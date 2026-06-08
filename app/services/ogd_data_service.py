"""
JALERT - Official water data integration
"""
from __future__ import annotations

import asyncio
import re
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np
import pandas as pd
from loguru import logger

from app.core.config import settings


RAW_DIR = Path(settings.OGD_RAW_DIR)
PROCESSED_DIR = Path(settings.OGD_PROCESSED_DIR)
RAW_DIR.mkdir(parents=True, exist_ok=True)
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)


PUBLIC_DATASETS = [
    {
        "key": "surface_water_quality",
        "source_group": "ogd",
        "title": "Surface water quality",
        "purpose": "Water-quality model training",
        "official_pages": [
            "https://services.india.gov.in/service/detail/browse-and-download-datasets-from-open-government-data-platform-ogd-india",
            "https://ap.data.gov.in/catalog/status-water-quality-india-2008-and-2011",
        ],
        "filename_hints": ["water_data"],
    },
    {
        "key": "village_water_quality",
        "source_group": "local_official_style",
        "title": "Village water quality",
        "purpose": "Village-level water-quality training",
        "official_pages": [],
        "filename_hints": ["village_water_quality"],
    },
    {
        "key": "groundwater_quality",
        "source_group": "ogd",
        "title": "Groundwater quality yearly tables",
        "purpose": "Water-quality enrichment",
        "official_pages": [
            "https://www.data.gov.in/keywords/Ground%20Water%20Level",
            "https://www.data.gov.in/catalog/ground-water-level-data-under-atal-bhujal-yojana",
        ],
        "filename_hints": ["ground", "water"],
    },
    {
        "key": "groundwater_level_changes",
        "source_group": "ogd",
        "title": "Groundwater level changes",
        "purpose": "Disease-risk proxy training and water-resource discovery",
        "official_pages": [
            "https://www.data.gov.in/apis/?sector=Water+Resources",
            "https://www.data.gov.in/catalog/ground-water-level-data-under-atal-bhujal-yojana",
        ],
        "filename_hints": ["water", "level"],
    },
    {
        "key": "jjm_reports",
        "source_group": "jjm",
        "title": "Jal Jeevan Mission reports",
        "purpose": "Future drinking-water service enrichment",
        "official_pages": [
            "https://ejalshakti.gov.in/",
            "https://ejalshakti.gov.in/jjm/JJMReports/profiles/rpt_VillageProfile.aspx",
            "https://ejalshakti.gov.in/JJM/JJMReports/Physical/JJMRep_VillageWiseFHTCCoverage.aspx",
            "https://ejalshakti.gov.in/JJM/JJMReports/Physical/JJMRep_HarGharJalVillage.aspx",
        ],
        "filename_hints": ["fhtc"],
    },
    {
        "key": "bhuvan_maps",
        "source_group": "bhuvan",
        "title": "Bhuvan groundwater map services",
        "purpose": "Public map integration",
        "official_pages": [
            "https://bhuvan-app1.nrsc.gov.in/gwis/gwis.php",
            "https://bhuvan-vec2.nrsc.gov.in/bhuvan/wms",
            "https://bhuvan.nrsc.gov.in/wiki/index.php/Information_for_Developers",
            "https://bhuvan.nrsc.gov.in/wiki/index.php/How_to_use_WMS_services",
        ],
        "filename_hints": ["bhuvan"],
    },
]


BHUVAN_MAP_CONFIG = {
    "portal_url": "https://bhuvan-app1.nrsc.gov.in/gwis/gwis.php",
    "wms_url": "https://bhuvan-vec2.nrsc.gov.in/bhuvan/wms",
    "developer_docs": "https://bhuvan.nrsc.gov.in/wiki/index.php/Information_for_Developers",
    "wms_docs": "https://bhuvan.nrsc.gov.in/wiki/index.php/How_to_use_WMS_services",
}

_OFFICIAL_WATER_OBSERVATIONS_CACHE: Optional[Tuple[pd.DataFrame, Dict[str, List[str]]]] = None
_GROUNDWATER_LEVEL_CACHE: Optional[Tuple[pd.DataFrame, List[str]]] = None
_PUBLIC_RESOURCES_CACHE: Optional[Dict[str, Any]] = None
_PUBLIC_RESOURCES_CACHE_LOCK = threading.Lock()
_PUBLIC_RESOURCES_CACHE_WARMING = False

