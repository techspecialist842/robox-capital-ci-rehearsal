#!/usr/bin/env bash
#
# Actualiza un servicio de ECS a una revision ya registrada y espera a que
# estabilice. Escalar de cero a la capacidad objetivo forma parte de esto: los
# servicios se crean sin tareas cuando aun no hay imagen publicada.
#
# Uso: deploy-service.sh <entorno> <region> <servicio> <revision-arn>
set -euo pipefail

ENTORNO="$1"
REGION="$2"
SERVICIO="$3"
REVISION="$4"

CLUSTER="robox-${ENTORNO}"
NOMBRE="robox-${ENTORNO}-${SERVICIO}"
DESEADAS=$([ "$ENTORNO" = "prod" ] && echo 2 || echo 1)

echo "Desplegando ${NOMBRE} con ${REVISION}"

aws ecs update-service --region "$REGION" \
  --cluster "$CLUSTER" \
  --service "$NOMBRE" \
  --task-definition "$REVISION" \
  --desired-count "$DESEADAS" \
  > /dev/null

echo "Esperando a que el servicio estabilice..."
# El interruptor de circuito del servicio revierte solo si el despliegue falla;
# esta espera hace que el pipeline lo refleje en lugar de darlo por bueno.
if ! aws ecs wait services-stable --region "$REGION" \
  --cluster "$CLUSTER" --services "$NOMBRE"; then
  echo "El servicio no estabilizo. Ultimos eventos:" >&2
  aws ecs describe-services --region "$REGION" --cluster "$CLUSTER" \
    --services "$NOMBRE" --query "services[0].events[0:5].message" --output text >&2
  exit 1
fi

echo "${NOMBRE} desplegado"
