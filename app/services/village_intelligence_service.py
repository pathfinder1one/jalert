from __future__ import annotations

import math
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable

import pandas as pd
from fastapi import HTTPException
from sqlalchemy import and_, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import (
    AIPrediction,
    Alert,
    AlertSeverity,
    AlertStatus,
    CitizenRequest,
    CitizenRequestStatus,
    HealthReport,
    Sensor,
    SensorReading,
    User,
    UserRole,
    Village,
)
from app.schemas.schemas import CitizenRequestCreate
from app.services.ogd_data_service import (
    BHUVAN_MAP_CONFIG,
    RAW_DIR,
    _get_cached_groundwater_levels,
    _get_cached_public_resources_payload,
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _to_iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


_CACHE_TTL_SECONDS = {
    "catalog": 300.0,
    "profile": 45.0,
    "map_overview": 90.0,
    "file_scan": 300.0,
    "trust_documents": 300.0,
}
_catalog_cache: dict[str, Any] = {"expires_at": 0.0, "value": None}
_profile_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_map_overview_cache: dict[tuple[str, str, str, str], tuple[float, dict[str, Any]]] = {}
_file_match_cache: dict[tuple[str, ...], tuple[float, list[str]]] = {}
_trust_docs_cache: dict[tuple[str, str], tuple[float, list[dict[str, Any]]]] = {}
_resource_area_cache: dict[tuple[int, str, str], list[dict[str, Any]]] = {}


def _cache_lookup(cache: dict[Any, tuple[float, Any]], key: Any) -> Any | None:
    cached = cache.get(key)
    if not cached:
        return None
    expires_at, value = cached
    if expires_at <= time.monotonic():
        cache.pop(key, None)
        return None
    return value


def _cache_store(cache: dict[Any, tuple[float, Any]], key: Any, value: Any, ttl: float) -> Any:
    cache[key] = (time.monotonic() + ttl, value)
    return value


def _safe_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except Exception:
        pass
    try:
        return float(value)
    except Exception:
        return None


def _normalize_text(value: str | None) -> str:
    if not value:
        return ""
    return "".join(ch.lower() if ch.isalnum() else " " for ch in value).strip()


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lon / 2) ** 2
    )
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _resource_rows_for_village(village: Village) -> list[dict[str, Any]]:
    payload = _get_cached_public_resources_payload()
    frame = payload["resources_frame"]
    if frame.empty:
        return []

    cache_key = (id(frame), village.state.lower(), village.district.lower())
    area_records = _resource_area_cache.get(cache_key)
    if area_records is None:
        state_frame = frame[frame["state_name"].astype(str).str.lower() == village.state.lower()].copy()
        district_frame = state_frame[
            state_frame["district_name"].astype(str).str.lower().str.contains(village.district.lower(), na=False)
        ].copy()
        selected = district_frame if not district_frame.empty else state_frame
        if selected.empty:
            return []

        area_records = []
        for _, row in selected.head(200).iterrows():
            lat = _safe_float(row.get("latitude"))
            lon = _safe_float(row.get("longitude"))
            area_records.append(
                {
                    "resource_id": str(row.get("resource_id") or ""),
                    "name": str(row.get("name") or "Unnamed source"),
                    "state_name": str(row.get("state_name") or village.state),
                    "district_name": str(row.get("district_name") or village.district),
                    "resource_type": str(row.get("resource_type") or "source"),
                    "water_quality_score": _safe_float(row.get("water_quality_score")),
                    "quality_status": row.get("quality_status"),
                    "ph": _safe_float(row.get("ph")),
                    "tds": _safe_float(row.get("tds")),
                    "turbidity": _safe_float(row.get("turbidity")),
                    "arsenic": _safe_float(row.get("arsenic")),
                    "fluoride": _safe_float(row.get("fluoride")),
                    "current_level": _safe_float(row.get("current_level")),
                    "level_diff": _safe_float(row.get("level_diff")),
                    "latitude": lat,
                    "longitude": lon,
                    "coordinate_confidence": "exact" if lat is not None and lon is not None else "approximate",
                }
            )
        _resource_area_cache[cache_key] = area_records

    records: list[dict[str, Any]] = []
    for record in area_records:
        lat = record.get("latitude")
        lon = record.get("longitude")
        distance = None
        if lat is not None and lon is not None:
            distance = round(_haversine_km(village.latitude, village.longitude, lat, lon), 2)
        records.append({**record, "distance_km": distance})
    return records


def _derive_quality_badge(latest_sensor: SensorReading | None, prediction: AIPrediction | None, alerts: list[Alert]) -> str:
    quality_score = latest_sensor.quality_score if latest_sensor and latest_sensor.quality_score is not None else None
    ecoli = latest_sensor.ecoli if latest_sensor else None
    has_high_alert = any(alert.severity in {AlertSeverity.HIGH, AlertSeverity.CRITICAL} for alert in alerts)
    if ecoli is not None and ecoli > 0:
        return "water_quality_affected"
    if quality_score is not None and quality_score < 55:
        return "water_quality_affected"
    if has_high_alert:
        return "needs_attention"
    if prediction and prediction.risk_score >= 55:
        return "needs_attention"
    return "safe"


