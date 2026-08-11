import logging

from fastapi import APIRouter, HTTPException
from jsonschema import ValidationError

from .contract_validator import UnknownEventTypeError, validate_event

logger = logging.getLogger("robox.quant_service.events")
router = APIRouter(prefix="/events", tags=["events"])

# Bandeja en memoria de eventos recibidos — respalda la prueba de extremo a extremo
# de la Fase 1 (Kickoff Dia 8): api-gateway/un script de prueba publica un
# platform.test_message y este endpoint lo recibe y valida contra el contrato.
_received_events: list[dict] = []


@router.post("", status_code=202)
def receive_event(event: dict) -> dict:
    try:
        validate_event(event)
    except UnknownEventTypeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.message) from exc

    logger.info("evento recibido: %s v%s", event["eventType"], event["eventVersion"])
    _received_events.append(event)
    return {"accepted": True, "eventId": event["eventId"]}


@router.get("/_debug/received")
def list_received_events() -> list[dict]:
    """Solo para pruebas locales/E2E — no exponer en produccion."""
    return _received_events
