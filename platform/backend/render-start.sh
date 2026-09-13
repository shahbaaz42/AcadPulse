#!/usr/bin/env bash
set -euo pipefail

# Keep the shared development database schema aligned with committed Alembic migrations.
alembic upgrade head

# Free hosting plans may not provide shell access. When temporary bootstrap
# credentials are configured, create the first platform administrator before
# starting the API. With no bootstrap variables configured this is a no-op.
python scripts/bootstrap_platform_admin.py

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
