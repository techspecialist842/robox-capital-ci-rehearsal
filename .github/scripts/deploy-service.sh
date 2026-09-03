#!/usr/bin/env bash
#
# Actualiza un servicio de ECS a una imagen concreta y espera a que estabilice.
#
# Se registra una revision nueva de la definicion de tarea con la imagen dada, en
# lugar de forzar un redespliegue de la actual: asi la revision desplegada
# identifica exactamente que imagen corre, y volver atras es seleccionar una
# revision anterior.
#
# Uso: deploy-service.sh <entorno> <region> <servicio> <imagen>
set -euo pipefail

ENTORNO="$1"
REGION="$2"
SERVICIO="$3"
IMAGEN="$4"

CLUSTER="robox-${ENTORNO}"
FAMILIA="robox-${ENTORNO}-${SERVICIO}"

echo "Desplegando ${SERVICIO} con ${IMAGEN}"

DEFINICION=$(aws ecs describe-task-definition --region "$REGION" \
  --task-definition "$FAMILIA" --query "taskDefinition")

NUEVA=$(echo "$DEFINICION" | python3 -c "
import json, sys
d = json.load(sys.stdin)
# Campos que devuelve describe pero que register no acepta.
for campo in ('taskDefinitionArn', 'revision', 'status', 'requiresAttributes',
              'compatibilities', 'registeredAt', 'registeredBy'):
    d.pop(campo, None)
d['containerDefinitions'][0]['image'] = '${IMAGEN}'
print(json.dumps(d))
")

REVISION=$(aws ecs register-task-definition --region "$REGION" \
  --cli-input-json "$NUEVA" \
  --query "taskDefinition.taskDefinitionArn" --output text)

echo "Revision registrada: ${REVISION}"

aws ecs update-service --region "$REGION" \
  --cluster "$CLUSTER" \
  --service "robox-${ENTORNO}-${SERVICIO}" \
  --task-definition "$REVISION" \
  > /dev/null

echo "Esperando a que el servicio estabilice..."
# El interruptor de circuito del servicio revierte solo si el despliegue falla;
# esta espera hace que el pipeline lo refleje en lugar de darlo por bueno.
aws ecs wait services-stable --region "$REGION" \
  --cluster "$CLUSTER" --services "robox-${ENTORNO}-${SERVICIO}"

echo "${SERVICIO} desplegado"
