# JALERT routers package
from app.routers import (
    admin,
    alerts,
    auth,
    health,
    ml_training,
    notifications,
    predictions,
    reports,
    sensors,
    village_intelligence,
    villages,
    water_resources,
    websockets,
    chat,
)

__all__ = [
    "auth",
    "admin",
    "sensors",
    "alerts",
    "notifications",
    "predictions",
    "health",
    "reports",
    "villages",
    "websockets",
    "ml_training",
    "water_resources",
    "village_intelligence",
    "chat",
]
