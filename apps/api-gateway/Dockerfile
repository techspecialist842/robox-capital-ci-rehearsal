# Estandar de Docker para la Fase 1 (build multi-stage, imagen final minima).
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist

# Autoridad certificadora de RDS. Se descarga del almacen oficial de AWS para
# poder VALIDAR el certificado del servidor, en lugar de aceptar cualquiera.
# RDS rechaza las conexiones sin cifrar, y desactivar la validacion dejaria la
# conexion expuesta a un intermediario: en una plataforma financiera eso no es
# una opcion aceptable ni siquiera en desarrollo.
RUN wget -qO /app/rds-ca.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
ENV POSTGRES_SSL_CA=/app/rds-ca.pem

EXPOSE 3000
CMD ["node", "dist/main.js"]
