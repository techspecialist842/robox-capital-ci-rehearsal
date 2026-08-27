import 'dart:convert';
import 'package:http/http.dart' as http;
import '../../app_config.dart';

/// Resultado de un intento de inicio de sesion.
///
/// Con el MFA obligatorio, unas credenciales correctas nunca entregan una sesion
/// directamente. Hay tres desenlaces posibles:
///
///  - el usuario ya tiene segundo factor -> se pide el codigo (challengeUserId);
///  - el usuario aun no lo ha configurado -> hay que darlo de alta
///    (requiresMfaEnrollment + enrollmentToken);
///  - el MFA obligatorio esta desactivado por feature flag -> accessToken.
class LoginResult {
  final bool requiresMfa;
  final bool requiresMfaEnrollment;
  final String? challengeUserId;
  final String? accessToken;
  final String? enrollmentToken;

  const LoginResult({
    required this.requiresMfa,
    this.requiresMfaEnrollment = false,
    this.challengeUserId,
    this.accessToken,
    this.enrollmentToken,
  });

  factory LoginResult.fromJson(Map<String, dynamic> json) {
    return LoginResult(
      requiresMfa: json['requiresMfa'] as bool? ?? false,
      requiresMfaEnrollment: json['requiresMfaEnrollment'] as bool? ?? false,
      challengeUserId: json['challengeUserId'] as String?,
      accessToken: json['accessToken'] as String?,
      enrollmentToken: json['enrollmentToken'] as String?,
    );
  }
}

/// Datos para configurar el segundo factor en la app de autenticacion.
class MfaEnrollment {
  final String secret;
  final String otpAuthUrl;

  const MfaEnrollment({required this.secret, required this.otpAuthUrl});

  factory MfaEnrollment.fromJson(Map<String, dynamic> json) {
    return MfaEnrollment(
      secret: json['secret'] as String,
      otpAuthUrl: json['otpAuthUrl'] as String,
    );
  }
}

class AuthException implements Exception {
  final String message;
  const AuthException(this.message);

  @override
  String toString() => message;
}

/// Habla con el modulo de Identidad del api-gateway — ver apps/api-gateway/src/auth.
class AuthRepository {
  final http.Client _client;
  final String _baseUrl;

  AuthRepository({http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? AppConfig.apiBaseUrl;

  Future<LoginResult> login({
    required String email,
    required String password,
  }) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/auth/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email, 'password': password}),
    );

    if (response.statusCode != 200) {
      throw const AuthException('Credenciales inválidas');
    }
    return LoginResult.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
  }

  Future<LoginResult> verifyMfa({
    required String challengeUserId,
    required String otpCode,
  }) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/auth/mfa/verify'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'challengeUserId': challengeUserId, 'otpCode': otpCode}),
    );

    if (response.statusCode != 200) {
      throw const AuthException('Código de verificación incorrecto');
    }
    return LoginResult.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
  }

  /// Alta de MFA, paso 1. Requiere el token acotado que devuelve el login.
  Future<MfaEnrollment> startMfaEnrollment({required String enrollmentToken}) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/auth/mfa/enroll'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $enrollmentToken',
      },
    );

    if (response.statusCode != 200) {
      throw const AuthException('No se pudo iniciar el alta de MFA');
    }
    return MfaEnrollment.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
  }

  /// Alta de MFA, paso 2: confirma el código y entrega ya la sesión.
  Future<String> activateMfa({
    required String enrollmentToken,
    required String otpCode,
  }) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/auth/mfa/activate'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $enrollmentToken',
      },
      body: jsonEncode({'otpCode': otpCode}),
    );

    if (response.statusCode != 200) {
      throw const AuthException('Código incorrecto: revise la app de autenticación');
    }
    final cuerpo = jsonDecode(response.body) as Map<String, dynamic>;
    return cuerpo['accessToken'] as String;
  }
}
