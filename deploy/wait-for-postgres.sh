#!/usr/bin/env bash
set -euo pipefail

ATTEMPTS="${1:-60}"
COUNT=0
while [ "$COUNT" -lt "$ATTEMPTS" ]; do
  if (echo >/dev/tcp/127.0.0.1/5432) >/dev/null 2>&1; then
    exit 0
  fi
  sleep 1
  COUNT=$((COUNT + 1))
done

echo "Postgres did not become reachable on 127.0.0.1:5432." >&2
exit 1