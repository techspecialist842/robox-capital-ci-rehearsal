/// Configuracion de la app. En Fase 1 apunta al api-gateway local; a partir de
/// la Fase 2 se sustituye por variables de compilacion (--dart-define) por
/// entorno (dev/staging/prod), una vez existan esos entornos (ADR-004).
class AppConfig {
  AppConfig._();

  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:3000',
  );
}
