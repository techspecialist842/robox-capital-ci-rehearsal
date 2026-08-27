import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:robox_capital_app/features/shell/home_shell.dart';
import 'package:robox_capital_app/features/strategies/strategy_repository.dart';

Map<String, dynamic> estrategia({
  String id = 'e-1',
  String name = 'Momento Oro',
  String status = 'active',
  int version = 1,
}) =>
    {
      'id': id,
      'name': name,
      'description': null,
      'status': status,
      'currentVersion': version,
    };

StrategyRepository repositorioCon(List<Map<String, dynamic>> estrategias) =>
    StrategyRepository(
      accessToken: 'token',
      baseUrl: 'http://api',
      client: MockClient(
        (_) async => http.Response(jsonEncode(estrategias), 200),
      ),
    );

void main() {
  group('Ciclo de vida en la interfaz', () {
    test('refleja las transiciones que el backend permite', () {
      expect(StrategyStatus.draft.siguientes,
          [StrategyStatus.active, StrategyStatus.archived]);
      expect(StrategyStatus.active.siguientes,
          [StrategyStatus.suspended, StrategyStatus.archived]);
      expect(StrategyStatus.suspended.siguientes,
          [StrategyStatus.active, StrategyStatus.archived]);
    });

    test('una estrategia archivada no ofrece ninguna accion', () {
      expect(StrategyStatus.archived.siguientes, isEmpty);
    });
  });

  group('StrategyRepository', () {
    test('traduce un 403 a un mensaje sobre permisos', () async {
      final repo = StrategyRepository(
        accessToken: 'token',
        baseUrl: 'http://api',
        client: MockClient((_) async => http.Response('{}', 403)),
      );

      await expectLater(
        repo.listar(),
        throwsA(
          isA<StrategyException>().having((e) => e.message, 'mensaje', contains('rol')),
        ),
      );
    });

    test('traduce un 401 a sesion expirada', () async {
      final repo = StrategyRepository(
        accessToken: 'token',
        baseUrl: 'http://api',
        client: MockClient((_) async => http.Response('{}', 401)),
      );

      await expectLater(
        repo.listar(),
        throwsA(
          isA<StrategyException>()
              .having((e) => e.message, 'mensaje', contains('expirado')),
        ),
      );
    });

    test('propaga el motivo del conflicto que devuelve el servidor', () async {
      final repo = StrategyRepository(
        accessToken: 'token',
        baseUrl: 'http://api',
        client: MockClient(
          (_) async => http.Response(
            jsonEncode({'message': 'Transicion no permitida: archived -> active'}),
            409,
          ),
        ),
      );

      await expectLater(
        repo.cambiarEstado('e-1', StrategyStatus.active),
        throwsA(
          isA<StrategyException>()
              .having((e) => e.message, 'mensaje', contains('Transicion no permitida')),
        ),
      );
    });
  });

  group('Shell', () {
    testWidgets('el panel resume las estrategias por estado', (tester) async {
      final repo = repositorioCon([
        estrategia(id: 'a', status: 'active'),
        estrategia(id: 'b', status: 'active'),
        estrategia(id: 'c', status: 'suspended'),
      ]);

      await tester.pumpWidget(MaterialApp(
        home: HomeShell(accessToken: 't', onLogout: () {}, repository: repo),
      ));
      await tester.pumpAndSettle();

      expect(find.text('Panel ejecutivo'), findsOneWidget);
      expect(find.text('Activas'), findsOneWidget);
      expect(find.text('2'), findsOneWidget);
    });

    testWidgets('no muestra ceros para indicadores sin datos', (tester) async {
      await tester.pumpWidget(MaterialApp(
        home: HomeShell(accessToken: 't', onLogout: () {}, repository: repositorioCon([])),
      ));
      await tester.pumpAndSettle();

      expect(find.text('Sin datos todavía'), findsOneWidget);
    });

    testWidgets('se puede navegar a la administración de estrategias', (tester) async {
      final repo = repositorioCon([estrategia(name: 'Momento Oro')]);

      await tester.pumpWidget(MaterialApp(
        home: HomeShell(accessToken: 't', onLogout: () {}, repository: repo),
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Estrategias').last);
      await tester.pumpAndSettle();

      expect(find.text('Momento Oro'), findsOneWidget);
      expect(find.text('Activa · versión 1'), findsOneWidget);
    });
  });
}
