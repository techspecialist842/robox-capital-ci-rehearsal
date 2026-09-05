# Objetivos no funcionales — roboX Capital

**Estado: aprobados por el cliente el 14 de agosto de 2026.** Cierran el Open Item 4
del paquete de Entregables del Paso 0 (Sección 6).

Estos valores dejan de ser una propuesta del proveedor: son los umbrales
contractuales contra los que se configuran el monitoreo y las alertas de la
plataforma. Cualquier alarma que se cree debe apuntar a un número de esta página,
y cualquier cambio requiere una nueva aprobación por escrito.

## Alcance al que aplican

MVP con paper trading, sin capital real hasta la Fase 6, sin infraestructura
multi-región (excluida explícitamente del alcance del MVP).

El cliente acordó que **deben revisarse antes de la Fase 6 y antes de cualquier
operación con capital real**. Hasta entonces, son los vigentes.

## Disponibilidad

Medida mensual, durante horario de mercado.

| Servicio | Objetivo | Indisponibilidad tolerada |
|---|---|---|
| Plataforma de decisiones y monitoreo | 99,9 % | ≈ 43 min/mes |
| Reportes y backtesting | 99,5 % | ≈ 3 h 39 min/mes |
| Staging | Sin compromiso formal | Mejor esfuerzo, horario laboral |

Alcanzable con despliegue en varias zonas de disponibilidad. No cubre una caída
regional completa: eso exigiría multi-región, fuera del alcance del MVP.

## Rendimiento

Percentil 95, medido en el API Gateway salvo indicación contraria.

| Operación | Objetivo |
|---|---|
| Validación de riesgo previa a la operación | < 200 ms |
| Consultas de lectura (dashboards, portafolio) | < 500 ms |
| Escrituras (crear estrategia, aprobar decisión) | < 800 ms |
| Ingesta de datos de mercado (retraso respecto al proveedor) | < 5 s |
| Recomendación de IA | < 30 s |
| Backtesting | Asíncrono, sin objetivo de latencia |

La validación de riesgo es la más estricta a propósito: está en el camino crítico
de cada decisión y, si se degrada, bloquea la operativa. Debe alertar antes que
cualquier otra métrica de latencia.

La recomendación de IA depende de un proveedor externo, así que su objetivo
incluye tiempo de espera máximo y degradación controlada: si el proveedor no
responde a tiempo, la plataforma sigue funcionando sin la recomendación.

## Recuperación

| Dato | Pérdida máxima (RPO) | Tiempo de recuperación (RTO) |
|---|---|---|
| Transaccional (estrategias, decisiones, portafolio) | 5 min | 2 h |
| Registro de auditoría | 5 min | 2 h |
| Datos históricos de mercado | 24 h | 8 h |
| Staging | 24 h | 8 h |

Los datos históricos de mercado admiten un objetivo más laxo porque se pueden
volver a obtener del proveedor: perderlos cuesta tiempo, no información.

Un RPO de 5 minutos se cubre con copias automáticas y recuperación a un punto en
el tiempo en PostgreSQL. El RTO de 2 horas asume restauración desde snapshot en
otra zona de disponibilidad, no conmutación automática.

**Pendiente de confirmar con el cliente:** si su política interna exige tolerancia
cero a pérdida en el registro de auditoría, el RPO de 5 minutos no basta. Es
alcanzable escribiendo además a un destino independiente e inmutable, con coste
adicional. Se preguntó de forma explícita y no se recibió objeción; conviene
reconfirmarlo antes de la Fase 5.

## Implicación de coste

Estos objetivos determinan el dimensionamiento de la infraestructura. Elevar la
disponibilidad al 99,99 % o bajar el RTO de una hora exige redundancia
multi-región, que está fuera del alcance del MVP y modificaría la cotización
acordada.

## Cómo se miden hoy

Cuatro alarmas de CloudWatch están activas en el entorno de desarrollo, cada una
atada a un objetivo de esta página (`infra/cdk/lib/observability-stack.ts`):

| Alarma | Objetivo que vigila |
|---|---|
| `robox-dev-latencia-p95` | Consultas de lectura por debajo de 500 ms |
| `robox-dev-errores-5xx` | Disponibilidad del 99,9 % |
| `robox-dev-sin-instancias-sanas` | El servicio está caído |
| `robox-dev-mensajes-en-dlq` | Eventos que ningún reintento arregla |

**Lo que aún no se mide:** los objetivos de recuperación. Las copias automáticas
de RDS están activas y cubren el RPO de 5 minutos sobre el papel, pero **nunca se
ha ensayado una restauración**. Hasta hacerlo, tanto el RPO como el RTO son
expectativas y no hechos comprobados.
