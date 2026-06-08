"""
JALERT - Intelligent Water & Health Alert System
FastAPI Application Entry Point
"""
import asyncio
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from loguru import logger
import sys

from app.core.config import settings
from app.core.database import init_db, close_db, AsyncSessionLocal, DATABASE_URL, IS_SQLITE, engine
from app.core.redis_manager import redis_manager
from app.core.security import require_admin
from app.models.user import User
from app.services.bootstrap_service import seed_sensor_network_if_empty, seed_villages_if_empty
from app.services.ogd_data_service import warm_public_water_resource_cache
from app.services.sensor_service import SensorService
from app.utils.kafka_pipeline import kafka_producer
from app.utils.middleware import RateLimitMiddleware, RequestLoggingMiddleware

# ── Structured logging ────────────────────────────────────────────────────────
logger.remove()
logger.add(
    sys.stdout,
    format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
    level="INFO" if not settings.DEBUG else "DEBUG",
    colorize=True,
)
logger.add(
    "logs/jalert.log",
    rotation="100 MB",
    retention="30 days",
    compression="gz",
    level="INFO",
)


def _safe_database_url(url: str) -> str:
    if "@" not in url or "://" not in url:
        return url
    scheme, rest = url.split("://", 1)
    _, host = rest.rsplit("@", 1)
    return f"{scheme}://***:***@{host}"


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
    settings.validate_production_security()
    logger.info("=" * 60)
    logger.info(f"  Starting {settings.APP_NAME} v{settings.APP_VERSION}")
    logger.info(f"  Environment: {settings.ENVIRONMENT}")
    logger.info(f"  Database: {'SQLite' if IS_SQLITE else 'Server DB'} via {type(engine.sync_engine.pool).__name__}")
    logger.info(f"  Database URL: {_safe_database_url(DATABASE_URL)}")
    logger.info("=" * 60)

    app.state.database_available = False
    app.state.redis_available = False

    # Database
    try:
        await init_db()
        await seed_villages_if_empty()
        await seed_sensor_network_if_empty()
        async with AsyncSessionLocal() as session:
            await SensorService.get_sensor_inventory(session)
        app.state.database_available = True
    except Exception as e:
        logger.warning(f"Database unavailable (continuing in degraded mode): {e}")

    # Redis
    try:
        await redis_manager.connect()
        app.state.redis_available = True
    except Exception as e:
        logger.warning(f"Redis unavailable (continuing in degraded mode): {e}")

    # Kafka is optional for local frontend-serving startup.
    logger.info("Skipping Kafka startup during local web serving.")
    app.state.public_water_resource_cache_task = asyncio.create_task(
        warm_public_water_resource_cache()
    )

    logger.info("All systems online. JALERT is ready.")
    yield

    # Shutdown
    logger.info("Shutting down JALERT...")
    cache_task = getattr(app.state, "public_water_resource_cache_task", None)
    if cache_task and not cache_task.done():
        cache_task.cancel()
        try:
            await cache_task
        except asyncio.CancelledError:
            logger.info("Public water resource cache warmup cancelled during shutdown.")
    if app.state.redis_available:
        await redis_manager.disconnect()
    kafka_producer.close()
    if app.state.database_available:
        await close_db()
    logger.info("JALERT shutdown complete.")


# ── App factory ───────────────────────────────────────────────────────────────

