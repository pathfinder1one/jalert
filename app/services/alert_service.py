"""
JALERT - Alert Service
Rule-based threshold alerts + AI-generated alerts
Notification delivery: SMS, Email, Push
"""
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, desc
from sqlalchemy.orm import selectinload
from fastapi import HTTPException
import asyncio

from app.models.user import (
    Alert,
    AlertIncident,
    AlertType,
    AlertSeverity,
    AlertStatus,
    NotificationChannel,
    NotificationDeliveryStatus,
    SensorReading,
    User,
    UserPreference,
    UserRole,
    Village,
)
from app.schemas.schemas import AlertCreate, AlertFilter
from app.core.config import settings
from app.core.redis_manager import redis_manager
from app.services.audit_service import AuditService
from app.services.notification_center_service import NotificationCenterService
from loguru import logger


class ThresholdChecker:
    """Evaluates sensor readings against WHO/BIS thresholds"""

    @staticmethod
    def check(reading: SensorReading) -> List[Dict[str, Any]]:
        violations = []

        def add(param, value, limit, severity, unit=""):
            violations.append({
                "parameter": param,
                "value": value,
                "limit": limit,
                "unit": unit,
                "severity": severity,
            })

        if reading.ph is not None:
            if reading.ph < 4.0 or reading.ph > 10.0:
                add("pH", reading.ph, f"{settings.PH_MIN}–{settings.PH_MAX}", AlertSeverity.CRITICAL)
            elif reading.ph < settings.PH_MIN or reading.ph > settings.PH_MAX:
                add("pH", reading.ph, f"{settings.PH_MIN}–{settings.PH_MAX}", AlertSeverity.HIGH)

        if reading.turbidity is not None and reading.turbidity > settings.TURBIDITY_MAX:
            sev = AlertSeverity.CRITICAL if reading.turbidity > 20 else AlertSeverity.HIGH
            add("Turbidity", reading.turbidity, settings.TURBIDITY_MAX, sev, "NTU")

        if reading.ecoli is not None and reading.ecoli > settings.ECOLI_MAX:
            sev = AlertSeverity.CRITICAL if reading.ecoli > 5 else AlertSeverity.HIGH
            add("E.coli", reading.ecoli, 0, sev, "CFU/100ml")

        if reading.tds is not None and reading.tds > settings.TDS_MAX:
            add("TDS", reading.tds, settings.TDS_MAX, AlertSeverity.MODERATE, "mg/L")

        if reading.nitrate is not None and reading.nitrate > settings.NITRATE_MAX:
            add("Nitrate", reading.nitrate, settings.NITRATE_MAX, AlertSeverity.HIGH, "mg/L")

        if reading.arsenic is not None and reading.arsenic > settings.ARSENIC_MAX:
            add("Arsenic", reading.arsenic, settings.ARSENIC_MAX, AlertSeverity.CRITICAL, "mg/L")

        if reading.fluoride is not None and reading.fluoride > settings.FLUORIDE_MAX:
            add("Fluoride", reading.fluoride, settings.FLUORIDE_MAX, AlertSeverity.HIGH, "mg/L")

        if reading.rainfall_mm is not None:
            if reading.rainfall_mm > settings.RAINFALL_CRITICAL_MM:
                add("Rainfall", reading.rainfall_mm, settings.RAINFALL_CRITICAL_MM, AlertSeverity.CRITICAL, "mm/24hr")
            elif reading.rainfall_mm > settings.RAINFALL_HIGH_MM:
                add("Rainfall", reading.rainfall_mm, settings.RAINFALL_HIGH_MM, AlertSeverity.HIGH, "mm/24hr")

        return violations


