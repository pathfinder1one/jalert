"""
JALERT - Villages Router
Village CRUD, dashboard summary
"""
from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import require_admin, require_any
from app.schemas.schemas import VillageCreate, VillageOut
from app.models.user import Village, User

router = APIRouter(prefix="/villages", tags=["Villages"])


@router.post("/", response_model=VillageOut, status_code=status.HTTP_201_CREATED)
async def create_village(
    data: VillageCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Create a new village (Admin only)"""
    village = Village(**data.model_dump())
    db.add(village)
    await db.flush()
    return village


@router.get("/", response_model=List[VillageOut])
async def list_villages(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any),
):
    """List all active villages"""
    result = await db.execute(select(Village).where(Village.is_active == True))
    return result.scalars().all()


@router.get("/{village_id}", response_model=VillageOut)
async def get_village(
    village_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any),
):
    """Get village details"""
    result = await db.execute(select(Village).where(Village.id == village_id))
    village = result.scalar_one_or_none()
    if not village:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Village not found")
    return village


@router.get("/{village_id}/dashboard")
async def village_dashboard(
    village_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any),
):
    """
    Single-call village dashboard snapshot:
    latest prediction + active alerts + recent sensor summary
    """
    from sqlalchemy import desc, and_
    from app.models.user import AIPrediction, Alert, AlertStatus, SensorReading
    from app.services.prediction_service import PredictionService
    # Village
    v_result = await db.execute(select(Village).where(Village.id == village_id))
    village = v_result.scalar_one_or_none()
    if not village:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Village not found")

    # Latest sensor reading
    sr_result = await db.execute(
        select(SensorReading)
        .where(SensorReading.village_id == village_id)
        .order_by(desc(SensorReading.timestamp))
        .limit(1)
    )
    latest_reading = sr_result.scalar_one_or_none()

    # Latest prediction
    p_result = await db.execute(
        select(AIPrediction).where(AIPrediction.village_id == village_id)
        .order_by(desc(AIPrediction.created_at)).limit(1)
    )
    prediction = p_result.scalar_one_or_none()
    if PredictionService._prediction_needs_rebuild(prediction):
        prediction = None

    # Active alerts
    a_result = await db.execute(
        select(Alert).where(and_(Alert.village_id == village_id, Alert.status == AlertStatus.ACTIVE))
        .order_by(desc(Alert.created_at)).limit(5)
    )
    alerts = a_result.scalars().all()

    risk_score = prediction.risk_score if prediction else None
    risk_category = prediction.risk_category.value if prediction else "unknown"
    outbreak_timeline_days = prediction.outbreak_timeline_days if prediction else None
    risk_updated = prediction.created_at.isoformat() if prediction else None

    if prediction is None and latest_reading is not None:
        quality_score = latest_reading.quality_score if latest_reading.quality_score is not None else 68
        sensor_risk_score = max(
            10.0,
            min(
                95.0,
                100.0 - float(quality_score) + float(latest_reading.turbidity or 0) * 1.4 + float(latest_reading.ecoli or 0) * 8.0,
            ),
        )
        risk_score = round(sensor_risk_score, 2)
        if sensor_risk_score >= 75:
            risk_category = "critical"
        elif sensor_risk_score >= 50:
            risk_category = "high"
        elif sensor_risk_score >= 25:
            risk_category = "moderate"
        else:
            risk_category = "low"
        risk_updated = latest_reading.timestamp.isoformat() if latest_reading.timestamp else None

    return {
        "village": {"id": village.id, "name": village.name, "district": village.district, "state": village.state, "population": village.population},
        "risk": {
            "score": risk_score,
            "category": risk_category,
            "outbreak_timeline_days": outbreak_timeline_days,
            "last_updated": risk_updated,
        },
        "active_alerts": [
            {"id": a.id, "severity": a.severity.value, "title": a.title, "created_at": a.created_at.isoformat()}
            for a in alerts
        ],
        "latest_sensor": {
            "ph": latest_reading.ph if latest_reading else None,
            "turbidity": latest_reading.turbidity if latest_reading else None,
            "ecoli": latest_reading.ecoli if latest_reading else None,
            "quality_score": latest_reading.quality_score if latest_reading else None,
            "timestamp": latest_reading.timestamp.isoformat() if latest_reading else None,
        },
    }
