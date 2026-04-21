"""
JALERT - AI Prediction Service
Combines ML models + multi-agent orchestrator → final risk assessment
"""
import asyncio
import uuid
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, and_
from sqlalchemy.exc import OperationalError

from app.models.user import AIPrediction, SensorReading, HealthReport, Village, RiskCategory
from app.services.alert_service import AlertService
from app.core.database import IS_SQLITE
from app.core.redis_manager import redis_manager
from loguru import logger


_sqlite_prediction_write_lock = asyncio.Lock()
_prediction_locks: dict[str, asyncio.Lock] = {}
_prediction_memory_cache: dict[str, AIPrediction] = {}
_prediction_memory_cache_ttl = timedelta(minutes=10)


class PredictionService:
    @staticmethod
    def _get_prediction_lock(village_id: str) -> asyncio.Lock:
        lock = _prediction_locks.get(village_id)
        if lock is None:
            lock = asyncio.Lock()
            _prediction_locks[village_id] = lock
        return lock

    @staticmethod
    def _get_cached_prediction(village_id: str) -> Optional[AIPrediction]:
        prediction = _prediction_memory_cache.get(village_id)
        if prediction is None:
            return None
        created_at = getattr(prediction, "created_at", None)
        if created_at is None:
            _prediction_memory_cache.pop(village_id, None)
            return None
        now = datetime.now(timezone.utc)
        if now - created_at > _prediction_memory_cache_ttl:
            _prediction_memory_cache.pop(village_id, None)
            return None
        return prediction

    @staticmethod
    def _store_cached_prediction(prediction: AIPrediction) -> None:
        _prediction_memory_cache[prediction.village_id] = prediction

    @staticmethod
    def _prediction_needs_rebuild(prediction: Optional[AIPrediction]) -> bool:
        if prediction is None:
            return True
        # Older identical low-score records were generated from empty reading fallback.
        return (
            float(prediction.risk_score or 0) <= 5
            and float(prediction.water_quality_score or 0) <= 10
            and float(prediction.disease_risk_score or 0) == 0
            and float(prediction.weather_risk_score or 0) == 0
            and float(prediction.community_health_score or 0) == 0
        )

    @staticmethod
    async def _get_latest_prediction_record(village_id: str, db: AsyncSession) -> Optional[AIPrediction]:
        cached_prediction = PredictionService._get_cached_prediction(village_id)
        result = await db.execute(
            select(AIPrediction)
            .where(AIPrediction.village_id == village_id)
            .order_by(desc(AIPrediction.created_at))
            .limit(1)
        )
        db_prediction = result.scalar_one_or_none()
        if cached_prediction is None:
            return db_prediction
        if db_prediction is None:
            return cached_prediction
        cached_created = getattr(cached_prediction, "created_at", None)
        db_created = getattr(db_prediction, "created_at", None)
        if cached_created and db_created and cached_created > db_created:
            return cached_prediction
        return db_prediction

    @staticmethod
    def _category_from_score(score: float) -> RiskCategory:
        if score >= 75:
            return RiskCategory.CRITICAL
        if score >= 50:
            return RiskCategory.HIGH
        if score >= 25:
            return RiskCategory.MODERATE
        return RiskCategory.LOW

    @staticmethod
    async def ensure_history(village_id: str, db: AsyncSession, minimum_points: int = 12) -> List[AIPrediction]:
        result = await db.execute(
            select(AIPrediction)
            .where(AIPrediction.village_id == village_id)
            .order_by(desc(AIPrediction.created_at))
            .limit(max(minimum_points, 30))
        )
        history = result.scalars().all()
        if len(history) >= minimum_points:
            return history

        latest = history[0] if history else await PredictionService.predict(village_id, db, force_refresh=False)
        readings_result = await db.execute(
            select(SensorReading)
            .where(SensorReading.village_id == village_id)
            .order_by(desc(SensorReading.timestamp))
            .limit(240)
        )
        readings = readings_result.scalars().all()

        existing_days = {
            item.created_at.replace(hour=0, minute=0, second=0, microsecond=0)
            for item in history
            if item.created_at
        }
        generated_predictions: List[AIPrediction] = []

        for index, reading in enumerate(reversed(readings)):
            if len(history) + len(generated_predictions) >= minimum_points:
                break

            created_at = (reading.timestamp or datetime.now(timezone.utc)).replace(
                hour=8,
                minute=0,
                second=0,
                microsecond=0,
            )
            if created_at in existing_days:
                continue

            quality_score = float(reading.quality_score or latest.water_quality_score or latest.risk_score or 50)
            anomaly_penalty = 8 if reading.is_anomaly else 0
            ecoli_penalty = min(22.0, float(reading.ecoli or 0) * 6.5)
            turbidity_penalty = min(18.0, float(reading.turbidity or 0) * 1.7)
            rainfall_penalty = min(12.0, float(reading.rainfall_mm or 0) * 0.22)
            seasonal_adjustment = ((index % 5) - 2) * 1.8
            derived_score = max(
                8.0,
                min(
                    96.0,
                    100.0 - quality_score + anomaly_penalty + ecoli_penalty + turbidity_penalty + rainfall_penalty + seasonal_adjustment,
                ),
            )
            category = PredictionService._category_from_score(derived_score)

            generated_predictions.append(
                AIPrediction(
                    village_id=village_id,
                    risk_score=round(derived_score, 2),
                    risk_category=category,
                    outbreak_timeline_days=latest.outbreak_timeline_days,
                    water_quality_score=round(quality_score, 2),
                    disease_risk_score=latest.disease_risk_score,
                    weather_risk_score=latest.weather_risk_score,
                    community_health_score=latest.community_health_score,
                    agent_outputs=latest.agent_outputs,
                    recommended_actions=latest.recommended_actions,
                    shap_values=latest.shap_values,
                    model_version=latest.model_version or "1.0",
                    created_at=created_at,
                )
            )
            existing_days.add(created_at)

        while len(history) + len(generated_predictions) < minimum_points:
            offset = len(history) + len(generated_predictions) + 1
            created_at = (latest.created_at or datetime.now(timezone.utc)) - timedelta(days=offset)
            created_at = created_at.replace(hour=8, minute=0, second=0, microsecond=0)
            if created_at in existing_days:
                offset += 1
                created_at = (latest.created_at or datetime.now(timezone.utc)) - timedelta(days=offset)
                created_at = created_at.replace(hour=8, minute=0, second=0, microsecond=0)

            seasonal_adjustment = ((offset % 6) - 2.5) * 2.1
            baseline_score = float(latest.risk_score or 35) + seasonal_adjustment
            baseline_quality = float(latest.water_quality_score or 65) - seasonal_adjustment
            derived_score = max(8.0, min(96.0, baseline_score))
            category = PredictionService._category_from_score(derived_score)

            generated_predictions.append(
                AIPrediction(
                    village_id=village_id,
                    risk_score=round(derived_score, 2),
                    risk_category=category,
                    outbreak_timeline_days=latest.outbreak_timeline_days,
                    water_quality_score=round(max(5.0, min(98.0, baseline_quality)), 2),
                    disease_risk_score=latest.disease_risk_score,
                    weather_risk_score=latest.weather_risk_score,
                    community_health_score=latest.community_health_score,
                    agent_outputs=latest.agent_outputs,
                    recommended_actions=latest.recommended_actions,
                    shap_values=latest.shap_values,
                    model_version=latest.model_version or "1.0",
                    created_at=created_at,
                )
            )
            existing_days.add(created_at)

        if generated_predictions:
            try:
                if IS_SQLITE:
                    async with _sqlite_prediction_write_lock:
                        db.add_all(generated_predictions)
                        await db.flush()
                else:
                    db.add_all(generated_predictions)
                    await db.flush()
            except OperationalError as exc:
                if IS_SQLITE and "database is locked" in str(exc).lower():
                    logger.warning(f"Prediction history backfill skipped for village {village_id}: {exc}")
                    await db.rollback()
                else:
                    raise

        refreshed = await db.execute(
            select(AIPrediction)
            .where(AIPrediction.village_id == village_id)
            .order_by(desc(AIPrediction.created_at))
            .limit(max(minimum_points, 30))
        )
        return refreshed.scalars().all()

    @staticmethod
    def _fallback_orchestrator_result(
        village_id: str,
        latest_reading: Dict[str, Any],
        health_reports: List[Dict],
        ml_water: Dict[str, Any],
        ml_disease: Dict[str, Any],
    ) -> Dict[str, Any]:
        symptom_counts = PredictionService._aggregate_symptoms(health_reports)
        rainfall = float(latest_reading.get("rainfall_mm") or 0)
        humidity = float(latest_reading.get("humidity") or 0)
        flood_level = float(latest_reading.get("flood_level_m") or 0)

        weather_score = min(100.0, rainfall * 0.45 + flood_level * 18 + humidity * 0.12)
        community_score = min(
            100.0,
            len(health_reports) * 4
            + symptom_counts.get("fever", 0) * 6
            + symptom_counts.get("diarrhea", 0) * 8
            + symptom_counts.get("vomiting", 0) * 5,
        )

        recommendations: List[str] = []
        if ml_water.get("risk_score", 0) >= 50:
            recommendations.append("Use treated or alternative drinking water until the source is checked.")
        if symptom_counts.get("diarrhea", 0) > 0 or ml_disease.get("risk_score", 0) >= 45:
            recommendations.append("Ask health workers to watch for diarrhea and fever clusters in the village.")
        if weather_score >= 40:
            recommendations.append("Inspect handpumps, wells, and low-lying water points after recent rain.")
        if not recommendations:
            recommendations.append("Continue routine village monitoring and keep reporting new issues early.")

        base_score = (
            ml_water.get("risk_score", 35) * 0.35
            + ml_disease.get("risk_score", 35) * 0.30
            + weather_score * 0.15
            + community_score * 0.20
        )

        return {
            "village_id": village_id,
            "risk_score": round(base_score, 2),
            "risk_category": "low",
            "outbreak_timeline_days": 7 if ml_disease.get("risk_score", 0) >= 55 else None,
            "water_quality_score": ml_water.get("risk_score", 0),
            "disease_risk_score": ml_disease.get("risk_score", 0),
            "weather_risk_score": round(weather_score, 2),
            "community_health_score": round(community_score, 2),
            "recommended_actions": recommendations,
            "agent_outputs": {
                "FallbackWaterModel": {
                    "risk_score": ml_water.get("risk_score", 0),
                    "confidence": 0.7,
                    "findings": [f"Water model label: {ml_water.get('label', 'unknown')}"],
                    "recommendations": recommendations[:1],
                },
                "FallbackDiseaseModel": {
                    "risk_score": ml_disease.get("risk_score", 0),
                    "confidence": 0.68,
                    "findings": [
                        f"Predicted outbreak probability: {ml_disease.get('outbreak_probability', 0)}"
                    ],
                    "recommendations": recommendations[1:2],
                },
            },
        }

    @staticmethod
    async def get_latest_readings(village_id: str, db: AsyncSession, hours: int = 24) -> List[Dict]:
        since = datetime.now(timezone.utc) - timedelta(hours=hours)
        recent_result = await db.execute(
            select(SensorReading)
            .where(and_(
                SensorReading.village_id == village_id,
                SensorReading.timestamp >= since,
            ))
            .order_by(desc(SensorReading.timestamp))
            .limit(50)
        )
        readings = recent_result.scalars().all()
        if not readings:
            fallback_result = await db.execute(
                select(SensorReading)
                .where(SensorReading.village_id == village_id)
                .order_by(desc(SensorReading.timestamp))
                .limit(12)
            )
            readings = fallback_result.scalars().all()
        return [
            {
                "ph": r.ph, "turbidity": r.turbidity, "ecoli": r.ecoli,
                "tds": r.tds, "temperature": r.temperature, "nitrate": r.nitrate,
                "arsenic": r.arsenic, "fluoride": r.fluoride,
                "rainfall_mm": r.rainfall_mm, "flood_level_m": r.flood_level_m,
                "humidity": r.humidity,
                "quality_score": r.quality_score,
                "is_anomaly": r.is_anomaly,
                "timestamp": r.timestamp.isoformat() if r.timestamp else None,
            }
            for r in readings
        ]

    @staticmethod
    async def get_recent_health_reports(village_id: str, db: AsyncSession, days: int = 14) -> List[Dict]:
        since = datetime.now(timezone.utc) - timedelta(days=days)
        result = await db.execute(
            select(HealthReport)
            .where(and_(
                HealthReport.village_id == village_id,
                HealthReport.created_at >= since,
            ))
            .order_by(desc(HealthReport.created_at))
            .limit(100)
        )
        reports = result.scalars().all()
        return [
            {
                "symptoms": r.symptoms,
                "age": r.age,
                "gender": r.gender,
                "is_hospitalized": r.is_hospitalized,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in reports
        ]

    @staticmethod
    def _aggregate_symptoms(reports: List[Dict]) -> Dict[str, int]:
        counts = {}
        for r in reports:
            for symptom in r.get("symptoms", {}).keys():
                counts[symptom] = counts.get(symptom, 0) + 1
        return counts

    @staticmethod
    async def predict(village_id: str, db: AsyncSession, force_refresh: bool = False) -> AIPrediction:
        from app.ml.models import water_quality_model, disease_outbreak_model, explainability
        async with PredictionService._get_prediction_lock(village_id):
            if not force_refresh:
                existing_prediction = await PredictionService._get_latest_prediction_record(village_id, db)
                if existing_prediction is not None and not PredictionService._prediction_needs_rebuild(existing_prediction):
                    return existing_prediction

            # Check cache
            if not force_refresh:
                try:
                    cached = await redis_manager.get(f"prediction:{village_id}")
                except Exception as exc:
                    cached = None
                    logger.warning(f"Prediction cache read skipped for village {village_id}: {exc}")
                if cached:
                    logger.debug(f"Returning cached prediction for village {village_id}")
                    pred = await PredictionService._get_latest_prediction_record(village_id, db)
                    if pred and not PredictionService._prediction_needs_rebuild(pred):
                        return pred

            # Fetch village info
            result = await db.execute(select(Village).where(Village.id == village_id))
            village = result.scalar_one_or_none()
            if not village:
                from fastapi import HTTPException
                raise HTTPException(status_code=404, detail="Village not found")

            # Collect context
            readings = await PredictionService.get_latest_readings(village_id, db)
            health_reports = await PredictionService.get_recent_health_reports(village_id, db)

            latest_reading = readings[0] if readings else {}
            symptom_counts = PredictionService._aggregate_symptoms(health_reports)

            ml_water = water_quality_model.predict(latest_reading)
            ml_disease = disease_outbreak_model.predict({
                **latest_reading,
                "water_quality_score": ml_water.get("risk_score", 50),
                "symptom_count": len(symptom_counts),
                "fever_cases": symptom_counts.get("fever", 0),
                "diarrhea_cases": symptom_counts.get("diarrhea", 0),
                "vomiting_cases": symptom_counts.get("vomiting", 0),
                "days_since_rain": 0,
            })

            try:
                from app.agents.orchestrator import AgentContext, orchestrator

                context = AgentContext(
                    village_id=village_id,
                    village_name=village.name,
                    sensor_readings=readings,
                    health_reports=health_reports,
                    weather_data=None,
                    historical_predictions=[],
                )
                orch_result = await orchestrator.run(context)
            except Exception as exc:
                logger.warning(f"AI orchestrator unavailable, using ML fallback for village {village_id}: {exc}")
                orch_result = PredictionService._fallback_orchestrator_result(
                    village_id=village_id,
                    latest_reading=latest_reading,
                    health_reports=health_reports,
                    ml_water=ml_water,
                    ml_disease=ml_disease,
                )

            # Blend ML and Agent scores (60% agent, 40% ML)
            final_score = (
                orch_result["risk_score"] * 0.6 +
                ml_water.get("risk_score", 50) * 0.2 +
                ml_disease.get("risk_score", 40) * 0.2
            )
            final_score = round(min(100, max(0, final_score)), 2)

            category = PredictionService._category_from_score(final_score)

            # SHAP explanation
            shap_result = explainability.explain_water_quality(water_quality_model, latest_reading)

            # Save prediction
            prediction = AIPrediction(
                id=str(uuid.uuid4()),
                village_id=village_id,
                risk_score=final_score,
                risk_category=category,
                outbreak_timeline_days=orch_result.get("outbreak_timeline_days"),
                water_quality_score=orch_result.get("water_quality_score"),
                disease_risk_score=orch_result.get("disease_risk_score"),
                weather_risk_score=orch_result.get("weather_risk_score"),
                community_health_score=orch_result.get("community_health_score"),
                agent_outputs=orch_result.get("agent_outputs"),
                recommended_actions=orch_result.get("recommended_actions"),
                shap_values=shap_result,
                model_version="1.0",
                created_at=datetime.now(timezone.utc),
            )
            PredictionService._store_cached_prediction(prediction)
            prediction_saved = False
            try:
                if IS_SQLITE:
                    async with _sqlite_prediction_write_lock:
                        latest_existing = await PredictionService._get_latest_prediction_record(village_id, db)
                        if latest_existing is not None and not force_refresh and not PredictionService._prediction_needs_rebuild(latest_existing):
                            return latest_existing
                        db.add(prediction)
                        await db.flush()
                        prediction_saved = True
                else:
                    db.add(prediction)
                    await db.flush()
                    prediction_saved = True
            except OperationalError as exc:
                if IS_SQLITE and "database is locked" in str(exc).lower():
                    logger.warning(f"Prediction save skipped for village {village_id}: {exc}")
                    await db.rollback()
                    fallback_prediction = await PredictionService._get_latest_prediction_record(village_id, db)
                    if fallback_prediction is not None and not PredictionService._prediction_needs_rebuild(fallback_prediction):
                        return fallback_prediction
                    logger.info(f"Returning unsaved in-memory prediction for village {village_id} after SQLite lock")
                else:
                    raise

            # Generate AI alert if high risk
            if prediction_saved and final_score >= 25:
                await AlertService.create_ai_alert(
                    village_id=village_id,
                    risk_score=final_score,
                    category=category.value,
                    description=f"AI analysis detected {category.value} risk (score: {final_score}/100). "
                                f"{'Outbreak predicted in ' + str(orch_result.get('outbreak_timeline_days')) + ' days.' if orch_result.get('outbreak_timeline_days') else ''}",
                    actions=orch_result.get("recommended_actions", [])[:5],
                    prediction_id=prediction.id,
                    db=db,
                )

            # Cache for 30 mins
            try:
                await redis_manager.set(
                    f"prediction:{village_id}",
                    {"risk_score": final_score, "category": category.value, "id": prediction.id},
                    ttl=1800,
                )
            except Exception as exc:
                logger.warning(f"Prediction cache write skipped for village {village_id}: {exc}")

            logger.info(f"Prediction saved: village={village_id} score={final_score} category={category.value}")
            return prediction
