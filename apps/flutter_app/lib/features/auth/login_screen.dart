import 'package:flutter/material.dart';
import 'auth_repository.dart';
import 'mfa_enrollment_screen.dart';
import 'mfa_screen.dart';

class LoginScreen extends StatefulWidget {
  final AuthRepository authRepository;
  final ValueChanged<String> onAuthenticated;

  const LoginScreen({
    super.key,
    required this.authRepository,
    required this.onAuthenticated,
  });

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();

  bool _submitting = false;
  String? _errorMessage;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _submitting = true;
      _errorMessage = null;
    });

    try {
      final result = await widget.authRepository.login(
        email: _emailController.text.trim(),
        password: _passwordController.text,
      );

      if (!mounted) return;

      // El orden importa: el alta se comprueba ANTES que el desafio. Un usuario
      // sin segundo factor recibe requiresMfa=true y challengeUserId, pero
      // enviarlo a introducir un codigo que todavia no puede generar lo dejaria
      // bloqueado sin salida.
      if (result.requiresMfaEnrollment && result.enrollmentToken != null) {
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => MfaEnrollmentScreen(
              authRepository: widget.authRepository,
              enrollmentToken: result.enrollmentToken!,
              onAuthenticated: widget.onAuthenticated,
            ),
          ),
        );
      } else if (result.requiresMfa && result.challengeUserId != null) {
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => MfaScreen(
              authRepository: widget.authRepository,
              challengeUserId: result.challengeUserId!,
              onAuthenticated: widget.onAuthenticated,
            ),
          ),
        );
      } else if (result.accessToken != null) {
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
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 400),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Form(
              key: _formKey,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('roboX Capital', style: Theme.of(context).textTheme.headlineMedium),
                  const SizedBox(height: 4),
                  const Text('Inicia sesión para continuar'),
                  const SizedBox(height: 24),
                  TextFormField(
                    controller: _emailController,
                    decoration: const InputDecoration(labelText: 'Correo electrónico'),
                    keyboardType: TextInputType.emailAddress,
                    validator: (value) =>
                        (value == null || !value.contains('@')) ? 'Correo inválido' : null,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _passwordController,
                    decoration: const InputDecoration(labelText: 'Contraseña'),
                    obscureText: true,
                    validator: (value) =>
                        (value == null || value.length < 8) ? 'Mínimo 8 caracteres' : null,
                  ),
                  if (_errorMessage != null) ...[
                    const SizedBox(height: 12),
                    Text(_errorMessage!, style: const TextStyle(color: Colors.red)),
                  ],
                  const SizedBox(height: 20),
                  ElevatedButton(
                    onPressed: _submitting ? null : _submit,
                    child: _submitting
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                          )
                        : const Text('Continuar'),
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
