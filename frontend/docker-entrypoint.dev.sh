#!/bin/sh
set -e

cd /app

# Bind-mount hides image node_modules; the named volume can be stale after package.json changes.
npm ci

exec npm run dev -- --host 0.0.0.0 --port 5173
