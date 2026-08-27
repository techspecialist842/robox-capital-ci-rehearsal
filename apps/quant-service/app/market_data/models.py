"""Modelo canonico de datos de mercado.

Todos los proveedores se normalizan a estas formas antes de entrar en la
plataforma (ADR-007, capa de adaptadores). El resto del sistema nunca ve el
formato propio de un proveedor, que es lo que permite cambiarlo sin tocar
estrategias ni backtesting.

Los precios son ``Decimal`` y NO ``float``. En coma flotante binaria, 0.1 + 0.2
no es 0.3; ese error es irrelevante en un grafico y no lo es en un P&L acumulado
sobre miles de operaciones.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, field_validator


class Bar(BaseModel):
    """Vela OHLCV para un instrumento y un instante."""

    model_config = ConfigDict(frozen=True)

    symbol: str
    timestamp: datetime
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: Decimal

    @field_validator("timestamp")
    @classmethod
    def exige_zona_horaria(cls, valor: datetime) -> datetime:
        """Una marca de tiempo sin zona es ambigua y aqui decide el orden de los hechos."""
        if valor.tzinfo is None:
            raise ValueError("timestamp debe incluir zona horaria (UTC)")
        return valor

    @field_validator("open", "high", "low", "close")
    @classmethod
    def exige_precio_positivo(cls, valor: Decimal) -> Decimal:
        if valor <= 0:
            raise ValueError("los precios deben ser positivos")
        return valor

    @field_validator("volume")
    @classmethod
    def exige_volumen_no_negativo(cls, valor: Decimal) -> Decimal:
        if valor < 0:
            raise ValueError("el volumen no puede ser negativo")
        return valor
