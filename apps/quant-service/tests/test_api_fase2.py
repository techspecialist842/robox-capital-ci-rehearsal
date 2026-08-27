"""Pruebas de los endpoints de la Fase 2, a traves de la aplicacion completa."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

cliente = TestClient(app)

PETICION = {
    "strategy_id": "estrategia-1",
    "strategy_name": "Momento Oro",
    "symbol": "XAUUSD",
    "parameters": {"ventana": 20},
    "market_summary": "tendencia alcista",
}


class TestDatosDeMercado:
    def test_devuelve_velas_con_su_informe_de_calidad(self):
        respuesta = cliente.get(
            "/market-data/bars",
            params={
                "symbol": "XAUUSD",
                "desde": "2026-08-24T12:00:00Z",
                "hasta": "2026-08-24T18:00:00Z",
                "minutos": 60,
            },
        )

        assert respuesta.status_code == 200
        cuerpo = respuesta.json()
        assert cuerpo["calidad"]["valido"] is True
        assert len(cuerpo["barras"]) == 7
        assert "calidad" in cuerpo, "el informe viaja siempre con los datos"

    def test_rechaza_un_rango_invertido(self):
        respuesta = cliente.get(
            "/market-data/bars",
            params={
                "symbol": "XAUUSD",
                "desde": "2026-08-24T18:00:00Z",
                "hasta": "2026-08-24T12:00:00Z",
            },
        )

        assert respuesta.status_code == 422


class TestRecomendacionesDeIa:
    def test_genera_una_recomendacion_pendiente_de_revision(self):
        respuesta = cliente.post("/ai/recommendations", json=PETICION)

        assert respuesta.status_code == 201
        cuerpo = respuesta.json()
        assert cuerpo["estado"] == "pendiente_revision"
        assert cuerpo["explicabilidad"]["prompt_version"] >= 1
        assert "coste" in cuerpo

    def test_la_recomendacion_no_contiene_nada_ejecutable(self):
        cuerpo = cliente.post("/ai/recommendations", json=PETICION).json()

        prohibidos = {"order_id", "broker", "cantidad", "quantity", "destino_ejecucion"}
        assert set(cuerpo) & prohibidos == set()

    def test_aparece_en_la_cola_de_supervision(self):
        creada = cliente.post("/ai/recommendations", json=PETICION).json()

        pendientes = cliente.get("/ai/recommendations/pending").json()
        ids = [r["recomendacion_id"] for r in pendientes]

        assert creada["recomendacion_id"] in ids

    def test_la_revision_humana_registra_la_decision(self):
        creada = cliente.post("/ai/recommendations", json=PETICION).json()

        respuesta = cliente.post(
            f"/ai/recommendations/{creada['recomendacion_id']}/review",
            json={"revisor_user_id": "user-1", "aprobada": True, "comentario": "conforme"},
        )

        assert respuesta.status_code == 200
        assert respuesta.json()["estado"] == "aprobada"

    def test_una_recomendacion_no_se_revisa_dos_veces(self):
        creada = cliente.post("/ai/recommendations", json=PETICION).json()
        ruta = f"/ai/recommendations/{creada['recomendacion_id']}/review"
        cliente.post(ruta, json={"revisor_user_id": "user-1", "aprobada": True})

        segunda = cliente.post(ruta, json={"revisor_user_id": "user-2", "aprobada": False})

        assert segunda.status_code == 409

    def test_revisar_una_recomendacion_inexistente_da_404(self):
        respuesta = cliente.post(
            "/ai/recommendations/no-existe/review",
            json={"revisor_user_id": "user-1", "aprobada": True},
        )

        assert respuesta.status_code == 404

    def test_expone_el_coste_acumulado(self):
        respuesta = cliente.get("/ai/cost")

        assert respuesta.status_code == 200
        assert "coste_acumulado_usd" in respuesta.json()
