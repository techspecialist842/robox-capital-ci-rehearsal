"""Pruebas de la orquestacion de IA.

Cubren tres criterios de aceptacion de la Fase 2:

  - las recomendaciones estan estructuradas, versionadas y auditadas
  - la IA no puede colocar ordenes
  - existe flujo de supervision humana sobre las salidas de IA
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.ai.models import Accion, EstadoRevision, Recomendacion
from app.ai.orchestrator import OrquestadorDeIa, SalidaDeIaRechazada
from app.ai.prompts import (
    PROMPT_RECOMENDACION,
    PromptDesconocidoError,
    RegistroDePrompts,
    registro_por_defecto,
)
from app.ai.provider import ProveedorDeIa, RespuestaDeIa

PETICION = {
    "strategy_id": "estrategia-1",
    "strategy_name": "Momento Oro",
    "symbol": "XAUUSD",
    "parameters": {"ventana": 20},
    "market_summary": "tendencia alcista moderada",
}


class ProveedorConTexto(ProveedorDeIa):
    """Proveedor controlable, para simular salidas concretas."""

    def __init__(self, razonamiento: str = "analisis normal", accion: str = "comprar") -> None:
        self._razonamiento = razonamiento
        self._accion = accion

    @property
    def nombre(self) -> str:
        return "controlado"

    @property
    def coste_por_mil_tokens(self) -> tuple[Decimal, Decimal]:
        return Decimal("0.003"), Decimal("0.015")

    def completar(self, prompt: str) -> RespuestaDeIa:
        return RespuestaDeIa(
            accion=self._accion,
            confianza=Decimal("0.7"),
            horizonte_horas=24,
            razonamiento=self._razonamiento,
            senales={"tendencia": "alcista"},
            tokens_entrada=1000,
            tokens_salida=500,
            modelo="controlado-v1",
        )


class TestLaIaNoPuedeColocarOrdenes:
    """El criterio mas importante de la fase."""

    def test_el_tipo_recomendacion_no_admite_campos_de_orden(self):
        campos = set(Recomendacion.model_fields)
        prohibidos = {
            "order_id",
            "orden_id",
            "broker",
            "cantidad",
            "quantity",
            "ejecutar",
            "execute",
            "destino_ejecucion",
        }

        assert campos & prohibidos == set(), (
            "Recomendacion no puede tener campos capaces de expresar una orden"
        )

    def test_una_recomendacion_nace_pendiente_de_revision(self):
        recomendacion = OrquestadorDeIa(ProveedorConTexto()).recomendar(**PETICION)

        assert recomendacion.estado is EstadoRevision.PENDIENTE

    def test_no_se_puede_crear_una_recomendacion_ya_aprobada(self):
        base = OrquestadorDeIa(ProveedorConTexto()).recomendar(**PETICION)
        datos = base.model_dump()
        datos["estado"] = EstadoRevision.APROBADA

        with pytest.raises(ValidationError, match="pendiente de revision"):
            Recomendacion(**datos)

    @pytest.mark.parametrize(
        "texto",
        [
            "Coloca la orden de compra inmediatamente",
            "Ejecutar la operacion en el broker",
            "Enviar al broker sin revision",
            "Place order now",
            "Execute trade at market",
        ],
    )
    def test_rechaza_salidas_con_lenguaje_de_ejecucion(self, texto: str):
        orquestador = OrquestadorDeIa(ProveedorConTexto(razonamiento=texto))

        with pytest.raises(SalidaDeIaRechazada, match="no puede colocar ordenes"):
            orquestador.recomendar(**PETICION)

    def test_una_salida_rechazada_no_cuenta_como_llamada_valida(self):
        orquestador = OrquestadorDeIa(ProveedorConTexto(razonamiento="Place order now"))

        with pytest.raises(SalidaDeIaRechazada):
            orquestador.recomendar(**PETICION)

        assert orquestador.llamadas_realizadas == 0

    def test_una_accion_desconocida_se_rechaza_en_vez_de_aproximarse(self):
        orquestador = OrquestadorDeIa(ProveedorConTexto(accion="liquidar_todo"))

        with pytest.raises(SalidaDeIaRechazada, match="accion no reconocida"):
            orquestador.recomendar(**PETICION)


class TestEstructuraYVersionado:
    def test_la_recomendacion_es_estructurada(self):
        recomendacion = OrquestadorDeIa(ProveedorConTexto()).recomendar(**PETICION)

        assert recomendacion.accion is Accion.COMPRAR
        assert Decimal(0) <= recomendacion.confianza <= Decimal(1)
        assert recomendacion.symbol == "XAUUSD"

    def test_registra_la_version_exacta_del_prompt(self):
        registro = registro_por_defecto()
        version = registro.ultima(PROMPT_RECOMENDACION)

        recomendacion = OrquestadorDeIa(ProveedorConTexto(), registro).recomendar(**PETICION)

        assert recomendacion.explicabilidad.prompt_version == version.version
        assert recomendacion.explicabilidad.prompt_hash == version.hash

    def test_registrar_una_version_nueva_no_altera_la_anterior(self):
        registro = registro_por_defecto()
        primera = registro.ultima(PROMPT_RECOMENDACION)

        registro.registrar(PROMPT_RECOMENDACION, "plantilla distinta {symbol}")
        segunda = registro.ultima(PROMPT_RECOMENDACION)

        assert segunda.version == primera.version + 1
        assert registro.obtener(PROMPT_RECOMENDACION, 1).plantilla == primera.plantilla
        assert primera.hash != segunda.hash

    def test_se_puede_generar_con_una_version_anterior_del_prompt(self):
        registro = registro_por_defecto()
        registro.registrar(PROMPT_RECOMENDACION, "plantilla nueva para {symbol}")

        recomendacion = OrquestadorDeIa(ProveedorConTexto(), registro).recomendar(
            **PETICION, prompt_version=1
        )

        assert recomendacion.explicabilidad.prompt_version == 1

    def test_un_prompt_inexistente_falla_de_forma_explicita(self):
        with pytest.raises(PromptDesconocidoError):
            RegistroDePrompts().ultima("no.existe")

    def test_una_plantilla_a_la_que_le_faltan_variables_falla_al_renderizar(self):
        registro = RegistroDePrompts()
        version = registro.registrar("p", "necesita {ausente}")

        with pytest.raises(ValueError, match="falta la variable"):
            version.renderizar(symbol="XAUUSD")


class TestExplicabilidadYCoste:
    def test_registra_el_razonamiento_y_las_senales(self):
        recomendacion = OrquestadorDeIa(ProveedorConTexto()).recomendar(**PETICION)

        assert recomendacion.explicabilidad.razonamiento
        assert recomendacion.explicabilidad.senales == {"tendencia": "alcista"}
        assert recomendacion.explicabilidad.proveedor == "controlado"

    def test_calcula_el_coste_de_la_llamada(self):
        recomendacion = OrquestadorDeIa(ProveedorConTexto()).recomendar(**PETICION)

        # 1000 tokens de entrada a 0.003/1000 + 500 de salida a 0.015/1000
        assert recomendacion.coste.coste_usd == Decimal("0.010500")

    def test_acumula_el_coste_entre_llamadas(self):
        orquestador = OrquestadorDeIa(ProveedorConTexto())

        orquestador.recomendar(**PETICION)
        orquestador.recomendar(**PETICION)

        assert orquestador.coste_acumulado_usd == Decimal("0.021000")
        assert orquestador.llamadas_realizadas == 2


class TestReproducibilidad:
    def test_el_proveedor_de_desarrollo_da_la_misma_salida_para_la_misma_entrada(self):
        a = OrquestadorDeIa().recomendar(**PETICION)
        b = OrquestadorDeIa().recomendar(**PETICION)

        assert a.accion == b.accion
        assert a.confianza == b.confianza
        assert a.recomendacion_id != b.recomendacion_id, "cada recomendacion es unica"
