import 'dart:convert';
import 'package:http/http.dart' as http;
import '../../app_config.dart';

/// Estados del ciclo de vida, iguales a los del backend.
enum StrategyStatus { draft, active, suspended, archived }

extension StrategyStatusX on StrategyStatus {
  String get valor => name;

  String get etiqueta => switch (this) {
        StrategyStatus.draft => 'Borrador',
        StrategyStatus.active => 'Activa',
        StrategyStatus.suspended => 'Suspendida',
        StrategyStatus.archived => 'Archivada',
      };

  /// Transiciones permitidas. Refleja la tabla del backend, que es la autoridad:
  /// aqui solo sirve para no ofrecer al usuario acciones que el servidor va a
  /// rechazar. La validacion real ocurre siempre del lado del servidor.
  List<StrategyStatus> get siguientes => switch (this) {
        StrategyStatus.draft => [StrategyStatus.active, StrategyStatus.archived],
        StrategyStatus.active => [StrategyStatus.suspended, StrategyStatus.archived],
        StrategyStatus.suspended => [StrategyStatus.active, StrategyStatus.archived],
        StrategyStatus.archived => const [],
      };
}

StrategyStatus _parseStatus(String valor) => StrategyStatus.values.firstWhere(
      (e) => e.name == valor,
      orElse: () => StrategyStatus.draft,
    );

class Strategy {
  final String id;
  final String name;
  final String? description;
  final StrategyStatus status;
  final int currentVersion;

  const Strategy({
    required this.id,
    required this.name,
    required this.status,
    required this.currentVersion,
    this.description,
  });

  factory Strategy.fromJson(Map<String, dynamic> json) => Strategy(
        id: json['id'] as String,
        name: json['name'] as String,
        description: json['description'] as String?,
        status: _parseStatus(json['status'] as String),
        currentVersion: json['currentVersion'] as int,
      );
}

class StrategyVersion {
  final int version;
  final Map<String, dynamic> parameters;
  final DateTime createdAt;

  const StrategyVersion({
    required this.version,
    required this.parameters,
    required this.createdAt,
  });

  factory StrategyVersion.fromJson(Map<String, dynamic> json) => StrategyVersion(
        version: json['version'] as int,
        parameters: (json['parameters'] as Map).cast<String, dynamic>(),
        createdAt: DateTime.parse(json['createdAt'] as String),
      );
}

class StrategyException implements Exception {
  final String message;
  const StrategyException(this.message);

  @override
  String toString() => message;
}

class StrategyRepository {
  final http.Client _client;
  final String _baseUrl;
  final String _accessToken;

  StrategyRepository({
    required String accessToken,
    http.Client? client,
    String? baseUrl,
  })  : _accessToken = accessToken,
        _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? AppConfig.apiBaseUrl;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $_accessToken',
      };

  Future<List<Strategy>> listar() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/strategies'),
      headers: _headers,
    );
    _verificar(response, 'No se pudieron cargar las estrategias');

    final lista = jsonDecode(response.body) as List<dynamic>;
    return lista
        .map((e) => Strategy.fromJson(e as Map<String, dynamic>))
        .toList(growable: false);
  }

  Future<List<StrategyVersion>> versiones(String strategyId) async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/strategies/$strategyId/versions'),
      headers: _headers,
    );
    _verificar(response, 'No se pudo cargar el historial');

    final lista = jsonDecode(response.body) as List<dynamic>;
    return lista
        .map((e) => StrategyVersion.fromJson(e as Map<String, dynamic>))
        .toList(growable: false);
  }

  Future<Strategy> crear({
    required String name,
    String? description,
    Map<String, dynamic> parameters = const {},
  }) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/strategies'),
      headers: _headers,
      body: jsonEncode({
        'name': name,
        if (description != null && description.isNotEmpty) 'description': description,
        'parameters': parameters,
        'instrumentIds': <String>[],
      }),
    );
    _verificar(response, 'No se pudo crear la estrategia', esperado: 201);
    return Strategy.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
  }

  Future<Strategy> cambiarEstado(String strategyId, StrategyStatus nuevo) async {
    final response = await _client.patch(
      Uri.parse('$_baseUrl/strategies/$strategyId/status'),
      headers: _headers,
      body: jsonEncode({'status': nuevo.valor}),
    );
    _verificar(response, 'No se pudo cambiar el estado');
    return Strategy.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
  }

  void _verificar(http.Response response, String mensaje, {int esperado = 200}) {
    if (response.statusCode == esperado) return;

    // Los errores del servidor se traducen a un mensaje util en lugar de mostrar
    // un codigo: 403 aqui significa casi siempre falta de permisos, y decirlo
    // ahorra al usuario suponerlo.
    final detalle = switch (response.statusCode) {
      401 => 'Su sesión ha expirado',
      403 => 'Su rol no permite esta acción',
      409 => _extraerMensaje(response.body) ?? 'La operación entra en conflicto con el estado actual',
      _ => mensaje,
    };
    throw StrategyException(detalle);
  }

  String? _extraerMensaje(String cuerpo) {
    try {
      final json = jsonDecode(cuerpo) as Map<String, dynamic>;
      return json['message'] as String?;
    } catch (_) {
      return null;
    }
  }
}
