from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "quant-service"


def test_root_reports_confirmed_providers():
    response = client.get("/")
    assert response.status_code == 200
    body = response.json()
    assert body["broker_provider"] == "interactive_brokers"
    assert body["ai_provider"] == "openai"
