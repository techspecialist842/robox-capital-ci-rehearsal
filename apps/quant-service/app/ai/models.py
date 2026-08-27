"""Modelo de las salidas de IA (Fase 2).

Dos criterios de aceptacion se sostienen sobre estas estructuras:

  - "las recomendaciones de IA estan estructuradas, versionadas y auditadas"
  - "la IA no puede colocar ordenes"

El segundo se garantiza por la forma del tipo, no por disciplina de quien
programa: ``Recomendacion`` no tiene ningun campo capaz de expresar una orden
—ni destino de ejecucion, ni identificador de orden, ni tamano en unidades
monetarias— y nace siempre en estado ``pendiente_revision``. Una salida de IA es
una propuesta dirigida a una persona; no existe representacion de "operacion" que
la IA pueda producir.
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, field_validator


class Accion(StrEnum):
    """Sentido de la propuesta. Deliberadamente cualitativo."""

    COMPRAR = "comprar"
    VENDER = "vender"
    MANTENER = "mantener"


class EstadoRevision(StrEnum):
    PENDIENTE = "pendiente_revision"
    APROBADA = "aprobada"
    RECHAZADA = "rechazada"


class Explicabilidad(BaseModel):
    """Registro de por que se produjo una recomendacion.

    Sin esto, una recomendacion es un numero sin defensa posible ante el cliente
    o ante un auditor. Guarda la version exacta del prompt y del modelo, de forma
    que la salida sea reconstruible mas adelante.
    """

    model_config = ConfigDict(frozen=True)

    prompt_id: str
    prompt_version: int
    prompt_hash: str
    modelo: str
    proveedor: str
    razonamiento: str = Field(max_length=4000)
    senales: dict[str, str] = Field(default_factory=dict)


class CosteLlamada(BaseModel):
    """Coste de una llamada al proveedor (criterio: monitoreo de costos de IA)."""

    model_config = ConfigDict(frozen=True)

    tokens_entrada: int = Field(ge=0)
    tokens_salida: int = Field(ge=0)
    coste_usd: Decimal = Field(ge=0)


class Recomendacion(BaseModel):
    """Propuesta de la IA. Nunca una orden."""

    model_config = ConfigDict(frozen=True)

    recomendacion_id: str
    strategy_id: str
    symbol: str
    accion: Accion
    confianza: Decimal = Field(ge=0, le=1)
    horizonte_horas: int = Field(ge=1, le=8760)
    explicabilidad: Explicabilidad
    coste: CosteLlamada
    generada_en: datetime = Field(default_factory=lambda: datetime.now(UTC))

    # Toda recomendacion nace pendiente de revision humana y no puede nacer de
    # otra forma: el validador rechaza cualquier intento de crearla ya aprobada.
    estado: EstadoRevision = EstadoRevision.PENDIENTE

    @field_validator("estado")
    @classmethod
    def debe_nacer_pendiente(cls, valor: EstadoRevision) -> EstadoRevision:
        if valor is not EstadoRevision.PENDIENTE:
            raise ValueError(
                "una recomendacion se crea siempre pendiente de revision; "
                "la aprobacion es un acto humano posterior"
            )
        return valor

    @field_validator("confianza")
    @classmethod
    def confianza_en_rango(cls, valor: Decimal) -> Decimal:
        if not (Decimal(0) <= valor <= Decimal(1)):
            raise ValueError("la confianza debe estar entre 0 y 1")
        return valor


class DecisionDeRevision(BaseModel):
    """Resultado de la supervision humana sobre una recomendacion."""

    model_config = ConfigDict(frozen=True)

    recomendacion_id: str
    revisor_user_id: str
    aprobada: bool
    comentario: str = Field(default="", max_length=2000)
    revisada_en: datetime = Field(default_factory=lambda: datetime.now(UTC))
