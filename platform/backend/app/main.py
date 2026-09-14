from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from .database import engine
from .routers import auth_router, foundation_router, organization_router
from .routers.foundation_edits import router as foundation_edits_router
from .routers.principal_users import router as principal_users_router
from .settings import settings

app = FastAPI(title=settings.app_name, version="0.6.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(principal_users_router)
app.include_router(foundation_router)
app.include_router(foundation_edits_router)
app.include_router(organization_router)


@app.get("/")
def root() -> dict[str, str]:
    return {"name": "AcadPulse Platform API", "status": "running"}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "environment": settings.environment}


@app.get("/health/db")
def database_health() -> dict[str, str]:
    """Verify that the API can reach its configured PostgreSQL database."""
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Database connection unavailable") from exc

    return {"status": "ok", "database": "postgresql"}
