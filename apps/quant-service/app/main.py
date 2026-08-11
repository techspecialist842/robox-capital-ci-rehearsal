from fastapi import FastAPI

from app.config import settings
from app.events.router import router as events_router
from app.health import router as health_router

app = FastAPI(
    title="roboX Capital — Quant Service",
    description="Datos de mercado, backtesting, motor de riesgo, orquestacion de IA (ADR-001).",
    version="0.1.0",
)

app.include_router(health_router)
app.include_router(events_router)


@app.get("/")
def root() -> dict:
    return {
        "service": "quant-service",
        "broker_provider": settings.broker_provider,
        "market_data_provider": settings.market_data_provider,
        "ai_provider": settings.ai_provider,
    }
