"""
JALERT - ML Training Router
Train models, synthetic data generation, model status
"""
import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from datetime import datetime, timezone, timedelta

from app.core.database import get_db
from app.core.security import require_admin
from app.models.user import SensorReading, HealthReport, User
from app.ml.models import water_quality_model, disease_outbreak_model
from app.services.ogd_data_service import (
    list_ogd_dataset_status,
    load_ogd_disease_training_data,
    load_ogd_water_quality_training_data,
)

router = APIRouter(prefix="/ml", tags=["ML Training"])


def _label_water_quality(row) -> int:
    """Auto-label: 0=safe, 1=moderate, 2=high_risk"""
    score = 0
    if row.get("ecoli", 0) and row["ecoli"] > 0:
        score += 2
    if row.get("ph") and (row["ph"] < 6.5 or row["ph"] > 8.5):
        score += 1
    if row.get("turbidity", 0) and row["turbidity"] > 4:
        score += 1
    if row.get("tds", 0) and row["tds"] > 500:
        score += 1
    if row.get("nitrate", 0) and row["nitrate"] > 45:
        score += 1
    return min(2, score)


@router.post("/train/water-quality")
async def train_water_quality_model(
    allow_synthetic_fallback: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Train water quality classification model on real sensor data"""
    ogd_data = load_ogd_water_quality_training_data()
    if ogd_data:
        df, y, metadata = ogd_data
        result = water_quality_model.train(df, y)
        return {"status": "trained", **metadata, **result}

    result = await db.execute(
        select(SensorReading)
        .where(SensorReading.ph.is_not(None))
        .limit(10000)
    )
    readings = result.scalars().all()

    if len(readings) < 100:
        if not allow_synthetic_fallback:
            raise HTTPException(
                status_code=409,
                detail=(
                    "Not enough trusted water-quality training data is available yet. "
                    "Load official datasets or retry with allow_synthetic_fallback=true."
                ),
            )
        # Generate synthetic training data only when explicitly requested
        np.random.seed(42)
        n = 2000
        data = {
            "ph": np.random.normal(7.0, 1.2, n).clip(4, 10),
            "turbidity": np.abs(np.random.exponential(3, n)),
            "ecoli": np.abs(np.random.exponential(1, n)),
            "tds": np.abs(np.random.normal(300, 150, n)),
            "temperature": np.random.normal(25, 5, n),
            "dissolved_oxygen": np.random.normal(7, 2, n).clip(0, 14),
            "nitrate": np.abs(np.random.normal(20, 20, n)),
            "arsenic": np.abs(np.random.exponential(0.005, n)),
            "fluoride": np.abs(np.random.normal(0.8, 0.5, n)),
        }
        df = pd.DataFrame(data)
        data_source = "synthetic_fallback"
    else:
        df = pd.DataFrame([{
            "ph": r.ph, "turbidity": r.turbidity, "ecoli": r.ecoli,
            "tds": r.tds, "temperature": r.temperature,
            "dissolved_oxygen": r.dissolved_oxygen, "nitrate": r.nitrate,
            "arsenic": r.arsenic, "fluoride": r.fluoride,
        } for r in readings])
        data_source = "database"

    y = df.apply(_label_water_quality, axis=1)
    result = water_quality_model.train(df, y)
    return {"status": "trained", "samples": len(df), "data_source": data_source, **result}


@router.post("/train/disease-outbreak")
async def train_disease_model(
    allow_synthetic_fallback: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Train disease outbreak prediction model"""
    ogd_data = load_ogd_disease_training_data()
    if ogd_data:
        df, y, metadata = ogd_data
        result = disease_outbreak_model.train(df, y)
        return {"status": "trained", **metadata, **result}

    if not allow_synthetic_fallback:
        raise HTTPException(
            status_code=409,
            detail=(
                "No trusted disease-training dataset is available yet. "
                "Load official datasets or retry with allow_synthetic_fallback=true."
            ),
        )

    # Synthetic training data is available only as an explicit fallback mode.
    np.random.seed(42)
    n = 3000
    data = {
        "water_quality_score": np.random.uniform(0, 100, n),
        "ecoli": np.abs(np.random.exponential(1, n)),
        "turbidity": np.abs(np.random.exponential(3, n)),
        "rainfall_mm": np.abs(np.random.exponential(30, n)),
        "symptom_count": np.random.poisson(3, n),
        "fever_cases": np.random.poisson(2, n),
        "diarrhea_cases": np.random.poisson(1.5, n),
        "vomiting_cases": np.random.poisson(1, n),
        "days_since_rain": np.random.randint(0, 30, n),
        "temperature": np.random.normal(28, 5, n),
        "humidity": np.random.uniform(40, 95, n),
    }
    df = pd.DataFrame(data)

    # Label: outbreak if multiple high-risk factors align
    y = (
        (df["ecoli"] > 1) |
        (df["fever_cases"] >= 5) |
        (df["diarrhea_cases"] >= 4) |
        ((df["water_quality_score"] < 40) & (df["symptom_count"] >= 5))
    ).astype(int)

    result = disease_outbreak_model.train(df, y)
    return {
        "status": "trained",
        "samples": len(df),
        "outbreak_ratio": float(y.mean()),
        "data_source": "synthetic_fallback",
        **result,
    }


@router.get("/datasets/ogd")
async def ogd_dataset_status(current_user: User = Depends(require_admin)):
    """Show official OGD datasets configured for local ML training."""
    return {"datasets": list_ogd_dataset_status()}


@router.get("/status")
async def model_status(current_user: User = Depends(require_admin)):
    """Check ML model availability and metadata"""
    import os
    from app.core.config import settings
    from pathlib import Path

    wq_path = Path(settings.ML_MODEL_DIR) / settings.WATER_QUALITY_MODEL
    do_path = Path(settings.ML_MODEL_DIR) / settings.DISEASE_OUTBREAK_MODEL

    return {
        "water_quality_model": {
            "available": wq_path.exists(),
            "path": str(wq_path),
            "size_kb": round(wq_path.stat().st_size / 1024, 2) if wq_path.exists() else None,
        },
        "disease_outbreak_model": {
            "available": do_path.exists(),
            "path": str(do_path),
            "size_kb": round(do_path.stat().st_size / 1024, 2) if do_path.exists() else None,
        },
    }
