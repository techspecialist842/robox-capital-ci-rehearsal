import 'package:flutter/material.dart';
import '../strategies/strategy_repository.dart';

/// Dashboard ejecutivo inicial (Fase 2).
///
/// Muestra los marcadores de plataforma y estrategias con el estado que hay
/// disponible hoy. Los indicadores de portafolio y riesgo llegan en las Fases 3
/// y 4; se declaran explicitamente como pendientes en lugar de mostrar ceros,
/// porque un cero se lee como "no hay exposicion" y no como "no hay dato".
class DashboardScreen extends StatefulWidget {
  final StrategyRepository repository;

  const DashboardScreen({super.key, required this.repository});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  late Future<List<Strategy>> _futuro;

  @override
  void initState() {
    super.initState();
    _futuro = widget.repository.listar();
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: () async {
        setState(() => _futuro = widget.repository.listar());
        await _futuro;
      },
      child: FutureBuilder<List<Strategy>>(
        future: _futuro,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          final estrategias = snapshot.data ?? const <Strategy>[];
          final porEstado = <StrategyStatus, int>{};
          for (final e in estrategias) {
            porEstado[e.status] = (porEstado[e.status] ?? 0) + 1;
          }

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (snapshot.hasError)
                Card(
                  color: Theme.of(context).colorScheme.errorContainer,
                  child: ListTile(
                    leading: const Icon(Icons.error_outline),
                    title: const Text('No se pudieron cargar las estrategias'),
                    subtitle: Text('${snapshot.error}'),
                  ),
                ),
              Text('Estrategias', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 12),
              Wrap(
                spacing: 12,
                runSpacing: 12,
                children: [
                  _Marcador(
                    etiqueta: 'Activas',
                    valor: '${porEstado[StrategyStatus.active] ?? 0}',
                    icono: Icons.play_circle_outline,
                  ),
                  _Marcador(
                    etiqueta: 'Suspendidas',
                    valor: '${porEstado[StrategyStatus.suspended] ?? 0}',
                    icono: Icons.pause_circle_outline,
                  ),
                  _Marcador(
                    etiqueta: 'Borradores',
                    valor: '${porEstado[StrategyStatus.draft] ?? 0}',
                    icono: Icons.edit_outlined,
                  ),
                  _Marcador(
                    etiqueta: 'Archivadas',
                    valor: '${porEstado[StrategyStatus.archived] ?? 0}',
                    icono: Icons.inventory_2_outlined,
                  ),
                ],
              ),
              const SizedBox(height: 28),
              Text('Portafolio y riesgo', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 12),
              const Card(
                child: ListTile(
                  leading: Icon(Icons.schedule),
                  title: Text('Sin datos todavía'),
                  subtitle: Text(
                    'Los indicadores de portafolio, P&L y riesgo se incorporan en '
                    'las Fases 3 y 4. No se muestran ceros para no confundir '
                    '«sin exposición» con «sin dato».',
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _Marcador extends StatelessWidget {
  final String etiqueta;
  final String valor;
  final IconData icono;

  const _Marcador({required this.etiqueta, required this.valor, required this.icono});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 160,
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icono, size: 20),
              const SizedBox(height: 8),
              Text(valor, style: Theme.of(context).textTheme.headlineMedium),
              Text(etiqueta, style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
        ),
      ),
    );
  }
}
