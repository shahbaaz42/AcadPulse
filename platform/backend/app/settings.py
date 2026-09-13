from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "AcadPulse Platform API"
    database_url: str = "postgresql+psycopg://acadpulse:acadpulse@localhost:5432/acadpulse"
    environment: str = "development"
    cors_origins: str = "http://localhost:3000"
    auth_secret_key: str = "change-this-development-secret"
    auth_algorithm: str = "HS256"
    auth_access_token_minutes: int = 60
    auth_token_issuer: str = "acadpulse"
    auth_token_audience: str = "acadpulse-web"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
