"""Pruebas de la semantica del consumidor SQS.

No necesitan AWS: sustituyen el cliente de boto3 por uno falso. Lo que se verifica
aqui son las tres reglas de packages/event-contracts/SEMANTICA.md, que son
justamente las que un entorno de desarrollo sincrono no deja ver.
"""

from __future__ import annotations

import json
import uuid

import pytest

from app.events.consumer import ProcessedEvents, SqsEventConsumer


def _event(event_id: str | None = None) -> dict:
    return {
        "eventId": event_id or str(uuid.uuid4()),
        "eventType": "platform.test_message",
        "eventVersion": 1,
        "occurredAt": "2026-08-12T09:00:00.000Z",
        "producer": "api-gateway",
        "payload": {"message": "hola"},
    }


class FakeSqs:
    """Cliente SQS minimo: entrega lo que se le encola y anota los borrados."""

    def __init__(self) -> None:
        self.messages: list[dict] = []
        self.deleted: list[str] = []

    def enqueue(self, event: dict, *, wrapped_by_sns: bool = False) -> None:
        body = json.dumps({"Message": json.dumps(event)}) if wrapped_by_sns else json.dumps(event)
        self.messages.append({"Body": body, "ReceiptHandle": f"rh-{len(self.messages)}"})

    def receive_message(self, **_kwargs) -> dict:
        pending, self.messages = self.messages, []
        return {"Messages": pending} if pending else {}

    def delete_message(self, *, QueueUrl: str, ReceiptHandle: str) -> None:  # noqa: N803
        self.deleted.append(ReceiptHandle)


@pytest.fixture
def consumer(monkeypatch) -> tuple[SqsEventConsumer, FakeSqs]:
    fake = FakeSqs()
    monkeypatch.setattr("boto3.client", lambda *args, **kwargs: fake)
    return SqsEventConsumer(queue_url="http://cola", wait_time_seconds=0), fake


def test_procesa_un_evento_valido_y_lo_borra(consumer):
    consumidor, fake = consumer
    recibidos: list[dict] = []
    consumidor.subscribe("platform.test_message", recibidos.append)

    fake.enqueue(_event())
    consumidor.poll_once()

    assert len(recibidos) == 1
    assert len(fake.deleted) == 1


def test_regla_1_una_reentrega_no_se_procesa_dos_veces(consumer):
    consumidor, fake = consumer
    recibidos: list[dict] = []
    consumidor.subscribe("platform.test_message", recibidos.append)

    evento = _event()
    fake.enqueue(evento)
    consumidor.poll_once()
    fake.enqueue(evento)  # misma entrega, otra vez
    consumidor.poll_once()

    assert len(recibidos) == 1, "el duplicado no debe llegar al manejador"
    assert len(fake.deleted) == 2, "pero si debe borrarse de la cola"


def test_regla_3_un_fallo_no_borra_el_mensaje(consumer):
    consumidor, fake = consumer

    def explota(_event: dict) -> None:
        raise RuntimeError("fallo del manejador")

    consumidor.subscribe("platform.test_message", explota)
    fake.enqueue(_event())
    consumidor.poll_once()

    assert fake.deleted == [], "un fallo debe dejar que SQS reintregue el mensaje"


def test_regla_3_el_reintento_vuelve_a_ejecutarse_de_verdad(consumer):
    consumidor, fake = consumer
    intentos: list[dict] = []

    def falla_la_primera_vez(event: dict) -> None:
        intentos.append(event)
        if len(intentos) == 1:
            raise RuntimeError("fallo transitorio")

    consumidor.subscribe("platform.test_message", falla_la_primera_vez)
    evento = _event()

    fake.enqueue(evento)
    consumidor.poll_once()
    fake.enqueue(evento)
    consumidor.poll_once()

    assert len(intentos) == 2, "el reintento no puede descartarse como duplicado"
    assert len(fake.deleted) == 1


def test_acepta_el_sobre_de_sns(consumer):
    consumidor, fake = consumer
    recibidos: list[dict] = []
    consumidor.subscribe("platform.test_message", recibidos.append)

    fake.enqueue(_event(), wrapped_by_sns=True)
    consumidor.poll_once()

    assert len(recibidos) == 1


def test_un_evento_que_incumple_el_contrato_no_se_borra(consumer):
    consumidor, fake = consumer
    invalido = _event()
    del invalido["payload"]

    fake.enqueue(invalido)
    consumidor.poll_once()

    assert fake.deleted == [], "debe acabar en la DLQ, no desaparecer"


def test_la_memoria_de_idempotencia_caduca():
    procesados = ProcessedEvents(ttl_seconds=0)

    assert procesados.claim("evento-1") is True
    assert procesados.claim("evento-1") is True, "pasado el TTL vuelve a admitirse"
