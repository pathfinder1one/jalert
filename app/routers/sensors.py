"""
JALERT - Sensor Router
IoT data ingestion, sensor management, historical data
"""
from typing import List
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import require_health_worker, require_any, get_current_user
from app.schemas.schemas import SensorReadingIngest, SensorReadingOut, SensorCreate, SensorOut
from app.services.sensor_service import SensorService
from app.models.user import User

router = APIRouter(prefix="/sensors", tags=["Sensors"])


@router.post("/ingest", response_model=SensorReadingOut, status_code=status.HTTP_201_CREATED)
async def ingest_reading(
    data: SensorReadingIngest,
    db: AsyncSession = Depends(get_db),
    # IoT devices use API key; simplified here
):
    """Ingest a single IoT sensor reading"""
    reading = await SensorService.ingest_reading(data, db)
    return reading


@router.post("/ingest/batch")
async def ingest_batch(
    readings: List[SensorReadingIngest],
    db: AsyncSession = Depends(get_db),
):
    """Batch ingest multiple sensor readings"""
    return await SensorService.batch_ingest(readings, db)


@router.post("/", response_model=SensorOut, status_code=status.HTTP_201_CREATED)
async def create_sensor(
    data: SensorCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_health_worker),
):
    """Register a new sensor (Health Worker+)"""
    sensor = await SensorService.create_sensor(data, db)
    return sensor


@router.get("/village/{village_id}", response_model=List[SensorOut])
async def get_village_sensors(
    village_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any),
):
    """Get all sensors for a village"""
    return await SensorService.get_sensors_by_village(village_id, db)


@router.get("/readings/{village_id}", response_model=List[SensorReadingOut])
async def get_village_readings(
    village_id: str,
    hours: int = Query(default=24, ge=1, le=720),
    limit: int = Query(default=100, le=1000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any),
):
    """Get historical sensor readings for a village"""
    return await SensorService.get_readings_by_village(village_id, db, hours=hours, limit=limit)


@router.get("/inventory")
async def get_sensor_inventory(
    village_id: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any),
):
    """Get available sensors and latest details, and refresh the inventory dataset."""
    return await SensorService.get_sensor_inventory(db, village_id=village_id)
