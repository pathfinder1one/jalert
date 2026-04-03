"""
JALERT - Auth Service
User registration, login, token management
"""
from datetime import timedelta
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status

from app.models.user import User
from app.schemas.schemas import UserRegister, UserLogin, TokenResponse
from app.core.security import (
    hash_password, verify_password,
    create_access_token, create_refresh_token
)
from app.core.config import settings
from app.services.audit_service import AuditService
from loguru import logger


class AuthService:

    @staticmethod
    async def register(data: UserRegister, db: AsyncSession) -> User:
        # Check email uniqueness
        existing = await db.execute(select(User).where(User.email == data.email))
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already registered"
            )

        user = User(
            name=data.name,
            email=data.email,
            phone=data.phone,
            hashed_password=hash_password(data.password),
            role=data.role,
            village_id=data.village_id,
            preferred_language=data.preferred_language,
        )
        db.add(user)
        await db.flush()
        await AuditService.log(
            db, action="user.register", resource_type="user",
            resource_id=user.id, user_id=None
        )
        logger.info(f"New user registered: {user.email} (role={user.role})")
        return user

    @staticmethod
    async def login(data: UserLogin, db: AsyncSession, ip: str = "") -> TokenResponse:
        result = await db.execute(select(User).where(User.email == data.email))
        user: Optional[User] = result.scalar_one_or_none()

        if not user or not verify_password(data.password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials"
            )
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account disabled"
            )

        token_data = {"sub": user.id, "role": user.role, "email": user.email}
        access_token = create_access_token(token_data)
        refresh_token = create_refresh_token(token_data)

        await AuditService.log(
            db, action="user.login", resource_type="user",
            resource_id=user.id, user_id=user.id, detail={"ip": ip}
        )
        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )
