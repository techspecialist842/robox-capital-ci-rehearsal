"""Valida eventos entrantes contra los esquemas versionados de packages/event-contracts
(ADR-002). Usa la misma fuente de verdad que la prueba de contrato de Node
(packages/event-contracts/scripts/validate.js), para que NestJS y Python nunca diverjan
sobre la forma de un evento.
"""

import json
from functools import cache
from pathlib import Path

from jsonschema import Draft7Validator, ValidationError

SCHEMAS_DIR = Path(__file__).resolve().parents[4] / "packages" / "event-contracts" / "schemas"


class UnknownEventTypeError(Exception):
    pass


@cache
def _load_validator(event_type: str, event_version: int) -> Draft7Validator:
    schema_path = SCHEMAS_DIR / f"{event_type}.v{event_version}.json"
    if not schema_path.exists():
        raise UnknownEventTypeError(f"Sin esquema para {event_type} v{event_version}")
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    return Draft7Validator(schema)


def validate_event(event: dict) -> None:
    """Lanza ValidationError o UnknownEventTypeError si el evento incumple el contrato."""
    event_type = event.get("eventType")
    event_version = event.get("eventVersion")
    if not event_type or not event_version:
        raise ValidationError("El evento debe incluir eventType y eventVersion")

    validator = _load_validator(event_type, event_version)
    validator.validate(event)
