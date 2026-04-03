"""
JALERT - Sensor Service
IoT data ingestion, processing, anomaly detection
"""
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, and_, func
from fastapi import HTTPException
import csv

from app.models.user import Sensor, SensorReading, SensorStatus, Village
from app.schemas.schemas import SensorReadingIngest, SensorCreate
from app.core.config import settings
from app.core.redis_manager import redis_manager
from app.services.alert_service import AlertService
from loguru import logger


class DataCleaner:
    """Cleans and validates incoming sensor readings"""

    @staticmethod
    def normalize(reading: SensorReadingIngest) -> Dict[str, Any]:
        cleaned = reading.model_dump()
        # Replace obvious out-of-range values with None
        if cleaned.get("ph") and not (0 <= cleaned["ph"] <= 14):
            cleaned["ph"] = None
        if cleaned.get("turbidity") and cleaned["turbidity"] < 0:
            cleaned["turbidity"] = None
        if cleaned.get("ecoli") and cleaned["ecoli"] < 0:
            cleaned["ecoli"] = None
        if cleaned.get("humidity") and not (0 <= cleaned.get("humidity", 50) <= 100):
            cleaned["humidity"] = None
        return cleaned

    @staticmethod
    def compute_quality_score(data: Dict[str, Any]) -> float:
        """
        Water quality score 0–100 (higher = safer)
        Based on WHO/BIS standards
        """
        score = 100.0
        deductions = 0.0

        ph = data.get("ph")
        if ph is not None:
            if ph < settings.PH_MIN or ph > settings.PH_MAX:
                dev = max(abs(ph - settings.PH_MIN), abs(ph - settings.PH_MAX))
                deductions += min(30, dev * 10)

        turbidity = data.get("turbidity")
        if turbidity is not None and turbidity > settings.TURBIDITY_MAX:
            deductions += min(25, (turbidity / settings.TURBIDITY_MAX) * 10)

        ecoli = data.get("ecoli")
        if ecoli is not None and ecoli > 0:
            deductions += min(40, ecoli * 5)

        tds = data.get("tds")
        if tds is not None and tds > settings.TDS_MAX:
            deductions += min(15, (tds / settings.TDS_MAX) * 5)

        nitrate = data.get("nitrate")
        if nitrate is not None and nitrate > settings.NITRATE_MAX:
            deductions += min(15, (nitrate / settings.NITRATE_MAX) * 10)

        return max(0.0, score - deductions)

    @staticmethod
    def is_anomaly(data: Dict[str, Any]) -> bool:
        """Rule-based anomaly detection"""
        ph = data.get("ph")
        if ph and (ph < 4.0 or ph > 10.0):
            return True
        if data.get("ecoli", 0) and data["ecoli"] > 10:
            return True
        if data.get("turbidity", 0) and data["turbidity"] > 20:
            return True
        if data.get("rainfall_mm", 0) and data["rainfall_mm"] > settings.RAINFALL_CRITICAL_MM:
            return True
        return False


