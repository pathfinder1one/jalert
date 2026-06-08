"""
JALERT - Database Models
All SQLAlchemy ORM models
"""
import uuid
import enum
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import (
    String, Float, Integer, Boolean, DateTime, Text, JSON,
    ForeignKey, Enum, Index, func
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base


def utcnow():
    return datetime.now(timezone.utc)


def new_uuid():
    return str(uuid.uuid4())


# ── Enums ─────────────────────────────────────────────────────────────────────

class UserRole(str, enum.Enum):
    ADMIN = "admin"
    HEALTH_WORKER = "health_worker"
    PUBLIC = "public"


class AlertSeverity(str, enum.Enum):
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"
    CRITICAL = "critical"


class AlertStatus(str, enum.Enum):
    ACTIVE = "active"
    RESOLVED = "resolved"
    ACKNOWLEDGED = "acknowledged"


class AlertType(str, enum.Enum):
    WATER_QUALITY = "water_quality"
    DISEASE_OUTBREAK = "disease_outbreak"
    FLOOD_RISK = "flood_risk"
    MANUAL = "manual"
    AI_PREDICTED = "ai_predicted"


class RiskCategory(str, enum.Enum):
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"
    CRITICAL = "critical"


class SensorStatus(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    FAULTY = "faulty"
    MAINTENANCE = "maintenance"


class CitizenRequestStatus(str, enum.Enum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"


class NotificationChannel(str, enum.Enum):
    IN_APP = "in_app"
    EMAIL = "email"
    SMS = "sms"
    VOICE = "voice"


class NotificationDeliveryStatus(str, enum.Enum):
    QUEUED = "queued"
    SENT = "sent"
    FAILED = "failed"
    READ = "read"


# ── Models ────────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    phone: Mapped[Optional[str]] = mapped_column(String(20))
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.PUBLIC)
    village_id: Mapped[Optional[str]] = mapped_column(ForeignKey("villages.id"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    preferred_language: Mapped[str] = mapped_column(String(5), default="en")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    village: Mapped[Optional["Village"]] = relationship(back_populates="users")
    health_reports: Mapped[List["HealthReport"]] = relationship(
        back_populates="user",
        foreign_keys="HealthReport.user_id",
    )
    assigned_health_reports: Mapped[List["HealthReport"]] = relationship(
        back_populates="assigned_worker",
        foreign_keys="HealthReport.assigned_worker_id",
    )
    audit_logs: Mapped[List["AuditLog"]] = relationship(back_populates="user")
    citizen_requests: Mapped[List["CitizenRequest"]] = relationship(back_populates="user")
    preferences: Mapped[Optional["UserPreference"]] = relationship(
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
    )
    notifications: Mapped[List["Notification"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    acknowledged_alert_incidents: Mapped[List["AlertIncident"]] = relationship(
        back_populates="acknowledged_by_user",
        foreign_keys="AlertIncident.acknowledged_by_id",
    )
    assigned_alert_incidents: Mapped[List["AlertIncident"]] = relationship(
        back_populates="assigned_to_user",
        foreign_keys="AlertIncident.assigned_to_user_id",
    )


class Village(Base):
    __tablename__ = "villages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    district: Mapped[str] = mapped_column(String(100), nullable=False)
    state: Mapped[str] = mapped_column(String(100), nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    population: Mapped[int] = mapped_column(Integer, default=0)
    pincode: Mapped[Optional[str]] = mapped_column(String(10))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    users: Mapped[List["User"]] = relationship(back_populates="village")
    sensors: Mapped[List["Sensor"]] = relationship(back_populates="village")
    alerts: Mapped[List["Alert"]] = relationship(back_populates="village")
    ai_predictions: Mapped[List["AIPrediction"]] = relationship(back_populates="village")
    health_reports: Mapped[List["HealthReport"]] = relationship(back_populates="village")
    citizen_requests: Mapped[List["CitizenRequest"]] = relationship(back_populates="village")

    __table_args__ = (
        Index("ix_village_district_state", "district", "state"),
    )


class Sensor(Base):
    __tablename__ = "sensors"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    village_id: Mapped[str] = mapped_column(ForeignKey("villages.id"), nullable=False)
    sensor_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    sensor_type: Mapped[str] = mapped_column(String(50), default="water_quality")
    location_name: Mapped[Optional[str]] = mapped_column(String(200))
    latitude: Mapped[Optional[float]] = mapped_column(Float)
    longitude: Mapped[Optional[float]] = mapped_column(Float)
    status: Mapped[SensorStatus] = mapped_column(Enum(SensorStatus), default=SensorStatus.ACTIVE)
    firmware_version: Mapped[Optional[str]] = mapped_column(String(20))
    last_seen: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    village: Mapped["Village"] = relationship(back_populates="sensors")
    readings: Mapped[List["SensorReading"]] = relationship(back_populates="sensor")

    __table_args__ = (
        Index("ix_sensor_village", "village_id"),
        Index("ix_sensor_status", "status"),
    )


class SensorReading(Base):
    __tablename__ = "sensor_readings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    sensor_id: Mapped[str] = mapped_column(ForeignKey("sensors.id"), nullable=False)
    village_id: Mapped[str] = mapped_column(String(36), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    # Water quality parameters
    ph: Mapped[Optional[float]] = mapped_column(Float)
    turbidity: Mapped[Optional[float]] = mapped_column(Float)     # NTU
    ecoli: Mapped[Optional[float]] = mapped_column(Float)         # CFU/100ml
    tds: Mapped[Optional[float]] = mapped_column(Float)           # mg/L
    temperature: Mapped[Optional[float]] = mapped_column(Float)   # Celsius
    dissolved_oxygen: Mapped[Optional[float]] = mapped_column(Float)
    nitrate: Mapped[Optional[float]] = mapped_column(Float)
    arsenic: Mapped[Optional[float]] = mapped_column(Float)
    fluoride: Mapped[Optional[float]] = mapped_column(Float)

    # Environmental
    rainfall_mm: Mapped[Optional[float]] = mapped_column(Float)
    flood_level_m: Mapped[Optional[float]] = mapped_column(Float)
    humidity: Mapped[Optional[float]] = mapped_column(Float)
    air_temp: Mapped[Optional[float]] = mapped_column(Float)

    # Metadata
    is_anomaly: Mapped[bool] = mapped_column(Boolean, default=False)
    quality_score: Mapped[Optional[float]] = mapped_column(Float)
    raw_payload: Mapped[Optional[dict]] = mapped_column(JSON)

    sensor: Mapped["Sensor"] = relationship(back_populates="readings")

    __table_args__ = (
        Index("ix_reading_sensor_time", "sensor_id", "timestamp"),
        Index("ix_reading_village_time", "village_id", "timestamp"),
    )


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    village_id: Mapped[str] = mapped_column(ForeignKey("villages.id"), nullable=False)
    alert_type: Mapped[AlertType] = mapped_column(Enum(AlertType), nullable=False)
    severity: Mapped[AlertSeverity] = mapped_column(Enum(AlertSeverity), nullable=False)
    status: Mapped[AlertStatus] = mapped_column(Enum(AlertStatus), default=AlertStatus.ACTIVE)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    recommended_actions: Mapped[Optional[dict]] = mapped_column(JSON)  # list of actions
    affected_population: Mapped[Optional[int]] = mapped_column(Integer)
    triggered_by: Mapped[Optional[str]] = mapped_column(String(100))   # rule or AI agent
    sensor_reading_id: Mapped[Optional[str]] = mapped_column(ForeignKey("sensor_readings.id"))
    ai_prediction_id: Mapped[Optional[str]] = mapped_column(ForeignKey("ai_predictions.id"))
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    resolved_by: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    village: Mapped["Village"] = relationship(back_populates="alerts")
    incident: Mapped[Optional["AlertIncident"]] = relationship(
        back_populates="alert",
        uselist=False,
        cascade="all, delete-orphan",
    )
    notifications: Mapped[List["Notification"]] = relationship(back_populates="alert")

    __table_args__ = (
        Index("ix_alert_village_severity", "village_id", "severity"),
        Index("ix_alert_status", "status"),
        Index("ix_alert_created", "created_at"),
    )

    @property
    def assigned_to_user_id(self) -> Optional[str]:
        incident = self.__dict__.get("incident")
        return incident.assigned_to_user_id if incident else None

    @property
    def assigned_to_name(self) -> Optional[str]:
        incident = self.__dict__.get("incident")
        if incident and incident.__dict__.get("assigned_to_user"):
            return incident.assigned_to_user.name
        return None

    @property
    def acknowledged_by_id(self) -> Optional[str]:
        incident = self.__dict__.get("incident")
        return incident.acknowledged_by_id if incident else None

    @property
    def acknowledged_by_name(self) -> Optional[str]:
        incident = self.__dict__.get("incident")
        if incident and incident.__dict__.get("acknowledged_by_user"):
            return incident.acknowledged_by_user.name
        return None

    @property
    def acknowledged_at(self) -> Optional[datetime]:
        incident = self.__dict__.get("incident")
        return incident.acknowledged_at if incident else None

    @property
    def escalated_at(self) -> Optional[datetime]:
        incident = self.__dict__.get("incident")
        return incident.escalated_at if incident else None

    @property
    def escalation_level(self) -> int:
        incident = self.__dict__.get("incident")
        return incident.escalation_level if incident else 0

    @property
    def escalation_reason(self) -> Optional[str]:
        incident = self.__dict__.get("incident")
        return incident.escalation_reason if incident else None

    @property
    def resolution_note(self) -> Optional[str]:
        incident = self.__dict__.get("incident")
        return incident.resolution_note if incident else None


class AlertIncident(Base):
    __tablename__ = "alert_incidents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    alert_id: Mapped[str] = mapped_column(ForeignKey("alerts.id"), unique=True, nullable=False)
    assigned_to_user_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"))
    acknowledged_by_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"))
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    escalated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    escalation_level: Mapped[int] = mapped_column(Integer, default=0)
    escalation_reason: Mapped[Optional[str]] = mapped_column(Text)
    resolution_note: Mapped[Optional[str]] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    alert: Mapped["Alert"] = relationship(back_populates="incident")
    assigned_to_user: Mapped[Optional["User"]] = relationship(
        back_populates="assigned_alert_incidents",
        foreign_keys=[assigned_to_user_id],
    )
    acknowledged_by_user: Mapped[Optional["User"]] = relationship(
        back_populates="acknowledged_alert_incidents",
        foreign_keys=[acknowledged_by_id],
    )

    __table_args__ = (
        Index("ix_alert_incident_alert", "alert_id"),
        Index("ix_alert_incident_assigned", "assigned_to_user_id"),
    )


class HealthReport(Base):
    __tablename__ = "health_reports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    village_id: Mapped[str] = mapped_column(ForeignKey("villages.id"), nullable=False)
    user_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"))
    reporter_name: Mapped[Optional[str]] = mapped_column(String(100))
    age: Mapped[Optional[int]] = mapped_column(Integer)
    gender: Mapped[Optional[str]] = mapped_column(String(10))
    symptoms: Mapped[dict] = mapped_column(JSON)           # {symptom: severity}
    symptom_onset: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    suspected_disease: Mapped[Optional[str]] = mapped_column(String(100))
    is_hospitalized: Mapped[bool] = mapped_column(Boolean, default=False)
    is_recovered: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    assigned_worker_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    village: Mapped["Village"] = relationship(back_populates="health_reports")
    user: Mapped[Optional["User"]] = relationship(
        back_populates="health_reports",
        foreign_keys=[user_id],
    )
    assigned_worker: Mapped[Optional["User"]] = relationship(
        back_populates="assigned_health_reports",
        foreign_keys=[assigned_worker_id],
    )

    __table_args__ = (
        Index("ix_health_village_time", "village_id", "created_at"),
    )


class AIPrediction(Base):
    __tablename__ = "ai_predictions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    village_id: Mapped[str] = mapped_column(ForeignKey("villages.id"), nullable=False)
    risk_score: Mapped[float] = mapped_column(Float, nullable=False)
    risk_category: Mapped[RiskCategory] = mapped_column(Enum(RiskCategory), nullable=False)
    outbreak_timeline_days: Mapped[Optional[int]] = mapped_column(Integer)
    water_quality_score: Mapped[Optional[float]] = mapped_column(Float)
    disease_risk_score: Mapped[Optional[float]] = mapped_column(Float)
    weather_risk_score: Mapped[Optional[float]] = mapped_column(Float)
    community_health_score: Mapped[Optional[float]] = mapped_column(Float)
    agent_outputs: Mapped[Optional[dict]] = mapped_column(JSON)   # raw agent outputs
    recommended_actions: Mapped[Optional[dict]] = mapped_column(JSON)
    shap_values: Mapped[Optional[dict]] = mapped_column(JSON)
    model_version: Mapped[Optional[str]] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    village: Mapped["Village"] = relationship(back_populates="ai_predictions")

    __table_args__ = (
        Index("ix_prediction_village_time", "village_id", "created_at"),
        Index("ix_prediction_risk", "risk_score"),
    )


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(50))
    resource_id: Mapped[Optional[str]] = mapped_column(String(36))
    detail: Mapped[Optional[dict]] = mapped_column(JSON)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45))
    user_agent: Mapped[Optional[str]] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped[Optional["User"]] = relationship(back_populates="audit_logs")

    __table_args__ = (
        Index("ix_audit_user", "user_id"),
        Index("ix_audit_action", "action"),
        Index("ix_audit_time", "created_at"),
    )

    @property
    def user_name(self) -> Optional[str]:
        return self.user.name if self.user else None

    @property
    def user_email(self) -> Optional[str]:
        return self.user.email if self.user else None


class UserPreference(Base):
    __tablename__ = "user_preferences"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), unique=True, nullable=False)
    language: Mapped[str] = mapped_column(String(5), default="en")
    comfort_mode: Mapped[bool] = mapped_column(Boolean, default=False)
    field_mode: Mapped[bool] = mapped_column(Boolean, default=False)
    accessibility_mode: Mapped[bool] = mapped_column(Boolean, default=False)
    active_village_id: Mapped[Optional[str]] = mapped_column(ForeignKey("villages.id"))
    saved_village_ids: Mapped[Optional[list]] = mapped_column(JSON, default=list)
    email_notifications: Mapped[bool] = mapped_column(Boolean, default=True)
    sms_notifications: Mapped[bool] = mapped_column(Boolean, default=True)
    voice_notifications: Mapped[bool] = mapped_column(Boolean, default=False)
    daily_summary_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user: Mapped["User"] = relationship(back_populates="preferences")

    __table_args__ = (
        Index("ix_user_preference_user", "user_id"),
    )


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    village_id: Mapped[Optional[str]] = mapped_column(ForeignKey("villages.id"))
    alert_id: Mapped[Optional[str]] = mapped_column(ForeignKey("alerts.id"))
    kind: Mapped[str] = mapped_column(String(100), nullable=False)
    channel: Mapped[NotificationChannel] = mapped_column(Enum(NotificationChannel), default=NotificationChannel.IN_APP)
    severity: Mapped[Optional[AlertSeverity]] = mapped_column(Enum(AlertSeverity))
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    link: Mapped[Optional[str]] = mapped_column(String(255))
    delivery_status: Mapped[NotificationDeliveryStatus] = mapped_column(
        Enum(NotificationDeliveryStatus),
        default=NotificationDeliveryStatus.QUEUED,
    )
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    read_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    data: Mapped[Optional[dict]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship(back_populates="notifications")
    alert: Mapped[Optional["Alert"]] = relationship(back_populates="notifications")

    __table_args__ = (
        Index("ix_notification_user_created", "user_id", "created_at"),
        Index("ix_notification_user_read", "user_id", "is_read"),
        Index("ix_notification_alert", "alert_id"),
    )


class CitizenRequest(Base):
    __tablename__ = "citizen_requests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    village_id: Mapped[str] = mapped_column(ForeignKey("villages.id"), nullable=False)
    user_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"))
    reporter_name: Mapped[str] = mapped_column(String(100), nullable=False)
    contact_phone: Mapped[Optional[str]] = mapped_column(String(20))
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[AlertSeverity] = mapped_column(Enum(AlertSeverity), default=AlertSeverity.MODERATE)
    status: Mapped[CitizenRequestStatus] = mapped_column(Enum(CitizenRequestStatus), default=CitizenRequestStatus.OPEN)
    preferred_channel: Mapped[Optional[str]] = mapped_column(String(50))
    resolution_notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    village: Mapped["Village"] = relationship(back_populates="citizen_requests")
    user: Mapped[Optional["User"]] = relationship(back_populates="citizen_requests")

    __table_args__ = (
        Index("ix_request_village_status", "village_id", "status"),
        Index("ix_request_created", "created_at"),
    )
