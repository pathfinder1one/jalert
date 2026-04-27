"""
JALERT - User, Preference, and Admin Management Service
"""
from __future__ import annotations

from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import hash_password, verify_password
from app.models.user import AuditLog, User, UserPreference
from app.schemas.schemas import (
    AdminUserPasswordReset,
    AdminUserUpdate,
    UserChangePassword,
    UserPreferenceUpdate,
    UserProfileUpdate,
)
from app.services.audit_service import AuditService


class UserService:
    @staticmethod
    async def get_or_create_preferences(
        user: User,
        db: AsyncSession,
    ) -> UserPreference:
        result = await db.execute(select(UserPreference).where(UserPreference.user_id == user.id))
        preferences = result.scalar_one_or_none()
        if preferences is not None:
            return preferences

        preferences = UserPreference(
            user_id=user.id,
            language=user.preferred_language,
            active_village_id=user.village_id,
            saved_village_ids=[user.village_id] if user.village_id else [],
        )
        db.add(preferences)
        await db.flush()
        return preferences

    @staticmethod
    async def update_profile(
        current_user: User,
        payload: UserProfileUpdate,
        db: AsyncSession,
    ) -> User:
        updates = payload.model_dump(exclude_unset=True)
        if "name" in updates:
            current_user.name = updates["name"]
        if "phone" in updates:
            current_user.phone = updates["phone"]
        if "preferred_language" in updates and updates["preferred_language"]:
            current_user.preferred_language = updates["preferred_language"]
            preferences = await UserService.get_or_create_preferences(current_user, db)
            preferences.language = updates["preferred_language"]

        await AuditService.log(
            db,
            action="user.profile.update",
            resource_type="user",
            resource_id=current_user.id,
            user_id=current_user.id,
            detail=updates,
        )
        await db.flush()
        return current_user

    @staticmethod
    async def change_password(
        current_user: User,
        payload: UserChangePassword,
        db: AsyncSession,
    ) -> None:
        if not verify_password(payload.current_password, current_user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is incorrect",
            )

        current_user.hashed_password = hash_password(payload.new_password)
        await AuditService.log(
            db,
            action="user.password.change",
            resource_type="user",
            resource_id=current_user.id,
            user_id=current_user.id,
        )
        await db.flush()

    @staticmethod
    async def get_preferences(current_user: User, db: AsyncSession) -> UserPreference:
        return await UserService.get_or_create_preferences(current_user, db)

    @staticmethod
    async def update_preferences(
        current_user: User,
        payload: UserPreferenceUpdate,
        db: AsyncSession,
    ) -> UserPreference:
        preferences = await UserService.get_or_create_preferences(current_user, db)
        updates = payload.model_dump(exclude_unset=True)

        for field, value in updates.items():
            setattr(preferences, field, value)

        if "language" in updates and updates["language"]:
            current_user.preferred_language = updates["language"]

        await AuditService.log(
            db,
            action="user.preferences.update",
            resource_type="user_preference",
            resource_id=preferences.id,
            user_id=current_user.id,
            detail=updates,
        )
        await db.flush()
        return preferences


class AdminService:
    @staticmethod
    async def list_users(db: AsyncSession, *, include_inactive: bool = True) -> list[User]:
        query = select(User).order_by(desc(User.created_at))
        if not include_inactive:
            query = query.where(User.is_active == True)  # noqa: E712
        result = await db.execute(query)
        return result.scalars().all()

    @staticmethod
    async def update_user(
        user_id: str,
        payload: AdminUserUpdate,
        actor: User,
        db: AsyncSession,
    ) -> User:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user is None:
            raise HTTPException(status_code=404, detail="User not found")

        updates = payload.model_dump(exclude_unset=True)
        for field, value in updates.items():
            setattr(user, field, value)

        if "preferred_language" in updates and updates["preferred_language"]:
            preferences = await UserService.get_or_create_preferences(user, db)
            preferences.language = updates["preferred_language"]

        await AuditService.log(
            db,
            action="admin.user.update",
            resource_type="user",
            resource_id=user.id,
            user_id=actor.id,
            detail=updates,
        )
        await db.flush()
        return user

    @staticmethod
    async def set_user_password(
        user_id: str,
        payload: AdminUserPasswordReset,
        actor: User,
        db: AsyncSession,
    ) -> None:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user is None:
            raise HTTPException(status_code=404, detail="User not found")

        user.hashed_password = hash_password(payload.new_password)
        await AuditService.log(
            db,
            action="admin.user.password_reset",
            resource_type="user",
            resource_id=user.id,
            user_id=actor.id,
        )
        await db.flush()

    @staticmethod
    async def list_audit_logs(
        db: AsyncSession,
        *,
        limit: int = 100,
        action: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> list[AuditLog]:
        query = select(AuditLog).options(selectinload(AuditLog.user)).order_by(desc(AuditLog.created_at)).limit(limit)
        if action:
            query = query.where(AuditLog.action == action)
        if user_id:
            query = query.where(AuditLog.user_id == user_id)
        result = await db.execute(query)
        return result.scalars().all()
