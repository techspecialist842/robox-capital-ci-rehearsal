"""Propagacion del ID de correlacion (ADR-009).

Mismo concepto que en el api-gateway: cada peticion o evento abre un contexto y
todo lo que se registre dentro queda ligado a el. Sin esto, seguir una operacion
que cruza los dos servicios obliga a adivinar por marcas de tiempo.

Se usa contextvars y no una variable global: funciona tanto en las corrutinas de
FastAPI como en el hilo del consumidor de eventos, y cada una ve su propio valor.
"""

from __future__ import annotations

import uuid
from contextvars import ContextVar

CABECERA_CORRELACION = "x-correlation-id"

_correlacion: ContextVar[str | None] = ContextVar("correlacion", default=None)


def obtener() -> str | None:
    return _correlacion.get()


def establecer(valor: str) -> object:
    """Fija el ID y devuelve el testigo necesario para restaurarlo despues."""
    return _correlacion.set(valor)


def restaurar(testigo: object) -> None:
    _correlacion.reset(testigo)  # type: ignore[arg-type]


def nuevo() -> str:
    return str(uuid.uuid4())