class NotificationService:
    """Handles multi-channel alert delivery"""

    @staticmethod
    async def send_sms(phone: str, message: str) -> bool:
        """Send SMS via Twilio"""
        try:
            from twilio.rest import Client
            client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
            client.messages.create(
                body=message,
                from_=settings.TWILIO_PHONE_NUMBER,
                to=phone,
            )
            logger.info(f"SMS sent to {phone}")
            return True
        except Exception as e:
            logger.error(f"SMS failed to {phone}: {e}")
            return False

    @staticmethod
    async def send_voice_alert(phone: str, text: str, language: str = "en") -> bool:
        """Convert text to voice and call via Twilio + Google TTS"""
        try:
            from twilio.rest import Client
            from google.cloud import texttospeech

            # Generate audio via Google TTS
            tts_client = texttospeech.TextToSpeechClient()
            synthesis_input = texttospeech.SynthesisInput(text=text)
            voice = texttospeech.VoiceSelectionParams(
                language_code=language, ssml_gender=texttospeech.SsmlVoiceGender.NEUTRAL
            )
            audio_config = texttospeech.AudioConfig(
                audio_encoding=texttospeech.AudioEncoding.MP3
            )
            response = tts_client.synthesize_speech(
                input=synthesis_input, voice=voice, audio_config=audio_config
            )

            # Upload to S3
            import boto3, uuid
            s3 = boto3.client(
                "s3",
                aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
                aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
                region_name=settings.AWS_REGION,
            )
            key = f"voice-alerts/{uuid.uuid4()}.mp3"
            s3.put_object(Bucket=settings.S3_BUCKET_REPORTS, Key=key, Body=response.audio_content)
            audio_url = f"https://{settings.S3_BUCKET_REPORTS}.s3.amazonaws.com/{key}"

            # Make call via Twilio
            twilio_client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
            twilio_client.calls.create(
                twiml=f"<Response><Play>{audio_url}</Play></Response>",
                from_=settings.TWILIO_PHONE_NUMBER,
                to=phone,
            )
            logger.info(f"Voice alert sent to {phone}")
            return True
        except Exception as e:
            logger.error(f"Voice alert failed: {e}")
            return False

    @staticmethod
    async def broadcast_alert(alert: Alert, db: AsyncSession) -> None:
        """Broadcast alert to all users in the village"""
        result = await db.execute(
            select(User)
            .options(selectinload(User.preferences))
            .where(
                and_(User.village_id == alert.village_id, User.is_active == True)
            )
        )
        users = result.scalars().all()

        msg = f"JALERT [{alert.severity.upper()}]: {alert.title}. {alert.description}"
        for user in users:
            preferences = user.preferences
            await NotificationCenterService.create(
                db,
                user_id=user.id,
                village_id=alert.village_id,
                alert_id=alert.id,
                kind="alert",
                title=alert.title,
                message=msg,
                severity=alert.severity,
                link="/alerts",
                channel=NotificationChannel.IN_APP,
                delivery_status=NotificationDeliveryStatus.SENT,
            )

            if (
                user.phone
                and alert.severity in (AlertSeverity.HIGH, AlertSeverity.CRITICAL)
                and (preferences.sms_notifications if preferences else True)
            ):
                sms_sent = await NotificationService.send_sms(user.phone, msg)
                await NotificationCenterService.create(
                    db,
                    user_id=user.id,
                    village_id=alert.village_id,
                    alert_id=alert.id,
                    kind="alert",
                    title=f"SMS alert: {alert.title}",
                    message=msg,
                    severity=alert.severity,
                    link="/alerts",
                    channel=NotificationChannel.SMS,
                    delivery_status=(
                        NotificationDeliveryStatus.SENT
                        if sms_sent
                        else NotificationDeliveryStatus.FAILED
                    ),
                )

            if (
                user.phone
                and alert.severity == AlertSeverity.CRITICAL
                and preferences
                and preferences.voice_notifications
            ):
                voice_sent = await NotificationService.send_voice_alert(user.phone, msg)
                await NotificationCenterService.create(
                    db,
                    user_id=user.id,
                    village_id=alert.village_id,
                    alert_id=alert.id,
                    kind="alert",
                    title=f"Voice alert: {alert.title}",
                    message=msg,
                    severity=alert.severity,
                    link="/alerts",
                    channel=NotificationChannel.VOICE,
                    delivery_status=(
                        NotificationDeliveryStatus.SENT
                        if voice_sent
                        else NotificationDeliveryStatus.FAILED
                    ),
                )


