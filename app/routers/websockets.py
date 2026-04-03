"""
JALERT - WebSocket Router
Real-time sensor streams, alert feeds, admin dashboard
"""
import json
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from loguru import logger

from app.utils.websocket_manager import ws_manager, redis_subscriber
from app.core.redis_manager import redis_manager

router = APIRouter(prefix="/ws", tags=["WebSockets"])


@router.websocket("/village/{village_id}/sensors")
async def sensor_stream(websocket: WebSocket, village_id: str):
    """
    Real-time sensor data stream for a village.
    Clients receive new readings as they are ingested.

    Protocol:
      - Connect to receive sensor updates
      - Server sends: {"event": "new_reading", "reading_id": "...", ...}
    """
    await ws_manager.connect(websocket, f"sensor:{village_id}")
    await redis_subscriber.subscribe_village(village_id)

    try:
        await websocket.send_json({"event": "connected", "village_id": village_id, "channel": "sensors"})

        # Also send last 5 readings from buffer immediately
        buffer = await redis_manager.get_sensor_buffer(village_id, count=5)
        if buffer:
            await websocket.send_json({"event": "initial_data", "readings": buffer})

        # Keep alive / receive pings
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30)
                if data == "ping":
                    await websocket.send_text("pong")
            except asyncio.TimeoutError:
                await websocket.send_json({"event": "heartbeat"})

    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, f"sensor:{village_id}")
        logger.info(f"Sensor WS disconnected: village={village_id}")
    except Exception as e:
        logger.error(f"Sensor WS error: {e}")
        ws_manager.disconnect(websocket, f"sensor:{village_id}")


@router.websocket("/village/{village_id}/alerts")
async def alert_stream(websocket: WebSocket, village_id: str):
    """
    Real-time alert feed for a village.
    Clients receive alerts immediately when they are generated.

    Protocol:
      - Server sends: {"event": "new_alert", "alert_id": "...", "severity": "...", "title": "..."}
    """
    await ws_manager.connect(websocket, f"alerts:{village_id}")
    await redis_subscriber.subscribe_village(village_id)

    try:
        await websocket.send_json({"event": "connected", "village_id": village_id, "channel": "alerts"})

        # Send cached active alerts
        cached = await redis_manager.get_cached_alerts(village_id)
        if cached:
            await websocket.send_json({"event": "active_alerts", "alerts": cached})

        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30)
                if data == "ping":
                    await websocket.send_text("pong")
            except asyncio.TimeoutError:
                await websocket.send_json({"event": "heartbeat"})

    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, f"alerts:{village_id}")
    except Exception as e:
        logger.error(f"Alert WS error: {e}")
        ws_manager.disconnect(websocket, f"alerts:{village_id}")


@router.websocket("/admin/dashboard")
async def admin_dashboard_stream(websocket: WebSocket):
    """
    Admin global dashboard stream.
    Receives system-wide events: new alerts, high-risk villages, system stats.
    """
    await ws_manager.connect_admin(websocket)

    try:
        await websocket.send_json({
            "event": "connected",
            "channel": "admin_dashboard",
            "total_connections": ws_manager.total_connections(),
        })

        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=60)
                if data == "ping":
                    await websocket.send_text("pong")
                elif data == "stats":
                    await websocket.send_json({
                        "event": "stats",
                        "total_connections": ws_manager.total_connections(),
                    })
            except asyncio.TimeoutError:
                await websocket.send_json({"event": "heartbeat", "connections": ws_manager.total_connections()})

    except WebSocketDisconnect:
        ws_manager.disconnect_admin(websocket)
    except Exception as e:
        logger.error(f"Admin WS error: {e}")
        ws_manager.disconnect_admin(websocket)
