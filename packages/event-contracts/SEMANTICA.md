# Semántica del bus de eventos (ADR-002)

Reglas que **todo** productor y consumidor de la plataforma debe cumplir. Se
escriben antes que el código porque son suposiciones que, si se dan por sentadas
mal, no fallan en desarrollo: fallan en producción con dinero de por medio.

## El transporte

SNS para la publicación (difusión a varios interesados) y una cola SQS por
consumidor. El productor no sabe quién escucha; añadir un consumidor nuevo no
toca al productor.

Se usan colas **estándar**, no FIFO. Las FIFO garantizan orden y unicidad, pero
limitan el rendimiento y obligan a agrupar por clave de partición. Para el MVP no
compensa: es más barato asumir las tres reglas de abajo que arrastrar esa
restricción.

## Las tres reglas

### 1. Entrega "al menos una vez" — todo consumidor debe ser idempotente

SQS puede entregar el mismo mensaje más de una vez. No es un fallo: es el
comportamiento normal del servicio.

Cada consumidor descarta los `eventId` ya procesados antes de actuar. La marca se
guarda con TTL (24 h por defecto): más allá de esa ventana, un reenvío es tan
improbable que no justifica almacenamiento indefinido.

Sin esto, un mensaje reentregado se traduce en una orden duplicada. Es el fallo
más caro de los tres.

### 2. Sin orden garantizado — nada puede depender de la secuencia de llegada

Dos eventos publicados en orden pueden llegar al revés. Los consumidores no
pueden asumir que "creado" llega antes que "actualizado".

Cada evento lleva `occurredAt` (ISO 8601, UTC). Si un consumidor necesita
descartar información vieja, compara ese campo contra el estado que ya tiene y
descarta lo anterior. No se compara contra la hora de recepción.

### 3. El fallo se reintenta, y luego se aparta

Un consumidor que falla **no borra el mensaje**: SQS lo vuelve a entregar cuando
vence el plazo de visibilidad. Tras 5 intentos, la cola lo mueve a la cola de
mensajes fallidos (DLQ).

Un mensaje en la DLQ es una alerta operativa, no un fichero que se ignore: algo
se rompió de forma que el reintento no arregla. El runbook cubre su inspección y
reproceso.

Corolario: **nunca se captura una excepción para poder borrar el mensaje**. Eso
convierte un fallo visible en una pérdida silenciosa de datos.

## Contrato de un evento

```json
{
  "eventId": "uuid v4 — clave de idempotencia",
  "eventType": "auth.session_created",
  "eventVersion": 1,
  "occurredAt": "2026-08-12T09:00:00.000Z",
  "producer": "api-gateway",
  "payload": {}
}
```

`eventType` y `eventVersion` viajan además como atributos del mensaje SNS, para
que un consumidor pueda suscribirse solo a lo que le interesa mediante una
política de filtrado en lugar de recibir todo y descartar.

## Versionado

Un cambio compatible (añadir un campo opcional) mantiene la versión. Un cambio
incompatible incrementa `eventVersion` y **convive** con la anterior hasta que
todos los consumidores migren: el productor publica ambas durante la transición.

Los esquemas de `schemas/` son la fuente de verdad y se validan en CI desde Node y
desde Python, de modo que ninguno de los dos lados pueda desviarse sin que el
pipeline lo note.

## Qué está verificado

La prueba de integración de CI levanta LocalStack y comprueba el recorrido
completo: el api-gateway publica en SNS, el mensaje llega a la cola SQS, el
quant-service lo consume y valida contra el esquema, y **una reentrega del mismo
`eventId` no se procesa dos veces**.

También está verificado contra AWS real, en el entorno de desarrollo: 4 eventos
publicados en SNS, 4 entregados a SQS, 0 fallos de entrega, y los 5 acumulados en
la cola consumidos y borrados, sin ninguno en la cola de fallidos.

Ese recorrido destapó un fallo que las pruebas no podían ver: el consumidor
estaba escrito y probado, pero **nadie lo arrancaba** al iniciar el servicio. Las
pruebas de integración lo instanciaban ellas mismas, así que pasaban. Se detectó
comparando métricas —mensajes entregados frente a consumidos—, no leyendo código.
