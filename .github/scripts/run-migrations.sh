#!/usr/bin/env bash
#
# Aplica las migraciones como tarea aislada de ECS, ANTES de mover el trafico.
#
# Recibe la revision ya registrada con la imagen nueva, no la imagen: ECS no
# permite sobrescribir la imagen en un run-task (containerOverrides solo admite
# name, command, environment, cpu, memory y resourceRequirements). Ejecutar con
# la misma revision que luego se despliega garantiza que el esquema y el codigo
# que lo espera vienen del mismo commit.
#
# Si la migracion falla, este script devuelve error, el despliegue se detiene y
# la version en funcionamiento sigue intacta.
#
# Uso: run-migrations.sh <entorno> <region> <revision-arn>
set -euo pipefail

ENTORNO="$1"
REGION="$2"
REVISION="$3"

CLUSTER="robox-${ENTORNO}"

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

echo "Lanzando migraciones con ${REVISION}"

TAREA=$(aws ecs run-task --region "$REGION" \
  --cluster "$CLUSTER" \
  --task-definition "$REVISION" \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[${SUBREDES}],securityGroups=[${GRUPO}],assignPublicIp=DISABLED}" \
  --overrides '{"containerOverrides":[{"name":"ApiGatewayContainer","command":["npm","run","migration:run:prod"]}]}' \
  --query "tasks[0].taskArn" --output text)

if [ -z "$TAREA" ] || [ "$TAREA" = "None" ]; then
  echo "No se pudo lanzar la tarea de migracion" >&2
  exit 1
fi

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
