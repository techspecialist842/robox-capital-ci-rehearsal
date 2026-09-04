"""Valida eventos entrantes contra los esquemas versionados de packages/event-contracts
(ADR-002). Usa la misma fuente de verdad que la prueba de contrato de Node
(packages/event-contracts/scripts/validate.js), para que NestJS y Python nunca diverjan
sobre la forma de un evento.
"""

import json
import os
from functools import cache
from pathlib import Path

from jsonschema import Draft7Validator, ValidationError


def _resolver_directorio_de_esquemas() -> Path:
    """Localiza los esquemas de eventos.

    En el contenedor la aplicacion no vive dentro del monorepo, asi que deducir
    la ruta contando carpetas hacia arriba falla con IndexError y el servicio ni
    siquiera arranca. Ocurrio en el primer despliegue real.

    EVENT_CONTRACTS_DIR lo declara la imagen; el calculo relativo queda como
    respaldo para ejecutar en local desde el repositorio.
    """
    declarado = os.environ.get("EVENT_CONTRACTS_DIR")
    if declarado:
        return Path(declarado)

    return Path(__file__).resolve().parents[4] / "packages" / "event-contracts" / "schemas"


SCHEMAS_DIR = _resolver_directorio_de_esquemas()


class UnknownEventTypeError(Exception):
    pass


@cache
def _load_validator(event_type: str, event_version: int) -> Draft7Validator:
    schema_path = SCHEMAS_DIR / f"{event_type}.v{event_version}.json"
    if not schema_path.exists():
        raise UnknownEventTypeError(f"Sin esquema para {event_type} v{event_version}")
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    # Sin format_checker, jsonschema IGNORA los "format" del esquema: un eventId que
    # no fuese un UUID pasaria aqui y seria rechazado por el lado de Node, que si
    # los comprueba. Esa asimetria es justo lo que el ADR-002 quiere impedir.
    return Draft7Validator(schema, format_checker=Draft7Validator.FORMAT_CHECKER)


def validate_event(event: dict) -> None:
    """Lanza ValidationError o UnknownEventTypeError si el evento incumple el contrato."""
    event_type = event.get("eventType")
    event_version = event.get("eventVersion")
    if not event_type or not event_version:
        raise ValidationError("El evento debe incluir eventType y eventVersion")

    validator = _load_validator(event_type, event_version)
    validator.validate(event)
