"""Middleware de correlacion para las peticiones HTTP."""

from __future__ import annotations

from collections.abc import Awaitable, Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from . import correlacion


class MiddlewareDeCorrelacion(BaseHTTPMiddleware):
    """Respeta el ID entrante o genera uno, y lo devuelve siempre.

    Respetar el ID entrante es lo que permite seguir una operacion que empieza en
    el api-gateway y continua aqui: ambos servicios escriben el mismo valor y una
    sola consulta reconstruye el recorrido completo.
    """

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        entrante = request.headers.get(correlacion.CABECERA_CORRELACION)
        identificador = entrante if entrante and entrante.strip() else correlacion.nuevo()

        testigo = correlacion.establecer(identificador)
        try:
            respuesta = await call_next(request)
        finally:
            correlacion.restaurar(testigo)

        respuesta.headers[correlacion.CABECERA_CORRELACION] = identificador
        return respuesta
