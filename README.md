# roboX Capital — Plataforma MVP

Monorepo de la plataforma de trading asistido por IA de roboX Capital. Este repositorio contiene
el esqueleto construido durante la **Fase 1 — Fundación de la Plataforma** (ver
`roboX_Capital_Fase1_Kickoff.pdf` para el plan de arranque, y el paquete de Entregables del Paso 0
para las decisiones de arquitectura — ADRs — que rigen este código).

## Estructura

```
apps/
  api-gateway/     NestJS — API Gateway + servicios centrales (Identidad, Estrategias, Decisiones, Administración)
  quant-service/    Python/FastAPI — datos de mercado, backtesting, motor de riesgo, orquestación de IA
  flutter_app/      Flutter — cliente Web/Mobile
packages/
  event-contracts/  Esquemas de eventos compartidos entre api-gateway y quant-service (ADR-002)
infra/
  cdk/              AWS CDK (TypeScript) — infraestructura como código (ADR-004)
```

## Decisiones de arquitectura relevantes (ver paquete de Entregables del Paso 0 §2)

- **ADR-001** — Stack dual de backend: NestJS (`apps/api-gateway`) + Python/FastAPI (`apps/quant-service`).
- **ADR-002** — Bus de eventos (AWS SNS/SQS en el MVP) como columna vertebral de integración; esquemas versionados en `packages/event-contracts`.
- **ADR-003** — PostgreSQL como sistema de registro; Redis solo para sesión/caché.
- **ADR-004** — Infraestructura como código bajo una AWS Organization propiedad de roboX Capital (`infra/cdk`).
- **ADR-005** — Flutter, una única base de código orientada primero a Web.
- **ADR-006** — La IA es exclusivamente asesora; ningún servicio de IA puede colocar órdenes.
- **ADR-007** — Broker: Interactive Brokers (Paper Trading API); Datos de mercado: Interactive Brokers Market Data; IA: OpenAI — todos detrás de una capa de adaptadores intercambiable.
- **ADR-008** — Secretos en AWS Secrets Manager/KMS; nunca en código ni variables de entorno en texto plano.

## Desarrollo local

Requisitos: Node.js 20+, Python 3.11+, Docker, Flutter SDK (para `apps/flutter_app`).

```bash
# 1. Levantar PostgreSQL + Redis
docker compose up -d

# 2. Copiar variables de entorno de ejemplo
cp .env.example .env

# 3. API Gateway (NestJS)
cd apps/api-gateway
npm install
npm run start:dev        # http://localhost:3000/health

# 4. Quant Service (Python/FastAPI)
cd apps/quant-service
python -m venv .venv && . .venv/Scripts/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000          # http://localhost:8000/health

# 5. Flutter app
cd apps/flutter_app
flutter pub get
flutter run -d chrome
```

## Estado del esqueleto (Fase 1)

Este código es un **esqueleto**, no una implementación completa — cubre la estructura, los
contratos y los puntos de extensión descritos en la Fase 1 del Plan de Entrega. Los módulos de
Identidad/MFA/RBAC, el bus de eventos y el servicio cuant tienen lógica mínima de ejemplo
(guardas, DTOs, endpoints de salud) pensada para que el equipo construya la funcionalidad completa
encima en las Fases 2–6, no para producción.

La infraestructura **sí está desplegada**: la cuenta de desarrollo (`762197749856`, `us-east-2`)
ejecuta la plataforma completa. Falta el entorno de staging, que requiere una cuenta adicional.

## Qué se verificó realmente en esta máquina, y qué no

Por transparencia, esto es lo que se ejecutó de verdad y lo que no. Postgres y Redis se instalaron
como binarios nativos de Windows, porque el Docker de esta máquina corre en modo contenedores de
Windows y no puede levantar imágenes Linux.

