"""
JALERT - Auth Router
Registration, login, profile, password, and synced preference management.
"""
from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.schemas.schemas import (
    TokenResponse,
    UserChangePassword,
    UserLogin,
    UserOut,
    UserPreferenceOut,
    UserPreferenceUpdate,
    UserProfileUpdate,
    UserRegister,
)
from app.services.auth_service import AuthService
from app.services.user_service import UserService
from app.models.user import User

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(data: UserRegister, db: AsyncSession = Depends(get_db)):
    """Register a new user"""
    user = await AuthService.register(data, db)
    return user


@router.post("/login", response_model=TokenResponse)
async def login(data: UserLogin, request: Request, db: AsyncSession = Depends(get_db)):
    """Authenticate and receive JWT tokens"""
    ip = request.client.host if request.client else ""
    return await AuthService.login(data, db, ip=ip)


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    """Get current authenticated user profile"""
    return current_user


@router.patch("/me", response_model=UserOut)
async def update_me(
    payload: UserProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update the current user's profile."""
    return await UserService.update_profile(current_user, payload, db)


@router.post("/change-password")
async def change_password(
    payload: UserChangePassword,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Change the current user's password."""
    await UserService.change_password(current_user, payload, db)
    return {"status": "password_changed"}


@router.get("/preferences", response_model=UserPreferenceOut)
async def get_preferences(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get synced preferences for the current user."""
    return await UserService.get_preferences(current_user, db)


@router.patch("/preferences", response_model=UserPreferenceOut)
async def update_preferences(
    payload: UserPreferenceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update synced preferences for the current user."""
    return await UserService.update_preferences(current_user, payload, db)
