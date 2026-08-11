# roboX Capital — Flutter App (esqueleto Fase 1)

Contiene el código de la app (`lib/`, `test/`, `pubspec.yaml`) escrito a mano para el
esqueleto de la Fase 1: sistema de diseño base, pantallas de login + MFA, y un shell
posterior a la autenticación.

## Importante — pasos antes del primer `flutter run`

Este entorno de desarrollo **no tiene el SDK de Flutter instalado**, así que este código
no pudo compilarse ni analizarse aquí (a diferencia de `api-gateway` y `quant-service`,
que sí se instalaron, compilaron, lintearon y probaron). Antes de usarlo, el equipo debe
generar las carpetas de plataforma (`web/`, `android/`, `ios/`) que normalmente crea el
CLI de Flutter y que este esqueleto no incluye:

```bash
cd apps/flutter_app
flutter create --org capital.robox --project-name robox_capital_app .
flutter pub get
flutter analyze
flutter test
flutter run -d chrome
```

`flutter create .` sobre un directorio existente **no sobrescribe** `lib/`, `test/` ni
`pubspec.yaml` — solo agrega el andamiaje de plataforma que falta. Revisar el diff
resultante antes de hacer commit.

## Estructura

```
lib/
  main.dart                    Punto de entrada; controla sesión autenticada/no autenticada
  app_config.dart              URL base del api-gateway (--dart-define API_BASE_URL)
  design_system/
    app_colors.dart            Paleta base
    app_theme.dart             ThemeData (Material 3)
  features/
    auth/
      auth_repository.dart     Llama a POST /auth/login y /auth/mfa/verify
      login_screen.dart
      mfa_screen.dart
    shell/
      home_shell.dart          Placeholder posterior al login
test/
  widget_test.dart             Pruebas de widget de la pantalla de login
```
