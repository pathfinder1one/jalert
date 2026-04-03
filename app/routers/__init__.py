# JALERT routers package
from app.routers import (
    alerts,
    auth,
    health,
    ml_training,
    predictions,
    reports,
    sensors,
    village_intelligence,
    villages,
    water_resources,
    websockets,
)

__all__ = [
    "auth",
    "sensors",
    "alerts",
    "predictions",
    "health",
    "reports",
    "villages",
    "websockets",
    "ml_training",
    "water_resources",
    "village_intelligence",
]
