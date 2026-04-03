"""
JALERT - WebSocket Manager
Real-time: sensor updates, alerts, dashboard streaming
"""
import json
import asyncio
from typing import Dict, Set, Optional
from fastapi import WebSocket, WebSocketDisconnect
from loguru import logger


class ConnectionManager:
    """Manages WebSocket connections grouped by village/channel"""

    def __init__(self):
        # village_id -> set of WebSocket connections
        self._connections: Dict[str, Set[WebSocket]] = {}
        # Global admin connections
        self._admin_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket, channel: str) -> None:
        await websocket.accept()
        if channel not in self._connections:
            self._connections[channel] = set()
        self._connections[channel].add(websocket)
        logger.info(f"WS connected: channel={channel} total={len(self._connections[channel])}")

    async def connect_admin(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._admin_connections.add(websocket)
        logger.info(f"Admin WS connected: total={len(self._admin_connections)}")

    def disconnect(self, websocket: WebSocket, channel: str) -> None:
        if channel in self._connections:
            self._connections[channel].discard(websocket)
            if not self._connections[channel]:
                del self._connections[channel]
        logger.info(f"WS disconnected: channel={channel}")

    def disconnect_admin(self, websocket: WebSocket) -> None:
        self._admin_connections.discard(websocket)

    async def send_to_channel(self, channel: str, data: dict) -> None:
        """Broadcast to all connections in a channel (village)"""
        if channel not in self._connections:
            return
        message = json.dumps(data)
        dead = set()
        for ws in self._connections[channel]:
            try:
                await ws.send_text(message)
            except Exception:
                dead.add(ws)
        for ws in dead:
            self._connections[channel].discard(ws)

    async def broadcast_admin(self, data: dict) -> None:
        """Broadcast to all admin connections"""
        message = json.dumps(data)
        dead = set()
        for ws in self._admin_connections:
            try:
                await ws.send_text(message)
            except Exception:
                dead.add(ws)
        for ws in dead:
            self._admin_connections.discard(ws)

    def total_connections(self) -> int:
        return sum(len(v) for v in self._connections.values()) + len(self._admin_connections)


ws_manager = ConnectionManager()


class RedisSubscriber:
    """Bridges Redis pub/sub to WebSocket connections"""

    def __init__(self):
        self._tasks: Dict[str, asyncio.Task] = {}

    async def subscribe_village(self, village_id: str) -> None:
        """Subscribe to Redis channels for a village and forward to WS"""
        if village_id in self._tasks:
            return  # Already subscribed

        async def _listen():
            from app.core.redis_manager import redis_manager
            try:
                sensor_pubsub = await redis_manager.subscribe(f"sensor:{village_id}")
                alert_pubsub = await redis_manager.subscribe(f"alerts:{village_id}")

                while True:
                    for pubsub in [sensor_pubsub, alert_pubsub]:
                        message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=0.1)
                        if message and message["type"] == "message":
                            data = json.loads(message["data"])
                            await ws_manager.send_to_channel(village_id, data)
                    await asyncio.sleep(0.05)
            except asyncio.CancelledError:
                pass
            except Exception as e:
                logger.error(f"Redis subscriber error for village {village_id}: {e}")

        task = asyncio.create_task(_listen())
        self._tasks[village_id] = task
        logger.info(f"Redis subscriber started for village {village_id}")

    async def stop_all(self) -> None:
        for task in self._tasks.values():
            task.cancel()
        self._tasks.clear()


redis_subscriber = RedisSubscriber()
