import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'auth_repository.dart';

/// Alta del segundo factor.
///
/// Se llega aqui cuando las credenciales son correctas pero el usuario aun no
/// tiene MFA configurado. El secreto se muestra una sola vez y el factor no queda
/// activo hasta que la persona demuestra que lo guardo introduciendo un codigo
/// valido: activarlo antes dejaria sin acceso a quien no consiguiera guardarlo.
class MfaEnrollmentScreen extends StatefulWidget {
  final AuthRepository authRepository;
  final String enrollmentToken;
  final ValueChanged<String> onAuthenticated;

  const MfaEnrollmentScreen({
    super.key,
    required this.authRepository,
    required this.enrollmentToken,
    required this.onAuthenticated,
  });

  @override
  State<MfaEnrollmentScreen> createState() => _MfaEnrollmentScreenState();
}

class _MfaEnrollmentScreenState extends State<MfaEnrollmentScreen> {
  final _codeController = TextEditingController();
  MfaEnrollment? _enrollment;
  String? _error;
  bool _busy = true;

  @override
  void initState() {
    super.initState();
    _cargarSecreto();
  }

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _cargarSecreto() async {
    try {
      final enrollment = await widget.authRepository.startMfaEnrollment(
        enrollmentToken: widget.enrollmentToken,
      );
      if (!mounted) return;
      setState(() {
        _enrollment = enrollment;
        _busy = false;
      });
    } on AuthException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _busy = false;
      });
    }
  }

  Future<void> _activar() async {
    if (_codeController.text.length != 6) {
      setState(() => _error = 'El código tiene 6 dígitos');
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      final token = await widget.authRepository.activateMfa(
        enrollmentToken: widget.enrollmentToken,
        otpCode: _codeController.text,
      );
      widget.onAuthenticated(token);
    } on AuthException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _busy = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final enrollment = _enrollment;

    return Scaffold(
      appBar: AppBar(title: const Text('Configurar segundo factor')),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 480),
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'Su cuenta requiere autenticación de dos factores. '
                  'Añada esta clave a su aplicación de autenticación.',
                ),
                const SizedBox(height: 24),
                if (enrollment != null) ...[
                  _ClaveSecreta(secret: enrollment.secret),
                  const SizedBox(height: 24),
                  TextField(
                    controller: _codeController,
                    keyboardType: TextInputType.number,
                    maxLength: 6,
                    decoration: const InputDecoration(
                      labelText: 'Código de 6 dígitos',
                      counterText: '',
                    ),
                    onSubmitted: (_) => _activar(),
                  ),
                ],
                if (_error != null) ...[
                  const SizedBox(height: 8),
                  Text(
                    _error!,
                    style: TextStyle(color: Theme.of(context).colorScheme.error),
                  ),
                ],
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: _busy || enrollment == null ? null : _activar,
                  child: _busy
                      ? const SizedBox(
                          height: 18,
                          width: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Activar y entrar'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ClaveSecreta extends StatelessWidget {
  final String secret;

  const _ClaveSecreta({required this.secret});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Clave', style: Theme.of(context).textTheme.labelLarge),
            const SizedBox(height: 8),
            SelectableText(
              secret,
              style: const TextStyle(fontFamily: 'monospace', fontSize: 16),
            ),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                icon: const Icon(Icons.copy, size: 18),
                label: const Text('Copiar'),
                onPressed: () => Clipboard.setData(ClipboardData(text: secret)),
              ),
            ),
            const Divider(),
            const Text(
              'Esta clave se muestra una sola vez. Guárdela antes de continuar.',
              style: TextStyle(fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }
}