def _derive_coverage(village: Village, quality_badge: str, latest_sensor: SensorReading | None, nearby_resources: list[dict[str, Any]]) -> dict[str, Any]:
    households = max(1, round(village.population / 4.8))
    quality_score = latest_sensor.quality_score if latest_sensor and latest_sensor.quality_score is not None else 68
    coverage_ratio = 0.58 + min(len(nearby_resources), 5) * 0.03 + (quality_score - 50) / 200
    if quality_badge == "water_quality_affected":
        coverage_ratio -= 0.1
    coverage_ratio = _clamp(coverage_ratio, 0.38, 0.96)
    connected = round(households * coverage_ratio)
    schools_total = max(1, round(village.population / 900))
    schools_covered = max(0, min(schools_total, round(schools_total * (coverage_ratio + 0.06))))
    anganwadi_total = max(1, round(village.population / 1300))
    anganwadi_covered = max(0, min(anganwadi_total, round(anganwadi_total * (coverage_ratio + 0.03))))
    habitation_count = max(1, round(village.population / 1500))
    return {
        "households": households,
        "tap_connected_households": connected,
        "remaining_households": max(0, households - connected),
        "tap_coverage_percent": round((connected / households) * 100, 1),
        "schools": {"total": schools_total, "covered": schools_covered},
        "anganwadi": {"total": anganwadi_total, "covered": anganwadi_covered},
        "habitation_count": habitation_count,
        "source_label": "modeled_from_population_and_live_monitoring",
        "source_reference": "JJM-style citizen profile fields with transparent local derivation",
    }


def _derive_iot_monitoring(village: Village, latest_sensor: SensorReading | None, sensors: list[Sensor]) -> dict[str, Any]:
    base_quality = latest_sensor.quality_score if latest_sensor and latest_sensor.quality_score is not None else 68
    tank_level = _clamp(55 + (base_quality - 50) * 0.7, 22, 94)
    pump_runtime = _clamp(4.5 + len(sensors) * 0.8, 3, 14)
    chlorine_residual = _clamp(0.18 + ((base_quality or 60) / 200), 0.1, 0.8)
    supply_hours = _clamp(7 + (base_quality - 55) / 10, 4, 18)
    return {
        "tank_level_percent": round(tank_level, 1),
        "pump_runtime_hours": round(pump_runtime, 1),
        "chlorine_residual_mg_l": round(chlorine_residual, 2),
        "supply_hours_today": round(supply_hours, 1),
        "last_successful_delivery_time": _to_iso(latest_sensor.timestamp if latest_sensor else _utcnow() - timedelta(hours=6)),
        "source_label": "modeled_from_live_sensor_network",
        "sensor_count": len(sensors),
    }


def _derive_testing_summary(village: Village, latest_sensor: SensorReading | None, reading_count: int, nearby_resources: list[dict[str, Any]]) -> dict[str, Any]:
    contamination_hits = 0
    for resource in nearby_resources[:10]:
        if (resource.get("arsenic") or 0) > 0.01 or (resource.get("fluoride") or 0) > 1.5:
            contamination_hits += 1
    if latest_sensor and latest_sensor.ecoli and latest_sensor.ecoli > 0:
        contamination_hits += 1
    contamination_found = contamination_hits > 0
    ftk_count = max(1, round(reading_count / 4)) if reading_count else 1
    retest_status = "safe_after_retest" if not contamination_found and latest_sensor and (latest_sensor.quality_score or 0) >= 70 else "needs_retest"
    return {
        "last_lab_test_at": _to_iso(latest_sensor.timestamp if latest_sensor else _utcnow() - timedelta(days=9)),
        "ftk_test_count": ftk_count,
        "contamination_found": contamination_found,
        "safe_after_retest": retest_status == "safe_after_retest",
        "tested_by": "JALERT-linked monitoring and village testing workflow",
        "source_label": "real sensor observations + official-source quality records",
    }


def _derive_source_and_scheme(village: Village, nearby_resources: list[dict[str, Any]]) -> dict[str, Any]:
    source_profiles = []
    for resource in sorted(nearby_resources, key=lambda item: (item.get("distance_km") is None, item.get("distance_km") or 9999))[:3]:
        source_profiles.append(
            {
                "name": resource["name"],
                "source_type": resource["resource_type"],
                "treatment_required": bool((resource.get("water_quality_score") or 100) < 75 or resource["resource_type"] == "surface_water"),
                "treatment_available": resource["resource_type"] == "surface_water" or (resource.get("water_quality_score") or 0) >= 70,
                "supply_route": [resource["name"], f"{village.district} storage point", f"{village.name} distribution line"],
                "coordinate_confidence": resource["coordinate_confidence"],
                "distance_km": resource["distance_km"],
            }
        )

    scheme_profiles = [
        {
            "name": f"{village.name} primary water scheme",
            "scheme_type": "multi_source_rural_supply",
            "service_status": "active" if source_profiles else "limited",
            "treatment_stage": "primary chlorination" if source_profiles else "inspection pending",
            "connected_sources": [item["name"] for item in source_profiles[:2]],
            "official_reference": BHUVAN_MAP_CONFIG["portal_url"],
            "source_label": "derived_from_connected water-resource records",
        },
        {
            "name": f"{village.name} seasonal backup scheme",
            "scheme_type": "backup_distribution",
            "service_status": "seasonal",
            "treatment_stage": "field verification required",
            "connected_sources": [item["name"] for item in source_profiles[1:3]],
            "official_reference": BHUVAN_MAP_CONFIG["wms_url"],
            "source_label": "derived_from_connected water-resource records",
        },
    ]

    return {"sources": source_profiles, "schemes": scheme_profiles}


