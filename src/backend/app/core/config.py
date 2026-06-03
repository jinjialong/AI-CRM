import os


class Settings:
    app_name = "AI CRM API"
    database_url = os.getenv("DATABASE_URL", "sqlite:///./data/app.db")
    jwt_secret = os.getenv("JWT_SECRET", "ai-crm-demo-secret-key-please-change-123456")
    jwt_algorithm = "HS256"
    cors_origins = [
        item.strip()
        for item in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001,http://localhost:3002,http://127.0.0.1:3002",
        ).split(",")
        if item.strip()
    ]
    openai_api_key = os.getenv("OPENAI_API_KEY", "").strip()
    openai_model = os.getenv("OPENAI_MODEL", "gpt-4.1-mini").strip()
    openai_base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").strip()


settings = Settings()
