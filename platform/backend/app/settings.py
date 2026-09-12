from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "AcadPulse Platform API"
    database_url: str = "postgresql+psycopg://acadpulse:acadpulse@localhost:5432/acadpulse"
    environment: str = "development"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