STATE_NAME_MAP = {
    "andhra_pradesh": "Andhra Pradesh",
    "arunachal_pradesh": "Arunachal Pradesh",
    "assam": "Assam",
    "bihar": "Bihar",
    "chhattisgarh": "Chhattisgarh",
    "goa": "Goa",
    "gujarat": "Gujarat",
    "haryana": "Haryana",
    "himachal_pradesh": "Himachal Pradesh",
    "jharkhand": "Jharkhand",
    "karnataka": "Karnataka",
    "kerala": "Kerala",
    "madhya_pradesh": "Madhya Pradesh",
    "maharashtra": "Maharashtra",
    "manipur": "Manipur",
    "meghalaya": "Meghalaya",
    "mizoram": "Mizoram",
    "nagaland": "Nagaland",
    "odisha": "Odisha",
    "orissa": "Odisha",
    "punjab": "Punjab",
    "rajasthan": "Rajasthan",
    "sikkim": "Sikkim",
    "tamil_nadu": "Tamil Nadu",
    "tamilnadu": "Tamil Nadu",
    "telangana": "Telangana",
    "tripura": "Tripura",
    "uttar_pradesh": "Uttar Pradesh",
    "uttarakhand": "Uttarakhand",
    "uttrakhand": "Uttarakhand",
    "west_bengal": "West Bengal",
    "andaman_and_nicobar_islands": "Andaman And Nicobar Islands",
    "chandigarh": "Chandigarh",
    "dadra_and_nagar_haveli": "Dadra And Nagar Haveli",
    "daman_and_diu": "Daman And Diu",
    "delhi": "Delhi",
    "jammu_and_kashmir": "Jammu And Kashmir",
    "ladakh": "Ladakh",
    "lakshadweep": "Lakshadweep",
    "puducherry": "Puducherry",
    "pondicherry": "Puducherry",
}


def _normalize_text(value: Any) -> str:
    text = "" if value is None else str(value).strip().lower()
    return re.sub(r"[^a-z0-9]+", "_", text).strip("_")


def _clean_text(value: Any) -> str:
    return re.sub(r"\s+", " ", "" if value is None else str(value)).strip(" ,")


def _is_synthetic_resource_name(value: Any) -> bool:
    text = _clean_text(value)
    return bool(re.match(r"^Village[_\-\s]*\d+$", text, flags=re.IGNORECASE))


def _canonicalize_state_name(value: Any, fallback: Any = None) -> str:
    candidates = [_clean_text(value), _clean_text(fallback)]
    for candidate in candidates:
        normalized = _normalize_text(candidate)
        if normalized in STATE_NAME_MAP:
            return STATE_NAME_MAP[normalized]
        for state_key, display_name in STATE_NAME_MAP.items():
            if state_key and state_key in normalized:
                return display_name
    return ""


def _coerce_numeric(series: Optional[pd.Series]) -> pd.Series:
    if series is None:
        return pd.Series(dtype=float)
    return pd.to_numeric(series.astype(str).str.replace(",", "", regex=False).str.strip(), errors="coerce")


def _match_column(columns: Sequence[str], *token_groups: Sequence[str]) -> Optional[str]:
    normalized = [_normalize_text(column) for column in columns]
    for tokens in token_groups:
        token_set = tuple(_normalize_text(token) for token in tokens if token)
        for idx, column in enumerate(normalized):
            if all(token in column for token in token_set):
                return columns[idx]
    return None


def _find_matching_files(hints: Sequence[str], allow_extensions: Optional[set[str]] = None) -> List[Path]:
    extensions = allow_extensions or {".csv", ".tsv", ".xls", ".xlsx"}
    matches: List[Path] = []
    normalized_hints = tuple(_normalize_text(hint) for hint in hints)
    for path in RAW_DIR.rglob("*"):
        if path.is_file() and path.suffix.lower() in extensions:
            stem = _normalize_text(path.stem)
            if all(hint in stem for hint in normalized_hints):
                matches.append(path)
    return sorted(matches)