def _derive_groundwater_season(village: Village) -> dict[str, Any]:
    loaded = _get_cached_groundwater_levels()
    if not loaded:
        return {
            "available": False,
            "message": "Groundwater season data is not available from the connected local official datasets.",
            "official_reference": BHUVAN_MAP_CONFIG["portal_url"],
        }

    frame, _ = loaded
    district_rows = frame[
        (frame["state_name"].astype(str).str.lower() == village.state.lower())
        & (frame["district_name"].astype(str).str.lower().str.contains(village.district.lower(), na=False))
    ].copy()
    if district_rows.empty:
        district_rows = frame[frame["state_name"].astype(str).str.lower() == village.state.lower()].copy()
    if district_rows.empty:
        return {
            "available": False,
            "message": "No groundwater level records matched this village yet.",
            "official_reference": BHUVAN_MAP_CONFIG["portal_url"],
        }

    current_level = float(district_rows["current_level"].dropna().mean()) if district_rows["current_level"].notna().any() else None
    level_diff = float(district_rows["level_diff"].dropna().mean()) if district_rows["level_diff"].notna().any() else 0.0
    pre_monsoon = None if current_level is None else round(current_level - level_diff, 2)
    post_monsoon = None if current_level is None else round(current_level, 2)
    trend = "stable"
    if level_diff > 0.25:
        trend = "rise"
    elif level_diff < -0.25:
        trend = "fall"

    state_rows = frame[frame["state_name"].astype(str).str.lower() == village.state.lower()].copy()
    state_avg = float(state_rows["level_diff"].dropna().mean()) if not state_rows.empty and state_rows["level_diff"].notna().any() else 0.0

    return {
        "available": True,
        "pre_monsoon_level_m": pre_monsoon,
        "post_monsoon_level_m": post_monsoon,
        "level_change_m": round(level_diff, 2),
        "recharge_trend": trend,
        "district_comparison": "above_state_average" if level_diff >= state_avg else "below_state_average",
        "coordinate_confidence": "mixed",
        "official_reference": BHUVAN_MAP_CONFIG["wms_docs"],
    }


def _derive_affordability(village: Village, quality_badge: str, nearby_resources: list[dict[str, Any]]) -> dict[str, Any]:
    tanker_dependency = quality_badge == "water_quality_affected" or len(nearby_resources) < 2
    monthly_spend = 280 if not tanker_dependency else 850
    if village.population > 8000:
        monthly_spend += 120
    support_eligibility = tanker_dependency or monthly_spend >= 800
    return {
        "tanker_dependency": tanker_dependency,
        "monthly_spend_inr": monthly_spend,
        "high_burden": monthly_spend >= 700,
        "support_eligibility": support_eligibility,
        "source_label": "modeled_from village profile, quality risk, and source availability",
        "official_reference": "https://www.unicef.org/reports/measurement-and-monitoring-water-supply-sanitation-and-hygiene-wash-affordability",
    }


def _derive_monsoon_preparedness(
    latest_sensor: SensorReading | None,
    prediction: AIPrediction | None,
    alerts: list[Alert],
    groundwater: dict[str, Any],
) -> dict[str, Any]:
    rainfall = latest_sensor.rainfall_mm if latest_sensor and latest_sensor.rainfall_mm is not None else 0
    flood_level = latest_sensor.flood_level_m if latest_sensor and latest_sensor.flood_level_m is not None else 0
    risk_score = prediction.risk_score if prediction else 40
    preparedness = 74.0
    preparedness -= min(rainfall, 120) * 0.12
    preparedness -= min(flood_level * 18, 20)
    preparedness -= risk_score * 0.15
    if groundwater.get("recharge_trend") == "fall":
        preparedness -= 8
    if any(alert.severity in {AlertSeverity.HIGH, AlertSeverity.CRITICAL} for alert in alerts):
        preparedness -= 10
    preparedness = round(_clamp(preparedness, 18, 96), 1)
    label = "prepared"
    if preparedness < 50:
        label = "needs_attention"
    if preparedness < 35:
        label = "high_risk"
    return {
        "score": preparedness,
        "label": label,
        "advice": (
            "Protect storage tanks, keep chlorination supplies ready, and monitor low-lying sources daily."
            if label != "prepared"
            else "Continue routine monsoon checks and keep alternate drinking-water storage ready."
        ),
    }


def _derive_household_vulnerability(
    coverage: dict[str, Any],
    affordability: dict[str, Any],
    quality_badge: str,
    prediction: AIPrediction | None,
) -> dict[str, Any]:
    vulnerability = 28.0
    vulnerability += max(0, 100 - coverage["tap_coverage_percent"]) * 0.28
    vulnerability += 18 if affordability["high_burden"] else 0
    vulnerability += 14 if affordability["tanker_dependency"] else 0
    vulnerability += 18 if quality_badge == "water_quality_affected" else 6 if quality_badge == "needs_attention" else 0
    vulnerability += (prediction.risk_score if prediction else 30) * 0.2
    vulnerability = round(_clamp(vulnerability, 8, 97), 1)
    return {
        "score": vulnerability,
        "label": "high" if vulnerability >= 70 else "moderate" if vulnerability >= 45 else "low",
        "summary": "Combines water quality, service access, and affordability pressure at household level.",
    }


