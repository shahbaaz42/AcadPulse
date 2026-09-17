#!/usr/bin/env bash
set -euo pipefail
export PYTHONUNBUFFERED=1

echo "[AcadPulse] Applying Alembic migrations..."
alembic upgrade head
echo "[AcadPulse] Alembic migrations complete."

# Free hosting plans may not provide shell access. When temporary bootstrap
# credentials are configured, create the first platform administrator before
# starting the API. With no bootstrap variables configured this is a no-op.
echo "[AcadPulse] Running platform-admin bootstrap check..."
python scripts/bootstrap_platform_admin.py
echo "[AcadPulse] Bootstrap check complete."

echo "[AcadPulse] Starting API on port ${PORT:-8000}..."
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
