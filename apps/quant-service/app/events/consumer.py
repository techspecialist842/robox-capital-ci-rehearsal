"""Consumidor SQS del quant-service (ADR-002).

Aplica la misma semantica que el lado NestJS, documentada en
packages/event-contracts/SEMANTICA.md:

- entrega al menos una vez -> se descartan los ``eventId`` ya procesados;
- sin orden garantizado -> ningun manejador asume secuencia;
- el fallo no borra el mensaje -> SQS lo reintenta y, tras N intentos, la propia
  cola lo mueve a la DLQ.
"""

from __future__ import annotations

import json
import logging
import threading
import time
from collections.abc import Callable

import boto3
from jsonschema import ValidationError

from .contract_validator import UnknownEventTypeError, validate_event

logger = logging.getLogger("robox.quant_service.consumer")

EventHandler = Callable[[dict], None]


class ProcessedEvents:
    """Memoria de idempotencia.

    En proceso y con TTL. Es suficiente para una sola instancia y para las pruebas
    de integracion; cuando el servicio escale a varias replicas debe respaldarse
    en Redis, igual que hace el api-gateway, o dos replicas procesaran el mismo
    evento. Queda anotado como limitacion conocida y no como decision final.
    """

    def __init__(self, ttl_seconds: int = 60 * 60 * 24) -> None:
        self._ttl = ttl_seconds
        self._seen: dict[str, float] = {}
        self._lock = threading.Lock()

    def claim(self, event_id: str) -> bool:
        """Reserva el evento. Devuelve False si ya estaba reservado."""
        now = time.monotonic()
        with self._lock:
            self._purge(now)
            if event_id in self._seen:
                return False
            self._seen[event_id] = now + self._ttl
            return True

    def release(self, event_id: str) -> None:
        with self._lock:
            self._seen.pop(event_id, None)

    def _purge(self, now: float) -> None:
        expired = [key for key, expires in self._seen.items() if expires <= now]
        for key in expired:
            del self._seen[key]


class SqsEventConsumer:
    def __init__(
        self,
        queue_url: str,
        region: str = "us-east-1",
        endpoint_url: str | None = None,
        wait_time_seconds: int = 20,
    ) -> None:
        self._queue_url = queue_url
        self._wait = wait_time_seconds
        self._client = boto3.client("sqs", region_name=region, endpoint_url=endpoint_url)
        self._handlers: dict[str, list[EventHandler]] = {}
        self._processed = ProcessedEvents()
        self._stopped = False

    def subscribe(self, event_type: str, handler: EventHandler) -> None:
        self._handlers.setdefault(event_type, []).append(handler)

    def stop(self) -> None:
        self._stopped = True

    def run_forever(self) -> None:
        while not self._stopped:
            self.poll_once()

    def poll_once(self) -> int:
        """Una pasada de lectura. Devuelve cuantos mensajes se procesaron."""
        response = self._client.receive_message(
            QueueUrl=self._queue_url,
            MaxNumberOfMessages=10,
            WaitTimeSeconds=self._wait,
        )
        messages = response.get("Messages", [])
        for message in messages:
            self._handle(message)
        return len(messages)

    def _handle(self, message: dict) -> None:
        try:
            event = self._parse(message.get("Body", ""))
            validate_event(event)
        except (json.JSONDecodeError, KeyError, UnknownEventTypeError, ValidationError):
            # Un mensaje que incumple el contrato no mejora con reintentos: se deja
            # que la cola lo lleve a la DLQ para inspeccion manual.
            logger.exception("mensaje descartado por incumplir el contrato")
            return

        event_id = event["eventId"]
        if not self._processed.claim(event_id):
            logger.info("duplicado ignorado: %s", event_id)
            self._delete(message)
            return

        try:
            for handler in self._handlers.get(event["eventType"], []):
                handler(event)
            self._delete(message)
        except Exception:
            # No se borra el mensaje: SQS debe reintentarlo. Se libera la marca
            # para que el reintento se ejecute de verdad y no se descarte como
            # duplicado.
            self._processed.release(event_id)
            logger.exception("fallo al procesar %s, se reintentara", event_id)

    @staticmethod
    def _parse(body: str) -> dict:
        """SNS envuelve el evento salvo que la suscripcion use entrega en crudo."""
        parsed = json.loads(body)
        inner = parsed.get("Message") if isinstance(parsed, dict) else None
        return json.loads(inner) if isinstance(inner, str) else parsed

    def _delete(self, message: dict) -> None:
        self._client.delete_message(
            QueueUrl=self._queue_url,
            ReceiptHandle=message["ReceiptHandle"],
        )
