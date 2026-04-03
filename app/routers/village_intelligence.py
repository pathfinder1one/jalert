from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, require_any, require_health_worker
from app.models.user import User
from app.schemas.schemas import (
    CitizenRequestCreate,
    CitizenRequestOut,
    CitizenRequestStatusUpdate,
)
from app.services.village_intelligence_service import (
    CitizenRequestService,
    VillageIntelligenceService,
)


router = APIRouter(prefix="/village-intelligence", tags=["Village Intelligence"])


@router.get("/catalog")
async def get_village_catalog(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any),
):
    return await VillageIntelligenceService.get_catalog(db)


@router.get("/map-overview")
async def get_map_overview(
    state: Optional[str] = Query(default=None),
    district: Optional[str] = Query(default=None),
    contaminant: Optional[str] = Query(default=None),
    season: str = Query(default="post_monsoon"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any),
):
    return await VillageIntelligenceService.get_map_overview(
        db,
        state=state,
        district=district,
        contaminant=contaminant,
        season=season,
    )


@router.get("/citizen-requests", response_model=list[CitizenRequestOut])
async def list_citizen_requests(
    village_id: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any),
):
    return await CitizenRequestService.list_requests(db, village_id=village_id)


@router.post("/citizen-requests", response_model=CitizenRequestOut, status_code=status.HTTP_201_CREATED)
async def create_citizen_request(
    data: CitizenRequestCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await CitizenRequestService.create_request(data, db, user_id=current_user.id)


@router.patch("/citizen-requests/{request_id}", response_model=CitizenRequestOut)
async def update_citizen_request(
    request_id: str,
    data: CitizenRequestStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_health_worker),
):
    return await CitizenRequestService.update_status(
        db,
        request_id=request_id,
        status=data.status,
        resolution_notes=data.resolution_notes,
    )


@router.get("/{village_id}")
async def get_village_profile(
    village_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any),
):
    return await VillageIntelligenceService.get_profile(village_id, db)


@router.get("/{village_id}/contaminants")
async def get_village_contaminants(
    village_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any),
):
    profile = await VillageIntelligenceService.get_profile(village_id, db)
    return {
        "village": profile["village"],
        "contaminants": profile["contaminants"],
        "family_actions": profile["family_actions"],
        "transparency": profile["transparency"],
    }


@router.get("/{village_id}/compare")
async def compare_village(
    village_id: str,
    compare_with: list[str] = Query(default=[]),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any),
):
    return await VillageIntelligenceService.compare_villages([village_id, *compare_with], db)
