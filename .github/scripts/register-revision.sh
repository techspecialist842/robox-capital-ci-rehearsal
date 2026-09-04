#!/usr/bin/env bash
#
# Registra una revision nueva de la definicion de tarea con una imagen concreta y
# escribe su ARN en la salida estandar.
#
# Existe como paso separado porque ECS NO permite sobrescribir la imagen en un
# "run-task": containerOverrides solo admite name, command, environment,
# environmentFiles, cpu, memory, memoryReservation y resourceRequirements.
# Cambiar de imagen exige una revision nueva, y tanto la tarea de migraciones
# como el servicio deben usar LA MISMA, o migrarian y ejecutarian codigos
# distintos.
#
# Uso: register-revision.sh <entorno> <region> <servicio> <imagen>
set -euo pipefail

ENTORNO="$1"
REGION="$2"
SERVICIO="$3"
IMAGEN="$4"

FAMILIA="robox-${ENTORNO}-${SERVICIO}"

ACTUAL=$(aws ecs describe-task-definition --region "$REGION" \
  --task-definition "$FAMILIA" --query "taskDefinition")

NUEVA=$(echo "$ACTUAL" | python3 -c "
import json, sys
d = json.load(sys.stdin)
# Campos que devuelve describe pero que register rechaza.
for campo in ('taskDefinitionArn', 'revision', 'status', 'requiresAttributes',
              'compatibilities', 'registeredAt', 'registeredBy'):
    d.pop(campo, None)
d['containerDefinitions'][0]['image'] = '${IMAGEN}'
print(json.dumps(d))
")

aws ecs register-task-definition --region "$REGION" \
  --cli-input-json "$NUEVA" \
  --query "taskDefinition.taskDefinitionArn" --output text
