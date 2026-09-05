# Runbook de entornos — roboX Capital

Procedimientos operativos de la plataforma. Entregable de la Fase 1 ("Runbooks de
entorno").

| Entorno | Estado | Notas |
|---|---|---|
| local | Operativo | Postgres y Redis nativos o `docker-compose.yml` |
| desarrollo | **Operativo** | Cuenta `762197749856`, region `us-east-2` |
| staging | Pendiente | Requiere una cuenta adicional |
| produccion | No previsto hasta la Fase 6 | — |

El entorno de desarrollo esta desplegado y en funcionamiento. El api-gateway se
expone a traves del balanceador; el quant-service solo es alcanzable dentro de la
VPC.

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

En AWS (CloudWatch Logs Insights), grupo `/ecs/robox-dev`:

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

## 8. Despliegue

El despliegue lo hace el pipeline (`.github/workflows/deploy.yml`), nunca a mano.
Se dispara con cada cambio en `main` y puede lanzarse a mano para elegir entorno.

El orden no es casual: publicar imagenes, aplicar las migraciones **como tarea
aislada**, y solo si esa tarea termina bien, mover el trafico. Si una migracion
falla, el despliegue se detiene y la version en funcionamiento no se toca.

Las imagenes se etiquetan con el SHA del commit y los repositorios usan etiquetas
inmutables, asi que cada version desplegada es rastreable hasta su codigo exacto.

### Volver a una version anterior

```bash
aws ecs list-task-definitions --family-prefix robox-dev-apigateway --region us-east-2

aws ecs update-service --cluster robox-dev --service robox-dev-apigateway \
  --task-definition robox-dev-apigateway:<N> --region us-east-2
```

Volver atras NO deshace una migracion de base de datos. Si la version anterior no
entiende el esquema nuevo, hay que revertir tambien la migracion, y eso se decide
caso por caso.

### Consultar los logs en AWS

Ambos servicios escriben en el grupo `/ecs/robox-dev` con el mismo esquema de
campos, de modo que una sola consulta los cruza:

```
fields @timestamp, service, level, message, correlationId
| filter correlationId = "<id>"
| sort @timestamp asc
```

---

## 9. Pendiente de ensayar

- **Restauracion desde copia de seguridad** y verificacion de RPO/RTO contra los
  objetivos aprobados en [objetivos-no-funcionales.md](../objetivos-no-funcionales.md).
  Las copias automaticas de RDS estan activas, pero nunca se ha probado una
  restauracion: hasta hacerlo, el RPO es una expectativa y no un hecho.
- Rotacion programada en Secrets Manager.
- Entorno de staging, cuando exista la cuenta.