def _derive_safe_water_route(village: Village, nearby_safe_sources: list[dict[str, Any]]) -> dict[str, Any]:
    if not nearby_safe_sources:
        return {
            "available": False,
            "message": "No nearby safe source could be confirmed from the connected official datasets yet.",
            "map_link": None,
        }

    source = nearby_safe_sources[0]
    if source.get("latitude") is not None and source.get("longitude") is not None:
        destination = f'{source["latitude"]},{source["longitude"]}'
    else:
        destination = f'{source["district_name"]}, {source["state_name"]}'

    return {
        "available": True,
        "source_name": source["name"],
        "distance_km": source.get("distance_km"),
        "message": f'Use {source["name"]} as the first alternate safe source when regular supply looks unsafe.',
        "map_link": f'https://www.google.com/maps/dir/?api=1&origin={village.latitude},{village.longitude}&destination={destination}&travelmode=driving',
    }


def _official_file_matches(*needles: str) -> list[str]:
    patterns = [needle.lower() for needle in needles]
    cache_key = tuple(patterns)
    cached = _cache_lookup(_file_match_cache, cache_key)
    if cached is not None:
        return cached

    matches: list[str] = []
    for path in RAW_DIR.rglob("*"):
        if not path.is_file():
            continue
        normalized = path.name.lower()
        if all(pattern in normalized for pattern in patterns):
            matches.append(str(path))
    return _cache_store(_file_match_cache, cache_key, sorted(matches), _CACHE_TTL_SECONDS["file_scan"])


def _load_local_trust_documents(village: Village) -> list[dict[str, Any]]:
    cache_key = (_normalize_text(village.name), _normalize_text(village.district))
    cached = _cache_lookup(_trust_docs_cache, cache_key)
    if cached is not None:
        return cached

    docs_dir = RAW_DIR.parent / "trust_documents"
    if not docs_dir.exists():
        return []

    village_key = _normalize_text(village.name)
    results: list[dict[str, Any]] = []
    for path in docs_dir.rglob("*"):
        if not path.is_file():
            continue
        normalized = _normalize_text(path.stem)
        if village_key in normalized or _normalize_text(village.district) in normalized:
            results.append(
                {
                    "label": path.stem.replace("_", " ").title(),
                    "type": path.suffix.lstrip(".") or "file",
                    "status": "available",
                    "reference": str(path),
                }
            )
    return _cache_store(_trust_docs_cache, cache_key, results, _CACHE_TTL_SECONDS["trust_documents"])


def _build_bounds_polygon(latitudes: list[float], longitudes: list[float], padding: float = 0.25) -> list[list[float]]:
    min_lat = min(latitudes) - padding
    max_lat = max(latitudes) + padding
    min_lon = min(longitudes) - padding
    max_lon = max(longitudes) + padding
    return [
        [min_lat, min_lon],
        [min_lat, max_lon],
        [max_lat, max_lon],
        [max_lat, min_lon],
    ]


def _derive_family_actions(quality_badge: str, latest_sensor: SensorReading | None, prediction: AIPrediction | None) -> list[str]:
    actions: list[str] = []
    if quality_badge == "water_quality_affected":
        actions.append("Boil or chlorinate drinking water before use.")
        actions.append("Use an alternate safe source for infants, elderly people, and sick family members.")
    if latest_sensor and latest_sensor.ecoli and latest_sensor.ecoli > 0:
        actions.append("Avoid direct use from the affected source until the next clear test arrives.")
    if prediction and prediction.risk_score >= 55:
        actions.append("Report unusual fever, vomiting, or diarrhea early through the health reporting page.")
    actions.append("Check the next testing date and keep one clean storage container reserved for drinking water.")
    return actions[:4]


def _derive_transparency(prediction: AIPrediction | None, latest_sensor: SensorReading | None, nearby_resources: list[dict[str, Any]]) -> dict[str, Any]:
    confidence = 0.52
    if latest_sensor:
        confidence += 0.16
    if prediction and prediction.shap_values and isinstance(prediction.shap_values, dict) and not prediction.shap_values.get("error"):
        confidence += 0.12
    if any(item.get("coordinate_confidence") == "exact" for item in nearby_resources):
        confidence += 0.08
    confidence = round(_clamp(confidence, 0.45, 0.92), 2)
    return {
        "last_sensor_update": _to_iso(latest_sensor.timestamp if latest_sensor else None),
        "last_prediction_update": _to_iso(prediction.created_at if prediction else None),
        "prediction_confidence": confidence,
        "coordinate_accuracy_note": "Exact when dataset coordinates are available, approximate when state or district fallback is used.",
        "government_references": [
            "https://www.data.gov.in/apis/?sector=Water+Resources",
            "https://ejalshakti.gov.in/jjm/citizen_corner/villageinformation.aspx",
            BHUVAN_MAP_CONFIG["portal_url"],
        ],
    }


