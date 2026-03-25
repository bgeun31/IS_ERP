from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DB_HOST: str = "192.168.18.43"
    DB_PORT: int = 3306
    DB_USER: str = "admin"
    DB_PASSWORD: str = "gtni14!$"
    DB_NAME: str = "is_erp"

    MINIO_HOST: str = "192.168.18.43"
    MINIO_PORT: int = 9000
    MINIO_ACCESS_KEY: str = "admin"
    MINIO_SECRET_KEY: str = "gtni14!$"
    MINIO_BUCKET: str = "is-erp-logs"
    MINIO_SECURE: bool = False

    SECRET_KEY: str = "is-erp-secret-key-change-in-production-2025"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8시간

    ADMIN_USERNAME: str = "admin"
    ADMIN_PASSWORD: str = "gtni14!$"

    class Config:
        env_file = ".env"


settings = Settings()
