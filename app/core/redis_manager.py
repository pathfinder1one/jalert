"""
JALERT - Redis Cache & Pub/Sub Manager
"""
import json
import redis.asyncio as redis_async
from typing import Any, Optional
from app.core.config import settings
from loguru import logger


class RedisManager:
    def __init__(self):
        self._pool: Optional[redis_async.Redis] = None

    async def connect(self):
        self._pool = redis_async.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
            max_connections=50,
        )
        logger.info("Redis connected")

    async def disconnect(self):
        if self._pool:
            await self._pool.aclose()
            logger.info("Redis disconnected")

    @property
    def client(self) -> redis_async.Redis:
        if not self._pool:
            raise RuntimeError("Redis not connected. Call connect() first.")
        return self._pool

    # ── Cache helpers ─────────────────────────────────────────────────────────

    async def set(self, key: str, value: Any, ttl: int = settings.REDIS_TTL) -> None:
        await self.client.setex(key, ttl, json.dumps(value))

    async def get(self, key: str) -> Optional[Any]:
        data = await self.client.get(key)
        return json.loads(data) if data else None

    async def delete(self, key: str) -> None:
        await self.client.delete(key)

    async def exists(self, key: str) -> bool:
        return await self.client.exists(key) > 0

    async def flush_prefix(self, prefix: str) -> int:
        """Delete all keys matching prefix:*"""
        keys = await self.client.keys(f"{prefix}:*")
        if keys:
            return await self.client.delete(*keys)
        return 0

    # ── Rate limiting ─────────────────────────────────────────────────────────

    async def check_rate_limit(self, identifier: str, limit: int, window: int) -> bool:
        """Returns True if request is allowed, False if rate limited"""
        key = f"rate:{identifier}"
        pipe = self.client.pipeline()
        pipe.incr(key)
        pipe.expire(key, window)
        results = await pipe.execute()
        return results[0] <= limit

    # ── Pub/Sub ───────────────────────────────────────────────────────────────

    async def publish(self, channel: str, message: Any) -> None:
        if not self._pool:
            logger.warning(f"Redis publish skipped for {channel}: client not connected")
            return
        try:
            await self.client.publish(channel, json.dumps(message))
        except Exception as exc:
            logger.warning(f"Redis publish skipped for {channel}: {exc}")

    async def subscribe(self, channel: str):
        pubsub = self.client.pubsub()
        await pubsub.subscribe(channel)
        return pubsub

    # ── Sensor data buffer ────────────────────────────────────────────────────

    async def push_sensor_reading(self, village_id: str, reading: dict) -> None:
        key = f"sensor:buffer:{village_id}"
        await self.client.lpush(key, json.dumps(reading))
        await self.client.ltrim(key, 0, 999)  # Keep last 1000 readings
        await self.client.expire(key, 86400)

    async def get_sensor_buffer(self, village_id: str, count: int = 100) -> list:
        key = f"sensor:buffer:{village_id}"
        raw = await self.client.lrange(key, 0, count - 1)
        return [json.loads(r) for r in raw]

    # ── Alert cache ───────────────────────────────────────────────────────────

    async def cache_active_alerts(self, village_id: str, alerts: list) -> None:
        await self.set(f"alerts:active:{village_id}", alerts, ttl=300)

    async def get_cached_alerts(self, village_id: str) -> Optional[list]:
        return await self.get(f"alerts:active:{village_id}")


# Singleton
redis_manager = RedisManager()


async def get_redis() -> RedisManager:
    return redis_manager
