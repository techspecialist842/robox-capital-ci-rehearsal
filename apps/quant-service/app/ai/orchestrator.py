"""Orquestacion de IA (Fase 2).

Convierte la salida cruda de un proveedor en una ``Recomendacion`` estructurada,
versionada y auditable, y lleva la cuenta del coste acumulado.

Sobre "la IA no puede colocar ordenes": la garantia principal es estructural —el
tipo ``Recomendacion`` no puede expresar una orden—. Aqui se anade una segunda
barrera que rechaza salidas con lenguaje de ejecucion. No porque el tipo sea
insuficiente, sino porque una salida que intenta dar instrucciones de ejecucion
indica que algo va mal (un prompt manipulado, un proveedor comprometido) y eso
debe detenerse y quedar registrado, no normalizarse.
"""

from __future__ import annotations

import logging
import re
import uuid
from decimal import Decimal

from .models import Accion, CosteLlamada, Explicabilidad, Recomendacion
from .prompts import PROMPT_RECOMENDACION, RegistroDePrompts, registro_por_defecto
from .provider import ProveedorDeIa, ProveedorDeterminista, RespuestaDeIa

logger = logging.getLogger("robox.quant_service.ai")

# Lenguaje que una propuesta no debe contener. Si aparece, la salida se rechaza.
PATRONES_DE_EJECUCION = [
    re.compile(r"\bcoloca(r)?\s+(la\s+)?orden\b", re.IGNORECASE),
    re.compile(r"\bejecuta(r)?\s+(la\s+)?(orden|operacion)\b", re.IGNORECASE),
    re.compile(r"\benvia(r)?\s+al\s+broker\b", re.IGNORECASE),
    re.compile(r"\bplace\s+order\b", re.IGNORECASE),
    re.compile(r"\bexecute\s+trade\b", re.IGNORECASE),
]


class SalidaDeIaRechazada(ValueError):
    """La salida del proveedor no cumple las garantias de la plataforma."""


class OrquestadorDeIa:
    def __init__(
        self,
        proveedor: ProveedorDeIa | None = None,
        registro: RegistroDePrompts | None = None,
    ) -> None:
        self._proveedor = proveedor or ProveedorDeterminista()
        self._registro = registro or registro_por_defecto()
        self._coste_acumulado = Decimal("0")
        self._llamadas = 0

    @property
    def coste_acumulado_usd(self) -> Decimal:
        return self._coste_acumulado

    @property
    def llamadas_realizadas(self) -> int:
        return self._llamadas

    def recomendar(
        self,
        *,
        strategy_id: str,
        strategy_name: str,
        symbol: str,
        parameters: dict,
        market_summary: str,
        prompt_version: int | None = None,
    ) -> Recomendacion:
        version = (
            self._registro.obtener(PROMPT_RECOMENDACION, prompt_version)
            if prompt_version
            else self._registro.ultima(PROMPT_RECOMENDACION)
        )

        prompt = version.renderizar(
            symbol=symbol,
            strategy_name=strategy_name,
            parameters=parameters,
            market_summary=market_summary,
        )

        respuesta = self._proveedor.completar(prompt)
        self._verificar_ausencia_de_ordenes(respuesta)

        coste = self._calcular_coste(respuesta)
        self._coste_acumulado += coste.coste_usd
        self._llamadas += 1

        return Recomendacion(
            recomendacion_id=str(uuid.uuid4()),
            strategy_id=strategy_id,
            symbol=symbol,
            accion=self._interpretar_accion(respuesta.accion),
            confianza=respuesta.confianza,
            horizonte_horas=respuesta.horizonte_horas,
            explicabilidad=Explicabilidad(
                prompt_id=version.prompt_id,
                prompt_version=version.version,
                prompt_hash=version.hash,
                modelo=respuesta.modelo,
                proveedor=self._proveedor.nombre,
                razonamiento=respuesta.razonamiento,
                senales=respuesta.senales,
            ),
            coste=coste,
        )

    def _verificar_ausencia_de_ordenes(self, respuesta: RespuestaDeIa) -> None:
        texto = f"{respuesta.razonamiento} {' '.join(respuesta.senales.values())}"
        for patron in PATRONES_DE_EJECUCION:
            if patron.search(texto):
                logger.error(
                    "salida de IA rechazada: contiene lenguaje de ejecucion (%s)",
                    patron.pattern,
                )
                raise SalidaDeIaRechazada(
                    "la salida del proveedor contiene instrucciones de ejecucion; "
                    "la IA no puede colocar ordenes"
                )

    @staticmethod
    def _interpretar_accion(valor: str) -> Accion:
        try:
            return Accion(valor.strip().lower())
        except ValueError as exc:
            # Una accion desconocida no se aproxima ni se convierte en "mantener":
            # adivinar la intencion del modelo es justo lo que no debe hacerse.
            raise SalidaDeIaRechazada(f"accion no reconocida: {valor!r}") from exc

    def _calcular_coste(self, respuesta: RespuestaDeIa) -> CosteLlamada:
        entrada, salida = self._proveedor.coste_por_mil_tokens
        coste = (
            Decimal(respuesta.tokens_entrada) / Decimal(1000) * entrada
            + Decimal(respuesta.tokens_salida) / Decimal(1000) * salida
        )
        return CosteLlamada(
            tokens_entrada=respuesta.tokens_entrada,
            tokens_salida=respuesta.tokens_salida,
            coste_usd=coste.quantize(Decimal("0.000001")),
        )
