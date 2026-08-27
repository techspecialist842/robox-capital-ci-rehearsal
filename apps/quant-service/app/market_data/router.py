"""Endpoints de datos de mercado (Fase 2)."""

from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Query

from .provider import DeterministicProvider, MarketDataProvider
from .quality import validar_lote

router = APIRouter(prefix="/market-data", tags=["market-data"])

# El proveedor se resuelve por configuracion (ADR-007). En desarrollo es el
# determinista; el adaptador del proveedor confirmado se activa cuando existan
# credenciales, sin tocar este modulo.
_proveedor: MarketDataProvider = DeterministicProvider()


@router.get("/bars")
def obtener_barras(
    symbol: str = Query(..., min_length=2, max_length=20),
    desde: datetime = Query(...),
    hasta: datetime = Query(...),
    minutos: int = Query(60, ge=1, le=1440),
) -> dict:
    """Devuelve velas junto con su informe de calidad.

    El informe viaja SIEMPRE con los datos, no en un endpoint aparte. Separarlos
    permitiria consumir las velas sin mirar su calidad, que es exactamente el
    error que estas validaciones existen para evitar.
    """
    intervalo = timedelta(minutes=minutos)

    try:
        barras = _proveedor.obtener_historico(symbol, desde, hasta, intervalo)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    informe = validar_lote(symbol, barras, intervalo)

    if not informe.valido:
        # Datos invalidos no se entregan: un backtest sobre ellos daria resultados
        # que parecen validos y no lo son.
        raise HTTPException(
            status_code=422,
            detail={
                "mensaje": "los datos no superan la validacion de calidad",
                "errores": [h.mensaje for h in informe.errores],
            },
        )

    return {
        "symbol": symbol,
        "proveedor": _proveedor.nombre,
        "calidad": {
            "valido": informe.valido,
            "barras_evaluadas": informe.barras_evaluadas,
            "avisos": [{"codigo": h.codigo, "mensaje": h.mensaje} for h in informe.avisos],
        },
        "barras": [b.model_dump(mode="json") for b in barras],
    }
