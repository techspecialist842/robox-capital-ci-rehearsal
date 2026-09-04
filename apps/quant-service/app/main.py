from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.ai.router import router as ai_router
from app.config import settings
from app.events.lifecycle import detener_consumidor, iniciar_consumidor
from app.events.router import router as events_router
from app.health import router as health_router
from app.market_data.router import router as market_data_router


@asynccontextmanager
async def ciclo_de_vida(_app: FastAPI) -> AsyncIterator[None]:
    """Arranca el consumidor de eventos junto con el servicio.

    Sin esto los eventos llegan a la cola y se acumulan sin que nadie los
    procese, que es exactamente lo que ocurria: el consumidor estaba escrito
    pero no lo iniciaba nadie.
    """
    iniciar_consumidor()
    try:
        yield
    finally:
        detener_consumidor()


app = FastAPI(
    title="roboX Capital — Quant Service",
    description="Datos de mercado, backtesting, motor de riesgo, orquestacion de IA (ADR-001).",
    version="0.2.0",
    lifespan=ciclo_de_vida,
)

app.include_router(health_router)
app.include_router(events_router)
app.include_router(market_data_router)
app.include_router(ai_router)


@app.get("/")
def root() -> dict:
    return {
        "service": "quant-service",
        "broker_provider": settings.broker_provider,
        "market_data_provider": settings.market_data_provider,
        "ai_provider": settings.ai_provider,
    }
