from datetime import datetime
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Body, Depends, HTTPException
from loguru import logger
from pydantic import BaseModel, Field
from sqlalchemy import and_, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.user import AIPrediction, Alert, AlertStatus, HealthReport, SensorReading, Village

router = APIRouter(prefix="/chat", tags=["AI Chatbot"])


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = Field(default_factory=list)
    village_id: Optional[str] = None


class ChatResponse(BaseModel):
    id: str
    text: str
    mode: str = "llm"
    notice: Optional[str] = None


SYSTEM_PROMPT = """You are the official JALERT AI Assistant, an intelligent system designed to help users understand water safety, health reports, and predictions for rural Indian villages.
You answer questions clearly, calmly, and directly without using overly technical jargon.

If the user asks about an alert, refer to village statistics if provided in context.
If no village context is provided, remind them to select a village or ask general questions.
Keep responses concise, accurate, and action-oriented. Do not invent sensor values or alert counts.
Do not include markdown headers unless strictly necessary.
"""


def _format_number(value: Any, digits: int = 1) -> str:
    if value is None:
        return "not available"
    try:
        return f"{float(value):.{digits}f}"
    except (TypeError, ValueError):
        return str(value)


def _format_timestamp(value: datetime | None) -> str:
    if value is None:
        return "not available"
    return value.strftime("%d %b %Y %I:%M %p")


def _message_mentions(text: str, *keywords: str) -> bool:
    lowered = text.lower()
    return any(keyword in lowered for keyword in keywords)


async def _load_village_snapshot(db: AsyncSession, village_id: str) -> dict[str, Any] | None:
    village = (
        await db.execute(select(Village).where(Village.id == village_id))
    ).scalar_one_or_none()
    if village is None:
        return None

    latest_sensor = (
        await db.execute(
            select(SensorReading)
            .where(SensorReading.village_id == village_id)
            .order_by(desc(SensorReading.timestamp))
            .limit(1)
        )
    ).scalar_one_or_none()

    latest_prediction = (
        await db.execute(
            select(AIPrediction)
            .where(AIPrediction.village_id == village_id)
            .order_by(desc(AIPrediction.created_at))
            .limit(1)
        )
    ).scalar_one_or_none()

    active_alerts = (
        await db.execute(
            select(Alert)
            .where(and_(Alert.village_id == village_id, Alert.status == AlertStatus.ACTIVE))
            .order_by(desc(Alert.created_at))
            .limit(5)
        )
    ).scalars().all()

    recent_health_reports = (
        await db.execute(
            select(HealthReport)
            .where(HealthReport.village_id == village_id)
            .order_by(desc(HealthReport.created_at))
            .limit(5)
        )
    ).scalars().all()

    return {
        "village": village,
        "latest_sensor": latest_sensor,
        "latest_prediction": latest_prediction,
        "active_alerts": active_alerts,
        "recent_health_reports": recent_health_reports,
    }


def _build_village_context(snapshot: dict[str, Any] | None) -> str:
    if not snapshot:
        return "\n[Context] No village is currently selected."

    village: Village = snapshot["village"]
    latest_sensor: SensorReading | None = snapshot["latest_sensor"]
    latest_prediction: AIPrediction | None = snapshot["latest_prediction"]
    active_alerts: list[Alert] = snapshot["active_alerts"]
    recent_health_reports: list[HealthReport] = snapshot["recent_health_reports"]

    alert_lines = [
        f"- {alert.severity.value}: {alert.title} ({_format_timestamp(alert.created_at)})"
        for alert in active_alerts[:3]
    ]

    return (
        "\n[Village Context]\n"
        f"Village: {village.name}, {village.district}, {village.state}\n"
        f"Population: {village.population}\n"
        f"Latest sensor timestamp: {_format_timestamp(latest_sensor.timestamp if latest_sensor else None)}\n"
        f"Latest water quality score: {_format_number(latest_sensor.quality_score if latest_sensor else None)}\n"
        f"Latest pH: {_format_number(latest_sensor.ph if latest_sensor else None)}\n"
        f"Latest turbidity: {_format_number(latest_sensor.turbidity if latest_sensor else None)} NTU\n"
        f"Latest E. coli: {_format_number(latest_sensor.ecoli if latest_sensor else None)} CFU/100ml\n"
        f"Latest risk score: {_format_number(latest_prediction.risk_score if latest_prediction else None)}\n"
        f"Latest risk category: {latest_prediction.risk_category.value if latest_prediction else 'not available'}\n"
        f"Outbreak timeline days: {latest_prediction.outbreak_timeline_days if latest_prediction and latest_prediction.outbreak_timeline_days is not None else 'not available'}\n"
        f"Active alert count: {len(active_alerts)}\n"
        f"Recent health report count: {len(recent_health_reports)}\n"
        + ("Active alerts:\n" + "\n".join(alert_lines) if alert_lines else "Active alerts: none")
    )


