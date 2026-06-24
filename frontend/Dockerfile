FROM node:20-bookworm-slim AS development

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

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
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS production

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
