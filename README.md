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

No incluye: cuentas AWS reales, credenciales, ni el despliegue efectivo de `infra/cdk` — eso
depende de que el cliente otorgue acceso a la AWS Organization (Open Item 5, ver el Kickoff de la
Fase 1).

## Qué se verificó realmente en esta máquina, y qué no

Por transparencia, esto es lo que se ejecutó de verdad y lo que no. Postgres y Redis se instalaron
como binarios nativos de Windows, porque el Docker de esta máquina corre en modo contenedores de
Windows y no puede levantar imágenes Linux.

| Componente | Verificado | Cómo |
|---|---|---|
| `apps/api-gateway` (NestJS) | ✅ Sí | `npm run lint && npm run test && npm run build` en local y en CI. Además, arrancado contra Postgres y Redis reales: migración aplicada, login, desafío MFA (TOTP), RBAC y registro de auditoría probados por HTTP. |
| `apps/quant-service` (Python) | ✅ Sí | `ruff check . && pytest` en local y en CI — incluida la validación de contrato de eventos contra `packages/event-contracts`. |
| `packages/event-contracts` | ✅ Sí | `npm run validate` en local y en CI: los fixtures cumplen ambos esquemas, validados desde Node y desde Python. |
| `apps/flutter_app` | ✅ Sí | `flutter analyze`, `flutter test` y `flutter build web` en local y en un runner limpio de Ubuntu en CI. Además, la app se abrió en Chrome y se completó un login real contra el api-gateway. |
| `.github/workflows/ci.yml` | ✅ Sí | Ejecutado de verdad en GitHub Actions: los 4 jobs en verde. El primer run falló (`ruff: command not found`) y expuso un defecto real del pipeline que el entorno local enmascaraba. |
| `infra/cdk` | ⚠️ Parcial | `cdk synth` genera CloudFormation válido para los 3 stacks (se encontró y corrigió un ciclo de dependencia real entre Secrets y Database). **No** se intentó `cdk deploy`: no hay credenciales de la AWS Organization del cliente (Open Item 5). |
| `docker-compose.yml` (Postgres/Redis) | ❌ No | Este Docker está en modo Windows containers; no puede correr imágenes Linux. El equipo debe validarlo en una máquina con Docker Desktop en modo Linux/WSL2 (la config habitual en laptops de desarrollo). |

Cada ronda de verificación destapó defectos reales que quedaron corregidos: un `.parents[N]` mal
calculado en Python, un ciclo de dependencia en CDK, un conflicto `jti`/`jwtid` al firmar el JWT, un
tipo de columna que TypeORM no podía inferir, y el paso de instalación incompleto del pipeline. Es
la razón por la que conviene que el equipo repita estos mismos comandos antes de construir encima.