def _read_table(path: Path) -> pd.DataFrame:
    if path.suffix.lower() == ".csv":
        last_error: Optional[Exception] = None
        for encoding in ("utf-8-sig", "utf-8", "latin-1", "cp1252"):
            try:
                return pd.read_csv(path, encoding=encoding, low_memory=False)
            except Exception as exc:
                last_error = exc
        if last_error:
            raise last_error
    if path.suffix.lower() == ".tsv":
        return pd.read_csv(path, sep="\t", low_memory=False)
    return pd.read_excel(path)


def _save_processed_frame(df: pd.DataFrame, filename: str) -> str:
    output_path = PROCESSED_DIR / filename
    df.to_csv(output_path, index=False)
    return str(output_path)


def _water_quality_score(row: pd.Series) -> float:
    penalty = 0.0
    ph = row.get("ph")
    tds = row.get("tds")
    turbidity = row.get("turbidity")
    ecoli = row.get("ecoli")
    nitrate = row.get("nitrate")
    arsenic = row.get("arsenic")
    fluoride = row.get("fluoride")
    if pd.notna(ph) and (ph < settings.PH_MIN or ph > settings.PH_MAX):
        penalty += 15
    if pd.notna(tds) and tds > settings.TDS_MAX:
        penalty += 15
    if pd.notna(turbidity) and turbidity > settings.TURBIDITY_MAX:
        penalty += 15
    if pd.notna(ecoli) and ecoli > settings.ECOLI_MAX:
        penalty += 30
    if pd.notna(nitrate) and nitrate > settings.NITRATE_MAX:
        penalty += 10
    if pd.notna(arsenic) and arsenic > settings.ARSENIC_MAX:
        penalty += 10
    if pd.notna(fluoride) and fluoride > settings.FLUORIDE_MAX:
        penalty += 5
    return max(0.0, 100.0 - penalty)


def _water_quality_label(row: pd.Series) -> int:
    if row.get("quality_status") == "unsafe":
        return 2
    score = _water_quality_score(row)
    if score < 45:
        return 2
    if score < 70:
        return 1
    return 0


def _load_village_water_quality() -> Optional[Tuple[pd.DataFrame, List[str]]]:
    files = _find_matching_files(("village_water_quality",))
    if not files:
        return None

    frames: List[pd.DataFrame] = []
    for path in files:
        raw = _read_table(path)
        raw.columns = [_normalize_text(column) for column in raw.columns]
        frame = pd.DataFrame({
            "resource_id": raw.get("village_id", raw.index.astype(str)).astype(str),
            "name": raw.get("village", raw.index.astype(str)).map(_clean_text),
            "state_name": raw.get("state", "").map(_canonicalize_state_name),
            "district_name": raw.get("district", "").astype(str).str.strip().str.title(),
            "district_key": raw.get("district", "").map(_normalize_text),
            "resource_type": raw.get("water_source", "groundwater").astype(str).str.strip().str.lower(),
            "source_dataset": path.name,
            "observation_year": np.nan,
            "temperature": np.nan,
            "dissolved_oxygen": np.nan,
            "ph": _coerce_numeric(raw.get("ph")),
            "tds": _coerce_numeric(raw.get("tds")),
            "turbidity": (_coerce_numeric(raw.get("hardness")) / 100).clip(lower=0),
            "ecoli": np.nan,
            "nitrate": np.nan,
            "arsenic": _coerce_numeric(raw.get("arsenic")),
            "fluoride": _coerce_numeric(raw.get("fluoride")),
            "quality_status": raw.get("quality_status", "").astype(str).str.strip().str.lower(),
            "latitude": np.nan,
            "longitude": np.nan,
        })
        frames.append(frame)

    df = pd.concat(frames, ignore_index=True)
    df["water_quality_score"] = df.apply(_water_quality_score, axis=1)
    return df, [str(path) for path in files]