def _build_local_fallback_response(
    user_message: str,
    snapshot: dict[str, Any] | None,
    failure_reason: str,
) -> tuple[str, str]:
    intro = "I could not reach the configured local AI model, so I used the latest JALERT data instead."

    if not snapshot:
        text = (
            f"{intro} {failure_reason} "
            "Please select a village if you want village-specific answers. "
            "I can still help with general questions about water quality, alerts, predictions, and reports."
        )
        return text, "Using local JALERT data because the AI model is unavailable."

    village: Village = snapshot["village"]
    latest_sensor: SensorReading | None = snapshot["latest_sensor"]
    latest_prediction: AIPrediction | None = snapshot["latest_prediction"]
    active_alerts: list[Alert] = snapshot["active_alerts"]
    recent_health_reports: list[HealthReport] = snapshot["recent_health_reports"]
    lowered = user_message.lower()

    risk_line = (
        f"Latest risk is {latest_prediction.risk_category.value} at {_format_number(latest_prediction.risk_score)}/100."
        if latest_prediction
        else "A fresh AI risk prediction is not available right now."
    )
    if latest_prediction and latest_prediction.outbreak_timeline_days is not None:
        risk_line += f" Outbreak timeline is estimated at {latest_prediction.outbreak_timeline_days} days."

    water_line = (
        f"Latest water quality score is {_format_number(latest_sensor.quality_score)}/100, "
        f"with pH {_format_number(latest_sensor.ph)} and turbidity {_format_number(latest_sensor.turbidity)} NTU."
        if latest_sensor
        else "No recent water sensor reading is available for this village."
    )
    if latest_sensor and latest_sensor.ecoli is not None:
        water_line += f" E. coli is {_format_number(latest_sensor.ecoli)} CFU/100ml."

    if active_alerts:
        top_alert = active_alerts[0]
        alert_line = (
            f"There are {len(active_alerts)} active alerts. "
            f"The most recent is {top_alert.severity.value} severity: {top_alert.title}."
        )
    else:
        alert_line = "There are no active alerts at the moment."

    health_line = (
        f"There are {len(recent_health_reports)} recent health reports on file."
        if recent_health_reports
        else "No recent health reports are on file."
    )

    follow_up = "You can ask me for alerts, water quality, prediction status, or report guidance."

    if _message_mentions(lowered, "alert", "alerts", "warning", "warnings"):
        text = f"{intro} For {village.name}, {alert_line} {risk_line} {follow_up}"
    elif _message_mentions(lowered, "water", "quality", "ph", "turbidity", "ecoli", "safe", "drink"):
        text = f"{intro} For {village.name}, {water_line} {alert_line} {follow_up}"
    elif _message_mentions(lowered, "risk", "prediction", "outbreak", "disease", "forecast"):
        text = f"{intro} For {village.name}, {risk_line} {water_line} {health_line} {follow_up}"
    elif _message_mentions(lowered, "report", "download", "export", "pdf", "csv"):
        text = (
            f"{intro} For {village.name}, {risk_line} {alert_line} "
            "You can open the Reports page to export the village PDF or recent sensor CSV."
        )
    else:
        text = (
            f"{intro} Here is the latest snapshot for {village.name}, {village.district}: "
            f"{risk_line} {water_line} {alert_line} {health_line} {follow_up}"
        )

    return text, "Using local JALERT data because the AI model is unavailable."


@router.post("", response_model=ChatResponse, include_in_schema=False)
@router.post("/", response_model=ChatResponse)
async def chat_with_assistant(
    request: ChatRequest = Body(...),
    db: AsyncSession = Depends(get_db),
) -> ChatResponse:
    logger.info(
        "Received chat request with model {} for village {}",
        settings.OLLAMA_MODEL,
        request.village_id,
    )

    try:
        snapshot = await _load_village_snapshot(db, request.village_id) if request.village_id else None
    except Exception as exc:
        logger.warning("Unable to load village context for chat: {}", exc)
        snapshot = None

    messages = [{"role": "system", "content": SYSTEM_PROMPT + _build_village_context(snapshot)}]
    for msg in request.history:
        messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": request.message})

    payload = {
        "model": settings.OLLAMA_MODEL,
        "messages": messages,
        "stream": False,
    }

    assistant_text: str
    mode = "llm"
    notice: Optional[str] = None

    try:
        async with httpx.AsyncClient(timeout=settings.OLLAMA_TIMEOUT_SECONDS) as client:
            response = await client.post(settings.OLLAMA_URL, json=payload)
            response.raise_for_status()
            data = response.json()
            assistant_text = data.get("message", {}).get("content", "").strip()
            if not assistant_text:
                raise ValueError("Local AI backend returned an empty response")
    except httpx.ConnectError:
        logger.error("Could not connect to Ollama at {}", settings.OLLAMA_URL)
        assistant_text, notice = _build_local_fallback_response(
            request.message,
            snapshot,
            f"The service at {settings.OLLAMA_URL} is not reachable.",
        )
        mode = "local_fallback"
    except httpx.TimeoutException:
        logger.warning("Ollama request timed out for model {}", settings.OLLAMA_MODEL)
        assistant_text, notice = _build_local_fallback_response(
            request.message,
            snapshot,
            f"The model {settings.OLLAMA_MODEL} did not respond before the timeout.",
        )
        mode = "local_fallback"
    except httpx.HTTPStatusError as exc:
        logger.warning(
            "Ollama returned HTTP {} for model {}",
            exc.response.status_code,
            settings.OLLAMA_MODEL,
        )
        assistant_text, notice = _build_local_fallback_response(
            request.message,
            snapshot,
            f"The model request returned HTTP {exc.response.status_code}.",
        )
        mode = "local_fallback"
    except Exception as exc:
        logger.exception("Chat request failed while contacting the AI backend: {}", exc)
        assistant_text, notice = _build_local_fallback_response(
            request.message,
            snapshot,
            "The local AI backend returned an unexpected error.",
        )
        mode = "local_fallback"

    import uuid

    reply_id = f"reply-{uuid.uuid4().hex[:8]}"
    return ChatResponse(id=reply_id, text=assistant_text, mode=mode, notice=notice)
