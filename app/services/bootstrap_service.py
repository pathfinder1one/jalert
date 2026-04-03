"""
JALERT - Local bootstrap helpers
Seeds a realistic village list for local development from official-style
groundwater monitoring datasets.
"""
from __future__ import annotations

import math
import re
from pathlib import Path
from typing import Any

import pandas as pd
from loguru import logger
from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from datetime import datetime, timedelta, timezone

from app.models.user import Sensor, SensorReading, SensorStatus, Village


MAX_BOOTSTRAP_VILLAGES = 300
SYNTHETIC_VILLAGE_PATTERN = re.compile(r"^village[_\-\s]*\d+$", re.IGNORECASE)
CODE_LIKE_NAME_PATTERN = re.compile(r"^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z0-9_-]{5,}$")


def _clean_text(value: Any) -> str:
    return re.sub(r"\s+", " ", "" if value is None else str(value)).strip(" ,")


def _title_case(value: Any) -> str:
    text = _clean_text(value)
    if not text:
        return ""
    return " ".join(part.capitalize() for part in text.lower().split())


def _clean_village_name(value: Any) -> str:
    text = _title_case(value)
    if not text:
        return ""
    text = re.sub(r"\s*\([^)]*\)$", "", text).strip()
    text = re.sub(r"-[a-z]{1,3}$", "", text, flags=re.IGNORECASE).strip()
    text = re.sub(r"\s+[a-z0-9]*\d[a-z0-9]*$", "", text, flags=re.IGNORECASE).strip()
    text = re.sub(r"(?<=\D)\d+$", "", text).strip()
    return text.strip(" ,-")


def _is_synthetic_village_name(name: str) -> bool:
    return bool(SYNTHETIC_VILLAGE_PATTERN.match(_clean_text(name)))


def _is_code_like_name(name: str) -> bool:
    text = _clean_text(name)
    return bool(CODE_LIKE_NAME_PATTERN.match(text))


def _groundwater_level_paths() -> list[Path]:
    return [
        Path(settings.OGD_RAW_DIR) / "cgwb_water_level" / "cgwb-changes-in-depth-to-water-level.csv",
        Path(settings.OGD_RAW_DIR)
        / "state_water_level"
        / "state-groundwater-boards-changes-in-depth-to-water-level.csv",
    ]


def _legacy_village_seed_path() -> Path:
    candidates = [
        Path(settings.OGD_RAW_DIR) / "village_water_quality_50000.csv",
        Path(settings.OGD_RAW_DIR) / "village_quality" / "village_water_quality_50000.csv",
    ]
    for path in candidates:
        if path.exists():
            return path
    return candidates[0]


def _deterministic_population(seed: int) -> int:
    return 1200 + ((seed * 173) % 8200)


def _deterministic_float(seed: int, lower: float, upper: float, precision: int = 2) -> float:
    span = upper - lower
    value = lower + (((seed * 97) % 1000) / 1000) * span
    return round(value, precision)


