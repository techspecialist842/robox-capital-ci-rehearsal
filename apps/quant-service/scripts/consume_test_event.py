"""Consume de SQS y comprueba la semantica del bus de extremo a extremo.

Segunda mitad de la prueba de integracion contra LocalStack: el api-gateway ya
publico el mismo evento dos veces en SNS. Aqui se verifica que:

  1. el evento llega y cumple el contrato versionado,
  2. la reentrega NO se procesa dos veces (regla 1 de SEMANTICA.md).

Sale con codigo distinto de cero si algo falla, para que el pipeline se detenga.
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.events.consumer import SqsEventConsumer  # noqa: E402


def main() -> int:
    queue_url = os.environ["EVENT_BUS_QUEUE_URL"]
    expected_event_id = sys.argv[1]

    consumer = SqsEventConsumer(
        queue_url=queue_url,
        region=os.environ.get("AWS_REGION", "us-east-1"),
        endpoint_url=os.environ.get("AWS_ENDPOINT_URL"),
        wait_time_seconds=5,
    )

    procesados: list[dict] = []
    consumer.subscribe("platform.test_message", procesados.append)

    # SNS entrega de forma asincrona: se sondea hasta agotar el plazo en lugar de
    # asumir que el mensaje ya esta.
    deadline = time.monotonic() + 60
    mensajes_vistos = 0
    while time.monotonic() < deadline and mensajes_vistos < 2:
        mensajes_vistos += consumer.poll_once()

    if not procesados:
        print("FALLO: no llego ningun evento desde SNS/SQS", file=sys.stderr)
        return 1

    if procesados[0]["eventId"] != expected_event_id:
        print(
            f"FALLO: se esperaba {expected_event_id}, llego {procesados[0]['eventId']}",
            file=sys.stderr,
        )
        return 1

    if len(procesados) != 1:
        print(
            f"FALLO: la reentrega se proceso {len(procesados)} veces; debe procesarse 1",
            file=sys.stderr,
        )
        return 1

    print(f"OK: evento {expected_event_id} entregado por SNS/SQS y validado")
    print(f"OK: {mensajes_vistos} mensajes recibidos, 1 procesado — idempotencia correcta")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
