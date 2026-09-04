# El contexto de construccion es la RAIZ del repositorio, no apps/quant-service.
#
# El servicio valida los eventos contra los esquemas versionados de
# packages/event-contracts, que viven fuera de su carpeta. Con el contexto
# acotado al servicio, esos esquemas no entraban en la imagen y el proceso ni
# siquiera arrancaba: la resolucion de la ruta fallaba con IndexError porque
# asumia la profundidad del monorepo.
#
#   docker build -f apps/quant-service/Dockerfile .
FROM python:3.12-slim
WORKDIR /app

COPY apps/quant-service/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY apps/quant-service/app ./app

# Los esquemas son parte del contrato que este servicio hace cumplir: viajan con
# la imagen. La ruta se declara de forma explicita en lugar de deducirse de la
# estructura de carpetas, que no es la misma dentro del contenedor.
COPY packages/event-contracts/schemas ./event-contracts/schemas
ENV EVENT_CONTRACTS_DIR=/app/event-contracts/schemas

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
