FROM node:20-bookworm-slim AS development

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ .

# Entrypoint lives outside /app so the bind mount cannot overwrite it with CRLF from Windows.
RUN printf '%s\n' \
  '#!/bin/sh' \
  'set -e' \
  'cd /app' \
  'npm ci' \
  'exec npm run dev -- --host 0.0.0.0 --port 5173' \
  > /usr/local/bin/docker-entrypoint.dev.sh \
  && chmod +x /usr/local/bin/docker-entrypoint.dev.sh

EXPOSE 5173

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.dev.sh"]

FROM node:20-bookworm-slim AS build

WORKDIR /app

ARG VITE_API_BASE_URL=http://127.0.0.1:8000
ARG VITE_WS_BASE_URL=
ARG VITE_ENABLE_CAMERA_PRODUCT_RECOGNITION=false
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_WS_BASE_URL=$VITE_WS_BASE_URL
ENV VITE_ENABLE_CAMERA_PRODUCT_RECOGNITION=$VITE_ENABLE_CAMERA_PRODUCT_RECOGNITION

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ .
RUN npm run build

FROM nginx:1.27-alpine AS production

ENV PORT=80

COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY frontend/docker-entrypoint.prod.sh /docker-entrypoint.prod.sh
RUN chmod +x /docker-entrypoint.prod.sh
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# Railway injects PORT at runtime.
CMD ["/docker-entrypoint.prod.sh"]
