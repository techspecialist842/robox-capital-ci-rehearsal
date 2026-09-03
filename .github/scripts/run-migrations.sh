#!/usr/bin/env bash
#
# Aplica las migraciones como tarea aislada de ECS, ANTES de mover el trafico.
#
# Se ejecuta con la imagen recien publicada, no con la que esta corriendo: el
# esquema y el codigo que lo espera vienen del mismo commit. Si la migracion
# falla, este script devuelve error, el despliegue se detiene y la version en
# funcionamiento sigue intacta.
#
# Uso: run-migrations.sh <entorno> <region> <imagen>
set -euo pipefail

ENTORNO="$1"
REGION="$2"
IMAGEN="$3"

CLUSTER="robox-${ENTORNO}"
FAMILIA="robox-${ENTORNO}-apigateway"

echo "Lanzando migraciones con ${IMAGEN}"

# La red se lee de las salidas de la pila, no de etiquetas: las etiquetas de
# subred que genera CDK dependen de la ruta del constructo y cambian si se
# renombra una pila. Una salida declarada es un contrato estable.
salida() {
  aws cloudformation describe-stacks --region "$REGION" \
    --stack-name "RoboX-${ENTORNO}-Network" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

SUBREDES=$(salida AppSubnetIds)
GRUPO=$(salida AppSecurityGroupId)

if [ -z "$SUBREDES" ] || [ -z "$GRUPO" ] || [ "$GRUPO" = "None" ]; then
  echo "No se pudieron leer las salidas de red de RoboX-${ENTORNO}-Network" >&2
  exit 1
fi

TAREA=$(aws ecs run-task --region "$REGION" \
  --cluster "$CLUSTER" \
  --task-definition "$FAMILIA" \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[${SUBREDES}],securityGroups=[${GRUPO}],assignPublicIp=DISABLED}" \
  --overrides "{\"containerOverrides\":[{\"name\":\"ApiGatewayContainer\",\"image\":\"${IMAGEN}\",\"command\":[\"npm\",\"run\",\"migration:run:prod\"]}]}" \
  --query "tasks[0].taskArn" --output text)

echo "Tarea de migracion: ${TAREA}"
aws ecs wait tasks-stopped --region "$REGION" --cluster "$CLUSTER" --tasks "$TAREA"

CODIGO=$(aws ecs describe-tasks --region "$REGION" --cluster "$CLUSTER" --tasks "$TAREA" \
  --query "tasks[0].containers[0].exitCode" --output text)
RAZON=$(aws ecs describe-tasks --region "$REGION" --cluster "$CLUSTER" --tasks "$TAREA" \
  --query "tasks[0].stoppedReason" --output text)

if [ "$CODIGO" != "0" ]; then
  echo "Las migraciones fallaron (codigo ${CODIGO}): ${RAZON}" >&2
  echo "El despliegue se detiene; la version en funcionamiento no se ha tocado." >&2
  echo "Revise los logs en /ecs/robox-${ENTORNO}." >&2
  exit 1
fi

echo "Migraciones aplicadas correctamente"