def _balanced_slice(candidates: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for candidate in candidates:
        grouped.setdefault(candidate["state"], []).append(candidate)

    state_names = sorted(grouped)
    if not state_names:
        return []

    per_state = max(1, math.ceil(limit / len(state_names)))
    selected: list[dict[str, Any]] = []
    used_keys: set[tuple[str, str, str]] = set()

    for state_name in state_names:
        for candidate in grouped[state_name][:per_state]:
            key = (
                candidate["name"].lower(),
                candidate["district"].lower(),
                candidate["state"].lower(),
            )
            if key in used_keys:
                continue
            selected.append(candidate)
            used_keys.add(key)
            if len(selected) >= limit:
                return selected

    for state_name in state_names:
        for candidate in grouped[state_name][per_state:]:
            key = (
                candidate["name"].lower(),
                candidate["district"].lower(),
                candidate["state"].lower(),
            )
            if key in used_keys:
                continue
            selected.append(candidate)
            used_keys.add(key)
            if len(selected) >= limit:
                return selected

    return selected


def _load_real_village_candidates() -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str]] = set()

    for path in _groundwater_level_paths():
        if not path.exists():
            continue

        raw = pd.read_csv(path, low_memory=False)
        required_columns = {
            "station_name",
            "district_name",
            "state_name",
            "latitude",
            "longitude",
        }
        if not required_columns.issubset(raw.columns):
            continue

        grouped = (
            raw[list(required_columns)]
            .dropna(subset=["station_name", "district_name", "state_name", "latitude", "longitude"])
            .groupby(["station_name", "district_name", "state_name"], as_index=False)
            .agg(latitude=("latitude", "median"), longitude=("longitude", "median"))
            .sort_values(["state_name", "district_name", "station_name"])
        )

        for row in grouped.itertuples(index=False):
            name = _clean_village_name(row.station_name)
            district = _title_case(row.district_name)
            state = _title_case(row.state_name)
            if not name or not district or not state:
                continue
            if _is_synthetic_village_name(name) or _is_code_like_name(name):
                continue

            key = (name.lower(), district.lower(), state.lower())
            if key in seen:
                continue

            seen.add(key)
            candidates.append(
                {
                    "name": name,
                    "district": district,
                    "state": state,
                    "latitude": round(float(row.latitude), 6),
                    "longitude": round(float(row.longitude), 6),
                }
            )

    return _balanced_slice(candidates, MAX_BOOTSTRAP_VILLAGES)


def _load_legacy_village_candidates() -> list[dict[str, Any]]:
    seed_path = _legacy_village_seed_path()
    if not seed_path.exists():
        return []

    df = pd.read_csv(seed_path, low_memory=False).rename(
        columns={
            "Village": "name",
            "District": "district",
            "State": "state",
        }
    )
    required = {"name", "district", "state"}
    if not required.issubset(df.columns):
        return []

    villages = (
        df[["name", "district", "state"]]
        .dropna()
        .drop_duplicates()
        .head(MAX_BOOTSTRAP_VILLAGES)
        .reset_index(drop=True)
    )

    candidates: list[dict[str, Any]] = []
    for idx, row in villages.iterrows():
        candidates.append(
            {
                "name": _title_case(row["name"]),
                "district": _title_case(row["district"]),
                "state": _title_case(row["state"]),
                "latitude": round(8.0 + ((idx * 37) % 1000) / 1000 * (35.0 - 8.0), 6),
                "longitude": round(68.0 + ((idx * 53) % 1000) / 1000 * (97.0 - 68.0), 6),
            }
        )
    return candidates


def _build_village_candidates() -> list[dict[str, Any]]:
    real_candidates = _load_real_village_candidates()
    if real_candidates:
        logger.info(
            "Prepared {} real village candidates from groundwater datasets",
            len(real_candidates),
        )
        return real_candidates

    legacy_candidates = _load_legacy_village_candidates()
    if legacy_candidates:
        logger.warning("Falling back to legacy village dataset because real groundwater candidates were unavailable")
    return legacy_candidates


async def seed_villages_if_empty() -> int:
    candidates = _build_village_candidates()
    if not candidates:
        logger.info("Village bootstrap skipped: no usable local datasets found")
        return 0

    async with AsyncSessionLocal() as session:
        existing_villages = (
            await session.scalars(select(Village).order_by(Village.created_at, Village.name))
        ).all()

        real_existing_keys = {
            (village.name.lower(), village.district.lower(), village.state.lower())
            for village in existing_villages
            if not _is_synthetic_village_name(village.name)
        }
        available_candidates = [
            candidate
            for candidate in candidates
            if (
                candidate["name"].lower(),
                candidate["district"].lower(),
                candidate["state"].lower(),
            )
            not in real_existing_keys
        ]

        updated = 0
        created = 0
        normalized = 0
        synthetic_villages = [
            village for village in existing_villages if _is_synthetic_village_name(village.name)
        ]

        for village in existing_villages:
            cleaned_name = _clean_village_name(village.name)
            if cleaned_name and cleaned_name != village.name:
                village.name = cleaned_name
                normalized += 1

        for village, candidate in zip(synthetic_villages, available_candidates):
            village.name = candidate["name"]
            village.district = candidate["district"]
            village.state = candidate["state"]
            village.latitude = candidate["latitude"]
            village.longitude = candidate["longitude"]
            if not village.population:
                village.population = _deterministic_population(updated + 1)
            village.is_active = True
            updated += 1

        used_candidates = updated
        current_total = len(existing_villages)
        remaining_slots = max(0, MAX_BOOTSTRAP_VILLAGES - current_total)

        for idx, candidate in enumerate(
            available_candidates[used_candidates : used_candidates + remaining_slots],
            start=used_candidates + 1,
        ):
            session.add(
                Village(
                    name=candidate["name"],
                    district=candidate["district"],
                    state=candidate["state"],
                    latitude=candidate["latitude"],
                    longitude=candidate["longitude"],
                    population=_deterministic_population(idx),
                    pincode=None,
                    is_active=True,
                )
            )
            created += 1

        if updated or created or normalized:
            await session.commit()
            logger.info(
                "Village bootstrap refreshed {} synthetic rows, normalized {} names, and created {} real villages",
                updated,
                normalized,
                created,
            )

        return updated + created + normalized