def _load_surface_water_quality() -> Optional[Tuple[pd.DataFrame, List[str]]]:
    files = _find_matching_files(("water_data",))
    if not files:
        return None

    frames: List[pd.DataFrame] = []
    for path in files:
        raw = _read_table(path)
        original_cols = list(raw.columns)
        raw.columns = [_normalize_text(column) for column in original_cols]
        cols = list(raw.columns)
        location_col = _match_column(cols, ("locations",), ("location",))
        state_col = _match_column(cols, ("state",))
        temp_col = _match_column(cols, ("temp",), ("temperature",))
        do_col = _match_column(cols, ("d", "o"), ("dissolved", "oxygen"))
        ph_col = _match_column(cols, ("ph",))
        conductivity_col = _match_column(cols, ("conductivity",))
        bod_col = _match_column(cols, ("b", "o", "d"), ("bod",))
        nitrate_col = _match_column(cols, ("nitrate",))
        fecal_col = _match_column(cols, ("fecal", "coliform"), ("faecal", "coliform"))
        total_coliform_col = _match_column(cols, ("total", "coliform"))
        year_col = _match_column(cols, ("year",))
        code_col = _match_column(cols, ("station", "code"), ("code",))
        if not location_col or not state_col or not ph_col:
            continue

        conductivity = _coerce_numeric(raw.get(conductivity_col))
        fecal = _coerce_numeric(raw.get(fecal_col))
        total_coliform = _coerce_numeric(raw.get(total_coliform_col))
        frame = pd.DataFrame({
            "resource_id": raw.get(code_col, raw.index.astype(str)).astype(str),
            "name": raw.get(location_col).map(_clean_text),
            "state_name": [ _canonicalize_state_name(value, fallback) for value, fallback in zip(raw.get(state_col, ""), raw.get(location_col)) ],
            "district_name": raw.get(location_col).map(_clean_text),
            "district_key": raw.get(location_col).map(_normalize_text),
            "resource_type": "surface_water",
            "source_dataset": path.name,
            "observation_year": _coerce_numeric(raw.get(year_col)),
            "temperature": _coerce_numeric(raw.get(temp_col)),
            "dissolved_oxygen": _coerce_numeric(raw.get(do_col)),
            "ph": _coerce_numeric(raw.get(ph_col)),
            "tds": conductivity * 0.64,
            "turbidity": (_coerce_numeric(raw.get(bod_col)) * 1.25).clip(lower=0),
            "ecoli": fecal.fillna(total_coliform),
            "nitrate": _coerce_numeric(raw.get(nitrate_col)),
            "arsenic": np.nan,
            "fluoride": np.nan,
            "quality_status": "",
            "latitude": np.nan,
            "longitude": np.nan,
        })
        frames.append(frame)

    if not frames:
        return None
    df = pd.concat(frames, ignore_index=True)
    df["water_quality_score"] = df.apply(_water_quality_score, axis=1)
    return df, [str(path) for path in files]


