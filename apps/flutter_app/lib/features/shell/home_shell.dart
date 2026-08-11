import 'package:flutter/material.dart';

/// Shell posterior a la autenticacion. En la Fase 1 solo confirma que el login
/// funciono de extremo a extremo; los dashboards reales (estrategias, riesgo,
/// paper trading, portafolio, reportes) se construyen en las Fases 2-5.
class HomeShell extends StatelessWidget {
  final VoidCallback onLogout;

  const HomeShell({super.key, required this.onLogout});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('roboX Capital'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Cerrar sesión',
            onPressed: onLogout,
          ),
        ],
      ),
      body: const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.check_circle_outline, size: 48),
              SizedBox(height: 12),
              Text(
                'Sesión autenticada contra el API Gateway.',
                textAlign: TextAlign.center,
              ),
              SizedBox(height: 4),
              Text(
                'Dashboards de estrategias, riesgo, paper trading y reportes '
                'llegan en las Fases 2-5.',
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
