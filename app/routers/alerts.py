"""
JALERT - Alerts Router
Alert management, incident workflow, manual triggers, and resolution.
"""
from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import require_health_worker, require_any, get_current_user
from app.schemas.schemas import (
    AlertAcknowledgeUpdate,
    AlertAssignUpdate,
    AlertCreate,
    AlertEscalateUpdate,
    AlertFilter,
    AlertOut,
    AlertResolveUpdate,
)
from app.services.alert_service import AlertService
from app.models.user import User

router = APIRouter(prefix="/alerts", tags=["Alerts"])


@router.get("/", response_model=List[AlertOut])
async def get_alerts(
    village_id: str = None,
    severity: str = None,
    alert_type: str = None,
    status: str = None,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any),
):
    """Fetch alerts with optional filters"""
    from app.models.user import AlertSeverity, AlertType, AlertStatus
    filters = AlertFilter(
        village_id=village_id,
        severity=AlertSeverity(severity) if severity else None,
        alert_type=AlertType(alert_type) if alert_type else None,
        status=AlertStatus(status) if status else None,
        limit=limit,
        offset=offset,
    )
    return await AlertService.get_alerts(filters, db)


@router.post("/manual", response_model=AlertOut, status_code=status.HTTP_201_CREATED)
async def trigger_manual_alert(
    data: AlertCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_health_worker),
):
    """Trigger a manual alert (Health Worker+)"""
    return await AlertService.create_manual_alert(data, current_user.id, db)


@router.patch("/{alert_id}/resolve", response_model=AlertOut)
async def resolve_alert(
    alert_id: str,
    payload: AlertResolveUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_health_worker),
):
    """Resolve an active alert"""
    return await AlertService.resolve_alert(
        alert_id,
        current_user.id,
        db,
        resolution_note=payload.resolution_note,
    )


@router.patch("/{alert_id}/acknowledge", response_model=AlertOut)
async def acknowledge_alert(
    alert_id: str,
    payload: AlertAcknowledgeUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_health_worker),
):
    """Acknowledge an active alert and attach an optional note."""
    return await AlertService.acknowledge_alert(
        alert_id,
        current_user.id,
        payload.note,
        db,
    )


@router.patch("/{alert_id}/assign", response_model=AlertOut)
async def assign_alert(
    alert_id: str,
    payload: AlertAssignUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_health_worker),
):
    """Assign an alert to a responder."""
    return await AlertService.assign_alert(
        alert_id,
        payload.assigned_to_user_id,
        current_user.id,
        payload.note,
        db,
    )


@router.patch("/{alert_id}/escalate", response_model=AlertOut)
async def escalate_alert(
    alert_id: str,
    payload: AlertEscalateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_health_worker),
):
    """Escalate an alert with a reason and numeric level."""
    return await AlertService.escalate_alert(
        alert_id,
        payload.escalation_level,
        payload.reason,
        current_user.id,
        db,
    )
