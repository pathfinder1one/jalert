"""
JALERT - Pydantic Schemas (Request/Response)
"""
from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List, Dict, Any
from datetime import datetime
from app.models.user import (
    UserRole,
    AlertSeverity,
    AlertStatus,
    AlertType,
    RiskCategory,
    SensorStatus,
    CitizenRequestStatus,
    NotificationChannel,
    NotificationDeliveryStatus,
)


# ── Auth ──────────────────────────────────────────────────────────────────────

class UserRegister(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    phone: Optional[str] = Field(None, pattern=r"^\+?[1-9]\d{7,14}$")
    password: str = Field(..., min_length=8)
    role: UserRole = UserRole.PUBLIC
    village_id: Optional[str] = None
    preferred_language: str = Field(default="en", pattern=r"^[a-z]{2}$")


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class UserOut(BaseModel):
    id: str
    name: str
    email: str
    phone: Optional[str]
    role: UserRole
    village_id: Optional[str]
    is_active: bool
    preferred_language: str
    created_at: datetime

    class Config:
        from_attributes = True


class UserProfileUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=100)
    phone: Optional[str] = Field(default=None, pattern=r"^\+?[1-9]\d{7,14}$")
    preferred_language: Optional[str] = Field(default=None, pattern=r"^[a-z]{2}$")


class UserChangePassword(BaseModel):
    current_password: str = Field(..., min_length=8)
    new_password: str = Field(..., min_length=8)


class UserPreferenceOut(BaseModel):
    language: str
    comfort_mode: bool
    field_mode: bool
    accessibility_mode: bool
    active_village_id: Optional[str]
    saved_village_ids: List[str]
    email_notifications: bool
    sms_notifications: bool
    voice_notifications: bool
    daily_summary_enabled: bool

    class Config:
        from_attributes = True


class UserPreferenceUpdate(BaseModel):
    language: Optional[str] = Field(default=None, pattern=r"^[a-z]{2}$")
    comfort_mode: Optional[bool] = None
    field_mode: Optional[bool] = None
    accessibility_mode: Optional[bool] = None
    active_village_id: Optional[str] = None
    saved_village_ids: Optional[List[str]] = None
    email_notifications: Optional[bool] = None
    sms_notifications: Optional[bool] = None
    voice_notifications: Optional[bool] = None
    daily_summary_enabled: Optional[bool] = None


# ── Village ───────────────────────────────────────────────────────────────────

class VillageCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=200)
    district: str
    state: str
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    population: int = Field(default=0, ge=0)
    pincode: Optional[str] = None


class VillageOut(VillageCreate):
    id: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ── Sensors ───────────────────────────────────────────────────────────────────

class SensorCreate(BaseModel):
    village_id: str
    sensor_code: str = Field(..., min_length=3, max_length=50)
    sensor_type: str = "water_quality"
    location_name: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    firmware_version: Optional[str] = None


class SensorReadingIngest(BaseModel):
    """IoT sensor data ingestion payload"""
    sensor_code: str
    timestamp: Optional[datetime] = None

    # Water quality
    ph: Optional[float] = Field(None, ge=0, le=14)
    turbidity: Optional[float] = Field(None, ge=0)
    ecoli: Optional[float] = Field(None, ge=0)
    tds: Optional[float] = Field(None, ge=0)
    temperature: Optional[float] = Field(None, ge=-10, le=100)
    dissolved_oxygen: Optional[float] = Field(None, ge=0)
    nitrate: Optional[float] = Field(None, ge=0)
    arsenic: Optional[float] = Field(None, ge=0)
    fluoride: Optional[float] = Field(None, ge=0)

    # Environmental
    rainfall_mm: Optional[float] = Field(None, ge=0)
    flood_level_m: Optional[float] = Field(None, ge=0)
    humidity: Optional[float] = Field(None, ge=0, le=100)
    air_temp: Optional[float] = None
    raw_payload: Optional[Dict[str, Any]] = None


class SensorReadingOut(BaseModel):
    id: str
    sensor_id: str
    village_id: str
    timestamp: datetime
    ph: Optional[float]
    turbidity: Optional[float]
    ecoli: Optional[float]
    tds: Optional[float]
    temperature: Optional[float]
    nitrate: Optional[float]
    arsenic: Optional[float]
    fluoride: Optional[float]
    rainfall_mm: Optional[float]
    flood_level_m: Optional[float]
    is_anomaly: bool
    quality_score: Optional[float]

    class Config:
        from_attributes = True


class SensorOut(BaseModel):
    id: str
    village_id: str
    sensor_code: str
    sensor_type: str
    location_name: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]
    status: SensorStatus
    firmware_version: Optional[str]
    last_seen: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


# ── Alerts ────────────────────────────────────────────────────────────────────

class AlertCreate(BaseModel):
    village_id: str
    alert_type: AlertType
    severity: AlertSeverity
    title: str = Field(..., max_length=300)
    description: str
    recommended_actions: Optional[List[str]] = None
    affected_population: Optional[int] = None


