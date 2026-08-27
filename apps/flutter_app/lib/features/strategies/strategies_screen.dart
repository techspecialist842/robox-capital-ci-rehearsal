import 'package:flutter/material.dart';
import 'strategy_repository.dart';

/// Administración de estrategias (Fase 2).
///
/// Solo ofrece las transiciones que el backend acepta para el estado actual. No
/// es una validación —la autoridad es siempre el servidor— sino evitar que el
/// usuario intente algo que va a ser rechazado.
class StrategiesScreen extends StatefulWidget {
  final StrategyRepository repository;

  const StrategiesScreen({super.key, required this.repository});

  @override
  State<StrategiesScreen> createState() => _StrategiesScreenState();
}

class _StrategiesScreenState extends State<StrategiesScreen> {
  late Future<List<Strategy>> _futuro;

  @override
  void initState() {
    super.initState();
    _futuro = widget.repository.listar();
  }

  void _recargar() {
    setState(() => _futuro = widget.repository.listar());
  }

  Future<void> _cambiarEstado(Strategy estrategia, StrategyStatus nuevo) async {
    // Archivar no tiene vuelta atrás: se confirma antes.
    if (nuevo == StrategyStatus.archived) {
      final confirmado = await showDialog<bool>(
        context: context,
        builder: (contexto) => AlertDialog(
          title: const Text('Archivar estrategia'),
          content: Text(
            'Archivar «${estrategia.name}» es definitivo: no podrá reactivarse. '
            'Para detenerla temporalmente, use Suspender.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(contexto).pop(false),
              child: const Text('Cancelar'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(contexto).pop(true),
              child: const Text('Archivar'),
            ),
          ],
        ),
      );
      if (confirmado != true) return;
    }

    try {
      await widget.repository.cambiarEstado(estrategia.id, nuevo);
      _recargar();
    } on StrategyException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _crear() async {
    final creada = await showDialog<bool>(
      context: context,
      builder: (_) => _DialogoNuevaEstrategia(repository: widget.repository),
    );
    if (creada == true) _recargar();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: FutureBuilder<List<Strategy>>(
        future: _futuro,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return _Mensaje(
              icono: Icons.error_outline,
              texto: '${snapshot.error}',
              accion: TextButton(onPressed: _recargar, child: const Text('Reintentar')),
            );
          }

          final estrategias = snapshot.data ?? const [];
          if (estrategias.isEmpty) {
            return const _Mensaje(
              icono: Icons.inbox_outlined,
              texto: 'Todavía no hay estrategias registradas.',
            );
          }

          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: estrategias.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (_, i) => _TarjetaEstrategia(
              estrategia: estrategias[i],
              onCambiarEstado: _cambiarEstado,
            ),
          );
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _crear,
        icon: const Icon(Icons.add),
        label: const Text('Nueva estrategia'),
      ),
    );
  }
}

class _TarjetaEstrategia extends StatelessWidget {
  final Strategy estrategia;
  final void Function(Strategy, StrategyStatus) onCambiarEstado;

  const _TarjetaEstrategia({required this.estrategia, required this.onCambiarEstado});

  @override
  Widget build(BuildContext context) {
    final siguientes = estrategia.status.siguientes;

    return Card(
      child: ListTile(
        title: Text(estrategia.name),
        subtitle: Text(
          '${estrategia.status.etiqueta} · versión ${estrategia.currentVersion}',
        ),
        trailing: siguientes.isEmpty
            ? const Chip(label: Text('Sin acciones'))
            : PopupMenuButton<StrategyStatus>(
                tooltip: 'Cambiar estado',
                onSelected: (nuevo) => onCambiarEstado(estrategia, nuevo),
                itemBuilder: (_) => [
                  for (final estado in siguientes)
                    PopupMenuItem(value: estado, child: Text(estado.etiqueta)),
                ],
              ),
      ),
    );
  }
}

class _DialogoNuevaEstrategia extends StatefulWidget {
  final StrategyRepository repository;

  const _DialogoNuevaEstrategia({required this.repository});

  @override
  State<_DialogoNuevaEstrategia> createState() => _DialogoNuevaEstrategiaState();
}

class _DialogoNuevaEstrategiaState extends State<_DialogoNuevaEstrategia> {
  final _nombre = TextEditingController();
  final _descripcion = TextEditingController();
  String? _error;
  bool _enviando = false;

  @override
  void dispose() {
    _nombre.dispose();
    _descripcion.dispose();
    super.dispose();
  }

  Future<void> _guardar() async {
    if (_nombre.text.trim().length < 3) {
      setState(() => _error = 'El nombre necesita al menos 3 caracteres');
      return;
    }

    setState(() {
      _enviando = true;
      _error = null;
    });

    try {
      await widget.repository.crear(
        name: _nombre.text.trim(),
        description: _descripcion.text.trim(),
      );
      if (mounted) Navigator.of(context).pop(true);
    } on StrategyException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _enviando = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Nueva estrategia'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: _nombre,
            decoration: const InputDecoration(labelText: 'Nombre'),
            autofocus: true,
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _descripcion,
            decoration: const InputDecoration(labelText: 'Descripción (opcional)'),
            maxLines: 2,
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ],
          const SizedBox(height: 12),
          const Text(
            'Se crea en estado Borrador con su versión inicial. No opera hasta '
            'que se active.',
            style: TextStyle(fontSize: 12),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: _enviando ? null : () => Navigator.of(context).pop(false),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          onPressed: _enviando ? null : _guardar,
          child: const Text('Crear'),
        ),
      ],
    );
  }
}

class _Mensaje extends StatelessWidget {
  final IconData icono;
  final String texto;
  final Widget? accion;

  const _Mensaje({required this.icono, required this.texto, this.accion});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icono, size: 40),
            const SizedBox(height: 12),
            Text(texto, textAlign: TextAlign.center),
            if (accion != null) ...[const SizedBox(height: 12), accion!],
          ],
        ),
      ),
    );
  }
}
