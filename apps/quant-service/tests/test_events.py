from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

VALID_TEST_MESSAGE = {
    "eventId": "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
    "eventType": "platform.test_message",
    "eventVersion": 1,
    "occurredAt": "2026-01-01T00:00:00.000Z",
    "producer": "api-gateway",
    "payload": {"message": "hello-from-api-gateway"},
}


def test_accepts_a_valid_contract_event():
    response = client.post("/events", json=VALID_TEST_MESSAGE)
    assert response.status_code == 202
    assert response.json()["accepted"] is True

    received = client.get("/events/_debug/received").json()
    assert any(e["eventId"] == VALID_TEST_MESSAGE["eventId"] for e in received)


def test_rejects_event_with_unknown_type():
    bad_event = {**VALID_TEST_MESSAGE, "eventType": "unknown.event", "eventVersion": 1}
    response = client.post("/events", json=bad_event)
    assert response.status_code == 400


def test_rejects_event_that_violates_schema():
    bad_event = {**VALID_TEST_MESSAGE, "payload": {"message": 123}}
    response = client.post("/events", json=bad_event)
    assert response.status_code == 422
