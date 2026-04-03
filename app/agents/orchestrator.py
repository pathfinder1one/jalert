"""
JALERT - AI Multi-Agent Orchestrator
Local, dependency-light orchestration for village risk assessment.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from loguru import logger

from app.core.config import settings


@dataclass
class AgentContext:
    village_id: str
    village_name: str
    sensor_readings: List[Dict[str, Any]]
    health_reports: List[Dict[str, Any]]
    weather_data: Optional[Dict[str, Any]]
    historical_predictions: List[Dict[str, Any]]


@dataclass
class AgentOutput:
    agent_name: str
    risk_score: float
    confidence: float
    findings: List[str]
    recommendations: List[str]
    raw_analysis: str


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _latest_value(readings: List[Dict[str, Any]], key: str, default: float = 0.0) -> float:
    for reading in readings:
        value = reading.get(key)
        if value is not None:
            return _safe_float(value, default)
    return default


def _mean_value(readings: List[Dict[str, Any]], key: str, default: float = 0.0) -> float:
    values = [_safe_float(reading.get(key)) for reading in readings if reading.get(key) is not None]
    if not values:
        return default
    return sum(values) / len(values)


def _count_symptoms(reports: List[Dict[str, Any]]) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for report in reports:
        for symptom in (report.get("symptoms") or {}).keys():
            normalized = str(symptom).strip().lower()
            counts[normalized] = counts.get(normalized, 0) + 1
    return counts


class BaseAgent:
    name = "BaseAgent"

    async def analyze(self, context: AgentContext) -> AgentOutput:
        raise NotImplementedError


class WaterQualityAgent(BaseAgent):
    name = "WaterQualityAgent"

    async def analyze(self, context: AgentContext) -> AgentOutput:
        ph = _latest_value(context.sensor_readings, "ph", 7.2)
        turbidity = _latest_value(context.sensor_readings, "turbidity")
        ecoli = _latest_value(context.sensor_readings, "ecoli")
        tds = _latest_value(context.sensor_readings, "tds")
        nitrate = _latest_value(context.sensor_readings, "nitrate")
        arsenic = _latest_value(context.sensor_readings, "arsenic")
        fluoride = _latest_value(context.sensor_readings, "fluoride")

        score = 10.0
        findings: List[str] = []
        recommendations: List[str] = []

        if ph < settings.PH_MIN or ph > settings.PH_MAX:
            score += 18
            findings.append(f"pH is outside the safe village drinking-water range at {ph:.1f}.")
            recommendations.append("Test the source again and avoid untreated drinking use until pH stabilizes.")
        if turbidity > settings.TURBIDITY_MAX:
            score += min(20, turbidity * 2.2)
            findings.append(f"Turbidity is elevated at {turbidity:.1f} NTU, which may indicate muddy or disturbed water.")
            recommendations.append("Clean storage points and inspect recent runoff near wells or tanks.")
        if ecoli > settings.ECOLI_MAX:
            score += min(30, 15 + ecoli / 10)
            findings.append(f"E. coli presence suggests biological contamination risk around the water source.")
            recommendations.append("Chlorinate or boil drinking water and inspect nearby sanitation leakage.")
        if tds > settings.TDS_MAX:
            score += min(14, (tds - settings.TDS_MAX) / 40)
            findings.append(f"TDS is above the preferred limit at {tds:.0f} mg/L.")
        if nitrate > settings.NITRATE_MAX:
            score += min(12, (nitrate - settings.NITRATE_MAX) / 5)
            findings.append(f"Nitrate is elevated at {nitrate:.1f} mg/L.")
        if arsenic > settings.ARSENIC_MAX:
            score += min(22, 12 + arsenic * 100)
            findings.append("Arsenic is above the safe threshold and needs urgent attention.")
            recommendations.append("Switch to a safer source while chemical testing is repeated.")
        if fluoride > settings.FLUORIDE_MAX:
            score += min(10, (fluoride - settings.FLUORIDE_MAX) * 6)
            findings.append(f"Fluoride is above the preferred level at {fluoride:.2f} mg/L.")

        if not findings:
            findings.append("Recent water readings are within or near the acceptable range.")
            recommendations.append("Continue routine monitoring of the village source.")

        return AgentOutput(
            agent_name=self.name,
            risk_score=round(min(100, score), 2),
            confidence=0.78 if context.sensor_readings else 0.52,
            findings=findings[:4],
            recommendations=recommendations[:4],
            raw_analysis="Local heuristic assessment from sensor water-quality parameters.",
        )


class DiseasePredictionAgent(BaseAgent):
    name = "DiseasePredictionAgent"

    async def analyze(self, context: AgentContext) -> AgentOutput:
        symptoms = _count_symptoms(context.health_reports)
        diarrhea = symptoms.get("diarrhea", 0) + symptoms.get("loose motions", 0)
        fever = symptoms.get("fever", 0)
        vomiting = symptoms.get("vomiting", 0)
        skin = symptoms.get("skin irritation", 0) + symptoms.get("rash", 0)
        ecoli = _latest_value(context.sensor_readings, "ecoli")
        turbidity = _mean_value(context.sensor_readings, "turbidity")

        score = min(100.0, diarrhea * 12 + fever * 7 + vomiting * 6 + skin * 4 + ecoli / 12 + turbidity * 1.2)
        findings: List[str] = []
        recommendations: List[str] = []

        if diarrhea or vomiting:
            findings.append("Recent symptom reports suggest possible water-borne illness clustering.")
            recommendations.append("Health workers should verify diarrhea and vomiting reports household by household.")
        if fever >= 2:
            findings.append("Repeated fever reports increase the likelihood of a broader local health signal.")
        if ecoli > 0:
            findings.append("Biological contamination in water increases disease transmission probability.")
        if not findings:
            findings.append("No strong outbreak pattern is visible from recent reports.")
            recommendations.append("Keep reporting symptoms early so local clusters can be detected.")

        return AgentOutput(
            agent_name=self.name,
            risk_score=round(score, 2),
            confidence=0.75 if context.health_reports or context.sensor_readings else 0.45,
            findings=findings[:4],
            recommendations=recommendations[:4],
            raw_analysis="Local heuristic assessment from symptom clustering and water contamination cues.",
        )


class WeatherFloodAgent(BaseAgent):
    name = "WeatherFloodAgent"

    async def analyze(self, context: AgentContext) -> AgentOutput:
        rainfall = _latest_value(context.sensor_readings, "rainfall_mm", _safe_float((context.weather_data or {}).get("rainfall_mm")))
        flood_level = _latest_value(context.sensor_readings, "flood_level_m", _safe_float((context.weather_data or {}).get("flood_level_m")))
        humidity = _latest_value(context.sensor_readings, "humidity", _safe_float((context.weather_data or {}).get("humidity"), 60))

        score = min(100.0, rainfall * 0.7 + flood_level * 22 + max(0, humidity - 70) * 0.8)
        findings: List[str] = []
        recommendations: List[str] = []

        if rainfall >= 25:
            findings.append(f"Recent rainfall of {rainfall:.1f} mm may disturb local water sources.")
            recommendations.append("Inspect open wells, tanks, and low-lying handpump surroundings after rain.")
        if flood_level >= 0.5:
            findings.append(f"Flood-water level indicators are elevated at {flood_level:.2f} m.")
            recommendations.append("Keep wastewater away from water points and alert households in flood-prone pockets.")
        if humidity >= 80:
            findings.append("High humidity supports stagnant conditions and slower drying after contamination.")
        if not findings:
            findings.append("Weather signals do not currently suggest strong flood-driven contamination.")
            recommendations.append("Continue local source inspection during seasonal weather changes.")

        return AgentOutput(
            agent_name=self.name,
            risk_score=round(score, 2),
            confidence=0.7 if context.sensor_readings or context.weather_data else 0.4,
            findings=findings[:4],
            recommendations=recommendations[:4],
            raw_analysis="Local heuristic assessment from rainfall, flood level, and humidity context.",
        )


class CommunityHealthAgent(BaseAgent):
    name = "CommunityHealthAgent"

    async def analyze(self, context: AgentContext) -> AgentOutput:
        reports = context.health_reports
        symptoms = _count_symptoms(reports)
        hospitalized = sum(1 for report in reports if report.get("is_hospitalized"))
        score = min(100.0, len(reports) * 6 + hospitalized * 12 + len(symptoms) * 4)

        findings: List[str] = []
        recommendations: List[str] = []

        if len(reports) >= 3:
            findings.append(f"{len(reports)} recent health reports suggest active community concern in the village.")
        if hospitalized:
            findings.append(f"{hospitalized} recent case(s) needed hospitalization, which raises urgency.")
            recommendations.append("Prioritize home visits for severe or elderly patients and share updates with the local clinic.")
        if symptoms:
            findings.append("Reported symptoms show more than one household-level issue instead of a single isolated case.")
        if not findings:
            findings.append("Community health reporting is currently low, so risk may still be under-reported.")
            recommendations.append("Encourage families and field workers to submit symptoms early.")

        return AgentOutput(
            agent_name=self.name,
            risk_score=round(score, 2),
            confidence=0.72 if reports else 0.38,
            findings=findings[:4],
            recommendations=recommendations[:4],
            raw_analysis="Local heuristic assessment from report volume, symptom spread, and hospitalization signals.",
        )


class AlertStrategyAgent(BaseAgent):
    name = "AlertStrategyAgent"

    async def analyze(self, context: AgentContext, agent_outputs: List[AgentOutput]) -> AgentOutput:
        peak_score = max((output.risk_score for output in agent_outputs), default=0.0)
        avg_score = sum(output.risk_score for output in agent_outputs) / max(1, len(agent_outputs))

        findings = [
            f"Highest single risk signal is {peak_score:.1f}/100 across the specialist agents.",
            f"Overall average risk pressure is {avg_score:.1f}/100 across water, disease, weather, and community signals.",
        ]
        recommendations: List[str] = []
        for output in agent_outputs:
            for recommendation in output.recommendations:
                if recommendation not in recommendations:
                    recommendations.append(recommendation)

        if peak_score >= 60:
            recommendations.insert(0, "Escalate the village update to field teams within the same day.")
        elif avg_score >= 35:
            recommendations.insert(0, "Keep local workers informed and repeat village checks within 24 hours.")
        else:
            recommendations.insert(0, "Continue routine monitoring and keep the village informed in simple language.")

        return AgentOutput(
            agent_name=self.name,
            risk_score=round(min(100.0, avg_score * 0.9 + peak_score * 0.1), 2),
            confidence=0.8,
            findings=findings,
            recommendations=recommendations[:6],
            raw_analysis="Local synthesis of specialist agent outputs into an action strategy.",
        )


class JALERTOrchestrator:
    def __init__(self):
        self.water_agent = WaterQualityAgent()
        self.disease_agent = DiseasePredictionAgent()
        self.weather_agent = WeatherFloodAgent()
        self.community_agent = CommunityHealthAgent()
        self.strategy_agent = AlertStrategyAgent()

    async def run(self, context: AgentContext) -> Dict[str, Any]:
        logger.info("Orchestrator running for village {}", context.village_id)

        base_outputs = await asyncio.gather(
            self.water_agent.analyze(context),
            self.disease_agent.analyze(context),
            self.weather_agent.analyze(context),
            self.community_agent.analyze(context),
        )
        strategy_output = await self.strategy_agent.analyze(context, list(base_outputs))
        outputs = [*base_outputs, strategy_output]

        by_name = {output.agent_name: output for output in outputs}

        weights = {
            "WaterQualityAgent": settings.WEIGHT_WATER_QUALITY,
            "DiseasePredictionAgent": settings.WEIGHT_DISEASE_PREDICTION,
            "WeatherFloodAgent": settings.WEIGHT_WEATHER,
            "CommunityHealthAgent": settings.WEIGHT_COMMUNITY_HEALTH,
        }
        weighted_score = 0.0
        total_weight = 0.0
        for name, weight in weights.items():
            output = by_name[name]
            weighted_score += output.risk_score * output.confidence * weight
            total_weight += output.confidence * weight

        final_score = round(weighted_score / total_weight, 2) if total_weight else 35.0
        if final_score >= 75:
            category = "critical"
            outbreak_days = 2
        elif final_score >= 50:
            category = "high"
            outbreak_days = 5
        elif final_score >= 25:
            category = "moderate"
            outbreak_days = 10
        else:
            category = "low"
            outbreak_days = None

        recommendations: List[str] = []
        for output in outputs:
            for recommendation in output.recommendations:
                if recommendation not in recommendations:
                    recommendations.append(recommendation)

        result = {
            "village_id": context.village_id,
            "risk_score": final_score,
            "risk_category": category,
            "outbreak_timeline_days": outbreak_days,
            "water_quality_score": by_name["WaterQualityAgent"].risk_score,
            "disease_risk_score": by_name["DiseasePredictionAgent"].risk_score,
            "weather_risk_score": by_name["WeatherFloodAgent"].risk_score,
            "community_health_score": by_name["CommunityHealthAgent"].risk_score,
            "recommended_actions": recommendations[:10],
            "agent_outputs": {
                output.agent_name: {
                    "risk_score": output.risk_score,
                    "confidence": output.confidence,
                    "findings": output.findings,
                    "recommendations": output.recommendations,
                }
                for output in outputs
            },
        }
        logger.info(
            "Orchestration complete: village={} score={} category={}",
            context.village_id,
            final_score,
            category,
        )
        return result


orchestrator = JALERTOrchestrator()
