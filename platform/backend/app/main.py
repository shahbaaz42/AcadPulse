from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import foundation_router
from .settings import settings

app = FastAPI(title=settings.app_name, version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(foundation_router)


@app.get("/")
def root() -> dict[str, str]:
    return {"name": "AcadPulse Platform API", "status": "running"}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "environment": settings.environment}
