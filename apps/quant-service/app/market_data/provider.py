"""Capa de adaptadores de datos de mercado (ADR-007).

El resto de la plataforma depende de ``MarketDataProvider``, nunca de un
proveedor concreto. Cambiar de proveedor debe ser cambiar una linea de
configuracion, no reescribir estrategias.

``DeterministicProvider`` no es un mock de pruebas: es el proveedor de desarrollo.
Genera series reproducibles a partir de una semilla, lo que permite trabajar y
correr el pipeline sin credenciales de un proveedor de pago y sin que los
resultados cambien entre ejecuciones. El adaptador real del proveedor confirmado
en el Paso 0 se anade cuando existan credenciales.
"""

from __future__ import annotations

import hashlib
from abc import ABC, abstractmethod
from datetime import datetime, timedelta
from decimal import Decimal

from .models import Bar


class MarketDataProvider(ABC):
    """Interfaz que todo proveedor debe cumplir."""

    @property
    @abstractmethod
    def nombre(self) -> str: ...

    @abstractmethod
    def obtener_historico(
        self,
        symbol: str,
        desde: datetime,
        hasta: datetime,
        intervalo: timedelta,
    ) -> list[Bar]:
        """Devuelve velas ordenadas cronologicamente, ambos extremos incluidos."""


class DeterministicProvider(MarketDataProvider):
    """Proveedor reproducible para desarrollo y pruebas."""

    def __init__(self, semilla: str = "robox", precio_base: Decimal = Decimal("2000")) -> None:
        self._semilla = semilla
        self._precio_base = precio_base

    @property
    def nombre(self) -> str:
        return "determinista"

    def obtener_historico(
        self,
        symbol: str,
        desde: datetime,
        hasta: datetime,
        intervalo: timedelta,
    ) -> list[Bar]:
        if desde > hasta:
            raise ValueError("'desde' no puede ser posterior a 'hasta'")
        if intervalo <= timedelta(0):
            raise ValueError("el intervalo debe ser positivo")

        barras: list[Bar] = []
        momento = desde

        while momento <= hasta:
            cierre = self._precio(symbol, momento)
            # Se construye la vela de forma que high y low acoten siempre a open y
            # close: un proveedor de desarrollo no debe generar datos que las
            # propias validaciones de calidad rechazarian.
            apertura = self._precio(symbol, momento - intervalo)
            maximo = max(apertura, cierre) * Decimal("1.002")
            minimo = min(apertura, cierre) * Decimal("0.998")

            barras.append(
                Bar(
                    symbol=symbol,
                    timestamp=momento,
                    open=apertura,
                    high=maximo.quantize(Decimal("0.01")),
                    low=minimo.quantize(Decimal("0.01")),
                    close=cierre,
                    volume=Decimal(self._entero(symbol, momento, 1000, 5000)),
                )
            )
            momento += intervalo

        return barras

    def _precio(self, symbol: str, momento: datetime) -> Decimal:
        """Precio estable para un instrumento e instante dados."""
        desviacion = self._entero(symbol, momento, -500, 500)
        precio = self._precio_base + Decimal(desviacion) / Decimal(100)
        return max(precio, Decimal("0.01")).quantize(Decimal("0.01"))

    def _entero(self, symbol: str, momento: datetime, minimo: int, maximo: int) -> int:
        """Entero derivado por hash: mismo dato de entrada, mismo resultado siempre."""
        clave = f"{self._semilla}:{symbol}:{momento.isoformat()}".encode()
        digest = hashlib.sha256(clave).digest()
        valor = int.from_bytes(digest[:4], "big")
        return minimo + valor % (maximo - minimo + 1)
