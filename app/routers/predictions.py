"""
JALERT - AI Predictions Router
Risk scoring, outbreak timeline, XAI explanations
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.core.database import get_db
from app.core.security import require_any, require_health_worker
from app.schemas.schemas import PredictionOut
from app.services.prediction_service import PredictionService
from app.models.user import AIPrediction, User

router = APIRouter(prefix="/predictions", tags=["AI Predictions"])


def _needs_prediction_refresh(pred: AIPrediction | None) -> bool:
    if PredictionService._prediction_needs_rebuild(pred):
        return True
    if isinstance(pred.shap_values, dict) and pred.shap_values.get("error"):
        return True
    if not pred.agent_outputs:
        return True
    return False


@router.post("/{village_id}", response_model=PredictionOut)
async def run_prediction(
    village_id: str,
    force_refresh: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_health_worker),
):
    """
    Run full AI multi-agent risk assessment for a village.
    Returns: risk score, category, outbreak timeline, recommendations, SHAP values.
    """
    prediction = await PredictionService.predict(village_id, db, force_refresh=force_refresh)
    return prediction


@router.get("/{village_id}/latest", response_model=PredictionOut)
async def get_latest_prediction(
    village_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any),
):
    """Get the most recent AI prediction for a village"""
    result = await db.execute(
        select(AIPrediction)
        .where(AIPrediction.village_id == village_id)
        .order_by(desc(AIPrediction.created_at))
        .limit(1)
    )
    pred = result.scalar_one_or_none()
    if _needs_prediction_refresh(pred):
        pred = await PredictionService.predict(village_id, db, force_refresh=False)
    return pred


@router.get("/{village_id}/history", response_model=list[PredictionOut])
async def get_prediction_history(
    village_id: str,
    limit: int = Query(default=30, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any),
):
    """Get prediction history for trend analysis"""
    history = await PredictionService.ensure_history(village_id, db, minimum_points=min(limit, 14))
    history = history[:limit]
    if history and _needs_prediction_refresh(history[0]):
        pred = await PredictionService.predict(village_id, db, force_refresh=False)
        history = [pred, *history[: max(limit - 1, 0)]]
    return history


@router.get("/{village_id}/explain")
async def explain_prediction(
    village_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_any),
):
    """Get SHAP-based XAI explanation for latest prediction"""
    result = await db.execute(
        select(AIPrediction)
        .where(AIPrediction.village_id == village_id)
        .order_by(desc(AIPrediction.created_at))
        .limit(1)
    )
    pred = result.scalar_one_or_none()
    if _needs_prediction_refresh(pred):
        pred = await PredictionService.predict(village_id, db, force_refresh=False)

    return {
        "village_id": village_id,
        "risk_score": pred.risk_score,
        "risk_category": pred.risk_category,
        "shap_values": pred.shap_values,
        "agent_outputs": pred.agent_outputs,
        "explanation": (
            f"The risk score of {pred.risk_score:.1f}/100 was determined by analyzing "
            f"water quality (weight: 35%), disease patterns (30%), weather/flood risk (15%), "
            f"and community health reports (20%). "
            f"{'Outbreak is predicted in ' + str(pred.outbreak_timeline_days) + ' days.' if pred.outbreak_timeline_days else 'No imminent outbreak predicted.'}"
        )
    }