def _load_groundwater_quality() -> Optional[Tuple[pd.DataFrame, List[str]]]:
    files = [path for path in _find_matching_files(("ground", "water")) if path.suffix.lower() == ".csv" and "level" not in path.name.lower()]
    if not files:
        return None

    frames: List[pd.DataFrame] = []
    for path in files:
        raw = _read_table(path)
        raw.columns = [_normalize_text(column) for column in raw.columns]
        cols = list(raw.columns)
        station_col = _match_column(cols, ("station", "name"))
        state_col = _match_column(cols, ("state",))
        temp_min_col = _match_column(cols, ("temperature", "min"))
        temp_max_col = _match_column(cols, ("temperature", "max"))
        ph_min_col = _match_column(cols, ("ph", "min"))
        ph_max_col = _match_column(cols, ("ph", "max"))
        conductivity_min_col = _match_column(cols, ("conductivity", "min"))
        conductivity_max_col = _match_column(cols, ("conductivity", "max"))
        year_col = _match_column(cols, ("year",))
        code_col = _match_column(cols, ("station", "code"), ("code",))
        if not station_col or not state_col or not (ph_min_col or ph_max_col):
            continue

        temp_min = _coerce_numeric(raw.get(temp_min_col))
        temp_max = _coerce_numeric(raw.get(temp_max_col))
        ph_min = _coerce_numeric(raw.get(ph_min_col))
        ph_max = _coerce_numeric(raw.get(ph_max_col))
        cond_min = _coerce_numeric(raw.get(conductivity_min_col))
        cond_max = _coerce_numeric(raw.get(conductivity_max_col))
        frame = pd.DataFrame({
            "resource_id": raw.get(code_col, raw.index.astype(str)).astype(str),
            "name": raw.get(station_col).map(_clean_text),
            "state_name": [ _canonicalize_state_name(value, fallback) for value, fallback in zip(raw.get(state_col, ""), raw.get(station_col)) ],
            "district_name": raw.get(station_col).map(_clean_text),
            "district_key": raw.get(station_col).map(_normalize_text),
            "resource_type": "groundwater",
            "source_dataset": path.name,
            "observation_year": _coerce_numeric(raw.get(year_col)),
            "temperature": (temp_min + temp_max) / 2,
            "dissolved_oxygen": np.nan,
            "ph": (ph_min + ph_max) / 2,
            "tds": ((cond_min + cond_max) / 2) * 0.64,
            "turbidity": np.nan,
            "ecoli": np.nan,
            "nitrate": np.nan,
            "arsenic": np.nan,
            "fluoride": np.nan,
            "quality_status": "",
            "latitude": np.nan,
            "longitude": np.nan,
        })
        frames.append(frame)

    if not frames:
        return None
    df = pd.concat(frames, ignore_index=True)
    df["water_quality_score"] = df.apply(_water_quality_score, axis=1)
    return df, [str(path) for path in files]


def _load_groundwater_levels() -> Optional[Tuple[pd.DataFrame, List[str]]]:
    files = [
        path
        for path in _find_matching_files(("water", "level"))
        if path.suffix.lower() == ".csv" and "level" in path.name.lower()
    ]
    if not files:
        return None

    frames: List[pd.DataFrame] = []
    for path in files:
        raw = _read_table(path)
        raw.columns = [_normalize_text(column) for column in raw.columns]
        cols = list(raw.columns)
        district_col = _match_column(cols, ("district", "name"))
        state_col = _match_column(cols, ("state", "name"))
        station_col = _match_column(cols, ("station", "name"))
        level_col = _match_column(cols, ("currentlevel",), ("current", "level"))
        level_diff_col = _match_column(cols, ("level_diff",), ("level", "diff"))
        lat_col = _match_column(cols, ("latitude",))
        lon_col = _match_column(cols, ("longitude",))
        date_col = _match_column(cols, ("date",))
        source_col = _match_column(cols, ("source",))
        if not district_col or not state_col or not station_col or not level_col:
            continue

        frame = pd.DataFrame({
            "resource_id": raw.index.astype(str),
            "name": raw.get(station_col).map(_clean_text),
            "state_name": [ _canonicalize_state_name(value, fallback) for value, fallback in zip(raw.get(state_col, ""), raw.get(district_col)) ],
            "district_name": raw.get(district_col, "").astype(str).str.strip().str.title(),
            "district_key": raw.get(district_col).map(_normalize_text),
            "resource_type": "groundwater_level_station",
            "source_dataset": raw.get(source_col, path.name).astype(str),
            "observation_year": pd.to_datetime(raw.get(date_col), errors="coerce").dt.year,
            "current_level": _coerce_numeric(raw.get(level_col)),
            "level_diff": _coerce_numeric(raw.get(level_diff_col)),
            "latitude": _coerce_numeric(raw.get(lat_col)),
            "longitude": _coerce_numeric(raw.get(lon_col)),
        })
        frames.append(frame)

    if not frames:
        return None
    return pd.concat(frames, ignore_index=True), [str(path) for path in files]


def _collect_official_water_observations() -> Tuple[Optional[pd.DataFrame], Dict[str, List[str]]]:
    frames: List[pd.DataFrame] = []
    source_files: Dict[str, List[str]] = {}
    for key, loader in (
        ("village_water_quality", _load_village_water_quality),
        ("surface_water_quality", _load_surface_water_quality),
        ("groundwater_quality", _load_groundwater_quality),
    ):
        loaded = loader()
        if loaded:
            frame, files = loaded
            frames.append(frame)
            source_files[key] = files
    if not frames:
        return None, source_files
    combined = pd.concat(frames, ignore_index=True)
    combined["water_quality_score"] = combined.apply(_water_quality_score, axis=1)
    return combined, source_files


