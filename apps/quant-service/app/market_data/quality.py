"""Validaciones de calidad de datos de mercado (Fase 2, criterio de aceptacion:
"datos de mercado ingresando y consultables con validacion de calidad").

Estas comprobaciones existen porque los datos de un proveedor externo llegan
sucios con normalidad, no por excepcion: faltan velas en festivos mal marcados,
llegan duplicados tras una reconexion, y de vez en cuando un precio erroneo.

La distincion importante es entre ERROR y AVISO:

- ERROR invalida el dato. Aceptarlo produciria un backtest cuyos resultados
  parecen validos y no lo son, que es peor que no tener el dato.
- AVISO deja pasar el dato pero lo marca. Un hueco de una vela puede ser un fallo
  del proveedor o simplemente que el mercado estaba cerrado; decidirlo aqui
  requeriria un calendario de mercado por instrumento, que llega en fases
  posteriores.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import timedelta
from decimal import Decimal
from enum import StrEnum

from .models import Bar


class Severidad(StrEnum):
    ERROR = "error"
    AVISO = "aviso"


@dataclass(frozen=True)
class Hallazgo:
    codigo: str
    severidad: Severidad
    mensaje: str


@dataclass
class InformeDeCalidad:
    symbol: str
    barras_evaluadas: int
    hallazgos: list[Hallazgo] = field(default_factory=list)

    @property
    def valido(self) -> bool:
        """Un solo error invalida el lote: no se ingiere a medias."""
        return not any(h.severidad is Severidad.ERROR for h in self.hallazgos)

    @property
    def errores(self) -> list[Hallazgo]:
        return [h for h in self.hallazgos if h.severidad is Severidad.ERROR]

    @property
    def avisos(self) -> list[Hallazgo]:
        return [h for h in self.hallazgos if h.severidad is Severidad.AVISO]


# Un movimiento intravela superior a este porcentaje se marca como sospechoso.
# No se rechaza: los mercados tienen dias asi, y descartar el dato de un desplome
# real seria justo perder la informacion mas valiosa.
SALTO_SOSPECHOSO = Decimal("0.20")


def validar_lote(symbol: str, barras: list[Bar], intervalo: timedelta) -> InformeDeCalidad:
    """Valida una secuencia de velas del mismo instrumento."""
    informe = InformeDeCalidad(symbol=symbol, barras_evaluadas=len(barras))

    if not barras:
        informe.hallazgos.append(
            Hallazgo("lote_vacio", Severidad.ERROR, "el lote no contiene velas")
        )
        return informe

    ajenas = {b.symbol for b in barras} - {symbol}
    if ajenas:
        informe.hallazgos.append(
            Hallazgo(
                "simbolo_mezclado",
                Severidad.ERROR,
                f"el lote de {symbol} contiene velas de {sorted(ajenas)}",
            )
        )

    _validar_coherencia_ohlc(barras, informe)
    _validar_orden_y_duplicados(barras, informe)
    _validar_huecos(barras, intervalo, informe)
    _validar_saltos(barras, informe)

    return informe


def _validar_coherencia_ohlc(barras: list[Bar], informe: InformeDeCalidad) -> None:
    """high debe ser el maximo y low el minimo. Si no, la vela es incoherente."""
    for barra in barras:
        if barra.high < max(barra.open, barra.close) or barra.low > min(
            barra.open, barra.close
        ):
            informe.hallazgos.append(
                Hallazgo(
                    "ohlc_incoherente",
                    Severidad.ERROR,
                    f"{barra.timestamp.isoformat()}: high/low no acotan a open/close",
                )
            )
        if barra.high < barra.low:
            informe.hallazgos.append(
                Hallazgo(
                    "high_menor_que_low",
                    Severidad.ERROR,
                    f"{barra.timestamp.isoformat()}: high < low",
                )
            )


def _validar_orden_y_duplicados(barras: list[Bar], informe: InformeDeCalidad) -> None:
    """El desorden y los duplicados son errores: rompen cualquier calculo de serie."""
    vistos: set = set()
    anterior = None

    for barra in barras:
        if barra.timestamp in vistos:
            informe.hallazgos.append(
                Hallazgo(
                    "timestamp_duplicado",
                    Severidad.ERROR,
                    f"{barra.timestamp.isoformat()} aparece mas de una vez",
                )
            )
        vistos.add(barra.timestamp)

        if anterior is not None and barra.timestamp < anterior:
            informe.hallazgos.append(
                Hallazgo(
                    "fuera_de_orden",
                    Severidad.ERROR,
                    f"{barra.timestamp.isoformat()} llega despues de {anterior.isoformat()}",
                )
            )
        anterior = barra.timestamp


def _validar_huecos(
    barras: list[Bar], intervalo: timedelta, informe: InformeDeCalidad
) -> None:
    """Detecta velas ausentes en la secuencia esperada."""
    ordenadas = sorted(barras, key=lambda b: b.timestamp)

    for previa, siguiente in zip(ordenadas, ordenadas[1:], strict=False):
        separacion = siguiente.timestamp - previa.timestamp
        if separacion > intervalo:
            faltan = int(separacion / intervalo) - 1
            informe.hallazgos.append(
                Hallazgo(
                    "hueco",
                    Severidad.AVISO,
                    f"faltan {faltan} vela(s) entre {previa.timestamp.isoformat()} "
                    f"y {siguiente.timestamp.isoformat()}",
                )
            )


def _validar_saltos(barras: list[Bar], informe: InformeDeCalidad) -> None:
    """Marca movimientos desproporcionados entre cierres consecutivos."""
    ordenadas = sorted(barras, key=lambda b: b.timestamp)

    for previa, siguiente in zip(ordenadas, ordenadas[1:], strict=False):
        variacion = abs(siguiente.close - previa.close) / previa.close
        if variacion > SALTO_SOSPECHOSO:
            informe.hallazgos.append(
                Hallazgo(
                    "salto_sospechoso",
                    Severidad.AVISO,
                    f"{siguiente.timestamp.isoformat()}: variacion de "
                    f"{variacion:.1%} respecto al cierre anterior",
                )
            )
