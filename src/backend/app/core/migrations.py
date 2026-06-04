from collections.abc import Iterable

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def _has_column(engine: Engine, table_name: str, column_name: str) -> bool:
    inspector = inspect(engine)
    try:
        columns = inspector.get_columns(table_name)
    except Exception:
        return False
    return any(column["name"] == column_name for column in columns)


def _ensure_columns(engine: Engine, table_name: str, column_definitions: Iterable[tuple[str, str]]) -> None:
    with engine.begin() as connection:
        for column_name, column_sql in column_definitions:
            if _has_column(engine, table_name, column_name):
                continue
            connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_sql}"))


def _migrate_lead_status(engine: Engine) -> None:
    with engine.begin() as connection:
        connection.execute(text("UPDATE lead SET status = '已丢弃' WHERE status = '无效'"))
        connection.execute(text("UPDATE lead SET status = '必胜' WHERE status = '必赢'"))
        connection.execute(
            text(
                """
                UPDATE lead
                SET converted_customer_id = (
                    SELECT customer.id
                    FROM customer
                    WHERE customer.source_lead_id = lead.id
                    ORDER BY customer.id DESC
                    LIMIT 1
                )
                WHERE converted_customer_id IS NULL
                  AND EXISTS (
                    SELECT 1
                    FROM customer
                    WHERE customer.source_lead_id = lead.id
                  )
                """
            )
        )


def run_startup_migrations(engine: Engine) -> None:
    _ensure_columns(engine, "user", [("manager_id", "manager_id INTEGER")])
    _ensure_columns(engine, "customerfollowup", [("opportunity_id", "opportunity_id INTEGER")])
    _ensure_columns(engine, "visitrecord", [("opportunity_id", "opportunity_id INTEGER")])
    _ensure_columns(engine, "communicationnote", [("opportunity_id", "opportunity_id INTEGER")])
    _migrate_lead_status(engine)