def _get_cached_official_water_observations() -> Tuple[Optional[pd.DataFrame], Dict[str, List[str]]]:
    global _OFFICIAL_WATER_OBSERVATIONS_CACHE
    if _OFFICIAL_WATER_OBSERVATIONS_CACHE is None:
        start = pd.Timestamp.utcnow()
        _OFFICIAL_WATER_OBSERVATIONS_CACHE = _collect_official_water_observations()
        elapsed = (pd.Timestamp.utcnow() - start).total_seconds()
        logger.info("Built official water observation cache in {:.2f}s", elapsed)
    observations, source_files = _OFFICIAL_WATER_OBSERVATIONS_CACHE
    return (
        observations.copy(deep=True) if observations is not None else None,
        {key: list(value) for key, value in source_files.items()},
    )


def _get_cached_groundwater_levels() -> Optional[Tuple[pd.DataFrame, List[str]]]:
    global _GROUNDWATER_LEVEL_CACHE
    if _GROUNDWATER_LEVEL_CACHE is None:
        start = pd.Timestamp.utcnow()
        _GROUNDWATER_LEVEL_CACHE = _load_groundwater_levels()
        elapsed = (pd.Timestamp.utcnow() - start).total_seconds()
        logger.info("Built groundwater level cache in {:.2f}s", elapsed)
    if _GROUNDWATER_LEVEL_CACHE is None:
        return None
    frame, files = _GROUNDWATER_LEVEL_CACHE
    return frame.copy(deep=True), list(files)


def _build_public_resources_payload() -> Dict[str, Any]:
    observations, source_files = _get_cached_official_water_observations()
    levels_loaded = _get_cached_groundwater_levels()

    frames: List[pd.DataFrame] = []
    if observations is not None and not observations.empty:
        public_observations = observations[~observations["name"].map(_is_synthetic_resource_name)].copy()
        frames.append(public_observations)

    level_files: List[str] = []
    if levels_loaded:
        level_df, level_files = levels_loaded
        public_levels = level_df[~level_df["name"].map(_is_synthetic_resource_name)].copy()
        frames.append(public_levels)

    if not frames:
        return {
            "summary": {
                "total_resources": 0,
                "states_covered": 0,
                "groundwater_resources": 0,
                "surface_water_resources": 0,
            },
            "resources_frame": pd.DataFrame(),
            "available_states": [],
            "source_files": {**source_files, "groundwater_levels": level_files},
            "map": BHUVAN_MAP_CONFIG,
        }

    all_resources = pd.concat(frames, ignore_index=True).replace({np.nan: None})
    return {
        "summary": {
            "total_resources": int(len(all_resources)),
            "states_covered": int(all_resources["state_name"].astype(str).str.strip().replace("", np.nan).dropna().nunique()),
            "groundwater_resources": int(all_resources["resource_type"].astype(str).str.contains("groundwater", case=False, na=False).sum()),
            "surface_water_resources": int((all_resources["resource_type"] == "surface_water").sum()),
        },
        "resources_frame": all_resources,
        "available_states": sorted(
            [value for value in all_resources["state_name"].dropna().astype(str).str.title().unique().tolist() if value]
        ),
        "source_files": {**source_files, "groundwater_levels": level_files},
        "map": BHUVAN_MAP_CONFIG,
    }


def _empty_public_resources_payload() -> Dict[str, Any]:
    return {
        "summary": {
            "total_resources": 0,
            "states_covered": 0,
            "groundwater_resources": 0,
            "surface_water_resources": 0,
        },
        "resources_frame": pd.DataFrame(),
        "available_states": [],
        "source_files": {},
        "map": BHUVAN_MAP_CONFIG,
    }


