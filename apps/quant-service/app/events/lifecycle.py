"""Arranque y parada del consumidor de eventos.

El consumidor existia pero nadie lo arrancaba: los eventos llegaban a la cola y
se quedaban ahi. Se detecto en AWS comparando metricas — 4 publicados, 4
entregados, 0 consumidos y 5 esperando en la cola.

Se ejecuta en un hilo aparte porque el bucle de sondeo es bloqueante y no debe
detener el servidor HTTP. Al apagar el servicio se le pide parar y se espera un
tiempo acotado: si un mensaje esta a medio procesar, no borrarlo es lo correcto
—SQS lo reentregara— pero conviene no cortar en seco.
"""

from __future__ import annotations

import logging
import os
import threading

from app.observabilidad import correlacion

from .consumer import SqsEventConsumer

logger = logging.getLogger("robox.quant_service.lifecycle")

_consumidor: SqsEventConsumer | None = None
_hilo: threading.Thread | None = None


def _registrar_evento(evento: dict) -> None:
    """Manejador de referencia.

    La Fase 2 aun no reacciona a eventos de dominio; deja constancia de la
    recepcion para que el recorrido sea observable. Los consumidores reales
    (datos de mercado, decisiones) se enganchan aqui en fases posteriores.
    """
    # Cada evento abre su propio contexto: el eventId es lo que permite seguir
    # una operacion asincrona, igual que la cabecera lo permite en una peticion.
    testigo = correlacion.establecer(evento["eventId"])
    try:
        logger.info(
            "evento consumido: %s v%s",
            evento["eventType"],
            evento["eventVersion"],
        )
    finally:
        correlacion.restaurar(testigo)


def iniciar_consumidor() -> None:
    global _consumidor, _hilo

    cola = os.environ.get("EVENT_BUS_QUEUE_URL")
    if not cola:
        logger.info("sin EVENT_BUS_QUEUE_URL: no se arranca el consumidor")
        return

    _consumidor = SqsEventConsumer(
        queue_url=cola,
        region=os.environ.get("AWS_REGION", "us-east-1"),
        endpoint_url=os.environ.get("AWS_ENDPOINT_URL"),
    )
    # Se suscribe a todos los tipos con esquema conocido. Un evento sin manejador
    # se descarta de la cola igualmente; lo que no debe ocurrir es que se acumule.
    for tipo in (
        "platform.test_message",
        "auth.session_created",
        "auth.mfa_enrollment_required",
        "auth.mfa_activated",
        "instrument.registered",
        "instrument.deactivated",
        "strategy.created",
        "strategy.version_created",
        "strategy.status_changed",
    ):
        _consumidor.subscribe(tipo, _registrar_evento)

    _hilo = threading.Thread(target=_consumidor.run_forever, name="sqs-consumer", daemon=True)
    _hilo.start()
    logger.info("consumidor de eventos arrancado sobre %s", cola)


def detener_consumidor() -> None:
    if _consumidor is None:
        return

    _consumidor.stop()
    if _hilo is not None:
        # Acotado: el sondeo espera hasta 20 s por lectura, y no tiene sentido
        # retrasar el apagado mas alla de eso.
        _hilo.join(timeout=25)
    logger.info("consumidor de eventos detenido")
