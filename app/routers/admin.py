"""
JALERT - Admin Router
User administration, audit visibility, and operational controls.
"""
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import require_admin
from app.models.user import User
from app.schemas.schemas import (
    AdminUserPasswordReset,
    AdminUserUpdate,
    AuditLogOut,
    UserOut,
)
from app.services.user_service import AdminService

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("/users", response_model=List[UserOut])
async def list_users(
    include_inactive: bool = True,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """List users for administrator review."""
    return await AdminService.list_users(db, include_inactive=include_inactive)


@router.patch("/users/{user_id}", response_model=UserOut)
async def update_user(
    user_id: str,
    payload: AdminUserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Update role, active state, village link, and preferred language for a user."""
    return await AdminService.update_user(user_id, payload, current_user, db)


@router.post("/users/{user_id}/set-password")
async def set_user_password(
    user_id: str,
    payload: AdminUserPasswordReset,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Admin-initiated password reset for a target user."""
    await AdminService.set_user_password(user_id, payload, current_user, db)
    return {"status": "password_reset"}


@router.get("/audit", response_model=List[AuditLogOut])
async def list_audit_logs(
    limit: int = 100,
    action: str | None = None,
    user_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """List recent audit activity for administrators."""
    return await AdminService.list_audit_logs(
        db,
        limit=limit,
        action=action,
        user_id=user_id,
    )