def _warm_public_resources_cache_sync() -> None:
    global _PUBLIC_RESOURCES_CACHE, _PUBLIC_RESOURCES_CACHE_WARMING
    try:
        start = pd.Timestamp.utcnow()
        payload = _build_public_resources_payload()
        elapsed = (pd.Timestamp.utcnow() - start).total_seconds()
        with _PUBLIC_RESOURCES_CACHE_LOCK:
            _PUBLIC_RESOURCES_CACHE = payload
        logger.info("Built public water resource payload cache in {:.2f}s", elapsed)
    except Exception as exc:
        logger.warning(f"Public water resource payload cache warmup failed: {exc}")
    finally:
        _PUBLIC_RESOURCES_CACHE_WARMING = False


def _ensure_public_resources_cache_building() -> None:
    global _PUBLIC_RESOURCES_CACHE_WARMING
    if _PUBLIC_RESOURCES_CACHE is not None or _PUBLIC_RESOURCES_CACHE_WARMING:
        return
    _PUBLIC_RESOURCES_CACHE_WARMING = True
    threading.Thread(
        target=_warm_public_resources_cache_sync,
        name="jalert-public-water-cache",
        daemon=True,
    ).start()


def _get_cached_public_resources_payload() -> Dict[str, Any]:
    with _PUBLIC_RESOURCES_CACHE_LOCK:
        cached_payload = _PUBLIC_RESOURCES_CACHE
    if cached_payload is None:
        _ensure_public_resources_cache_building()
        return _empty_public_resources_payload()
    return {
        "summary": dict(cached_payload["summary"]),
        "resources_frame": cached_payload["resources_frame"].copy(deep=True),
        "available_states": list(cached_payload["available_states"]),
        "source_files": {key: list(value) for key, value in cached_payload["source_files"].items()},
        "map": dict(cached_payload["map"]),
    }


def list_ogd_dataset_status() -> List[Dict[str, Any]]:
    status: List[Dict[str, Any]] = []
    for dataset in PUBLIC_DATASETS:
        local_files = _find_matching_files(dataset["filename_hints"], allow_extensions={".csv", ".tsv", ".xls", ".xlsx", ".zip", ".shp", ".geojson", ".gpkg"})
        item = dict(dataset)
        item["available_locally"] = bool(local_files)
        item["local_files"] = [str(path) for path in local_files]
        status.append(item)
    return status


def load_ogd_water_quality_training_data() -> Optional[Tuple[pd.DataFrame, pd.Series, Dict[str, Any]]]:
    combined, source_files = _get_cached_official_water_observations()
    if combined is None or combined.empty:
        return None

    features = combined[[
        "ph",
        "turbidity",
        "ecoli",
        "tds",
        "temperature",
        "dissolved_oxygen",
        "nitrate",
        "arsenic",
        "fluoride",
    ]].copy()
    labels = combined.apply(_water_quality_label, axis=1)
    processed_path = _save_processed_frame(combined, "water_quality_training.csv")
    metadata = {
        "data_source": "official_public_data",
        "dataset": "Village water quality + surface water + groundwater quality",
        "source_files": source_files,
        "processed_file": processed_path,
        "samples": int(len(features)),
        "label_distribution": {str(label): int(count) for label, count in labels.value_counts().sort_index().items()},
    }
    return features, labels, metadata


