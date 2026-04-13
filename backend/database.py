from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker

from config import settings


def create_database_if_not_exists():
    engine_no_db = create_engine(
        f"mysql+pymysql://{settings.DB_USER}:{settings.DB_PASSWORD}"
        f"@{settings.DB_HOST}:{settings.DB_PORT}",
        echo=False,
    )
    with engine_no_db.connect() as conn:
        conn.execute(
            text(
                f"CREATE DATABASE IF NOT EXISTS `{settings.DB_NAME}` "
                f"CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
            )
        )
        conn.commit()
    engine_no_db.dispose()


DATABASE_URL = (
    f"mysql+pymysql://{settings.DB_USER}:{settings.DB_PASSWORD}"
    f"@{settings.DB_HOST}:{settings.DB_PORT}/{settings.DB_NAME}?charset=utf8mb4"
)

engine = create_engine(DATABASE_URL, echo=False, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def run_schema_migrations() -> None:
    user_columns = {
        "full_name": "ALTER TABLE users ADD COLUMN full_name VARCHAR(100) NULL",
        "phone_number": "ALTER TABLE users ADD COLUMN phone_number VARCHAR(50) NULL",
        "position": "ALTER TABLE users ADD COLUMN position VARCHAR(100) NULL",
    }
    template_columns = {
        "folder_name": "ALTER TABLE document_templates ADD COLUMN folder_name VARCHAR(255) NULL",
    }
    snapshot_columns = {
        "manufacturer": "ALTER TABLE device_snapshots ADD COLUMN manufacturer VARCHAR(255) NULL",
        "management_ip": "ALTER TABLE device_snapshots ADD COLUMN management_ip VARCHAR(100) NULL",
    }
    asset_columns = {
        "manufacturer_override": "ALTER TABLE assets ADD COLUMN manufacturer_override VARCHAR(255) NULL",
        "model_override": "ALTER TABLE assets ADD COLUMN model_override VARCHAR(255) NULL",
        "serial_number_override": "ALTER TABLE assets ADD COLUMN serial_number_override VARCHAR(255) NULL",
        "hostname_override": "ALTER TABLE assets ADD COLUMN hostname_override VARCHAR(255) NULL",
        "os_override": "ALTER TABLE assets ADD COLUMN os_override VARCHAR(255) NULL",
        "ip_override": "ALTER TABLE assets ADD COLUMN ip_override VARCHAR(100) NULL",
    }
    bundle_columns = {
        "template_folder": "ALTER TABLE template_bundles ADD COLUMN template_folder VARCHAR(255) NULL",
    }

    with engine.begin() as conn:
        existing_user_columns = {
            row[0]
            for row in conn.execute(
                text(
                    """
                    SELECT COLUMN_NAME
                    FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = :schema AND TABLE_NAME = 'users'
                    """
                ),
                {"schema": settings.DB_NAME},
            )
        }

        for column_name, ddl in user_columns.items():
            if column_name in existing_user_columns:
                continue
            conn.execute(text(ddl))

        existing_snapshot_columns = {
            row[0]
            for row in conn.execute(
                text(
                    """
                    SELECT COLUMN_NAME
                    FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = :schema AND TABLE_NAME = 'device_snapshots'
                    """
                ),
                {"schema": settings.DB_NAME},
            )
        }

        for column_name, ddl in snapshot_columns.items():
            if column_name in existing_snapshot_columns:
                continue
            conn.execute(text(ddl))

        existing_template_columns = {
            row[0]
            for row in conn.execute(
                text(
                    """
                    SELECT COLUMN_NAME
                    FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = :schema AND TABLE_NAME = 'document_templates'
                    """
                ),
                {"schema": settings.DB_NAME},
            )
        }

        for column_name, ddl in template_columns.items():
            if column_name in existing_template_columns:
                continue
            conn.execute(text(ddl))

        existing_bundle_columns = {
            row[0]
            for row in conn.execute(
                text(
                    """
                    SELECT COLUMN_NAME
                    FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = :schema AND TABLE_NAME = 'template_bundles'
                    """
                ),
                {"schema": settings.DB_NAME},
            )
        }

        # assets 테이블 마이그레이션
        asset_table_exists = conn.execute(
            text(
                """
                SELECT COUNT(*) FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = :schema AND TABLE_NAME = 'assets'
                """
            ),
            {"schema": settings.DB_NAME},
        ).scalar()

        if asset_table_exists:
            existing_asset_columns = {
                row[0]
                for row in conn.execute(
                    text(
                        """
                        SELECT COLUMN_NAME
                        FROM information_schema.COLUMNS
                        WHERE TABLE_SCHEMA = :schema AND TABLE_NAME = 'assets'
                        """
                    ),
                    {"schema": settings.DB_NAME},
                )
            }

            for column_name, ddl in asset_columns.items():
                if column_name in existing_asset_columns:
                    continue
                conn.execute(text(ddl))

        for column_name, ddl in bundle_columns.items():
            if column_name in existing_bundle_columns:
                continue
            conn.execute(text(ddl))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
