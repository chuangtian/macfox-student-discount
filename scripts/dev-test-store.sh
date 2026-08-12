#!/bin/sh

set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_dir"

if [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env.local
  set +a
fi

if [ -z "${SHOPIFY_STORE_PASSWORD:-}" ]; then
  echo "SHOPIFY_STORE_PASSWORD is missing from .env.local" >&2
  exit 1
fi

exec shopify app dev \
  --config shopify.app.toml \
  --store my-store-custom-app-dev-2026-08-05.myshopify.com \
  --theme 149669445734 \
  --store-password "$SHOPIFY_STORE_PASSWORD" \
  --no-update
