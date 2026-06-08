"""
JALERT - Database Configuration
Async SQLAlchemy with PostgreSQL
"""
from pathlib import Path
import shutil
from fastapi import HTTPException
from sqlalchemy import event
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings
from loguru import logger


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models"""
    pass


DATABASE_URL = settings.DATABASE_URL
IS_SQLITE = DATABASE_URL.startswith("sqlite")

# Convert postgresql:// to postgresql+asyncpg:// for async driver
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)
elif DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)

if IS_SQLITE:
    sqlite_path = DATABASE_URL.replace("sqlite+aiosqlite:///", "", 1)
    if sqlite_path and sqlite_path != ":memory:":
        resolved_sqlite_path = Path(sqlite_path).expanduser().resolve()
        resolved_sqlite_path.parent.mkdir(parents=True, exist_ok=True)
        legacy_sqlite_path = resolved_sqlite_path.with_name("jalert_local.db")
        if (
            resolved_sqlite_path.name == "jalert.db"
            and legacy_sqlite_path.exists()
            and legacy_sqlite_path.stat().st_size > 0
            and (not resolved_sqlite_path.exists() or resolved_sqlite_path.stat().st_size == 0)
        ):
            shutil.copy2(legacy_sqlite_path, resolved_sqlite_path)
            logger.info(
                f"Migrated legacy local database from {legacy_sqlite_path.name} to {resolved_sqlite_path.name}"
            )

    engine = create_async_engine(
        DATABASE_URL,
        echo=settings.SQL_ECHO,
        connect_args={"timeout": 10},
        pool_size=20,
        max_overflow=20,
        pool_timeout=30,
    )
else:
    engine = create_async_engine(
        DATABASE_URL,
        pool_size=settings.DATABASE_POOL_SIZE,
        max_overflow=settings.DATABASE_MAX_OVERFLOW,
        pool_pre_ping=True,
        echo=settings.SQL_ECHO,
        connect_args={"timeout": 2},
    )

if IS_SQLITE:
    @event.listens_for(engine.sync_engine, "connect")
    def _set_sqlite_pragmas(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("PRAGMA busy_timeout=15000;")
            cursor.execute("PRAGMA synchronous=NORMAL;")
            cursor.execute("PRAGMA journal_mode=WAL;")
        except Exception as exc:
            logger.warning(f"SQLite pragma setup skipped: {exc}")
        cursor.close()

# Session factory
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


async def get_db() -> AsyncSession:
    """FastAPI dependency: yields a database session"""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except HTTPException:
            await session.rollback()
            raise
        except Exception as e:
            await session.rollback()
            logger.error(f"Database session error: {e}")
            raise
        finally:
            await session.close()


async def init_db():
    """Initialize database tables"""
    # Import models before create_all so every table is registered on Base.metadata.
    import app.models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables initialized")


async def close_db():
    """Close database connections"""
    await engine.dispose()
    logger.info("Database connections closed")