class AlertOut(BaseModel):
    id: str
    village_id: str
    alert_type: AlertType
    severity: AlertSeverity
    status: AlertStatus
    title: str
    description: str
    recommended_actions: Optional[Any]
    affected_population: Optional[int]
    triggered_by: Optional[str]
    created_at: datetime
    resolved_at: Optional[datetime]
    assigned_to_user_id: Optional[str] = None
    assigned_to_name: Optional[str] = None
    acknowledged_by_id: Optional[str] = None
    acknowledged_by_name: Optional[str] = None
    acknowledged_at: Optional[datetime] = None
    escalated_at: Optional[datetime] = None
    escalation_level: int = 0
    escalation_reason: Optional[str] = None
    resolution_note: Optional[str] = None

    class Config:
        from_attributes = True


class AlertFilter(BaseModel):
    village_id: Optional[str] = None
    severity: Optional[AlertSeverity] = None
    alert_type: Optional[AlertType] = None
    status: Optional[AlertStatus] = None
    limit: int = Field(default=50, le=200)
    offset: int = 0


class AlertAcknowledgeUpdate(BaseModel):
    note: Optional[str] = Field(default=None, max_length=500)


class AlertAssignUpdate(BaseModel):
    assigned_to_user_id: str
    note: Optional[str] = Field(default=None, max_length=500)


class AlertEscalateUpdate(BaseModel):
    escalation_level: int = Field(default=1, ge=1, le=10)
    reason: str = Field(..., min_length=4, max_length=500)


class AlertResolveUpdate(BaseModel):
    resolution_note: Optional[str] = Field(default=None, max_length=1000)


# ── Health Reports ────────────────────────────────────────────────────────────

class HealthReportCreate(BaseModel):
    village_id: str
    reporter_name: Optional[str] = None
    age: Optional[int] = Field(None, ge=0, le=150)
    gender: Optional[str] = None
    symptoms: Dict[str, Any]      # e.g. {"fever": "high", "diarrhea": "moderate"}
    symptom_onset: Optional[datetime] = None
    suspected_disease: Optional[str] = None
    is_hospitalized: bool = False
    notes: Optional[str] = None


class HealthReportOut(HealthReportCreate):
    id: str
    user_id: Optional[str]
    is_recovered: bool
    assigned_worker_id: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


# ── AI Predictions ────────────────────────────────────────────────────────────

class PredictionRequest(BaseModel):
    village_id: str
    force_refresh: bool = False


class PredictionOut(BaseModel):
    id: str
    village_id: str
    risk_score: float
    risk_category: RiskCategory
    outbreak_timeline_days: Optional[int]
    water_quality_score: Optional[float]
    disease_risk_score: Optional[float]
    weather_risk_score: Optional[float]
    community_health_score: Optional[float]
    recommended_actions: Optional[Any]
    shap_values: Optional[Any]
    created_at: datetime

    class Config:
        from_attributes = True


# ── Pagination ────────────────────────────────────────────────────────────────

class PaginatedResponse(BaseModel):
    items: List[Any]
    total: int
    page: int
    size: int
    pages: int


class CitizenRequestCreate(BaseModel):
    village_id: str
    reporter_name: str = Field(..., min_length=2, max_length=100)
    contact_phone: Optional[str] = Field(None, pattern=r"^\+?[1-9]\d{7,14}$")
    category: str = Field(..., min_length=3, max_length=100)
    description: str = Field(..., min_length=10, max_length=2000)
    severity: AlertSeverity = AlertSeverity.MODERATE
    preferred_channel: Optional[str] = Field(default="call", max_length=50)


class CitizenRequestStatusUpdate(BaseModel):
    status: CitizenRequestStatus
    resolution_notes: Optional[str] = Field(default=None, max_length=1000)


class CitizenRequestOut(BaseModel):
    id: str
    village_id: str
    user_id: Optional[str]
    reporter_name: str
    contact_phone: Optional[str]
    category: str
    description: str
    severity: AlertSeverity
    status: CitizenRequestStatus
    preferred_channel: Optional[str]
    resolution_notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class NotificationOut(BaseModel):
    id: str
    user_id: str
    village_id: Optional[str]
    alert_id: Optional[str]
    kind: str
    channel: NotificationChannel
    severity: Optional[AlertSeverity]
    title: str
    message: str
    link: Optional[str]
    delivery_status: NotificationDeliveryStatus
    is_read: bool
    read_at: Optional[datetime]
    data: Optional[Dict[str, Any]]
    created_at: datetime

    class Config:
        from_attributes = True


class AdminUserUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=100)
    phone: Optional[str] = Field(default=None, pattern=r"^\+?[1-9]\d{7,14}$")
    role: Optional[UserRole] = None
    village_id: Optional[str] = None
    is_active: Optional[bool] = None
    preferred_language: Optional[str] = Field(default=None, pattern=r"^[a-z]{2}$")


class AdminUserPasswordReset(BaseModel):
    new_password: str = Field(..., min_length=8)


class AuditLogOut(BaseModel):
    id: str
    user_id: Optional[str]
    user_name: Optional[str] = None
    user_email: Optional[str] = None
    action: str
    resource_type: str
    resource_id: Optional[str]
    detail: Optional[Dict[str, Any]]
    ip_address: Optional[str]
    user_agent: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True
