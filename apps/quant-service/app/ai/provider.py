"""Capa de adaptadores del proveedor de IA (ADR-007).

Igual que con los datos de mercado, la plataforma depende de la interfaz y no de
un proveedor concreto. ``ProveedorDeterminista`` permite desarrollar y correr el
pipeline sin una clave de pago y sin que los resultados varien entre ejecuciones,
que es imprescindible para poder escribir pruebas sobre la orquestacion.
"""

from __future__ import annotations

import hashlib
from abc import ABC, abstractmethod
from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True)
class RespuestaDeIa:
    """Salida cruda del proveedor, antes de validarse y estructurarse."""

    accion: str
    confianza: Decimal
    horizonte_horas: int
    razonamiento: str
    senales: dict[str, str]
    tokens_entrada: int
    tokens_salida: int
    modelo: str


class ProveedorDeIa(ABC):
    @property
    @abstractmethod
    def nombre(self) -> str: ...

    @property
    @abstractmethod
    def coste_por_mil_tokens(self) -> tuple[Decimal, Decimal]:
        """(entrada, salida) en USD. Necesario para el monitoreo de costos."""

    @abstractmethod
    def completar(self, prompt: str) -> RespuestaDeIa: ...


class ProveedorDeterminista(ProveedorDeIa):
    """Proveedor reproducible para desarrollo y pruebas."""

    @property
    def nombre(self) -> str:
        return "determinista"

    @property
    def coste_por_mil_tokens(self) -> tuple[Decimal, Decimal]:
        return Decimal("0.003"), Decimal("0.015")

    def completar(self, prompt: str) -> RespuestaDeIa:
        digest = hashlib.sha256(prompt.encode("utf-8")).digest()
        indice = digest[0] % 3
        accion = ["comprar", "vender", "mantener"][indice]
        confianza = Decimal(digest[1] % 101) / Decimal(100)

        return RespuestaDeIa(
            accion=accion,
            confianza=confianza,
            horizonte_horas=1 + digest[2] % 72,
            razonamiento=(
                f"Propuesta {accion} derivada de las senales del periodo evaluado. "
                "Generada por el proveedor determinista de desarrollo."
            ),
            senales={"tendencia": accion, "volatilidad": str(digest[3] % 100)},
            tokens_entrada=len(prompt) // 4,
            tokens_salida=64,
            modelo="determinista-v1",
        )
