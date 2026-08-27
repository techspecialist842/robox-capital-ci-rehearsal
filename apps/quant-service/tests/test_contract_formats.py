"""Verifica que el validador de Python aplica los formatos del esquema.

Sin format_checker, jsonschema ignora los "format" y aceptaria un eventId que no
es un UUID. El lado de Node si los comprueba, de modo que el mismo evento seria
valido para un servicio e invalido para el otro: exactamente la divergencia que
el ADR-002 existe para evitar.
"""

from __future__ import annotations

import pytest
from jsonschema import ValidationError

from app.events.contract_validator import validate_event


def evento(**cambios) -> dict:
    base = {
        "eventId": "3f1c8a2e-9b7d-4c5a-8e1f-2d4b6a8c0e91",
        "eventType": "strategy.status_changed",
        "eventVersion": 1,
        "occurredAt": "2026-08-24T09:00:00.000Z",
        "producer": "api-gateway",
        "payload": {
            "strategyId": "7a2d9c4b-1e3f-4a6b-9c8d-5e7f1a3b2c4d",
            "status": "suspended",
        },
    }
    base.update(cambios)
    return base


def test_un_evento_correcto_pasa():
    validate_event(evento())


def test_rechaza_un_eventId_que_no_es_uuid():
    with pytest.raises(ValidationError):
        validate_event(evento(eventId="no-soy-un-uuid"))


def test_rechaza_una_fecha_mal_formada():
    with pytest.raises(ValidationError):
        validate_event(evento(occurredAt="24 de agosto de 2026"))


def test_rechaza_un_estado_fuera_del_ciclo_de_vida():
    malo = evento()
    malo["payload"]["status"] = "liquidada"

    with pytest.raises(ValidationError):
        validate_event(malo)


def test_rechaza_campos_no_declarados():
    with pytest.raises(ValidationError):
        validate_event(evento(campoInventado="x"))


def test_rechaza_un_productor_desconocido():
    with pytest.raises(ValidationError):
        validate_event(evento(producer="servicio-fantasma"))
