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

Este entorno de desarrollo no tiene Flutter SDK ni `docker compose` (Docker corre en modo
contenedores de Windows, no Linux, así que las imágenes `postgres:16-alpine`/`redis:7-alpine`
tampoco se pudieron levantar aquí). Por transparencia:

| Componente | Verificado aquí | Cómo |
|---|---|---|
| `apps/api-gateway` (NestJS) | ✅ Sí | `npm install && npm run build && npm run lint && npm run test` — todo pasa. La e2e (`test/health.e2e-spec.ts`) requiere Postgres/Redis vivos y no se ejecutó. |
| `apps/quant-service` (Python) | ✅ Sí | `pip install -r requirements-dev.txt && ruff check . && pytest` — 5/5 pruebas pasan, incluida la validación de contrato de eventos contra `packages/event-contracts`. |
| `packages/event-contracts` | ✅ Sí | `npm run validate` — los fixtures de ejemplo cumplen ambos esquemas. |
| `infra/cdk` | ✅ Sí (parcial) | `cdk synth` genera CloudFormation válido para los 3 stacks (se encontró y corrigió un ciclo de dependencia real entre Secrets y Database). **No** se intentó `cdk deploy` — no hay credenciales de la AWS Organization del cliente. |
| `apps/flutter_app` | ❌ No | Sin Flutter SDK instalado en esta máquina. El código se escribió siguiendo los patrones estándar de Flutter/Material 3, pero **no se compiló ni analizó**. Ver `apps/flutter_app/README.md` para los pasos exactos que el equipo debe correr antes del primer `flutter run`. |
| `docker-compose.yml` (Postgres/Redis) | ❌ No | Este Docker está en modo Windows containers; no puede correr imágenes Linux. El equipo debe validarlo en una máquina con Docker Desktop en modo Linux/WSL2 (la config habitual en laptops de desarrollo). |

En dos de las tres pruebas automatizadas que sí se corrieron aparecieron errores reales (un
`.parents[N]` mal calculado en Python, y el ciclo de dependencia de CDK) que quedaron corregidos
gracias a esa verificación — es la razón por la que vale la pena que el equipo repita estos mismos
comandos en su propia máquina antes de construir encima.
