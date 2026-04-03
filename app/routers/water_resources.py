"""
JALERT - Public water resources explorer
"""
from typing import Optional

from fastapi import APIRouter, Query

from app.services.ogd_data_service import get_water_resources_data


router = APIRouter(prefix="/water-resources", tags=["Water Resources"])


@router.get("/")
async def list_water_resources(
    query: Optional[str] = Query(default=None),
    state: Optional[str] = Query(default=None),
    resource_type: Optional[str] = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
):
    return get_water_resources_data(query=query, state=state, resource_type=resource_type, limit=limit)