def create_app() -> FastAPI:
    frontend_dist = Path(__file__).resolve().parents[1] / "frontend" / "dist"

    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        description="""
## JALERT — Intelligent Water & Health Alert System

A mission-critical AI-powered platform for monitoring water quality, predicting disease outbreaks,
and protecting rural communities in India.

### Features
- 🔬 **Real-time IoT sensor monitoring** (pH, E.coli, turbidity, TDS, etc.)
- 🤖 **AI Multi-Agent System** — 5 specialized agents + central orchestrator
- 📊 **ML Models** — Random Forest + XGBoost with SHAP explainability
- 🚨 **Smart Alert Engine** — Rule-based + AI-predicted alerts
- 📱 **Multi-channel notifications** — SMS, voice, push
- 📄 **Automated reports** — PDF + CSV generation
- ⚡ **Real-time streaming** — WebSocket + Redis pub/sub
        """,
        docs_url=None if settings.is_production else "/docs",
        redoc_url=None if settings.is_production else "/redoc",
        openapi_url=None if settings.is_production else "/openapi.json",
        lifespan=lifespan,
    )

    # ── Middleware ─────────────────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS if settings.CORS_ORIGINS else (["*"] if settings.DEBUG else []),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(GZipMiddleware, minimum_size=1000)
    app.add_middleware(RequestLoggingMiddleware)
    app.add_middleware(RateLimitMiddleware)

    # ── Routers ────────────────────────────────────────────────────────────────
    from app.routers import (
        admin,
        alerts,
        auth,
        chat,
        health,
        ml_training,
        notifications,
        predictions,
        reports,
        sensors,
        village_intelligence,
        villages,
        water_resources,
        websockets,
    )

    PREFIX = "/api/v1"
    app.include_router(auth.router, prefix=PREFIX)
    app.include_router(admin.router, prefix=PREFIX)
    app.include_router(villages.router, prefix=PREFIX)
    app.include_router(sensors.router, prefix=PREFIX)
    app.include_router(alerts.router, prefix=PREFIX)
    app.include_router(notifications.router, prefix=PREFIX)
    app.include_router(predictions.router, prefix=PREFIX)
    app.include_router(health.router, prefix=PREFIX)
    app.include_router(reports.router, prefix=PREFIX)
    app.include_router(ml_training.router, prefix=PREFIX)
    app.include_router(water_resources.router, prefix=PREFIX)
    app.include_router(village_intelligence.router, prefix=PREFIX)
    app.include_router(chat.router, prefix=PREFIX)
    app.include_router(websockets.router)  # No prefix for WS

    # ── Health endpoints ───────────────────────────────────────────────────────
    @app.get("/", tags=["System"], include_in_schema=False)
    async def root():
        index_file = frontend_dist / "index.html"
        if index_file.exists():
            return FileResponse(index_file)

        return {
            "system": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "status": "operational",
            "docs": "/docs",
        }

    @app.get("/health", tags=["System"])
    async def health_check():
        """Liveness probe"""
        checks = {"api": "ok", "database": "unknown", "redis": "unknown"}
        try:
            await redis_manager.client.ping()
            checks["redis"] = "ok"
        except Exception:
            checks["redis"] = "error"

        try:
            from app.core.database import engine
            async with engine.connect() as conn:
                await conn.execute(__import__("sqlalchemy").text("SELECT 1"))
            checks["database"] = "ok"
        except Exception:
            checks["database"] = "error"

        all_ok = all(v == "ok" for v in checks.values())
        # Always return 200 so Railway/Render healthchecks pass even in degraded mode.
        # The body status field distinguishes healthy vs degraded.
        return JSONResponse(
            content={"status": "healthy" if all_ok else "degraded", "checks": checks},
            status_code=200,
        )

    @app.get("/metrics", tags=["System"])
    async def metrics(current_user: User = Depends(require_admin)):
        """Basic operational metrics"""
        from app.utils.websocket_manager import ws_manager
        return {
            "websocket_connections": ws_manager.total_connections(),
            "environment": settings.ENVIRONMENT,
        }

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str):
        if full_path.startswith(("api/", "ws/", "docs", "redoc", "openapi.json", "health", "metrics")):
            raise HTTPException(status_code=404, detail="Not found")

        if not frontend_dist.exists():
            raise HTTPException(status_code=404, detail="Frontend build not found")

        requested_path = frontend_dist / full_path
        if requested_path.is_file():
            return FileResponse(requested_path)

        index_file = frontend_dist / "index.html"
        if index_file.exists():
            return FileResponse(index_file)

        raise HTTPException(status_code=404, detail="Frontend build not found")

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        workers=settings.WORKERS,
        reload=settings.DEBUG,
        log_level="debug" if settings.DEBUG else "info",
    )

# Trigger reload