async def seed_sensor_network_if_empty() -> int:
    async with AsyncSessionLocal() as session:
        existing_sensor = await session.scalar(select(Sensor.id).limit(1))
        if existing_sensor:
            return 0

        villages = (
            await session.scalars(select(Village).order_by(Village.state, Village.district, Village.name))
        ).all()
        if not villages:
            logger.info("Sensor bootstrap skipped because no villages are available yet")
            return 0

        now = datetime.now(timezone.utc)
        sensors_created = 0
        readings_created = 0

        for index, village in enumerate(villages[:MAX_BOOTSTRAP_VILLAGES], start=1):
            sensor = Sensor(
                village_id=village.id,
                sensor_code=f"JAL-{index:04d}",
                sensor_type="water_quality",
                location_name=f"{village.name} monitoring point",
                latitude=village.latitude,
                longitude=village.longitude,
                status=SensorStatus.ACTIVE,
                firmware_version="1.0.0",
                last_seen=now,
            )
            session.add(sensor)
            await session.flush()
            sensors_created += 1

            for step in range(12):
                seed = index * 31 + step
                timestamp = now - timedelta(hours=(11 - step) * 4)
                ph = _deterministic_float(seed, 6.7, 8.4)
                turbidity = _deterministic_float(seed + 3, 0.4, 6.5)
                ecoli = round(_deterministic_float(seed + 5, 0, 4.5), 1)
                tds = _deterministic_float(seed + 7, 180, 720)
                nitrate = _deterministic_float(seed + 11, 2, 42)
                arsenic = round(_deterministic_float(seed + 13, 0.0, 0.012, 4), 4)
                fluoride = round(_deterministic_float(seed + 17, 0.2, 1.6, 3), 3)
                rainfall = _deterministic_float(seed + 19, 0, 22)
                humidity = _deterministic_float(seed + 23, 48, 88)
                quality_score = max(
                    45.0,
                    100
                    - max(0, turbidity - 4) * 6
                    - ecoli * 4
                    - max(0, tds - 500) / 20
                    - max(0, nitrate - 35),
                )

                session.add(
                    SensorReading(
                        sensor_id=sensor.id,
                        village_id=village.id,
                        timestamp=timestamp,
                        ph=ph,
                        turbidity=turbidity,
                        ecoli=ecoli,
                        tds=tds,
                        temperature=_deterministic_float(seed + 29, 23, 34),
                        dissolved_oxygen=_deterministic_float(seed + 31, 4.8, 8.2),
                        nitrate=nitrate,
                        arsenic=arsenic,
                        fluoride=fluoride,
                        rainfall_mm=rainfall,
                        flood_level_m=round(_deterministic_float(seed + 37, 0, 0.8, 3), 3),
                        humidity=humidity,
                        air_temp=_deterministic_float(seed + 41, 22, 37),
                        is_anomaly=bool(ecoli > 3.5 or turbidity > 5.5),
                        quality_score=round(quality_score, 2),
                        raw_payload={"bootstrap": True, "village": village.name},
                    )
                )
                readings_created += 1

        await session.commit()
        logger.info(
            "Sensor bootstrap created {} sensors and {} recent readings",
            sensors_created,
            readings_created,
        )
        return sensors_created
