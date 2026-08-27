"""Pruebas de las validaciones de calidad de datos de mercado.

Verifican tanto que los datos limpios pasan como que cada tipo de suciedad real
se detecta con la severidad correcta. La distincion entre error y aviso es la
parte que importa: marcar como error algo normal del mercado paralizaria la
ingesta, y marcar como aviso un dato corrupto lo dejaria entrar en un backtest.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest

from app.market_data.models import Bar
from app.market_data.provider import DeterministicProvider
from app.market_data.quality import Severidad, validar_lote

INTERVALO = timedelta(hours=1)
INICIO = datetime(2026, 8, 24, 12, 0, tzinfo=UTC)


def barra(
    desplazamiento: int = 0,
    *,
    symbol: str = "XAUUSD",
    close: str = "2000.00",
    open_: str | None = None,
    high: str | None = None,
    low: str | None = None,
) -> Bar:
    cierre = Decimal(close)
    apertura = Decimal(open_) if open_ else cierre
    return Bar(
        symbol=symbol,
        timestamp=INICIO + desplazamiento * INTERVALO,
        open=apertura,
        high=Decimal(high) if high else max(apertura, cierre),
        low=Decimal(low) if low else min(apertura, cierre),
        close=cierre,
        volume=Decimal("100"),
    )


def codigos(informe) -> set[str]:
    return {h.codigo for h in informe.hallazgos}


class TestDatosLimpios:
    def test_una_secuencia_correcta_no_genera_hallazgos(self):
        lote = [barra(i) for i in range(5)]

        informe = validar_lote("XAUUSD", lote, INTERVALO)

        assert informe.valido
        assert informe.hallazgos == []
        assert informe.barras_evaluadas == 5

    def test_el_proveedor_de_desarrollo_genera_datos_que_pasan_la_validacion(self):
        proveedor = DeterministicProvider()
        barras = proveedor.obtener_historico(
            "XAUUSD", INICIO, INICIO + 10 * INTERVALO, INTERVALO
        )

        informe = validar_lote("XAUUSD", barras, INTERVALO)

        assert informe.valido, [h.mensaje for h in informe.errores]

    def test_el_proveedor_es_reproducible(self):
        a = DeterministicProvider().obtener_historico(
            "XAUUSD", INICIO, INICIO + 3 * INTERVALO, INTERVALO
        )
        b = DeterministicProvider().obtener_historico(
            "XAUUSD", INICIO, INICIO + 3 * INTERVALO, INTERVALO
        )

        assert [x.close for x in a] == [x.close for x in b]


class TestErrores:
    def test_lote_vacio(self):
        informe = validar_lote("XAUUSD", [], INTERVALO)

        assert not informe.valido
        assert "lote_vacio" in codigos(informe)

    def test_timestamp_duplicado(self):
        lote = [barra(0), barra(0), barra(1)]

        informe = validar_lote("XAUUSD", lote, INTERVALO)

        assert not informe.valido
        assert "timestamp_duplicado" in codigos(informe)

    def test_velas_fuera_de_orden(self):
        lote = [barra(2), barra(1), barra(0)]

        informe = validar_lote("XAUUSD", lote, INTERVALO)

        assert not informe.valido
        assert "fuera_de_orden" in codigos(informe)

    def test_ohlc_incoherente_cuando_high_no_acota(self):
        lote = [barra(0, close="2000.00", open_="1990.00", high="1995.00", low="1980.00")]

        informe = validar_lote("XAUUSD", lote, INTERVALO)

        assert not informe.valido
        assert "ohlc_incoherente" in codigos(informe)

    def test_ohlc_incoherente_cuando_low_no_acota(self):
        lote = [barra(0, close="2000.00", open_="1990.00", high="2010.00", low="1995.00")]

        informe = validar_lote("XAUUSD", lote, INTERVALO)

        assert not informe.valido
        assert "ohlc_incoherente" in codigos(informe)

    def test_lote_con_simbolos_mezclados(self):
        lote = [barra(0), barra(1, symbol="BTCUSD")]

        informe = validar_lote("XAUUSD", lote, INTERVALO)

        assert not informe.valido
        assert "simbolo_mezclado" in codigos(informe)

    def test_un_solo_error_invalida_todo_el_lote(self):
        lote = [barra(0), barra(0)] + [barra(i) for i in range(1, 10)]

        informe = validar_lote("XAUUSD", lote, INTERVALO)

        assert not informe.valido, "no se ingiere un lote a medias"


class TestAvisos:
    def test_un_hueco_es_aviso_y_no_invalida(self):
        lote = [barra(0), barra(1), barra(5)]

        informe = validar_lote("XAUUSD", lote, INTERVALO)

        assert informe.valido, "el mercado pudo estar cerrado; no se descarta el dato"
        assert "hueco" in codigos(informe)
        assert all(h.severidad is Severidad.AVISO for h in informe.hallazgos)

    def test_el_hueco_indica_cuantas_velas_faltan(self):
        lote = [barra(0), barra(4)]

        informe = validar_lote("XAUUSD", lote, INTERVALO)

        assert "faltan 3 vela(s)" in informe.avisos[0].mensaje

    def test_un_salto_grande_es_aviso_y_no_invalida(self):
        lote = [barra(0, close="2000.00"), barra(1, close="2600.00")]

        informe = validar_lote("XAUUSD", lote, INTERVALO)

        assert informe.valido, "un desplome real es la informacion mas valiosa, no ruido"
        assert "salto_sospechoso" in codigos(informe)

    def test_un_movimiento_normal_no_genera_aviso(self):
        lote = [barra(0, close="2000.00"), barra(1, close="2010.00")]

        informe = validar_lote("XAUUSD", lote, INTERVALO)

        assert informe.hallazgos == []


class TestModelo:
    def test_rechaza_marca_de_tiempo_sin_zona_horaria(self):
        with pytest.raises(ValueError, match="zona horaria"):
            Bar(
                symbol="XAUUSD",
                timestamp=datetime(2026, 8, 24, 12, 0),
                open=Decimal("1"),
                high=Decimal("1"),
                low=Decimal("1"),
                close=Decimal("1"),
                volume=Decimal("1"),
            )

    def test_rechaza_precio_no_positivo(self):
        with pytest.raises(ValueError, match="positivos"):
            Bar(
                symbol="XAUUSD",
                timestamp=INICIO,
                open=Decimal("0"),
                high=Decimal("1"),
                low=Decimal("1"),
                close=Decimal("1"),
                volume=Decimal("1"),
            )

    def test_rechaza_volumen_negativo(self):
        with pytest.raises(ValueError, match="volumen"):
            Bar(
                symbol="XAUUSD",
                timestamp=INICIO,
                open=Decimal("1"),
                high=Decimal("1"),
                low=Decimal("1"),
                close=Decimal("1"),
                volume=Decimal("-1"),
            )

    def test_los_precios_no_pierden_precision(self):
        b = barra(0, close="2000.10")

        assert b.close == Decimal("2000.10")
        assert str(b.close) == "2000.10"
