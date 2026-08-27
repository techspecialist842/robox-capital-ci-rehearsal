import 'package:flutter/material.dart';
import '../dashboard/dashboard_screen.dart';
import '../strategies/strategies_screen.dart';
import '../strategies/strategy_repository.dart';

/// Shell posterior a la autenticación. Desde la Fase 2 aloja el dashboard
/// ejecutivo y la administración de estrategias. Riesgo, paper trading y
/// reportes se incorporan en las Fases 3-5.
class HomeShell extends StatefulWidget {
  final VoidCallback onLogout;
  final String accessToken;
  final StrategyRepository? repository;

  const HomeShell({
    super.key,
    required this.onLogout,
    required this.accessToken,
    this.repository,
  });

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  late final StrategyRepository _repository;
  int _indice = 0;

  @override
  void initState() {
    super.initState();
    _repository =
        widget.repository ?? StrategyRepository(accessToken: widget.accessToken);
  }

  @override
  Widget build(BuildContext context) {
    final pantallas = [
      DashboardScreen(repository: _repository),
      StrategiesScreen(repository: _repository),
    ];

    return Scaffold(
      appBar: AppBar(
        title: Text(_indice == 0 ? 'Panel ejecutivo' : 'Estrategias'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Cerrar sesión',
            onPressed: widget.onLogout,
          ),
        ],
      ),
      body: pantallas[_indice],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _indice,
        onDestinationSelected: (i) => setState(() => _indice = i),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.dashboard_outlined),
            selectedIcon: Icon(Icons.dashboard),
            label: 'Panel',
          ),
          NavigationDestination(
            icon: Icon(Icons.insights_outlined),
            selectedIcon: Icon(Icons.insights),
            label: 'Estrategias',
          ),
        ],
      ),
    );
  }
}
