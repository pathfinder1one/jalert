"""
JALERT - Celery Background Tasks
Scheduled: predictions, report generation, alert notifications
"""
from celery import Celery
from celery.schedules import crontab
from app.core.config import settings
from loguru import logger
from sqlalchemy.ext.asyncio import create_async_engine

celery_app = Celery(
    "jalert",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)


def _create_task_engine():
    """Use the same SQLite-safe engine settings as the web app."""
    database_url = settings.DATABASE_URL
    if database_url.startswith("sqlite"):
        return create_async_engine(
            database_url,
            connect_args={"timeout": 10},
            pool_size=1,
            max_overflow=0,
            pool_timeout=10,
        )
    return create_async_engine(database_url)

# ── Scheduled Tasks ───────────────────────────────────────────────────────────

celery_app.conf.beat_schedule = {
    # Run AI predictions for all villages every 6 hours
    "run-village-predictions": {
        "task": "app.tasks.run_all_predictions",
        "schedule": crontab(minute=0, hour="*/6"),
    },
    # Check for stale sensors (no data in 2 hours) every hour
    "check-sensor-health": {
        "task": "app.tasks.check_sensor_health",
        "schedule": crontab(minute=30),
    },
    # Send daily summary reports at 7am IST (1:30 UTC)
    "daily-summary-report": {
        "task": "app.tasks.send_daily_summary",
        "schedule": crontab(hour=1, minute=30),
    },
    # Cleanup old logs older than 90 days weekly
    "cleanup-old-logs": {
        "task": "app.tasks.cleanup_audit_logs",
        "schedule": crontab(day_of_week="sunday", hour=2),
    },
}


@celery_app.task(name="app.tasks.run_all_predictions", bind=True, max_retries=3)
def run_all_predictions(self):
    """Run AI predictions for all active villages"""
    import asyncio
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
    from sqlalchemy import select
    from app.models.user import Village
    from app.services.prediction_service import PredictionService

    async def _run():
        engine = _create_task_engine()
        SessionLocal = async_sessionmaker(engine, class_=AsyncSession)
        async with SessionLocal() as db:
            result = await db.execute(select(Village).where(Village.is_active == True))
            villages = result.scalars().all()
            for village in villages:
                try:
                    await PredictionService.predict(village.id, db, force_refresh=True)
                    logger.info(f"Prediction completed for village {village.id}")
                except Exception as e:
                    logger.error(f"Prediction failed for village {village.id}: {e}")
        await engine.dispose()

    asyncio.run(_run())
    return {"status": "completed"}


@celery_app.task(name="app.tasks.check_sensor_health", bind=True)
def check_sensor_health(self):
    """Mark sensors as inactive if no data received in 2 hours"""
    import asyncio
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
    from sqlalchemy import select, update, and_
    from app.models.user import Sensor, SensorStatus
    from datetime import datetime, timezone, timedelta

    async def _run():
        engine = _create_task_engine()
        SessionLocal = async_sessionmaker(engine, class_=AsyncSession)
        threshold = datetime.now(timezone.utc) - timedelta(hours=2)
        async with SessionLocal() as db:
            await db.execute(
                update(Sensor)
                .where(and_(
                    Sensor.status == SensorStatus.ACTIVE,
                    Sensor.last_seen < threshold,
                ))
                .values(status=SensorStatus.INACTIVE)
            )
            await db.commit()
        await engine.dispose()

    asyncio.run(_run())
    return {"status": "sensor health checked"}


@celery_app.task(name="app.tasks.send_daily_summary", bind=True)
def send_daily_summary(self):
    """Generate and email daily summary for admin"""
    import asyncio
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
    from sqlalchemy.orm import selectinload

    from app.models.user import NotificationChannel, NotificationDeliveryStatus, User, UserRole
    from app.services.notification_center_service import NotificationCenterService

    logger.info("Daily summary task triggered")

    async def _run():
        engine = _create_task_engine()
        SessionLocal = async_sessionmaker(engine, class_=AsyncSession)
        async with SessionLocal() as db:
            result = await db.execute(
                select(User)
                .options(selectinload(User.preferences))
                .where(User.role == UserRole.ADMIN, User.is_active == True)  # noqa: E712
            )
            admins = result.scalars().all()
            for admin in admins:
                preferences = getattr(admin, "preferences", None)
                if preferences and not preferences.daily_summary_enabled:
                    continue
                await NotificationCenterService.create(
                    db,
                    user_id=admin.id,
                    kind="daily_summary",
                    title="Daily operations summary ready",
                    message=(
                        "Your daily JALERT summary is ready. Review alerts, audit activity, "
                        "and active villages from the admin portal."
                    ),
                    channel=NotificationChannel.IN_APP,
                    delivery_status=NotificationDeliveryStatus.SENT,
                    link="/admin-portal",
                )
            await db.commit()
        await engine.dispose()

    asyncio.run(_run())
    return {"status": "summary sent"}


@celery_app.task(name="app.tasks.cleanup_audit_logs", bind=True)
def cleanup_audit_logs(self):
    """Remove audit logs older than 90 days"""
    import asyncio
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
    from sqlalchemy import delete
    from app.models.user import AuditLog
    from datetime import datetime, timezone, timedelta

    async def _run():
        engine = _create_task_engine()
        SessionLocal = async_sessionmaker(engine, class_=AsyncSession)
        cutoff = datetime.now(timezone.utc) - timedelta(days=90)
        async with SessionLocal() as db:
            result = await db.execute(
                delete(AuditLog).where(AuditLog.created_at < cutoff)
            )
            await db.commit()
            logger.info(f"Deleted {result.rowcount} old audit log entries")
        await engine.dispose()

    asyncio.run(_run())
    return {"status": "cleanup done"}


# ── On-demand tasks ───────────────────────────────────────────────────────────

@celery_app.task(name="app.tasks.send_alert_notifications", bind=True)
def send_alert_notifications(self, alert_id: str):
    """Send multi-channel notifications for a specific alert"""
    import asyncio
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
    from sqlalchemy import select
    from app.models.user import Alert, User
    from app.services.alert_service import NotificationService

    async def _run():
        engine = _create_task_engine()
        SessionLocal = async_sessionmaker(engine, class_=AsyncSession)
        async with SessionLocal() as db:
            a_result = await db.execute(select(Alert).where(Alert.id == alert_id))
            alert = a_result.scalar_one_or_none()
            if alert:
                await NotificationService.broadcast_alert(alert, db)
        await engine.dispose()

    asyncio.run(_run())
    return {"status": "notifications sent", "alert_id": alert_id}
