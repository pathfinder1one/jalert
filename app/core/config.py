"""
JALERT - Core Configuration
Centralized settings management using pydantic-settings
"""
from pydantic_settings import BaseSettings
from pydantic import Field, field_validator
from functools import lru_cache
from typing import List


class Settings(BaseSettings):
    # App
    APP_NAME: str = "JALERT - Intelligent Water & Health Alert System"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    ENVIRONMENT: str = "production"
    SQL_ECHO: bool = False
    CORS_ORIGINS: List[str] = ["http://localhost:5173", "http://127.0.0.1:8000"]

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    WORKERS: int = 4

    # Database
    DATABASE_URL: str = Field(
        default="sqlite+aiosqlite:///./jalert.db",
        env="DATABASE_URL"
    )
    DATABASE_POOL_SIZE: int = 20
    DATABASE_MAX_OVERFLOW: int = 40

    # Redis
    REDIS_URL: str = Field(default="redis://localhost:6379/0", env="REDIS_URL")
    REDIS_TTL: int = 3600  # 1 hour default

    # Kafka
    KAFKA_BOOTSTRAP_SERVERS: str = Field(
        default="localhost:9092", env="KAFKA_BOOTSTRAP_SERVERS"
    )
    KAFKA_TOPIC_SENSOR: str = "jalert.sensor.readings"
    KAFKA_TOPIC_ALERTS: str = "jalert.alerts"
    KAFKA_TOPIC_HEALTH: str = "jalert.health.reports"

    # JWT
    SECRET_KEY: str = Field(
        default="CHANGE_THIS_IN_PRODUCTION_SUPER_SECRET_KEY_256_BITS", env="SECRET_KEY"
    )
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # OpenAI / LLM
    OPENAI_API_KEY: str = Field(default="", env="OPENAI_API_KEY")
    LLM_MODEL: str = "gpt-4o"
    LLM_TEMPERATURE: float = 0.1
    LLM_MAX_TOKENS: int = 2000
    OLLAMA_URL: str = Field(default="http://localhost:11434/api/chat", env="OLLAMA_URL")
    OLLAMA_MODEL: str = Field(default="gemma4:31b-cloud", env="OLLAMA_MODEL")
    OLLAMA_TIMEOUT_SECONDS: float = Field(default=120.0, env="OLLAMA_TIMEOUT_SECONDS")

    # Twilio (SMS)
    TWILIO_ACCOUNT_SID: str = Field(default="", env="TWILIO_ACCOUNT_SID")
    TWILIO_AUTH_TOKEN: str = Field(default="", env="TWILIO_AUTH_TOKEN")
    TWILIO_PHONE_NUMBER: str = Field(default="", env="TWILIO_PHONE_NUMBER")

    # AWS
    AWS_ACCESS_KEY_ID: str = Field(default="", env="AWS_ACCESS_KEY_ID")
    AWS_SECRET_ACCESS_KEY: str = Field(default="", env="AWS_SECRET_ACCESS_KEY")
    AWS_REGION: str = "ap-south-1"
    S3_BUCKET_REPORTS: str = "jalert-reports"

    # Google TTS
    GOOGLE_APPLICATION_CREDENTIALS: str = Field(
        default="", env="GOOGLE_APPLICATION_CREDENTIALS"
    )

    # Alert Thresholds
    PH_MIN: float = 6.5
    PH_MAX: float = 8.5
    TURBIDITY_MAX: float = 4.0       # NTU
    ECOLI_MAX: float = 0.0           # CFU/100ml (zero tolerance)
    TDS_MAX: float = 500.0           # mg/L
    NITRATE_MAX: float = 45.0        # mg/L
    ARSENIC_MAX: float = 0.01        # mg/L
    FLUORIDE_MAX: float = 1.5        # mg/L

    # Flood / Weather Thresholds
    RAINFALL_HIGH_MM: float = 100.0  # mm/24hr
    RAINFALL_CRITICAL_MM: float = 200.0

    # Risk Score Weights
    WEIGHT_WATER_QUALITY: float = 0.35
    WEIGHT_DISEASE_PREDICTION: float = 0.30
    WEIGHT_WEATHER: float = 0.15
    WEIGHT_COMMUNITY_HEALTH: float = 0.20

    # Rate Limiting
    RATE_LIMIT_REQUESTS: int = 100
    RATE_LIMIT_WINDOW: int = 60  # seconds

    # Celery
    CELERY_BROKER_URL: str = Field(
        default="redis://localhost:6379/1", env="CELERY_BROKER_URL"
    )
    CELERY_RESULT_BACKEND: str = Field(
        default="redis://localhost:6379/2", env="CELERY_RESULT_BACKEND"
    )

    # Supported Languages for Voice Alerts
    SUPPORTED_LANGUAGES: List[str] = ["en", "hi", "ta", "te", "bn", "mr", "gu"]

    # ML Model Paths
    ML_MODEL_DIR: str = "ml_models"
    WATER_QUALITY_MODEL: str = "water_quality_rf.joblib"
    DISEASE_OUTBREAK_MODEL: str = "disease_outbreak_xgb.joblib"

    # OGD India dataset integration
    OGD_DATA_DIR: str = "data/ogd_india"
    OGD_RAW_DIR: str = "data/ogd_india/raw"
    OGD_PROCESSED_DIR: str = "data/ogd_india/processed"
    LOCAL_REPORTS_DIR: str = "data/generated_reports"

    class Config:
        env_file = ".env"
        case_sensitive = True

    @field_validator("DEBUG", "SQL_ECHO", mode="before")
    @classmethod
    def parse_debug_value(cls, value):
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"1", "true", "yes", "on", "debug", "development", "dev"}:
                return True
            if normalized in {"0", "false", "no", "off", "release", "production", "prod"}:
                return False
        return value

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, value):
        if isinstance(value, list):
            return value
        if isinstance(value, str):
            normalized = value.strip()
            if not normalized:
                return []
            if normalized.startswith("[") and normalized.endswith("]"):
                return [item.strip().strip("\"'") for item in normalized[1:-1].split(",") if item.strip()]
            return [item.strip() for item in normalized.split(",") if item.strip()]
        return value


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
