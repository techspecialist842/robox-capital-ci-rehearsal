import 'package:flutter/material.dart';
import 'design_system/app_theme.dart';
import 'features/auth/auth_repository.dart';
import 'features/auth/login_screen.dart';
import 'features/shell/home_shell.dart';

void main() {
  runApp(const RoboXCapitalApp());
}

class RoboXCapitalApp extends StatelessWidget {
  const RoboXCapitalApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'roboX Capital',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      home: const AppRoot(),
    );
  }
}

/// Controla el estado minimo de sesion (autenticado / no autenticado) del shell.
/// Se reemplaza por una solucion de manejo de estado mas robusta (p. ej.
/// Riverpod/Bloc) cuando la app crezca mas alla de la Fase 1.
class AppRoot extends StatefulWidget {
  const AppRoot({super.key});

  @override
  State<AppRoot> createState() => _AppRootState();
}

class _AppRootState extends State<AppRoot> {
  final _authRepository = AuthRepository();
  String? _accessToken;

  void _handleAuthenticated(String accessToken) {
    setState(() => _accessToken = accessToken);
  }

  void _handleLogout() {
    setState(() => _accessToken = null);
  }

  @override
  Widget build(BuildContext context) {
    if (_accessToken == null) {
      return LoginScreen(
        authRepository: _authRepository,
        onAuthenticated: _handleAuthenticated,
      );
    }
    return HomeShell(accessToken: _accessToken!, onLogout: _handleLogout);
  }
}