class AlertService:
    @staticmethod
    def _severity_rank(severity: AlertSeverity) -> int:
        ranks = {
            AlertSeverity.LOW: 1,
            AlertSeverity.MODERATE: 2,
            AlertSeverity.HIGH: 3,
            AlertSeverity.CRITICAL: 4,
        }
        return ranks.get(severity, 1)

    @staticmethod
    def _max_severity(left: AlertSeverity, right: AlertSeverity) -> AlertSeverity:
        return left if AlertService._severity_rank(left) >= AlertService._severity_rank(right) else right

    @staticmethod
    def _reading_alert_severity(reading: SensorReading) -> Optional[AlertSeverity]:
        severity: Optional[AlertSeverity] = None

        if reading.ecoli is not None and reading.ecoli > settings.ECOLI_MAX:
            severity = AlertSeverity.CRITICAL if reading.ecoli >= 3 else AlertSeverity.HIGH

        if reading.turbidity is not None and reading.turbidity > settings.TURBIDITY_MAX:
            turbidity_severity = AlertSeverity.CRITICAL if reading.turbidity >= 12 else AlertSeverity.HIGH
            severity = turbidity_severity if severity is None else AlertService._max_severity(severity, turbidity_severity)

        if reading.arsenic is not None and reading.arsenic > settings.ARSENIC_MAX:
            severity = AlertSeverity.CRITICAL if severity is None else AlertService._max_severity(severity, AlertSeverity.CRITICAL)

        if reading.fluoride is not None and reading.fluoride > settings.FLUORIDE_MAX:
            severity = AlertSeverity.HIGH if severity is None else AlertService._max_severity(severity, AlertSeverity.HIGH)

        if reading.nitrate is not None and reading.nitrate > settings.NITRATE_MAX:
            severity = AlertSeverity.HIGH if severity is None else AlertService._max_severity(severity, AlertSeverity.HIGH)

        return severity

    @staticmethod
    async def _get_alert(alert_id: str, db: AsyncSession) -> Alert:
        result = await db.execute(
            select(Alert)
            .options(
                selectinload(Alert.incident).selectinload(AlertIncident.assigned_to_user),
                selectinload(Alert.incident).selectinload(AlertIncident.acknowledged_by_user),
            )
            .where(Alert.id == alert_id)
        )
        alert = result.scalar_one_or_none()
        if alert is None:
            raise HTTPException(status_code=404, detail="Alert not found")
        return alert

    @staticmethod
    async def _ensure_incident(alert: Alert, db: AsyncSession) -> AlertIncident:
        if alert.incident is not None:
            return alert.incident

        incident = AlertIncident(alert_id=alert.id)
        db.add(incident)
        await db.flush()
        alert.incident = incident
        return incident

    @staticmethod
    async def _publish_workflow_event(alert: Alert, event: str) -> None:
        await redis_manager.publish(
            f"alerts:{alert.village_id}",
            {
                "event": event,
                "alert_id": alert.id,
                "status": alert.status,
                "severity": alert.severity,
                "title": alert.title,
                "village_id": alert.village_id,
            },
        )

    @staticmethod
    async def ensure_alert_feed(village_id: str, db: AsyncSession) -> None:
        active_result = await db.execute(
            select(Alert)
            .where(
                and_(
                    Alert.village_id == village_id,
                    Alert.status == AlertStatus.ACTIVE,
                )
            )
            .order_by(desc(Alert.created_at))
        )
        active_alerts = active_result.scalars().all()
        active_types = {alert.alert_type for alert in active_alerts}

        village_result = await db.execute(select(Village).where(Village.id == village_id))
        village = village_result.scalar_one_or_none()
        if village is None:
            return

        from app.models.user import AIPrediction

        prediction_result = await db.execute(
            select(AIPrediction)
            .where(AIPrediction.village_id == village_id)
            .order_by(desc(AIPrediction.created_at))
            .limit(1)
        )
        latest_prediction = prediction_result.scalar_one_or_none()

        reading_result = await db.execute(
            select(SensorReading)
            .where(SensorReading.village_id == village_id)
            .order_by(desc(SensorReading.timestamp))
            .limit(1)
        )
        latest_reading = reading_result.scalar_one_or_none()

        if (
            latest_prediction is not None
            and latest_prediction.risk_score >= 25
            and AlertType.AI_PREDICTED not in active_types
        ):
            description = (
                f"{village.name}, {village.district} is in {latest_prediction.risk_category.value} risk "
                f"with a current assessment score of {round(float(latest_prediction.risk_score), 1)}/100."
            )
            if latest_prediction.water_quality_score is not None:
                description += (
                    f" Latest water quality score is {round(float(latest_prediction.water_quality_score), 1)}, "
                    "so families should avoid unsafe sources until field teams confirm conditions."
                )

            await AlertService.create_ai_alert(
                village_id=village_id,
                risk_score=float(latest_prediction.risk_score),
                category=latest_prediction.risk_category.value,
                description=description,
                actions=(latest_prediction.recommended_actions or [])[:5],
                prediction_id=latest_prediction.id,
                db=db,
            )
            active_types.add(AlertType.AI_PREDICTED)
        elif (
            latest_prediction is None
            and latest_reading is not None
            and latest_reading.quality_score is not None
            and latest_reading.quality_score < 72
            and AlertType.AI_PREDICTED not in active_types
        ):
            derived_risk = max(25.0, min(82.0, 100.0 - float(latest_reading.quality_score)))
            derived_category = "high" if derived_risk >= 50 else "moderate"
            actions = [
                "Use treated or boiled drinking water until the next field verification is completed.",
                "Ask the village team to inspect the source and collect a follow-up sample today.",
                "Avoid unsafe handpump or storage points for children, elderly people, and sick family members.",
            ]
            await AlertService.create_ai_alert(
                village_id=village_id,
                risk_score=derived_risk,
                category=derived_category,
                description=(
                    f"{village.name}, {village.district} shows elevated community water risk based on the latest "
                    f"quality score of {round(float(latest_reading.quality_score), 1)}/100 and recent sensor conditions."
                ),
                actions=actions,
                prediction_id=None,
                db=db,
            )
            active_types.add(AlertType.AI_PREDICTED)

        reading_severity = (
            AlertService._reading_alert_severity(latest_reading)
            if latest_reading is not None
            else None
        )

        if latest_reading is not None and reading_severity and AlertType.WATER_QUALITY not in active_types:
            flags: List[str] = []
            if latest_reading.ecoli is not None and latest_reading.ecoli > settings.ECOLI_MAX:
                flags.append(f"E. coli {latest_reading.ecoli}")
            if latest_reading.turbidity is not None and latest_reading.turbidity > settings.TURBIDITY_MAX:
                flags.append(f"turbidity {latest_reading.turbidity} NTU")
            if latest_reading.arsenic is not None and latest_reading.arsenic > settings.ARSENIC_MAX:
                flags.append(f"arsenic {latest_reading.arsenic} mg/L")
            if latest_reading.fluoride is not None and latest_reading.fluoride > settings.FLUORIDE_MAX:
                flags.append(f"fluoride {latest_reading.fluoride} mg/L")
            if latest_reading.nitrate is not None and latest_reading.nitrate > settings.NITRATE_MAX:
                flags.append(f"nitrate {latest_reading.nitrate} mg/L")

            alert = Alert(
                village_id=village_id,
                alert_type=AlertType.WATER_QUALITY,
                severity=reading_severity,
                title=f"Water quality warning for {village.name}",
                description=(
                    "The latest monitored sample shows unsafe conditions: "
                    + ", ".join(flags[:4])
                    + ". Please switch to treated or alternate drinking water while the source is checked."
                ),
                recommended_actions=[
                    "Boil or chlorinate drinking water before use.",
                    "Use an alternate safe source for children, elderly people, and sick family members.",
                    "Ask the field worker to collect a confirmatory sample today.",
                ],
                affected_population=village.population or None,
                triggered_by="alert_feed_autofill",
                sensor_reading_id=latest_reading.id,
            )
            db.add(alert)
            await db.flush()
            await redis_manager.publish(
                f"alerts:{village_id}",
                {
                    "event": "new_alert",
                    "alert_id": alert.id,
                    "severity": alert.severity,
                    "title": alert.title,
                    "village_id": village_id,
                },
            )
            active_types.add(AlertType.WATER_QUALITY)

        if (
            latest_reading is not None
            and latest_reading.rainfall_mm is not None
            and latest_reading.rainfall_mm > settings.RAINFALL_HIGH_MM
            and AlertType.FLOOD_RISK not in active_types
        ):
            flood_severity = (
                AlertSeverity.CRITICAL
                if latest_reading.rainfall_mm >= settings.RAINFALL_CRITICAL_MM
                else AlertSeverity.HIGH
            )
            flood_alert = Alert(
                village_id=village_id,
                alert_type=AlertType.FLOOD_RISK,
                severity=flood_severity,
                title=f"Heavy rainfall watch for {village.name}",
                description=(
                    f"Recent rainfall near {village.name} reached {round(float(latest_reading.rainfall_mm), 1)} mm. "
                    "Low-lying water points and nearby drains may contaminate the drinking-water source."
                ),
                recommended_actions=[
                    "Inspect storage tanks, handpumps, and drains near homes.",
                    "Keep children away from pooled runoff water.",
                    "Use a higher-ground or treated source until the site is checked.",
                ],
                affected_population=village.population or None,
                triggered_by="alert_feed_autofill",
                sensor_reading_id=latest_reading.id,
            )
            db.add(flood_alert)
            await db.flush()
            await redis_manager.publish(
                f"alerts:{village_id}",
                {
                    "event": "new_alert",
                    "alert_id": flood_alert.id,
                    "severity": flood_alert.severity,
                    "title": flood_alert.title,
                    "village_id": village_id,
                },
            )

    @staticmethod
    async def check_thresholds(
        reading: SensorReading, village_id: str, db: AsyncSession
    ) -> List[Alert]:
        violations = ThresholdChecker.check(reading)
        created_alerts = []

        for v in violations:
            title = f"{v['parameter']} threshold exceeded"
            desc = (
                f"Measured: {v['value']} {v['unit']} | "
                f"Limit: {v['limit']} {v['unit']}. "
                f"Immediate action required."
            )
            alert = Alert(
                village_id=village_id,
                alert_type=AlertType.WATER_QUALITY,
                severity=v["severity"],
                title=title,
                description=desc,
                recommended_actions=["Stop drinking water from this source",
                                     "Notify local health authorities",
                                     "Distribute safe water supplies"],
                triggered_by="threshold_engine",
                sensor_reading_id=reading.id,
            )
            db.add(alert)
            await db.flush()
            created_alerts.append(alert)

            # Publish to Redis for WebSocket push
            await redis_manager.publish(
                f"alerts:{village_id}",
                {
                    "event": "new_alert",
                    "alert_id": alert.id,
                    "severity": alert.severity,
                    "title": alert.title,
                    "village_id": village_id,
                }
            )

        if created_alerts:
            logger.warning(f"{len(created_alerts)} threshold alerts generated for village {village_id}")
        return created_alerts

    @staticmethod
    async def create_manual_alert(data: AlertCreate, user_id: str, db: AsyncSession) -> Alert:
        alert = Alert(
            **data.model_dump(exclude={"recommended_actions", "alert_type"}),
            recommended_actions=data.recommended_actions,
            triggered_by=f"manual:{user_id}",
            alert_type=AlertType.MANUAL,
        )
        db.add(alert)
        await db.flush()
        await NotificationService.broadcast_alert(alert, db)
        await AuditService.log(
            db,
            action="alert.manual.create",
            resource_type="alert",
            resource_id=alert.id,
            user_id=user_id,
            detail={"village_id": data.village_id, "severity": data.severity.value},
        )

        await redis_manager.publish(f"alerts:{data.village_id}", {
            "event": "manual_alert", "alert_id": alert.id, "severity": data.severity
        })
        return alert

    @staticmethod
    async def get_alerts(filters: AlertFilter, db: AsyncSession) -> List[Alert]:
        if filters.village_id and filters.status in (None, AlertStatus.ACTIVE):
            try:
                await AlertService.ensure_alert_feed(filters.village_id, db)
            except Exception as exc:
                logger.warning(f"Alert feed autofill skipped for village {filters.village_id}: {exc}")

        conditions = []
        if filters.village_id:
            conditions.append(Alert.village_id == filters.village_id)
        if filters.severity:
            conditions.append(Alert.severity == filters.severity)
        if filters.alert_type:
            conditions.append(Alert.alert_type == filters.alert_type)
        if filters.status:
            conditions.append(Alert.status == filters.status)

        query = select(Alert)
        if conditions:
            query = query.where(and_(*conditions))
        query = (
            query.options(
                selectinload(Alert.incident).selectinload(AlertIncident.assigned_to_user),
                selectinload(Alert.incident).selectinload(AlertIncident.acknowledged_by_user),
            )
            .order_by(desc(Alert.created_at))
            .offset(filters.offset)
            .limit(filters.limit)
        )

        result = await db.execute(query)
        return result.scalars().all()

    @staticmethod
    async def acknowledge_alert(
        alert_id: str,
        user_id: str,
        note: Optional[str],
        db: AsyncSession,
    ) -> Alert:
        alert = await AlertService._get_alert(alert_id, db)
        if alert.status == AlertStatus.RESOLVED:
            raise HTTPException(status_code=400, detail="Resolved alerts cannot be acknowledged")

        incident = await AlertService._ensure_incident(alert, db)
        alert.status = AlertStatus.ACKNOWLEDGED
        incident.acknowledged_by_id = user_id
        incident.acknowledged_at = datetime.now(timezone.utc)

        await AuditService.log(
            db,
            action="alert.acknowledge",
            resource_type="alert",
            resource_id=alert.id,
            user_id=user_id,
            detail={"note": note},
        )
        await AlertService._publish_workflow_event(alert, "alert_acknowledged")
        await db.flush()
        return await AlertService._get_alert(alert_id, db)

    @staticmethod
    async def assign_alert(
        alert_id: str,
        assigned_to_user_id: str,
        actor_id: str,
        note: Optional[str],
        db: AsyncSession,
    ) -> Alert:
        alert = await AlertService._get_alert(alert_id, db)
        worker_result = await db.execute(select(User).where(User.id == assigned_to_user_id))
        assigned_user = worker_result.scalar_one_or_none()
        if assigned_user is None:
            raise HTTPException(status_code=404, detail="Assigned user not found")
        if assigned_user.role not in (UserRole.ADMIN, UserRole.HEALTH_WORKER):
            raise HTTPException(status_code=400, detail="Only admins or health workers can own alerts")

        incident = await AlertService._ensure_incident(alert, db)
        incident.assigned_to_user_id = assigned_to_user_id
        if alert.status == AlertStatus.ACTIVE:
            alert.status = AlertStatus.ACKNOWLEDGED

        await NotificationCenterService.create(
            db,
            user_id=assigned_user.id,
            village_id=alert.village_id,
            alert_id=alert.id,
            kind="alert_assignment",
            title=f"Assigned alert: {alert.title}",
            message=f"You were assigned to follow up on '{alert.title}'.",
            severity=alert.severity,
            link="/alerts",
            channel=NotificationChannel.IN_APP,
            delivery_status=NotificationDeliveryStatus.SENT,
        )
        await AuditService.log(
            db,
            action="alert.assign",
            resource_type="alert",
            resource_id=alert.id,
            user_id=actor_id,
            detail={"assigned_to_user_id": assigned_to_user_id, "note": note},
        )
        await AlertService._publish_workflow_event(alert, "alert_assigned")
        await db.flush()
        return await AlertService._get_alert(alert_id, db)

    @staticmethod
    async def escalate_alert(
        alert_id: str,
        escalation_level: int,
        reason: str,
        actor_id: str,
        db: AsyncSession,
    ) -> Alert:
        alert = await AlertService._get_alert(alert_id, db)
        incident = await AlertService._ensure_incident(alert, db)
        incident.escalation_level = max(incident.escalation_level, escalation_level)
        incident.escalation_reason = reason
        incident.escalated_at = datetime.now(timezone.utc)
        if alert.status == AlertStatus.ACTIVE:
            alert.status = AlertStatus.ACKNOWLEDGED

        admin_result = await db.execute(
            select(User)
            .options(selectinload(User.preferences))
            .where(User.role == UserRole.ADMIN, User.is_active == True)  # noqa: E712
        )
        admins = admin_result.scalars().all()
        await NotificationCenterService.create_many(
            db,
            user_ids=[admin.id for admin in admins],
            village_id=alert.village_id,
            alert_id=alert.id,
            kind="alert_escalation",
            title=f"Escalated alert: {alert.title}",
            message=reason,
            severity=alert.severity,
            link="/alerts",
            channel=NotificationChannel.IN_APP,
            delivery_status=NotificationDeliveryStatus.SENT,
            data={"escalation_level": escalation_level},
        )
        await AuditService.log(
            db,
            action="alert.escalate",
            resource_type="alert",
            resource_id=alert.id,
            user_id=actor_id,
            detail={"escalation_level": escalation_level, "reason": reason},
        )
        await AlertService._publish_workflow_event(alert, "alert_escalated")
        await db.flush()
        return await AlertService._get_alert(alert_id, db)

    @staticmethod
    async def resolve_alert(
        alert_id: str,
        user_id: str,
        db: AsyncSession,
        resolution_note: Optional[str] = None,
    ) -> Alert:
        alert = await AlertService._get_alert(alert_id, db)

        alert.status = AlertStatus.RESOLVED
        alert.resolved_at = datetime.now(timezone.utc)
        alert.resolved_by = user_id
        incident = await AlertService._ensure_incident(alert, db)
        incident.resolution_note = resolution_note
        await AuditService.log(
            db,
            action="alert.resolve",
            resource_type="alert",
            resource_id=alert.id,
            user_id=user_id,
            detail={"resolution_note": resolution_note},
        )
        await AlertService._publish_workflow_event(alert, "alert_resolved")
        await db.flush()
        return await AlertService._get_alert(alert_id, db)

    @staticmethod
    async def create_ai_alert(
        village_id: str,
        risk_score: float,
        category: str,
        description: str,
        actions: List[str],
        prediction_id: Optional[str],
        db: AsyncSession,
    ) -> Alert:
        if risk_score >= 75:
            severity = AlertSeverity.CRITICAL
        elif risk_score >= 50:
            severity = AlertSeverity.HIGH
        elif risk_score >= 25:
            severity = AlertSeverity.MODERATE
        else:
            severity = AlertSeverity.LOW

        alert = Alert(
            village_id=village_id,
            alert_type=AlertType.AI_PREDICTED,
            severity=severity,
            title=f"AI Risk Alert: {category.upper()} risk detected",
            description=description,
            recommended_actions=actions,
            triggered_by="ai_orchestrator",
            ai_prediction_id=prediction_id,
        )
        db.add(alert)
        await db.flush()
        await NotificationService.broadcast_alert(alert, db)
        await redis_manager.publish(f"alerts:{village_id}", {
            "event": "ai_alert", "alert_id": alert.id, "risk_score": risk_score
        })
        return alert
