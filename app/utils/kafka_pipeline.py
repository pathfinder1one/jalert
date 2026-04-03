"""
JALERT - Kafka Data Pipeline
Producer: IoT sensor events
Consumer: Processes and stores readings, triggers alerts
"""
import json
import asyncio
from datetime import datetime, timezone
from typing import Optional, Callable
from kafka import KafkaProducer, KafkaConsumer
from kafka.errors import KafkaError
from loguru import logger

from app.core.config import settings


# ── Producer ──────────────────────────────────────────────────────────────────

class SensorEventProducer:
    """Publishes sensor readings to Kafka topic"""

    def __init__(self):
        self._producer: Optional[KafkaProducer] = None

    def connect(self):
        try:
            self._producer = KafkaProducer(
                bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS.split(","),
                value_serializer=lambda v: json.dumps(v).encode("utf-8"),
                key_serializer=lambda k: k.encode("utf-8") if k else None,
                retries=3,
                acks="all",
                compression_type="gzip",
                request_timeout_ms=2000,
                api_version_auto_timeout_ms=2000,
                max_block_ms=2000,
            )
            logger.info("Kafka producer connected")
        except Exception as e:
            logger.warning(f"Kafka producer connection failed (non-critical): {e}")

    def publish_sensor_reading(self, sensor_code: str, reading: dict) -> None:
        if not self._producer:
            return
        try:
            self._producer.send(
                topic=settings.KAFKA_TOPIC_SENSOR,
                key=sensor_code,
                value={**reading, "ingested_at": datetime.now(timezone.utc).isoformat()},
            )
        except KafkaError as e:
            logger.error(f"Kafka publish failed: {e}")

    def publish_alert(self, alert: dict) -> None:
        if not self._producer:
            return
        try:
            self._producer.send(
                topic=settings.KAFKA_TOPIC_ALERTS,
                key=alert.get("village_id", ""),
                value=alert,
            )
        except KafkaError as e:
            logger.error(f"Kafka alert publish failed: {e}")

    def close(self):
        if self._producer:
            self._producer.flush()
            self._producer.close()


# ── Consumer ──────────────────────────────────────────────────────────────────

class SensorEventConsumer:
    """
    Consumes Kafka sensor topic, processes events asynchronously.
    Run as a separate process/worker.
    """

    def __init__(self, group_id: str = "jalert-processor"):
        self._consumer: Optional[KafkaConsumer] = None
        self.group_id = group_id
        self._running = False

    def connect(self):
        try:
            self._consumer = KafkaConsumer(
                settings.KAFKA_TOPIC_SENSOR,
                bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS.split(","),
                group_id=self.group_id,
                value_deserializer=lambda v: json.loads(v.decode("utf-8")),
                key_deserializer=lambda k: k.decode("utf-8") if k else None,
                auto_offset_reset="latest",
                enable_auto_commit=True,
                max_poll_records=50,
            )
            logger.info(f"Kafka consumer connected (group={self.group_id})")
        except Exception as e:
            logger.error(f"Kafka consumer connection failed: {e}")

    async def start(self, process_fn: Callable):
        """Start consuming messages, call process_fn for each"""
        if not self._consumer:
            logger.warning("Kafka consumer not connected, skipping")
            return

        self._running = True
        logger.info("Kafka consumer started")

        while self._running:
            try:
                messages = self._consumer.poll(timeout_ms=1000)
                for _, records in messages.items():
                    for record in records:
                        try:
                            await process_fn(record.key, record.value)
                        except Exception as e:
                            logger.error(f"Error processing Kafka message: {e}")
                await asyncio.sleep(0.1)
            except Exception as e:
                logger.error(f"Kafka poll error: {e}")
                await asyncio.sleep(5)

    def stop(self):
        self._running = False
        if self._consumer:
            self._consumer.close()
        logger.info("Kafka consumer stopped")


# ── IoT Simulator ─────────────────────────────────────────────────────────────

class IoTSimulator:
    """
    Simulates IoT sensor data for development/testing.
    Generates realistic water quality readings with occasional anomalies.
    """

    def __init__(self, sensor_codes: list, interval_seconds: float = 5.0):
        self.sensor_codes = sensor_codes
        self.interval = interval_seconds
        self._running = False

    @staticmethod
    def _generate_reading(sensor_code: str, inject_anomaly: bool = False) -> dict:
        import random
        base = {
            "sensor_code": sensor_code,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "ph": round(random.gauss(7.2, 0.3), 2),
            "turbidity": round(abs(random.gauss(2.0, 1.5)), 2),
            "ecoli": 0.0,
            "tds": round(abs(random.gauss(250, 80)), 1),
            "temperature": round(random.gauss(24, 3), 1),
            "dissolved_oxygen": round(random.gauss(7.5, 1.0), 2),
            "nitrate": round(abs(random.gauss(15, 8)), 1),
            "arsenic": round(abs(random.gauss(0.003, 0.002)), 4),
            "fluoride": round(abs(random.gauss(0.8, 0.3)), 2),
            "rainfall_mm": round(abs(random.gauss(5, 8)), 1),
            "humidity": round(random.uniform(50, 85), 1),
            "air_temp": round(random.gauss(30, 4), 1),
        }
        if inject_anomaly:
            anomaly_type = random.choice(["ecoli", "ph_low", "ph_high", "turbidity", "flood"])
            if anomaly_type == "ecoli":
                base["ecoli"] = round(random.uniform(1, 15), 2)
            elif anomaly_type == "ph_low":
                base["ph"] = round(random.uniform(4.0, 6.0), 2)
            elif anomaly_type == "ph_high":
                base["ph"] = round(random.uniform(9.0, 10.5), 2)
            elif anomaly_type == "turbidity":
                base["turbidity"] = round(random.uniform(8, 25), 2)
            elif anomaly_type == "flood":
                base["rainfall_mm"] = round(random.uniform(150, 300), 1)
                base["flood_level_m"] = round(random.uniform(0.5, 3.0), 2)
        return base

    async def run(self, on_reading: Callable):
        """Continuously generate and emit simulated readings"""
        import random
        self._running = True
        logger.info(f"IoT simulator started for {len(self.sensor_codes)} sensors")

        while self._running:
            for sensor_code in self.sensor_codes:
                inject = random.random() < 0.05  # 5% anomaly rate
                reading = self._generate_reading(sensor_code, inject_anomaly=inject)
                await on_reading(reading)
            await asyncio.sleep(self.interval)

    def stop(self):
        self._running = False


# Singletons
kafka_producer = SensorEventProducer()
