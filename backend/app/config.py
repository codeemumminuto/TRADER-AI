from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    twelve_data_api_key: str | None = None

    cors_origin: str = "http://localhost:5174"

    database_url: str = "postgresql+psycopg://trader:trader@localhost:5432/trader_ai"
    session_secret: str = "change-me"
    session_ttl_hours: int = 12

    # Bootstrap: se não existir nenhum admin no banco, um é criado a partir dessas credenciais
    # no startup — sem isso não teria como logar pela primeira vez.
    admin_email: str = "admin@trader-ai.local"
    admin_password: str = "change-me"


settings = Settings()
