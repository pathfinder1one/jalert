"""
JALERT - Health Reports Router
Symptom reporting, case tracking, outbreak clusters
"""
from typing import List
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, and_, func
from datetime import datetime, timezone, timedelta

from app.core.database import get_db
from app.core.security import require_health_worker, require_any, get_current_user
from app.schemas.schemas import HealthReportCreate, HealthReportOut
from app.models.user import HealthReport, User

router = APIRouter(prefix="/health", tags=["Health Reports"])


@router.post("/report", response_model=HealthReportOut, status_code=status.HTTP_201_CREATED)
async def submit_health_report(
    data: HealthReportCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Submit a new health/symptom report"""
    report = HealthReport(
        **data.model_dump(),
        user_id=current_user.id,
    )
    db.add(report)
    await db.flush()
    return report


@router.get("/reports/{village_id}", response_model=List[HealthReportOut])
async def get_village_health_reports(
    village_id: str,
    days: int = Query(default=14, ge=1, le=90),
    limit: int = Query(default=50, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_health_worker),
):
    """Get health reports for a village (Health Worker+)"""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        select(HealthReport)
        .where(and_(
            HealthReport.village_id == village_id,
            HealthReport.created_at >= since,
        ))
        .order_by(desc(HealthReport.created_at))
        .limit(limit)
    )
    return result.scalars().all()


@router.get("/clusters/{village_id}")
async def get_outbreak_clusters(
    village_id: str,
    days: int = Query(default=7, ge=1, le=30),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_health_worker),
):
    """Identify symptom clusters and potential outbreak hotspots"""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        select(HealthReport)
        .where(and_(
            HealthReport.village_id == village_id,
            HealthReport.created_at >= since,
        ))
    )
    reports = result.scalars().all()

    # Aggregate symptoms
    symptom_freq: dict = {}
    daily_counts: dict = {}
    for r in reports:
        day = r.created_at.date().isoformat() if r.created_at else "unknown"
        daily_counts[day] = daily_counts.get(day, 0) + 1
        for symptom in r.symptoms.keys():
            symptom_freq[symptom] = symptom_freq.get(symptom, 0) + 1

    top_symptoms = sorted(symptom_freq.items(), key=lambda x: x[1], reverse=True)[:10]
    cluster_detected = len(reports) >= 5 and len(symptom_freq) > 0

    return {
        "village_id": village_id,
        "period_days": days,
        "total_reports": len(reports),
        "hospitalized": sum(1 for r in reports if r.is_hospitalized),
        "cluster_detected": cluster_detected,
        "top_symptoms": [{"symptom": s, "count": c} for s, c in top_symptoms],
        "daily_case_trend": daily_counts,
        "alert_level": (
            "critical" if len(reports) >= 20 else
            "high" if len(reports) >= 10 else
            "moderate" if len(reports) >= 5 else "low"
        ),
    }


@router.patch("/report/{report_id}/assign")
async def assign_health_worker(
    report_id: str,
    worker_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_health_worker),
):
    """Assign a health worker to a report"""
    result = await db.execute(select(HealthReport).where(HealthReport.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Report not found")
    report.assigned_worker_id = worker_id
    await db.flush()
    return {"message": "Worker assigned", "report_id": report_id, "worker_id": worker_id}


@router.patch("/report/{report_id}/resolve")
async def mark_recovered(
    report_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_health_worker),
):
    """Mark patient as recovered"""
    result = await db.execute(select(HealthReport).where(HealthReport.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Report not found")
    report.is_recovered = True
    await db.flush()
    return {"message": "Marked as recovered", "report_id": report_id}
