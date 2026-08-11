from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuracion del servicio, cargada desde variables de entorno (.env en la raiz del repo)."""

    model_config = SettingsConfigDict(env_file="../../.env", extra="ignore")

    quant_service_port: int = 8000

    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "robox"
    postgres_user: str = "robox"
    postgres_password: str = "robox_dev_only"

    redis_host: str = "localhost"
    redis_port: int = 6379

    # ADR-007 — nombres de proveedor seleccionados por el cliente; la logica de
    # integracion concreta vive detras de un adaptador, nunca aqui directamente.
    broker_provider: str = "interactive_brokers"
    market_data_provider: str = "interactive_brokers"
    ai_provider: str = "openai"


settings = Settings()
