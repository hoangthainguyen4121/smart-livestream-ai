#!/bin/sh
set -e

PORT="${PORT:-80}"
sed -i "s/listen 80;/listen ${PORT};/" /etc/nginx/conf.d/default.conf

cat > /usr/share/nginx/html/runtime-config.js <<EOF
window.__RUNTIME_CONFIG__ = {
  VITE_SUPABASE_URL: "${VITE_SUPABASE_URL:-}",
  VITE_SUPABASE_ANON_KEY: "${VITE_SUPABASE_ANON_KEY:-}"
};
EOF

exec nginx -g "daemon off;"
