"""Registro y versionado de prompts (Fase 2, "orquestacion de IA: un proveedor
aprobado, registro/versionado de prompts").

Un prompt es codigo: determina lo que el modelo responde. Cambiarlo sin dejar
rastro hace imposible explicar por que dos recomendaciones aparentemente iguales
difieren, y anula la reproducibilidad que exige la auditoria.

Por eso el registro es inmutable: una modificacion crea una version nueva y las
anteriores siguen recuperables. Cada version lleva el hash de su contenido, para
que la recomendacion pueda demostrar con que texto exacto se genero.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass


@dataclass(frozen=True)
class VersionDePrompt:
    prompt_id: str
    version: int
    plantilla: str

    @property
    def hash(self) -> str:
        """Huella del contenido. Identifica el texto exacto sin almacenarlo dos veces."""
        return hashlib.sha256(self.plantilla.encode("utf-8")).hexdigest()[:16]

    def renderizar(self, **variables: object) -> str:
        try:
            return self.plantilla.format(**variables)
        except KeyError as exc:
            raise ValueError(
                f"falta la variable {exc} requerida por {self.prompt_id} v{self.version}"
            ) from exc


class PromptDesconocidoError(KeyError):
    pass


class RegistroDePrompts:
    """Almacen en memoria de versiones de prompts.

    En memoria es suficiente mientras los prompts se versionan con el codigo, que
    es lo correcto en esta fase: un cambio de prompt pasa por revision como
    cualquier otro cambio. Si mas adelante se editan desde la consola de
    administracion, este registro pasa a respaldarse en base de datos sin que
    cambie su interfaz.
    """

    def __init__(self) -> None:
        self._versiones: dict[str, list[VersionDePrompt]] = {}

    def registrar(self, prompt_id: str, plantilla: str) -> VersionDePrompt:
        historial = self._versiones.setdefault(prompt_id, [])
        version = VersionDePrompt(prompt_id, len(historial) + 1, plantilla)
        historial.append(version)
        return version

    def ultima(self, prompt_id: str) -> VersionDePrompt:
        historial = self._versiones.get(prompt_id)
        if not historial:
            raise PromptDesconocidoError(prompt_id)
        return historial[-1]

    def obtener(self, prompt_id: str, version: int) -> VersionDePrompt:
        historial = self._versiones.get(prompt_id)
        if not historial or version < 1 or version > len(historial):
            raise PromptDesconocidoError(f"{prompt_id} v{version}")
        return historial[version - 1]

    def historial(self, prompt_id: str) -> list[VersionDePrompt]:
        return list(self._versiones.get(prompt_id, []))


PROMPT_RECOMENDACION = "recomendacion.estrategia"

# Version inicial. La instruccion de no emitir ordenes forma parte del texto, pero
# NO es la garantia: la garantia es que el tipo Recomendacion no puede expresar
# una orden. Un prompt puede ignorarse; un tipo, no.
PLANTILLA_INICIAL = """Eres un analista cuantitativo de roboX Capital.

Instrumento: {symbol}
Estrategia: {strategy_name}
Parametros vigentes: {parameters}
Resumen de mercado reciente: {market_summary}

Propon una accion (comprar, vender o mantener), un nivel de confianza entre 0 y 1
y un horizonte en horas. Explica el razonamiento citando las senales concretas que
lo sustentan.

Tu salida es una PROPUESTA sujeta a revision humana. No emites ordenes ni
instrucciones de ejecucion.
"""


def registro_por_defecto() -> RegistroDePrompts:
    registro = RegistroDePrompts()
    registro.registrar(PROMPT_RECOMENDACION, PLANTILLA_INICIAL)
    return registro
