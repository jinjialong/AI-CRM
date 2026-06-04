import os
from pathlib import Path


def _load_backend_dotenv() -> None:
    env_path = Path(__file__).resolve().parents[2] / ".env"
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def _getenv(*keys: str, default: str = "") -> str:
    for key in keys:
        value = os.getenv(key)
        if value is not None:
            return value.strip()
    return default.strip()


_load_backend_dotenv()


class Settings:
    app_name = "AI CRM API"
    database_url = _getenv("DATABASE_URL", default="sqlite:///./data/app.db")
    jwt_secret = _getenv("JWT_SECRET", default="ai-crm-demo-secret-key-please-change-123456")
    jwt_algorithm = "HS256"
    cors_origins = [
        item.strip()
        for item in _getenv(
            "CORS_ORIGINS",
            default="http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001,http://localhost:3002,http://127.0.0.1:3002,http://localhost:3005,http://127.0.0.1:3005,http://localhost:3105,http://127.0.0.1:3105,http://localhost:3200,http://127.0.0.1:3200",
        ).split(",")
        if item.strip()
    ]
    openai_api_key = _getenv("OPENAI_API_KEY", "AI_TRAVELOGUE_PARSE_API_KEY")
    openai_model = _getenv("OPENAI_MODEL", "AI_TRAVELOGUE_PARSE_MODEL", default="gpt-4.1-mini")
    openai_base_url = _getenv("OPENAI_BASE_URL", "AI_TRAVELOGUE_PARSE_BASE_URL", default="https://api.openai.com/v1")


settings = Settings()
