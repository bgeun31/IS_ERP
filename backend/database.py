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
        "deleted": "ALTER TABLE assets ADD COLUMN deleted BOOLEAN NOT NULL DEFAULT FALSE",
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
    spare_columns = {
        "deleted": "ALTER TABLE spare_assets ADD COLUMN deleted BOOLEAN NOT NULL DEFAULT FALSE",
        "idc_primary": "ALTER TABLE spare_assets ADD COLUMN idc_primary VARCHAR(255) NULL",
        "category": "ALTER TABLE spare_assets ADD COLUMN category VARCHAR(255) NULL",
        "model_name": "ALTER TABLE spare_assets ADD COLUMN model_name VARCHAR(255) NULL",
        "asset_number": "ALTER TABLE spare_assets ADD COLUMN asset_number VARCHAR(255) NULL",
        "serial_number": "ALTER TABLE spare_assets ADD COLUMN serial_number VARCHAR(255) NULL",
        "contract_period": "ALTER TABLE spare_assets ADD COLUMN contract_period VARCHAR(255) NULL",
        "note": "ALTER TABLE spare_assets ADD COLUMN note VARCHAR(1000) NULL",
        "idc_secondary": "ALTER TABLE spare_assets ADD COLUMN idc_secondary VARCHAR(255) NULL",
        "asset_sticker": "ALTER TABLE spare_assets ADD COLUMN asset_sticker VARCHAR(255) NULL",
        "rfid_attached": "ALTER TABLE spare_assets ADD COLUMN rfid_attached VARCHAR(50) NULL",
        "asset_status": "ALTER TABLE spare_assets ADD COLUMN asset_status VARCHAR(255) NULL",
        "note_before_after": "ALTER TABLE spare_assets ADD COLUMN note_before_after VARCHAR(1000) NULL",
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

        spare_table_exists = conn.execute(
            text(
                """
                SELECT COUNT(*) FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = :schema AND TABLE_NAME = 'spare_assets'
                """
            ),
            {"schema": settings.DB_NAME},
        ).scalar()

        if spare_table_exists:
            existing_spare_columns = {
                row[0]
                for row in conn.execute(
                    text(
                        """
                        SELECT COLUMN_NAME
                        FROM information_schema.COLUMNS
                        WHERE TABLE_SCHEMA = :schema AND TABLE_NAME = 'spare_assets'
                        """
                    ),
                    {"schema": settings.DB_NAME},
                )
            }

            for column_name, ddl in spare_columns.items():
                if column_name in existing_spare_columns:
                    continue
                conn.execute(text(ddl))

            unique_hostname_index_exists = conn.execute(
                text(
                    """
                    SELECT COUNT(*)
                    FROM information_schema.STATISTICS
                    WHERE TABLE_SCHEMA = :schema
                      AND TABLE_NAME = 'spare_assets'
                      AND INDEX_NAME = 'ix_spare_assets_hostname'
                      AND NON_UNIQUE = 0
                    """
                ),
                {"schema": settings.DB_NAME},
            ).scalar()

            if unique_hostname_index_exists:
                conn.execute(text("ALTER TABLE spare_assets DROP INDEX ix_spare_assets_hostname"))
                conn.execute(text("CREATE INDEX ix_spare_assets_hostname ON spare_assets (hostname)"))

            hostname_not_nullable = conn.execute(
                text(
                    """
                    SELECT IS_NULLABLE
                    FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = :schema
                      AND TABLE_NAME = 'spare_assets'
                      AND COLUMN_NAME = 'hostname'
                    """
                ),
                {"schema": settings.DB_NAME},
            ).scalar()

            if hostname_not_nullable == "NO":
                conn.execute(text("ALTER TABLE spare_assets MODIFY COLUMN hostname VARCHAR(255) NULL"))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
