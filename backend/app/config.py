from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    twelve_data_api_key: str | None = None

    cors_origin: str = "http://localhost:5174"


settings = Settings()
