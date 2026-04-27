"""
JALERT - Notifications Router
In-app inbox, delivery log, and read state management.
"""
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.schemas.schemas import NotificationOut
from app.services.notification_center_service import NotificationCenterService

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("/", response_model=List[NotificationOut])
async def list_notifications(
    unread_only: bool = False,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List notifications for the current authenticated user."""
    return await NotificationCenterService.list_for_user(
        current_user.id,
        db,
        unread_only=unread_only,
        limit=limit,
    )


@router.patch("/{notification_id}/read", response_model=NotificationOut)
async def mark_notification_read(
    notification_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark a single notification as read."""
    return await NotificationCenterService.mark_read(notification_id, current_user.id, db)


@router.post("/read-all")
async def mark_all_notifications_read(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark every notification for the user as read."""
    count = await NotificationCenterService.mark_all_read(current_user.id, db)
    return {"updated": count}
