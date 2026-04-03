"""
JALERT - Initial Database Schema Migration
Run: alembic upgrade head
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# Revision identifiers
revision = "001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create enums
    op.execute("CREATE TYPE userrole AS ENUM ('admin', 'health_worker', 'public')")
    op.execute("CREATE TYPE alertseverity AS ENUM ('low', 'moderate', 'high', 'critical')")
    op.execute("CREATE TYPE alertstatus AS ENUM ('active', 'resolved', 'acknowledged')")
    op.execute("CREATE TYPE alerttype AS ENUM ('water_quality', 'disease_outbreak', 'flood_risk', 'manual', 'ai_predicted')")
    op.execute("CREATE TYPE riskcategory AS ENUM ('low', 'moderate', 'high', 'critical')")
    op.execute("CREATE TYPE sensorstatus AS ENUM ('active', 'inactive', 'faulty', 'maintenance')")

    # Villages
    op.create_table(
        "villages",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("district", sa.String(100), nullable=False),
        sa.Column("state", sa.String(100), nullable=False),
        sa.Column("latitude", sa.Float, nullable=False),
        sa.Column("longitude", sa.Float, nullable=False),
        sa.Column("population", sa.Integer, default=0),
        sa.Column("pincode", sa.String(10)),
        sa.Column("is_active", sa.Boolean, default=True),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_village_district_state", "villages", ["district", "state"])

    # Users
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("phone", sa.String(20)),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("role", sa.Enum("admin", "health_worker", "public", name="userrole")),
        sa.Column("village_id", sa.String(36), sa.ForeignKey("villages.id")),
        sa.Column("is_active", sa.Boolean, default=True),
        sa.Column("preferred_language", sa.String(5), default="en"),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_users_email", "users", ["email"])

    # Sensors
    op.create_table(
        "sensors",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("village_id", sa.String(36), sa.ForeignKey("villages.id"), nullable=False),
        sa.Column("sensor_code", sa.String(50), unique=True, nullable=False),
        sa.Column("sensor_type", sa.String(50), default="water_quality"),
        sa.Column("location_name", sa.String(200)),
        sa.Column("latitude", sa.Float),
        sa.Column("longitude", sa.Float),
        sa.Column("status", sa.Enum("active", "inactive", "faulty", "maintenance", name="sensorstatus")),
        sa.Column("firmware_version", sa.String(20)),
        sa.Column("last_seen", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_sensor_village", "sensors", ["village_id"])
    op.create_index("ix_sensor_status", "sensors", ["status"])

    # Sensor Readings (partitioned by month in production)
    op.create_table(
        "sensor_readings",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("sensor_id", sa.String(36), sa.ForeignKey("sensors.id"), nullable=False),
        sa.Column("village_id", sa.String(36), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True)),
        sa.Column("ph", sa.Float),
        sa.Column("turbidity", sa.Float),
        sa.Column("ecoli", sa.Float),
        sa.Column("tds", sa.Float),
        sa.Column("temperature", sa.Float),
        sa.Column("dissolved_oxygen", sa.Float),
        sa.Column("nitrate", sa.Float),
        sa.Column("arsenic", sa.Float),
        sa.Column("fluoride", sa.Float),
        sa.Column("rainfall_mm", sa.Float),
        sa.Column("flood_level_m", sa.Float),
        sa.Column("humidity", sa.Float),
        sa.Column("air_temp", sa.Float),
        sa.Column("is_anomaly", sa.Boolean, default=False),
        sa.Column("quality_score", sa.Float),
        sa.Column("raw_payload", postgresql.JSON),
    )
    op.create_index("ix_reading_sensor_time", "sensor_readings", ["sensor_id", "timestamp"])
    op.create_index("ix_reading_village_time", "sensor_readings", ["village_id", "timestamp"])

    # AI Predictions
    op.create_table(
        "ai_predictions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("village_id", sa.String(36), sa.ForeignKey("villages.id"), nullable=False),
        sa.Column("risk_score", sa.Float, nullable=False),
        sa.Column("risk_category", sa.Enum("low", "moderate", "high", "critical", name="riskcategory")),
        sa.Column("outbreak_timeline_days", sa.Integer),
        sa.Column("water_quality_score", sa.Float),
        sa.Column("disease_risk_score", sa.Float),
        sa.Column("weather_risk_score", sa.Float),
        sa.Column("community_health_score", sa.Float),
        sa.Column("agent_outputs", postgresql.JSON),
        sa.Column("recommended_actions", postgresql.JSON),
        sa.Column("shap_values", postgresql.JSON),
        sa.Column("model_version", sa.String(20)),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_prediction_village_time", "ai_predictions", ["village_id", "created_at"])
    op.create_index("ix_prediction_risk", "ai_predictions", ["risk_score"])

    # Alerts
    op.create_table(
        "alerts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("village_id", sa.String(36), sa.ForeignKey("villages.id"), nullable=False),
        sa.Column("alert_type", sa.Enum("water_quality", "disease_outbreak", "flood_risk", "manual", "ai_predicted", name="alerttype")),
        sa.Column("severity", sa.Enum("low", "moderate", "high", "critical", name="alertseverity")),
        sa.Column("status", sa.Enum("active", "resolved", "acknowledged", name="alertstatus")),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("recommended_actions", postgresql.JSON),
        sa.Column("affected_population", sa.Integer),
        sa.Column("triggered_by", sa.String(100)),
        sa.Column("sensor_reading_id", sa.String(36), sa.ForeignKey("sensor_readings.id")),
        sa.Column("ai_prediction_id", sa.String(36), sa.ForeignKey("ai_predictions.id")),
        sa.Column("resolved_at", sa.DateTime(timezone=True)),
        sa.Column("resolved_by", sa.String(36), sa.ForeignKey("users.id")),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_alert_village_severity", "alerts", ["village_id", "severity"])
    op.create_index("ix_alert_status", "alerts", ["status"])
    op.create_index("ix_alert_created", "alerts", ["created_at"])

    # Health Reports
    op.create_table(
        "health_reports",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("village_id", sa.String(36), sa.ForeignKey("villages.id"), nullable=False),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id")),
        sa.Column("reporter_name", sa.String(100)),
        sa.Column("age", sa.Integer),
        sa.Column("gender", sa.String(10)),
        sa.Column("symptoms", postgresql.JSON, nullable=False),
        sa.Column("symptom_onset", sa.DateTime(timezone=True)),
        sa.Column("suspected_disease", sa.String(100)),
        sa.Column("is_hospitalized", sa.Boolean, default=False),
        sa.Column("is_recovered", sa.Boolean, default=False),
        sa.Column("notes", sa.Text),
        sa.Column("assigned_worker_id", sa.String(36), sa.ForeignKey("users.id")),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_health_village_time", "health_reports", ["village_id", "created_at"])

    # Audit Logs
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id")),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("resource_type", sa.String(50)),
        sa.Column("resource_id", sa.String(36)),
        sa.Column("detail", postgresql.JSON),
        sa.Column("ip_address", sa.String(45)),
        sa.Column("user_agent", sa.String(300)),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_audit_user", "audit_logs", ["user_id"])
    op.create_index("ix_audit_action", "audit_logs", ["action"])
    op.create_index("ix_audit_time", "audit_logs", ["created_at"])


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("health_reports")
    op.drop_table("alerts")
    op.drop_table("ai_predictions")
    op.drop_table("sensor_readings")
    op.drop_table("sensors")
    op.drop_table("users")
    op.drop_table("villages")
    for enum in ["userrole", "alertseverity", "alertstatus", "alerttype", "riskcategory", "sensorstatus"]:
        op.execute(f"DROP TYPE IF EXISTS {enum}")
