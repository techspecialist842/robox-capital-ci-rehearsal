# Runbook de entornos — roboX Capital

Procedimientos operativos de la plataforma. Entregable de la Fase 1 ("Runbooks de
entorno"). Cada procedimiento indica si ya es ejecutable o si espera a que exista
la infraestructura AWS (Open Item 5).

| Entorno | Estado | Notas |
|---|---|---|
| local | Operativo | Postgres y Redis nativos o `docker-compose.yml` |
| desarrollo | Pendiente | Requiere cuentas AWS |
| staging | Pendiente | Requiere cuentas AWS |
| produccion | No previsto hasta la Fase 6 | — |

---

## 1. Levantar el entorno local

Requiere PostgreSQL 16 y Redis accesibles. Con Docker en modo Linux:

```bash
docker compose up -d          # postgres + redis
cp .env.example .env          # ajustar si los puertos difieren
```

Si el Docker local corre en modo contenedores Windows no puede ejecutar las
imagenes Linux; en ese caso se instalan Postgres y Redis nativos y se apunta
`.env` a ellos.

```bash
cd apps/api-gateway
npm ci
npm run migration:run         # crea users y audit_events
npm run build && npm start     # escucha en :3000

cd ../quant-service
pip install -r requirements-dev.txt
uvicorn app.main:app --port 8000
```

Comprobacion: `curl http://localhost:3000/health` y `curl http://localhost:8000/health`
deben responder 200.

---

## 2. Alta del primer usuario administrador

No hay registro publico: el primer administrador se crea por semilla y los demas
los crea un administrador existente.

```sql
INSERT INTO users (email, password_hash, roles, active, mfa_enabled)
VALUES ('admin@robox.capital', '<hash bcrypt>', '{admin}', true, false);
```

En el primer inicio de sesion el servidor no entrega una sesion: devuelve
`requiresMfaEnrollment` y un token de alta valido 10 minutos. Con ese token:

1. `POST /auth/mfa/enroll` devuelve el secreto y la URL `otpauth://` para el QR.
2. `POST /auth/mfa/activate` con el codigo de 6 digitos activa el factor y
   entrega ya si la sesion.

El MFA es obligatorio por diseño. Ver §6 para el procedimiento de emergencia.

---

## 3. Migraciones de base de datos

Las migraciones son explicitas: nunca se ejecutan solas al arrancar, para que un
despliegue no altere el esquema sin que nadie lo haya decidido.

```bash
npm run migration:run          # aplicar
npm run migration:revert       # deshacer la ultima
```

Orden en un despliegue: aplicar migraciones **antes** de mover trafico a la nueva
version. Si una migracion falla, se detiene el despliegue y la version en
funcionamiento no se ve afectada.

---

## 4. Diagnostico de un incidente

Todas las respuestas incluyen la cabecera `x-correlation-id`. Es el punto de
partida de cualquier investigacion: pedirla al usuario que reporta el problema.

Los logs son una linea JSON por evento con los campos `timestamp`, `level`,
`service`, `environment`, `message`, `context`, `correlationId` y `userId`.

En local:

```bash
npm start | grep '"correlationId":"<id>"'
```

En AWS (CloudWatch Logs Insights), una vez desplegado:

```
fields @timestamp, level, service, message, userId
| filter correlationId = "<id>"
| sort @timestamp asc
```

---

## 5. Feature flags

Permiten apagar una funcionalidad sin desplegar. El valor por defecto vive en el
codigo (`FEATURE_FLAG_DEFAULTS`); la anulacion vive en Redis y tiene prioridad.

| Flag | Por defecto | Para que sirve |
|---|---|---|
| `auth.require-mfa` | activado | Exige MFA a todos los roles |
| `events.publish-enabled` | activado | Apagarlo si el bus se degrada, sin tumbar la autenticacion |
| `platform.maintenance-mode` | desactivado | Rechaza escrituras de negocio |

```bash
redis-cli SET "feature-flag:events.publish-enabled" false   # apagar
redis-cli DEL "feature-flag:events.publish-enabled"         # volver al defecto
```

Si Redis no responde, el servicio usa el valor por defecto y deja un aviso en el
log: un fallo del registro no cambia el comportamiento en silencio.

---

## 6. Procedimientos de emergencia

### Revocar la sesion de un usuario

```bash
redis-cli DEL "session:<sessionId>"
redis-cli SET "revoked-jti:<jti>" 1 EX 28800
```

El token deja de ser aceptado en la siguiente peticion. El `sessionId` y el `jti`
estan en el evento de auditoria `auth.session_created`.

### Usuario bloqueado sin acceso a su segundo factor

Requiere aprobacion de un segundo administrador y queda registrado en auditoria.
Restablece el alta de MFA, no desactiva la exigencia:

```sql
UPDATE users SET mfa_enabled = false, mfa_secret = NULL WHERE email = '<correo>';
```

En el siguiente inicio de sesion el usuario vuelve a pasar por el alta de §2.

### Desactivar el MFA obligatorio (ultimo recurso)

```bash
redis-cli SET "feature-flag:auth.require-mfa" false
```

Solo ante un incidente que impida entrar a todos los administradores. Degrada la
postura de seguridad de la plataforma: hay que revertirlo en cuanto se resuelva y
dejar constancia del motivo.

---

## 7. Rotacion de secretos

Fuera de local los secretos viven en AWS Secrets Manager y se leen con el nombre
`roboX-{entorno}-{secreto}`. `SECRETS_PROVIDER=env` esta prohibido fuera de
local/test y el servicio se niega a arrancar si se intenta.

Al rotar `jwt-secret`, las sesiones firmadas con el valor anterior dejan de ser
validas: los usuarios vuelven a iniciar sesion. Conviene hacerlo en una ventana
acordada, no en caliente.

---

## 8. Pendiente de la infraestructura AWS

Estos procedimientos no se pueden redactar con precision hasta que existan las
cuentas (Open Item 5), porque dependen de los recursos concretos que se creen:

- Despliegue y rollback en dev/staging.
- Restauracion desde copia de seguridad y verificacion de RPO/RTO.
- Respuesta a alertas (umbrales pendientes del Open Item 4).
- Rotacion programada en Secrets Manager.