| Componente | Verificado | Cómo |
|---|---|---|
| `apps/api-gateway` (NestJS) | ✅ Sí | `npm run lint && npm run test && npm run build` en local y en CI. Además, arrancado contra Postgres y Redis reales: migración aplicada, login, desafío MFA (TOTP), RBAC y registro de auditoría probados por HTTP. |
| `apps/quant-service` (Python) | ✅ Sí | `ruff check . && pytest` en local y en CI — incluida la validación de contrato de eventos contra `packages/event-contracts`. |
| `packages/event-contracts` | ✅ Sí | `npm run validate` en local y en CI: los fixtures cumplen ambos esquemas, validados desde Node y desde Python. |
| Bus de eventos SNS/SQS (ADR-002) | ✅ Sí (LocalStack **y AWS real**) | En CI sobre LocalStack: NestJS publica en SNS, Python consume y valida el contrato, y **una reentrega del mismo `eventId` no se procesa dos veces**. En AWS `dev`: 4 eventos publicados, 4 entregados, 0 fallos de entrega, 5 consumidos y borrados, 0 en la cola de fallidos. Semántica en [`SEMANTICA.md`](packages/event-contracts/SEMANTICA.md). |
| `apps/flutter_app` | ✅ Sí | `flutter analyze`, `flutter test` y `flutter build web` en local y en un runner limpio de Ubuntu en CI. Además, la app se abrió en Chrome y se completó un login real contra el api-gateway. |
| `.github/workflows/ci.yml` | ✅ Sí | Ejecutado de verdad en GitHub Actions. El primer run falló (`ruff: command not found`) y expuso un defecto real del pipeline que el entorno local enmascaraba. |
| Escaneo de seguridad (Puerta 1) | ✅ Sí | `npm audit`, `pip-audit` y `bandit` en CI. La primera pasada encontró 25 vulnerabilidades (7 altas) en NestJS 10; se actualizó a NestJS 11 y quedaron **0**. |
| Observabilidad (ADR-009) | ✅ Sí | Logger JSON con `correlationId` en ambos servicios, con el mismo formato para que una consulta pueda cruzarlos. Cuatro alarmas de CloudWatch activas en AWS `dev`, atadas a los objetivos aprobados por el cliente. |
| Gestión de secretos (ADR-008) | ✅ Sí | `SECRETS_PROVIDER=env` **falla el arranque** fuera de local/test. En AWS `dev` los servicios arrancan con `SECRETS_PROVIDER=aws` y las credenciales de PostgreSQL se inyectan desde Secrets Manager: se comprobó sobre la plantilla desplegada que ninguna variable de entorno lleva un valor sensible. |
| Feature flags | ✅ Sí | Valor por defecto en código + anulación en Redis, con degradación segura si Redis cae. Cubierto por pruebas. |
| Runbooks de entorno | ✅ Sí | `docs/runbooks/entornos.md`, actualizado con los procedimientos del entorno desplegado. La recuperación desde copia sigue sin ensayarse. |
| `infra/cdk` | ✅ Sí | **Desplegado** en la cuenta `762197749856` (`us-east-2`): las siete pilas en `CREATE_COMPLETE`. PostgreSQL y Redis disponibles, cifrados y sin acceso público; tópico SNS con su cola y DLQ; cuatro alarmas activas. El primer despliegue destapó dos fallos que `cdk synth` no podía ver —la política de la clave KMS y un servicio ECS apuntando a una imagen inexistente—, ambos corregidos. |
| `docker-compose.yml` (Postgres/Redis) | ❌ No | Este Docker está en modo Windows containers; no puede correr imágenes Linux. El equipo debe validarlo en una máquina con Docker Desktop en modo Linux/WSL2 (la config habitual en laptops de desarrollo). |
| Despliegue desde el pipeline | ✅ Sí | `deploy.yml` publica imágenes en ECR, aplica migraciones como tarea aislada y escala los servicios. Autenticación por OIDC, sin claves permanentes. Ejecutado de verdad contra AWS. |

Cada ronda de verificación destapó defectos reales que quedaron corregidos: un `.parents[N]` mal
calculado en Python, un ciclo de dependencia en CDK, un conflicto `jti`/`jwtid` al firmar el JWT, un
tipo de columna que TypeORM no podía inferir, el paso de instalación incompleto del pipeline, y 7
vulnerabilidades altas heredadas de NestJS 10.

El primer despliegue a AWS destapó por sí solo catorce problemas que ninguna prueba anterior podía
detectar, porque todos dependían del comportamiento real de los servicios de AWS: la política de una
clave KMS, un servicio apuntando a una imagen inexistente, la forma exacta de la afirmación `sub`
que emite GitHub, RDS rechazando conexiones sin cifrar, y una imagen que no llevaba consigo los
esquemas que el servicio hace cumplir, entre otros. Es la razón por la que conviene que el equipo
repita estos mismos comandos antes de construir encima.

## Autenticación: el MFA es obligatorio

Unas credenciales correctas **no** producen una sesión por sí solas. Si el usuario no tiene segundo
factor, `POST /auth/login` devuelve `requiresMfaEnrollment` y un token acotado de 10 minutos que
solo habilita `/auth/mfa/enroll` y `/auth/mfa/activate` — nada más. `JwtAuthGuard` rechaza ese token
en cualquier otro endpoint, de modo que el alta no se puede usar como puerta trasera.

El comportamiento se controla con el flag `auth.require-mfa`, activado por defecto. Existe para
poder desactivarlo durante un incidente de acceso, no para operar la plataforma sin segundo factor.