def _derive_contaminants(latest_sensor: SensorReading | None, nearby_resources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    resource_sample = nearby_resources[:8]
    tds_values = [item["tds"] for item in resource_sample if item.get("tds") is not None]
    return [
        {
            "slug": "arsenic",
            "label": "Arsenic",
            "latest_value": latest_sensor.arsenic if latest_sensor else None,
            "safe_limit": 0.01,
            "status": "needs_attention" if latest_sensor and (latest_sensor.arsenic or 0) > 0.01 else "safe",
            "explanation": "Long-term arsenic exposure can affect skin and internal health.",
        },
        {
            "slug": "fluoride",
            "label": "Fluoride",
            "latest_value": latest_sensor.fluoride if latest_sensor else None,
            "safe_limit": 1.5,
            "status": "needs_attention" if latest_sensor and (latest_sensor.fluoride or 0) > 1.5 else "safe",
            "explanation": "High fluoride can affect teeth and bones over time.",
        },
        {
            "slug": "iron",
            "label": "Iron",
            "latest_value": None,
            "safe_limit": 0.3,
            "status": "integration_ready",
            "explanation": "Iron-specific testing is ready for integration when a direct source is connected.",
        },
        {
            "slug": "nitrate",
            "label": "Nitrate",
            "latest_value": latest_sensor.nitrate if latest_sensor else None,
            "safe_limit": 45.0,
            "status": "needs_attention" if latest_sensor and (latest_sensor.nitrate or 0) > 45 else "safe",
            "explanation": "Elevated nitrate can be risky, especially for infants.",
        },
        {
            "slug": "salinity",
            "label": "Salinity / TDS",
            "latest_value": latest_sensor.tds if latest_sensor else (sum(tds_values) / len(tds_values) if tds_values else None),
            "safe_limit": 500.0,
            "status": "needs_attention" if latest_sensor and (latest_sensor.tds or 0) > 500 else "safe",
            "explanation": "High salinity changes taste and may reduce water acceptability.",
        },
        {
            "slug": "biological",
            "label": "Biological contamination",
            "latest_value": latest_sensor.ecoli if latest_sensor else None,
            "safe_limit": 0.0,
            "status": "needs_attention" if latest_sensor and (latest_sensor.ecoli or 0) > 0 else "safe",
            "explanation": "Any E.coli detection suggests contamination and requires quick action.",
        },
    ]


def _build_timeline(
    latest_sensor: SensorReading | None,
    prediction: AIPrediction | None,
    alerts: list[Alert],
    health_reports: list[HealthReport],
    citizen_requests: list[CitizenRequest],
    testing_summary: dict[str, Any],
) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    if latest_sensor:
        items.append({
            "type": "sensor_update",
            "title": "Latest water reading captured",
            "timestamp": _to_iso(latest_sensor.timestamp),
            "detail": f"Quality score {round(latest_sensor.quality_score or 0, 1)}",
        })
    if prediction:
        items.append({
            "type": "prediction",
            "title": f"AI risk assessed as {prediction.risk_category.value}",
            "timestamp": _to_iso(prediction.created_at),
            "detail": f"Risk score {round(prediction.risk_score, 1)}",
        })
    for alert in alerts[:4]:
        items.append({
            "type": "alert",
            "title": alert.title,
            "timestamp": _to_iso(alert.created_at),
            "detail": alert.severity.value,
        })
    if testing_summary.get("last_lab_test_at"):
        items.append({
            "type": "lab_test",
            "title": "Village water quality testing recorded",
            "timestamp": testing_summary["last_lab_test_at"],
            "detail": "Lab or FTK workflow updated",
        })
    for report in health_reports[:3]:
        items.append({
            "type": "health_report",
            "title": "Community health report submitted",
            "timestamp": _to_iso(report.created_at),
            "detail": report.suspected_disease or "Symptom report",
        })
    for request in citizen_requests[:4]:
        items.append({
            "type": "citizen_request",
            "title": request.category.replace("_", " ").title(),
            "timestamp": _to_iso(request.created_at),
            "detail": request.status.value,
        })
    items.sort(key=lambda item: item["timestamp"] or "", reverse=True)
    return items[:12]


class CitizenRequestService:
    @staticmethod
    async def create_request(data: CitizenRequestCreate, db: AsyncSession, user_id: str | None = None) -> CitizenRequest:
        request = CitizenRequest(
            village_id=data.village_id,
            user_id=user_id,
            reporter_name=data.reporter_name,
            contact_phone=data.contact_phone,
            category=data.category,
            description=data.description,
            severity=data.severity,
            preferred_channel=data.preferred_channel,
        )
        db.add(request)
        await db.flush()
        _profile_cache.pop(data.village_id, None)
        return request

    @staticmethod
    async def list_requests(db: AsyncSession, village_id: str | None = None) -> list[CitizenRequest]:
        query = select(CitizenRequest).order_by(desc(CitizenRequest.created_at))
        if village_id:
            query = query.where(CitizenRequest.village_id == village_id)
        result = await db.execute(query.limit(100))
        return result.scalars().all()

    @staticmethod
    async def update_status(db: AsyncSession, request_id: str, status: CitizenRequestStatus, resolution_notes: str | None = None) -> CitizenRequest:
        result = await db.execute(select(CitizenRequest).where(CitizenRequest.id == request_id))
        request = result.scalar_one_or_none()
        if not request:
            raise HTTPException(status_code=404, detail="Citizen request not found")
        request.status = status
        request.resolution_notes = resolution_notes
        request.updated_at = _utcnow()
        await db.flush()
        _profile_cache.pop(request.village_id, None)
        return request


class VillageIntelligenceService:
    @staticmethod
    async def get_catalog(db: AsyncSession) -> dict[str, Any]:
        cached_catalog = _catalog_cache.get("value")
        if cached_catalog is not None and _catalog_cache["expires_at"] > time.monotonic():
            return cached_catalog

        villages = (
            await db.execute(
                select(Village).where(Village.is_active == True).order_by(Village.state, Village.district, Village.name)
            )
        ).scalars().all()
        grouped: dict[str, dict[str, list[dict[str, Any]]]] = defaultdict(lambda: defaultdict(list))
        for village in villages:
            block_name = f"{village.district} block"
            panchayat_name = f"{village.name.split()[0]} panchayat"
            grouped[village.state][village.district].append(
                {
                    "id": village.id,
                    "name": village.name,
                    "block": block_name,
                    "panchayat": panchayat_name,
                    "latitude": village.latitude,
                    "longitude": village.longitude,
                }
            )

        states = []
        for state_name, districts in grouped.items():
            state_payload = {"name": state_name, "districts": []}
            for district_name, items in districts.items():
                blocks = defaultdict(list)
                for item in items:
                    blocks[item["block"]].append(item)
                district_payload = {"name": district_name, "blocks": []}
                for block_name, villages_in_block in blocks.items():
                    panchayats = defaultdict(list)
                    for item in villages_in_block:
                        panchayats[item["panchayat"]].append({"id": item["id"], "name": item["name"]})
                    district_payload["blocks"].append(
                        {
                            "name": block_name,
                            "panchayats": [
                                {"name": panchayat_name, "villages": villages_payload}
                                for panchayat_name, villages_payload in panchayats.items()
                            ],
                        }
                    )
                state_payload["districts"].append(district_payload)
            states.append(state_payload)
        catalog = {"states": states, "source_label": "drilldown generated from active village registry"}
        _catalog_cache["value"] = catalog
        _catalog_cache["expires_at"] = time.monotonic() + _CACHE_TTL_SECONDS["catalog"]
        return catalog

    @staticmethod
    async def get_profile(village_id: str, db: AsyncSession) -> dict[str, Any]:
        cached_profile = _cache_lookup(_profile_cache, village_id)
        if cached_profile is not None:
            return cached_profile

        village = (await db.execute(select(Village).where(Village.id == village_id))).scalar_one_or_none()
        if not village:
            raise HTTPException(status_code=404, detail="Village not found")

        latest_sensor = (
            await db.execute(
                select(SensorReading).where(SensorReading.village_id == village_id).order_by(desc(SensorReading.timestamp)).limit(1)
            )
        ).scalar_one_or_none()
        sensors = (
            await db.execute(select(Sensor).where(Sensor.village_id == village_id).order_by(Sensor.sensor_code))
        ).scalars().all()
        alerts = (
            await db.execute(
                select(Alert)
                .where(and_(Alert.village_id == village_id, Alert.status == AlertStatus.ACTIVE))
                .order_by(desc(Alert.created_at))
                .limit(6)
            )
        ).scalars().all()
        prediction = (
            await db.execute(
                select(AIPrediction).where(AIPrediction.village_id == village_id).order_by(desc(AIPrediction.created_at)).limit(1)
            )
        ).scalar_one_or_none()
        health_reports = (
            await db.execute(
                select(HealthReport).where(HealthReport.village_id == village_id).order_by(desc(HealthReport.created_at)).limit(10)
            )
        ).scalars().all()
        citizen_requests = (
            await db.execute(
                select(CitizenRequest).where(CitizenRequest.village_id == village_id).order_by(desc(CitizenRequest.created_at)).limit(10)
            )
        ).scalars().all()
        reading_count = await db.scalar(select(func.count(SensorReading.id)).where(SensorReading.village_id == village_id)) or 0

        nearby_resources = _resource_rows_for_village(village)
        quality_badge = _derive_quality_badge(latest_sensor, prediction, alerts)
        coverage = _derive_coverage(village, quality_badge, latest_sensor, nearby_resources)
        iot_monitoring = _derive_iot_monitoring(village, latest_sensor, sensors)
        testing_summary = _derive_testing_summary(village, latest_sensor, int(reading_count), nearby_resources)
        source_scheme = _derive_source_and_scheme(village, nearby_resources)
        groundwater = _derive_groundwater_season(village)
        affordability = _derive_affordability(village, quality_badge, nearby_resources)
        family_actions = _derive_family_actions(quality_badge, latest_sensor, prediction)
        transparency = _derive_transparency(prediction, latest_sensor, nearby_resources)
        contaminants = _derive_contaminants(latest_sensor, nearby_resources)
        monsoon_preparedness = _derive_monsoon_preparedness(latest_sensor, prediction, alerts, groundwater)
        household_vulnerability = _derive_household_vulnerability(coverage, affordability, quality_badge, prediction)
        timeline = _build_timeline(latest_sensor, prediction, alerts, health_reports, citizen_requests, testing_summary)

        nearby_safe_sources = [
            source
            for source in sorted(
                nearby_resources,
                key=lambda item: (item.get("distance_km") is None, item.get("distance_km") or 9999),
            )
            if (source.get("water_quality_score") or 0) >= 75
        ][:5]
        alternate_source = _derive_safe_water_route(village, nearby_safe_sources)

        mapped_contacts = []
        contact_rows = (
            await db.execute(
                select(User)
                .where(
                    and_(
                        User.village_id == village_id,
                        User.role.in_([UserRole.HEALTH_WORKER, UserRole.ADMIN]),
                        User.is_active == True,
                    )
                )
                .order_by(User.role, User.name)
            )
        ).scalars().all()
        for contact in contact_rows:
            mapped_contacts.append(
                {
                    "name": contact.name,
                    "role": contact.role.value,
                    "phone": contact.phone,
                    "email": contact.email,
                    "channel": "call" if contact.phone else "email",
                }
            )
        if not mapped_contacts:
            mapped_contacts.append(
                {
                    "name": "Jal Jeevan Mission citizen portal",
                    "role": "official_reference",
                    "phone": None,
                    "email": None,
                    "channel": "web",
                    "reference_url": "https://ejalshakti.gov.in/jjm/citizen_corner/villageinformation.aspx",
                }
            )

        jjm_files = [*_official_file_matches("jjm"), *_official_file_matches("fhtc")]
        ftk_lab_files = [*_official_file_matches("ftk"), *_official_file_matches("lab")]

        official_ingestion = {
            "jjm_export": {
                "available": bool(jjm_files),
                "files": jjm_files,
                "status": "connected" if jjm_files else "awaiting_export",
            },
            "ftk_lab": {
                "available": bool(ftk_lab_files),
                "files": ftk_lab_files,
                "status": "connected" if ftk_lab_files else "awaiting_dataset",
            },
        }

        local_trust_documents = _load_local_trust_documents(village)
        trust_documents = {
            "official_references": [
                {
                    "label": "JJM citizen village information",
                    "url": "https://ejalshakti.gov.in/jjm/citizen_corner/villageinformation.aspx",
                    "availability": "official_reference",
                },
                {
                    "label": "Bhuvan groundwater portal",
                    "url": BHUVAN_MAP_CONFIG["portal_url"],
                    "availability": "official_reference",
                },
                {
                    "label": "OGD India water resources APIs",
                    "url": "https://www.data.gov.in/apis/?sector=Water+Resources",
                    "availability": "official_reference",
                },
            ],
            "local_documents": [
                {
                    "label": "Village sensor inventory dataset",
                    "type": "dataset",
                    "status": "available",
                    "reference": "generated from active JALERT sensor network",
                },
                {
                    "label": "Gram sabha resolution / declaration video / certificate links",
                    "type": "trust_documents",
                    "status": "available" if local_trust_documents else "integration_ready",
                    "reference": "local trust-document library connected" if local_trust_documents else "public direct URLs are not exposed by the connected official portals",
                },
                *local_trust_documents,
            ],
        }

        profile = {
            "village": {
                "id": village.id,
                "name": village.name,
                "district": village.district,
                "state": village.state,
                "population": village.population,
                "latitude": village.latitude,
                "longitude": village.longitude,
                "quality_badge": quality_badge,
                "quality_badge_label": quality_badge.replace("_", " ").title(),
            },
            "drilldown": {
                "state": village.state,
                "district": village.district,
                "block": f"{village.district} block",
                "panchayat": f"{village.name.split()[0]} panchayat",
                "source_label": "derived from active village registry",
            },
            "coverage": coverage,
            "iot_monitoring": iot_monitoring,
            "testing_summary": testing_summary,
            "source_scheme": source_scheme,
            "groundwater": groundwater,
            "affordability": affordability,
            "family_actions": family_actions,
            "contaminants": contaminants,
            "nearby_safe_sources": nearby_safe_sources,
            "alternate_source": alternate_source,
            "monsoon_preparedness": monsoon_preparedness,
            "household_vulnerability": household_vulnerability,
            "mapped_contacts": mapped_contacts,
            "official_ingestion": official_ingestion,
            "timeline": timeline,
            "trust_documents": trust_documents,
            "transparency": transparency,
        }
        return _cache_store(_profile_cache, village_id, profile, _CACHE_TTL_SECONDS["profile"])

    @staticmethod
    async def compare_villages(village_ids: Iterable[str], db: AsyncSession) -> dict[str, Any]:
        ids = [item for item in dict.fromkeys(village_ids) if item]
        if len(ids) < 2:
            raise HTTPException(status_code=400, detail="At least two villages are required for comparison")

        villages = (
            await db.execute(select(Village).where(Village.id.in_(ids)).order_by(Village.state, Village.district, Village.name))
        ).scalars().all()
        comparison_rows = []
        for village in villages:
            latest_sensor = (
                await db.execute(
                    select(SensorReading).where(SensorReading.village_id == village.id).order_by(desc(SensorReading.timestamp)).limit(1)
                )
            ).scalar_one_or_none()
            prediction = (
                await db.execute(
                    select(AIPrediction).where(AIPrediction.village_id == village.id).order_by(desc(AIPrediction.created_at)).limit(1)
                )
            ).scalar_one_or_none()
            alert_count = await db.scalar(
                select(func.count(Alert.id)).where(and_(Alert.village_id == village.id, Alert.status == AlertStatus.ACTIVE))
            ) or 0
            comparison_rows.append(
                {
                    "id": village.id,
                    "name": village.name,
                    "district": village.district,
                    "state": village.state,
                    "population": village.population,
                    "quality_score": latest_sensor.quality_score if latest_sensor else None,
                    "risk_score": prediction.risk_score if prediction else None,
                    "risk_category": prediction.risk_category.value if prediction else "unknown",
                    "alert_count": alert_count,
                    "sensor_uptime": "stable" if latest_sensor else "limited",
                }
            )
        return {"villages": comparison_rows}

    @staticmethod
    async def get_map_overview(
        db: AsyncSession,
        state: str | None = None,
        district: str | None = None,
        contaminant: str | None = None,
        season: str = "post_monsoon",
    ) -> dict[str, Any]:
        cache_key = (
            (state or "").lower(),
            (district or "").lower(),
            (contaminant or "").lower(),
            season.lower(),
        )
        cached_overview = _cache_lookup(_map_overview_cache, cache_key)
        if cached_overview is not None:
            return cached_overview

        villages = (
            await db.execute(select(Village).where(Village.is_active == True).order_by(Village.state, Village.district, Village.name))
        ).scalars().all()

        if state:
            villages = [village for village in villages if village.state.lower() == state.lower()]
        if district:
            villages = [village for village in villages if district.lower() in village.district.lower()]

        if not villages:
            return {
                "states": [],
                "districts": [],
                "villages": [],
                "clusters": [],
                "legend": {
                    "risk": ["low", "moderate", "high"],
                    "source_types": ["groundwater", "surface_water", "groundwater_level_station"],
                    "confidence": ["exact", "approximate"],
                },
                "season": season,
            }

        village_ids = [village.id for village in villages]
        latest_readings = (
            await db.execute(
                select(SensorReading)
                .where(SensorReading.village_id.in_(village_ids))
                .order_by(SensorReading.village_id, desc(SensorReading.timestamp))
            )
        ).scalars().all()
        latest_by_village: dict[str, SensorReading] = {}
        for reading in latest_readings:
            latest_by_village.setdefault(reading.village_id, reading)

        latest_predictions = (
            await db.execute(
                select(AIPrediction)
                .where(AIPrediction.village_id.in_(village_ids))
                .order_by(AIPrediction.village_id, desc(AIPrediction.created_at))
            )
        ).scalars().all()
        prediction_by_village: dict[str, AIPrediction] = {}
        for prediction in latest_predictions:
            prediction_by_village.setdefault(prediction.village_id, prediction)

        groundwater_loaded = _get_cached_groundwater_levels()
        groundwater_frame = groundwater_loaded[0] if groundwater_loaded else pd.DataFrame()

        state_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
        district_groups: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
        village_payload: list[dict[str, Any]] = []

        for village in villages:
            latest_sensor = latest_by_village.get(village.id)
            prediction = prediction_by_village.get(village.id)
            resources = _resource_rows_for_village(village)
            contaminants = _derive_contaminants(latest_sensor, resources)
            contaminant_statuses = {item["slug"]: item["status"] for item in contaminants}
            if contaminant and contaminant_statuses.get(contaminant) not in {"safe", "needs_attention"}:
                continue

            quality_badge = _derive_quality_badge(latest_sensor, prediction, [])
            risk_score = prediction.risk_score if prediction else (100 - (latest_sensor.quality_score or 65) if latest_sensor else 42)
            groundwater_note = "approximate"
            season_level = None
            if not groundwater_frame.empty:
                district_rows = groundwater_frame[
                    (groundwater_frame["state_name"].astype(str).str.lower() == village.state.lower())
                    & (groundwater_frame["district_name"].astype(str).str.lower().str.contains(village.district.lower(), na=False))
                ]
                if not district_rows.empty:
                    avg_current = district_rows["current_level"].dropna().mean() if district_rows["current_level"].notna().any() else None
                    avg_diff = district_rows["level_diff"].dropna().mean() if district_rows["level_diff"].notna().any() else 0
                    if avg_current is not None:
                        season_level = float(avg_current if season == "post_monsoon" else avg_current - avg_diff)
                        groundwater_note = "mixed"

            village_item = {
                "id": village.id,
                "name": village.name,
                "district": village.district,
                "state": village.state,
                "panchayat": f"{village.name.split()[0]} panchayat",
                "latitude": village.latitude,
                "longitude": village.longitude,
                "risk_score": round(float(risk_score), 1),
                "risk_category": prediction.risk_category.value if prediction else "moderate" if risk_score >= 45 else "low",
                "quality_badge": quality_badge,
                "quality_score": latest_sensor.quality_score if latest_sensor else None,
                "contaminants": contaminant_statuses,
                "source_count": len(resources),
                "safe_source_count": len([item for item in resources if (item.get("water_quality_score") or 0) >= 75]),
                "coordinate_confidence": "exact",
                "groundwater_level_m": round(season_level, 2) if season_level is not None else None,
                "groundwater_accuracy": groundwater_note,
            }
            village_payload.append(village_item)
            state_groups[village.state].append(village_item)
            district_groups[(village.state, village.district)].append(village_item)

        state_payload = []
        for state_name, items in state_groups.items():
            lats = [item["latitude"] for item in items]
            lons = [item["longitude"] for item in items]
            state_payload.append(
                {
                    "name": state_name,
                    "village_count": len(items),
                    "risk_score": round(sum(item["risk_score"] for item in items) / max(len(items), 1), 1),
                    "polygon": _build_bounds_polygon(lats, lons, 0.55),
                    "center": [round(sum(lats) / len(lats), 4), round(sum(lons) / len(lons), 4)],
                }
            )

        district_payload = []
        for (state_name, district_name), items in district_groups.items():
            lats = [item["latitude"] for item in items]
            lons = [item["longitude"] for item in items]
            district_payload.append(
                {
                    "state": state_name,
                    "name": district_name,
                    "village_count": len(items),
                    "risk_score": round(sum(item["risk_score"] for item in items) / max(len(items), 1), 1),
                    "polygon": _build_bounds_polygon(lats, lons, 0.22),
                    "center": [round(sum(lats) / len(lats), 4), round(sum(lons) / len(lons), 4)],
                }
            )

        clusters = []
        cluster_source = district_payload if state else state_payload
        for item in cluster_source:
            clusters.append(
                {
                    "key": f'{item.get("state", item["name"])}-{item["name"]}',
                    "label": item["name"],
                    "count": item["village_count"],
                    "risk_score": item["risk_score"],
                    "center": item["center"],
                    "level": "district" if state else "state",
                }
            )

        overview = {
            "states": state_payload,
            "districts": district_payload,
            "villages": village_payload,
            "clusters": clusters,
            "legend": {
                "risk": ["low", "moderate", "high"],
                "source_types": ["groundwater", "surface_water", "groundwater_level_station"],
                "confidence": ["exact", "approximate", "mixed"],
            },
            "season": season,
            "contaminant": contaminant or "all",
        }
        return _cache_store(_map_overview_cache, cache_key, overview, _CACHE_TTL_SECONDS["map_overview"])
