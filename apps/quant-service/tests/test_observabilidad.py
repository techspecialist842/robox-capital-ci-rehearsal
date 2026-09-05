"""Pruebas del logging estructurado y la correlacion.

Existen porque el servicio estuvo emitiendo logs que no llegaban a ninguna parte
y nadie lo detecto: el consumidor de eventos funcionaba correctamente sin dejar
rastro. Un log que no se ve es indistinguible de un log que no existe.

Se comprueba ademas que el formato coincide con el del api-gateway, porque una
consulta en CloudWatch solo puede cruzar ambos servicios si usan los mismos
nombres de campo.
"""

from __future__ import annotations

import json
import logging

from fastapi.testclient import TestClient

from app.main import app
from app.observabilidad import correlacion
from app.observabilidad.registro import FormateadorJson

cliente = TestClient(app)


def formatear(nivel: int = logging.INFO, mensaje: str = "prueba", nombre: str = "robox.x") -> dict:
    registro = logging.LogRecord(
        name=nombre, level=nivel, pathname=__file__, lineno=1,
        msg=mensaje, args=(), exc_info=None,
    )
    return json.loads(FormateadorJson("quant-service", "test").format(registro))


class TestFormato:
    def test_emite_json_con_los_campos_del_api_gateway(self):
        salida = formatear()

        # Los mismos nombres que usa el api-gateway: sin esto una consulta no
        # puede cruzar los dos servicios.
        assert set(salida) >= {
            "timestamp",
            "level",
            "service",
            "environment",
            "message",
            "context",
        }
        assert salida["service"] == "quant-service"
        assert salida["environment"] == "test"

    def test_traduce_los_niveles_a_los_del_api_gateway(self):
        assert formatear(logging.INFO)["level"] == "log"
        assert formatear(logging.WARNING)["level"] == "warn"
        assert formatear(logging.ERROR)["level"] == "error"
        assert formatear(logging.DEBUG)["level"] == "debug"

    def test_cada_registro_es_una_sola_linea(self):
        registro = logging.LogRecord(
            name="robox.x", level=logging.INFO, pathname=__file__, lineno=1,
            msg="con\nsalto de linea", args=(), exc_info=None,
        )
        salida = FormateadorJson("quant-service", "test").format(registro)

        assert "\n" not in salida, "un registro partido rompe el analisis por lineas"


class TestCorrelacion:
    def test_incluye_el_id_cuando_hay_contexto(self):
        testigo = correlacion.establecer("abc-123")
        try:
            assert formatear()["correlationId"] == "abc-123"
        finally:
            correlacion.restaurar(testigo)

    def test_no_lo_incluye_fuera_de_contexto(self):
        assert "correlationId" not in formatear()

    def test_no_se_filtra_entre_contextos(self):
        testigo = correlacion.establecer("primera")
        correlacion.restaurar(testigo)

        assert "correlationId" not in formatear()


class TestMiddleware:
    def test_toda_respuesta_lleva_la_cabecera(self):
        respuesta = cliente.get("/health")

        assert respuesta.headers.get("x-correlation-id")

    def test_respeta_un_id_entrante(self):
        respuesta = cliente.get("/health", headers={"x-correlation-id": "traza-compartida"})

        assert respuesta.headers["x-correlation-id"] == "traza-compartida"

    def test_genera_ids_distintos_por_peticion(self):
        a = cliente.get("/health").headers["x-correlation-id"]
        b = cliente.get("/health").headers["x-correlation-id"]

        assert a != b


class TestRuidoDeLibrerias:
    """Las librerias de AWS no deben inundar el log en modo debug.

    Con DEBUG global, botocore emite decenas de lineas por cada sondeo de SQS.
    El consumidor sondea de forma continua, asi que ese ruido se paga en
    CloudWatch y entierra los mensajes propios.
    """

    def test_las_librerias_de_aws_quedan_en_warning(self, monkeypatch):
        import logging as log

        from app.observabilidad.registro import configurar

        monkeypatch.setenv("LOG_LEVEL", "DEBUG")
        configurar()

        assert log.getLogger().level == log.DEBUG, "la aplicacion si registra en debug"
        for ruidoso in ("botocore", "boto3", "urllib3", "s3transfer"):
            assert log.getLogger(ruidoso).level == log.WARNING, ruidoso
