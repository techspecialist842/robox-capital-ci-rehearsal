import 'package:flutter_test/flutter_test.dart';
import 'package:robox_capital_app/main.dart';

void main() {
  testWidgets('muestra la pantalla de login cuando no hay sesión', (tester) async {
    await tester.pumpWidget(const RoboXCapitalApp());

    expect(find.text('roboX Capital'), findsOneWidget);
    expect(find.text('Correo electrónico'), findsOneWidget);
    expect(find.text('Contraseña'), findsOneWidget);
  });

  testWidgets('valida el formulario antes de enviar', (tester) async {
    await tester.pumpWidget(const RoboXCapitalApp());

    await tester.tap(find.text('Continuar'));
    await tester.pump();

    expect(find.text('Correo inválido'), findsOneWidget);
    expect(find.text('Mínimo 8 caracteres'), findsOneWidget);
  });
}
