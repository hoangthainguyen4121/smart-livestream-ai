#!/bin/sh
# One-shot Alembic migration for Railway / production PostgreSQL.
# Run manually once per deploy that includes new migrations — NOT on every web replica start.
#
# Railway UI: Service → Settings → Deploy → Custom Start Command (temporary) OR
#   railway run --service backend sh backend/scripts/railway_migrate.sh
#
# Requires DATABASE_URL in environment.

set -e

cd "$(dirname "$0")/.."

if [ -z "${DATABASE_URL}" ]; then
  echo "ERROR: DATABASE_URL is required for alembic upgrade head" >&2
  exit 1
fi

echo "Running alembic upgrade head..."
python -m alembic upgrade head
echo "Migration complete."
