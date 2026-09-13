#!/usr/bin/env bash
set -euo pipefail

# Keep the shared development database schema aligned with committed Alembic migrations.
alembic upgrade head

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