def load_ogd_disease_training_data() -> Optional[Tuple[pd.DataFrame, pd.Series, Dict[str, Any]]]:
    combined, source_files = _get_cached_official_water_observations()
    levels_loaded = _get_cached_groundwater_levels()
    if combined is None or combined.empty:
        return None

    level_files: List[str] = []
    if levels_loaded:
        level_df, level_files = levels_loaded
        level_summary = (
            level_df.groupby("district_key", as_index=False)
            .agg(
                current_level=("current_level", "mean"),
                level_diff=("level_diff", "mean"),
                latitude=("latitude", "median"),
                longitude=("longitude", "median"),
            )
        )
        combined = combined.merge(level_summary, on="district_key", how="left")
    else:
        combined["current_level"] = np.nan
        combined["level_diff"] = np.nan

    combined["temperature"] = combined["temperature"].fillna(28)
    combined["water_quality_score"] = combined["water_quality_score"].fillna(65)
    combined["ecoli"] = combined["ecoli"].fillna(0)
    combined["turbidity"] = combined["turbidity"].fillna(0)
    combined["current_level"] = combined["current_level"].fillna(combined["current_level"].median(skipna=True) if combined["current_level"].notna().any() else 5)
    combined["level_diff"] = combined["level_diff"].fillna(0)
    combined["rainfall_mm"] = np.clip(combined["level_diff"] * 40, 0, 220)
    combined["days_since_rain"] = np.clip(30 - (combined["rainfall_mm"] / 10), 0, 30)
    combined["humidity"] = np.clip(52 + combined["rainfall_mm"] / 4, 40, 95)

    contamination = np.clip((100 - combined["water_quality_score"]) / 15, 0, 6)
    aquifer_stress = np.clip(combined["current_level"] / 5, 0, 5)
    combined["diarrhea_cases"] = np.round(contamination * 2.6 + combined["ecoli"] / 500 + combined["turbidity"] / 3).clip(lower=0)
    combined["fever_cases"] = np.round(contamination * 1.4 + aquifer_stress + combined["temperature"] / 15).clip(lower=0)
    combined["vomiting_cases"] = np.round(contamination + combined["turbidity"] / 4).clip(lower=0)
    combined["symptom_count"] = combined["diarrhea_cases"] + combined["fever_cases"] + combined["vomiting_cases"]

    # Label is derived from environmental proxies ONLY (contamination + aquifer
    # stress). Symptom columns (diarrhea_cases, fever_cases, vomiting_cases,
    # symptom_count) are kept for context / audit but must NOT appear in the
    # label formula — they are passed as model features at inference time and
    # including them here would cause circular (near-100 %) data leakage.
    risk_score = contamination * 6 + aquifer_stress * 4
    threshold = float(risk_score.quantile(0.68)) if len(risk_score) >= 20 else float(risk_score.mean())
    labels = (risk_score >= threshold).astype(int)

    # Return features matching DISEASE_FEATURES in models.py.
    # Label is derived from contamination + aquifer_stress ONLY, so symptom
    # columns are now safe to include as features — no circular dependency.
    features = combined[[
        "water_quality_score",
        "ecoli",
        "turbidity",
        "rainfall_mm",
        "days_since_rain",
        "temperature",
        "humidity",
        "symptom_count",
        "fever_cases",
        "diarrhea_cases",
        "vomiting_cases",
    ]].copy()
    processed_path = _save_processed_frame(combined, "disease_outbreak_training.csv")
    metadata = {
        "data_source": "official_public_data",
        "dataset": "Official water quality + groundwater level proxy training",
        "source_files": {**source_files, "groundwater_levels": level_files},
        "processed_file": processed_path,
        "samples": int(len(features)),
        "outbreak_ratio": float(labels.mean()),
        "labeling_method": "proxy_from_water_quality_and_groundwater_stress",
    }
    return features, labels, metadata


def get_water_resources_data(query: Optional[str] = None, state: Optional[str] = None, resource_type: Optional[str] = None, limit: int = 200) -> Dict[str, Any]:
    payload = _get_cached_public_resources_payload()
    resources = payload["resources_frame"]
    if resources.empty:
        return payload

    if query:
        q = _normalize_text(query)
        resources = resources[
            resources["name"].astype(str).map(_normalize_text).str.contains(q, na=False)
            | resources["district_name"].astype(str).map(_normalize_text).str.contains(q, na=False)
            | resources["state_name"].astype(str).map(_normalize_text).str.contains(q, na=False)
        ]
    if state:
        resources = resources[resources["state_name"].astype(str).map(_normalize_text) == _normalize_text(state)]
    if resource_type:
        resources = resources[resources["resource_type"].astype(str).map(_normalize_text) == _normalize_text(resource_type)]

    return {
        "summary": payload["summary"],
        "resources": resources.head(limit).replace({np.nan: None}).to_dict(orient="records"),
        "available_states": payload["available_states"],
        "source_files": payload["source_files"],
        "map": payload["map"],
    }


async def warm_public_water_resource_cache() -> None:
    await asyncio.to_thread(_warm_public_resources_cache_sync)
