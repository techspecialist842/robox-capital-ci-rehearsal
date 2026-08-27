import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:robox_capital_app/features/auth/auth_repository.dart';

/// El MFA obligatorio se introdujo en el backend sin actualizar esta app: un
/// usuario sin segundo factor recibia requiresMfa=true y era enviado a introducir
/// un codigo que aun no podia generar, quedando bloqueado sin salida.
///
/// Estas pruebas fijan el comportamiento correcto para que no vuelva a ocurrir.
void main() {
  group('AuthRepository', () {
    test('reconoce que hace falta dar de alta el segundo factor', () async {
      final repo = AuthRepository(
        baseUrl: 'http://api',
        client: MockClient((_) async => http.Response(
              jsonEncode({
                'requiresMfa': true,
                'requiresMfaEnrollment': true,
                'challengeUserId': 'user-1',
                'enrollmentToken': 'token-de-alta',
              }),
              200,
            )),
      );

      final resultado = await repo.login(email: 'a@robox.capital', password: 'x' * 8);

      expect(resultado.requiresMfaEnrollment, isTrue);
      expect(resultado.enrollmentToken, 'token-de-alta');
      expect(resultado.accessToken, isNull);
    });

    test('distingue el desafio normal del alta', () async {
      final repo = AuthRepository(
        baseUrl: 'http://api',
        client: MockClient((_) async => http.Response(
              jsonEncode({'requiresMfa': true, 'challengeUserId': 'user-1'}),
              200,
            )),
      );

      final resultado = await repo.login(email: 'a@robox.capital', password: 'x' * 8);

      expect(resultado.requiresMfa, isTrue);
      expect(resultado.requiresMfaEnrollment, isFalse);
      expect(resultado.enrollmentToken, isNull);
    });

    test('el alta envia el token acotado como Bearer', () async {
      String? cabecera;
      final repo = AuthRepository(
        baseUrl: 'http://api',
        client: MockClient((peticion) async {
          cabecera = peticion.headers['Authorization'];
          return http.Response(
            jsonEncode({'secret': 'ABC123', 'otpAuthUrl': 'otpauth://totp/x'}),
            200,
          );
        }),
      );

      final alta = await repo.startMfaEnrollment(enrollmentToken: 'token-de-alta');

      expect(cabecera, 'Bearer token-de-alta');
      expect(alta.secret, 'ABC123');
    });

    test('la activacion devuelve la sesion', () async {
      final repo = AuthRepository(
        baseUrl: 'http://api',
        client: MockClient(
          (_) async => http.Response(jsonEncode({'accessToken': 'sesion'}), 200),
        ),
      );

      final token = await repo.activateMfa(
        enrollmentToken: 'token-de-alta',
        otpCode: '123456',
      );

      expect(token, 'sesion');
    });

    test('un codigo incorrecto en la activacion se comunica con claridad', () async {
      final repo = AuthRepository(
        baseUrl: 'http://api',
        client: MockClient((_) async => http.Response('{}', 403)),
      );

      expect(
        () => repo.activateMfa(enrollmentToken: 't', otpCode: '000000'),
        throwsA(isA<AuthException>()),
      );
    });
  });
}