class SensorService:

    @staticmethod
    async def create_sensor(data: SensorCreate, db: AsyncSession) -> Sensor:
        sensor = Sensor(**data.model_dump())
        db.add(sensor)
        await db.flush()
        return sensor

    @staticmethod
    async def ingest_reading(data: SensorReadingIngest, db: AsyncSession) -> SensorReading:
        # Lookup sensor by code
        result = await db.execute(
            select(Sensor).where(Sensor.sensor_code == data.sensor_code)
        )
        sensor: Optional[Sensor] = result.scalar_one_or_none()
        if not sensor:
            raise HTTPException(status_code=404, detail=f"Sensor {data.sensor_code} not found")
        if sensor.status != SensorStatus.ACTIVE:
            raise HTTPException(status_code=400, detail="Sensor is not active")

        # Update last seen
        sensor.last_seen = datetime.now(timezone.utc)

        # Clean data
        cleaned = DataCleaner.normalize(data)
        quality_score = DataCleaner.compute_quality_score(cleaned)
        anomaly = DataCleaner.is_anomaly(cleaned)

        # Store reading
        reading = SensorReading(
            sensor_id=sensor.id,
            village_id=sensor.village_id,
            timestamp=data.timestamp or datetime.now(timezone.utc),
            ph=cleaned.get("ph"),
            turbidity=cleaned.get("turbidity"),
            ecoli=cleaned.get("ecoli"),
            tds=cleaned.get("tds"),
            temperature=cleaned.get("temperature"),
            dissolved_oxygen=cleaned.get("dissolved_oxygen"),
            nitrate=cleaned.get("nitrate"),
            arsenic=cleaned.get("arsenic"),
            fluoride=cleaned.get("fluoride"),
            rainfall_mm=cleaned.get("rainfall_mm"),
            flood_level_m=cleaned.get("flood_level_m"),
            humidity=cleaned.get("humidity"),
            air_temp=cleaned.get("air_temp"),
            is_anomaly=anomaly,
            quality_score=quality_score,
            raw_payload=cleaned.get("raw_payload"),
        )
        db.add(reading)
        await db.flush()

        # Buffer for real-time
        await redis_manager.push_sensor_reading(
            sensor.village_id,
            {
                "id": reading.id,
                "timestamp": reading.timestamp.isoformat(),
                "ph": reading.ph,
                "turbidity": reading.turbidity,
                "ecoli": reading.ecoli,
                "quality_score": quality_score,
                "is_anomaly": anomaly,
            }
        )

        # Pub/Sub broadcast
        await redis_manager.publish(
            f"sensor:{sensor.village_id}",
            {"event": "new_reading", "reading_id": reading.id, "village_id": sensor.village_id}
        )

        # Threshold-based alert check
        await AlertService.check_thresholds(reading, sensor.village_id, db)

        logger.debug(f"Reading ingested: sensor={data.sensor_code} quality={quality_score:.1f} anomaly={anomaly}")
        return reading

    @staticmethod
    async def get_readings_by_village(
        village_id: str,
        db: AsyncSession,
        hours: int = 24,
        limit: int = 100,
    ) -> List[SensorReading]:
        since = datetime.now(timezone.utc) - timedelta(hours=hours)
        result = await db.execute(
            select(SensorReading)
            .where(
                and_(
                    SensorReading.village_id == village_id,
                    SensorReading.timestamp >= since,
                )
            )
            .order_by(desc(SensorReading.timestamp))
            .limit(limit)
        )
        return result.scalars().all()

    @staticmethod
    async def get_sensors_by_village(village_id: str, db: AsyncSession) -> List[Sensor]:
        result = await db.execute(
            select(Sensor).where(Sensor.village_id == village_id)
        )
        return result.scalars().all()

    @staticmethod
    async def batch_ingest(readings: List[SensorReadingIngest], db: AsyncSession) -> Dict:
        success = 0
        errors = []
        for r in readings:
            try:
                await SensorService.ingest_reading(r, db)
                success += 1
            except Exception as e:
                errors.append({"sensor_code": r.sensor_code, "error": str(e)})
        return {"success": success, "errors": errors, "total": len(readings)}

    @staticmethod
    async def get_sensor_inventory(
        db: AsyncSession,
        village_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        sensor_query = (
            select(Sensor, Village)
            .join(Village, Village.id == Sensor.village_id)
            .order_by(Village.state, Village.district, Village.name, Sensor.sensor_code)
        )
        if village_id:
            sensor_query = sensor_query.where(Sensor.village_id == village_id)

        sensor_rows = (await db.execute(sensor_query)).all()
        if not sensor_rows:
            dataset_path = SensorService._write_sensor_inventory_dataset([])
            return {"dataset_path": str(dataset_path), "items": [], "total": 0}

        sensors = [sensor for sensor, _ in sensor_rows]
        sensor_ids = [sensor.id for sensor in sensors]

        latest_readings_query = (
            select(SensorReading)
            .where(SensorReading.sensor_id.in_(sensor_ids))
            .order_by(SensorReading.sensor_id, desc(SensorReading.timestamp))
        )
        reading_rows = (await db.execute(latest_readings_query)).scalars().all()
        latest_by_sensor: Dict[str, SensorReading] = {}
        for reading in reading_rows:
            latest_by_sensor.setdefault(reading.sensor_id, reading)

        count_rows = (
            await db.execute(
                select(SensorReading.sensor_id, func.count(SensorReading.id))
                .where(SensorReading.sensor_id.in_(sensor_ids))
                .group_by(SensorReading.sensor_id)
            )
        ).all()
        counts_by_sensor = {sensor_id: count for sensor_id, count in count_rows}

        items: List[Dict[str, Any]] = []
        for sensor, village in sensor_rows:
            latest = latest_by_sensor.get(sensor.id)
            items.append(
                {
                    "sensor_id": sensor.id,
                    "sensor_code": sensor.sensor_code,
                    "sensor_type": sensor.sensor_type,
                    "status": sensor.status.value if hasattr(sensor.status, "value") else str(sensor.status),
                    "firmware_version": sensor.firmware_version,
                    "location_name": sensor.location_name,
                    "latitude": sensor.latitude,
                    "longitude": sensor.longitude,
                    "last_seen": sensor.last_seen.isoformat() if sensor.last_seen else None,
                    "created_at": sensor.created_at.isoformat() if sensor.created_at else None,
                    "village_id": village.id,
                    "village_name": village.name,
                    "district": village.district,
                    "state": village.state,
                    "population": village.population,
                    "reading_count": counts_by_sensor.get(sensor.id, 0),
                    "latest_reading_at": latest.timestamp.isoformat() if latest and latest.timestamp else None,
                    "latest_quality_score": latest.quality_score if latest else None,
                    "latest_ph": latest.ph if latest else None,
                    "latest_turbidity": latest.turbidity if latest else None,
                    "latest_ecoli": latest.ecoli if latest else None,
                }
            )

        dataset_path = SensorService._write_sensor_inventory_dataset(items)
        return {"dataset_path": str(dataset_path), "items": items, "total": len(items)}

    @staticmethod
    def _write_sensor_inventory_dataset(items: List[Dict[str, Any]]) -> Path:
        output_path = Path(settings.OGD_PROCESSED_DIR) / "available_sensor_inventory.csv"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        fieldnames = [
            "sensor_id",
            "sensor_code",
            "sensor_type",
            "status",
            "firmware_version",
            "location_name",
            "latitude",
            "longitude",
            "last_seen",
            "created_at",
            "village_id",
            "village_name",
            "district",
            "state",
            "population",
            "reading_count",
            "latest_reading_at",
            "latest_quality_score",
            "latest_ph",
            "latest_turbidity",
            "latest_ecoli",
        ]
        with output_path.open("w", newline="", encoding="utf-8") as csv_file:
            writer = csv.DictWriter(csv_file, fieldnames=fieldnames)
            writer.writeheader()
            for item in items:
                writer.writerow(item)
        return output_path
