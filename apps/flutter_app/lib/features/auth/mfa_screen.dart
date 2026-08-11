import 'package:flutter/material.dart';
import 'auth_repository.dart';

class MfaScreen extends StatefulWidget {
  final AuthRepository authRepository;
  final String challengeUserId;
  final ValueChanged<String> onAuthenticated;

  const MfaScreen({
    super.key,
    required this.authRepository,
    required this.challengeUserId,
    required this.onAuthenticated,
  });

  @override
  State<MfaScreen> createState() => _MfaScreenState();
}

class _MfaScreenState extends State<MfaScreen> {
  final _formKey = GlobalKey<FormState>();
  final _codeController = TextEditingController();

  bool _submitting = false;
  String? _errorMessage;

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _submitting = true;
      _errorMessage = null;
    });

    try {
      final result = await widget.authRepository.verifyMfa(
        challengeUserId: widget.challengeUserId,
        otpCode: _codeController.text.trim(),
      );
      if (result.accessToken != null) {
        widget.onAuthenticated(result.accessToken!);
      }
    } on AuthException catch (error) {
      setState(() => _errorMessage = error.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Verificación en dos pasos')),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 360),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Form(
              key: _formKey,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text('Ingresa el código de 6 dígitos de tu app de autenticación.'),
                  const SizedBox(height: 20),
                  TextFormField(
                    controller: _codeController,
                    decoration: const InputDecoration(labelText: 'Código MFA'),
                    keyboardType: TextInputType.number,
                    maxLength: 6,
                    validator: (value) =>
                        (value == null || value.length != 6) ? 'Debe tener 6 dígitos' : null,
                  ),
                  if (_errorMessage != null) ...[
                    const SizedBox(height: 4),
                    Text(_errorMessage!, style: const TextStyle(color: Colors.red)),
                  ],
                  const SizedBox(height: 12),
                  ElevatedButton(
                    onPressed: _submitting ? null : _submit,
                    child: _submitting
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                          )
                        : const Text('Verificar'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
