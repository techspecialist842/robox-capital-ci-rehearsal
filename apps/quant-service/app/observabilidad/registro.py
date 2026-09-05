"""Logging estructurado en JSON (ADR-009).

El quant-service no configuraba logging: los mensajes de la aplicacion no
llegaban a ninguna parte y solo se veian las lineas propias de uvicorn. Se
detecto al diagnosticar el consumidor de eventos, que funcionaba correctamente
sin dejar rastro alguno.

El formato replica EXACTAMENTE el del api-gateway (mismos nombres de campo), para
que una consulta en CloudWatch Logs Insights pueda cruzar los dos servicios. Si
cada uno usara sus propios nombres, seguir una operacion de extremo a extremo
obligaria a escribir dos consultas y unirlas a mano.
"""

from __future__ import annotations

import json
import logging
import os
import sys
from datetime import UTC, datetime

from . import correlacion

# Equivalencia con los niveles del api-gateway, para que un filtro por nivel
# signifique lo mismo en ambos servicios.
_NIVELES = {
    "DEBUG": "debug",
    "INFO": "log",
    "WARNING": "warn",
    "ERROR": "error",
    "CRITICAL": "fatal",
}


class FormateadorJson(logging.Formatter):
    def __init__(self, servicio: str, entorno: str) -> None:
        super().__init__()
        self._servicio = servicio
        self._entorno = entorno

    def format(self, record: logging.LogRecord) -> str:
        registro: dict[str, object] = {
            "timestamp": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "level": _NIVELES.get(record.levelname, record.levelname.lower()),
            "service": self._servicio,
            "environment": self._entorno,
            "message": record.getMessage(),
            "context": record.name,
        }

        identificador = correlacion.obtener()
        if identificador:
            registro["correlationId"] = identificador

        if record.exc_info:
            registro["stack"] = self.formatException(record.exc_info)

        return json.dumps(registro, ensure_ascii=False)


def configurar() -> None:
    """Enruta TODOS los logs a stdout con el mismo formato.

    Incluye los de uvicorn: si se dejaran con su formato propio, la mitad de las
    lineas del servicio serian texto plano y la otra mitad JSON, y ninguna
    consulta estructurada funcionaria sobre el conjunto.
    """
    servicio = os.environ.get("SERVICE_NAME", "quant-service")
    entorno = os.environ.get("ENVIRONMENT", "local")
    nivel = os.environ.get("LOG_LEVEL", "INFO").upper()

    manejador = logging.StreamHandler(sys.stdout)
    manejador.setFormatter(FormateadorJson(servicio, entorno))

    raiz = logging.getLogger()
    raiz.handlers = [manejador]
    raiz.setLevel(getattr(logging, nivel, logging.INFO))

    # uvicorn instala sus propios manejadores al arrancar; se los quitamos para
    # que sus mensajes suban a la raiz y salgan con el mismo formato.
    for nombre in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        registrador = logging.getLogger(nombre)
        registrador.handlers = []
        registrador.propagate = True
