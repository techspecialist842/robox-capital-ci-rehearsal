"""Endpoints de IA: generacion de recomendaciones y supervision humana (Fase 2)."""

from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .models import DecisionDeRevision, EstadoRevision, Recomendacion
from .orchestrator import OrquestadorDeIa, SalidaDeIaRechazada

router = APIRouter(prefix="/ai", tags=["ai"])

_orquestador = OrquestadorDeIa()

# Bandeja de recomendaciones pendientes de revision. En memoria mientras el
# almacenamiento de decisiones se define en la Fase 4; la persistencia definitiva
# llega con ese modulo. Queda anotado como limitacion conocida.
_recomendaciones: dict[str, Recomendacion] = {}
_revisiones: dict[str, DecisionDeRevision] = {}


class PeticionDeRecomendacion(BaseModel):
    strategy_id: str
    strategy_name: str
    symbol: str
    parameters: dict = Field(default_factory=dict)
    market_summary: str = ""
    prompt_version: int | None = None


class PeticionDeRevision(BaseModel):
    revisor_user_id: str
    aprobada: bool
    comentario: str = Field(default="", max_length=2000)


@router.post("/recommendations", status_code=201)
def generar_recomendacion(peticion: PeticionDeRecomendacion) -> dict:
    try:
        recomendacion = _orquestador.recomendar(**peticion.model_dump())
    except SalidaDeIaRechazada as exc:
        # 422 y no 500: la peticion era valida, la salida del proveedor no.
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    _recomendaciones[recomendacion.recomendacion_id] = recomendacion
    return recomendacion.model_dump(mode="json")


@router.get("/recommendations/pending")
def listar_pendientes() -> list[dict]:
    """Cola de supervision humana."""
    return [
        r.model_dump(mode="json")
        for r in _recomendaciones.values()
        if r.recomendacion_id not in _revisiones
    ]


@router.post("/recommendations/{recomendacion_id}/review")
def revisar(recomendacion_id: str, peticion: PeticionDeRevision) -> dict:
    """Registra la decision humana sobre una recomendacion.

    Una recomendacion solo se revisa una vez: permitir revisarla de nuevo
    equivaldria a poder reescribir una decision ya tomada, y con ella la
    evidencia de quien la tomo.
    """
    if recomendacion_id not in _recomendaciones:
        raise HTTPException(status_code=404, detail="Recomendacion no encontrada")

    if recomendacion_id in _revisiones:
        raise HTTPException(status_code=409, detail="La recomendacion ya fue revisada")

    decision = DecisionDeRevision(
        recomendacion_id=recomendacion_id,
        revisor_user_id=peticion.revisor_user_id,
        aprobada=peticion.aprobada,
        comentario=peticion.comentario,
    )
    _revisiones[recomendacion_id] = decision

    return {
        "recomendacion_id": recomendacion_id,
        "estado": (
            EstadoRevision.APROBADA if peticion.aprobada else EstadoRevision.RECHAZADA
        ).value,
        "revisor_user_id": decision.revisor_user_id,
        "revisada_en": decision.revisada_en.isoformat(),
        # Aprobar NO ejecuta nada: la ejecucion simulada es alcance de la Fase 4.
        "nota": "La aprobacion registra la decision; no coloca ninguna orden.",
    }


@router.get("/cost")
def coste_acumulado() -> dict:
    """Monitoreo de costos de IA (criterio de aceptacion de la Fase 2)."""
    return {
        "llamadas": _orquestador.llamadas_realizadas,
        "coste_acumulado_usd": str(_orquestador.coste_acumulado_usd.quantize(Decimal("0.000001"))),
    }
