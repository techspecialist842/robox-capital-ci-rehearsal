import 'dart:convert';
import 'package:http/http.dart' as http;
import '../../app_config.dart';

/// Resultado de un intento de login: o requiere un segundo factor (MFA), o ya
/// entrega un token de acceso.
class LoginResult {
  final bool requiresMfa;
  final String? challengeUserId;
  final String? accessToken;

  const LoginResult({required this.requiresMfa, this.challengeUserId, this.accessToken});

  factory LoginResult.fromJson(Map<String, dynamic> json) {
    return LoginResult(
      requiresMfa: json['requiresMfa'] as bool? ?? false,
      challengeUserId: json['challengeUserId'] as String?,
      accessToken: json['accessToken'] as String?,
    );
  }
}

class AuthException implements Exception {
  final String message;
  const AuthException(this.message);

  @override
  String toString() => message;
}

/// Habla con el modulo de Identidad del api-gateway (POST /auth/login,
/// POST /auth/mfa/verify) — ver apps/api-gateway/src/auth.
class AuthRepository {
  final http.Client _client;
  final String _baseUrl;

  AuthRepository({http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? AppConfig.apiBaseUrl;

  Future<LoginResult> login({required String email, required String password}) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/auth/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email, 'password': password}),
    );

    if (response.statusCode != 200) {
      throw const AuthException('Credenciales invalidas');
    }
    return LoginResult.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
  }

  Future<LoginResult> verifyMfa({required String challengeUserId, required String otpCode}) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/auth/mfa/verify'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'challengeUserId': challengeUserId, 'otpCode': otpCode}),
    );

    if (response.statusCode != 200) {
      throw const AuthException('Codigo de verificacion incorrecto');
    }
    return LoginResult.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
  }
}
