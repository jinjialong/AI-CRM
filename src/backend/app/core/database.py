from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine

from app.core.config import settings


def _build_engine():
    if settings.database_url.startswith("sqlite:///"):
        db_path = settings.database_url.replace("sqlite:///", "", 1)
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        return create_engine(
            settings.database_url,
            echo=False,
            connect_args={"check_same_thread": False},
        )
    return create_engine(settings.database_url, echo=False)


engine = _build_engine()


def get_session():
    with Session(engine) as session:
        yield session


def init_database():
    SQLModel.metadata.create_all(engine)

