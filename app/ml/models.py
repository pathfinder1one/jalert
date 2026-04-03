"""
JALERT - Machine Learning Models
Water quality classification + Disease outbreak prediction
Random Forest / XGBoost + SHAP explainability
"""
import os
import numpy as np
import pandas as pd
import joblib
from typing import Dict, Any, Optional, List, Tuple
from pathlib import Path

from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, roc_auc_score
import xgboost as xgb

from app.core.config import settings
from loguru import logger


MODEL_DIR = Path(settings.ML_MODEL_DIR)
MODEL_DIR.mkdir(parents=True, exist_ok=True)


# ── Feature engineering ───────────────────────────────────────────────────────

WATER_FEATURES = [
    "ph", "turbidity", "ecoli", "tds", "temperature",
    "dissolved_oxygen", "nitrate", "arsenic", "fluoride",
    "ph_deviation",      # |ph - 7.0|
    "turbidity_log",     # log1p(turbidity)
    "contamination_index",  # composite
]

DISEASE_FEATURES = [
    "water_quality_score",
    "ecoli",
    "turbidity",
    "rainfall_mm",
    "symptom_count",
    "fever_cases",
    "diarrhea_cases",
    "vomiting_cases",
    "days_since_rain",
    "temperature",
    "humidity",
]


def engineer_water_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    if "ph" not in df.columns:
        df["ph"] = 7.0
    if "turbidity" not in df.columns:
        df["turbidity"] = 0.0
    if "ecoli" not in df.columns:
        df["ecoli"] = 0.0
    if "tds" not in df.columns:
        df["tds"] = 0.0
    if "nitrate" not in df.columns:
        df["nitrate"] = 0.0

    df["ph_deviation"] = (df["ph"] - 7.0).abs()
    df["turbidity_log"] = np.log1p(df["turbidity"])
    # Contamination index: normalized weighted sum
    df["contamination_index"] = (
        df["ecoli"] / 10 * 0.4 +
        df["ph_deviation"] / 3.5 * 0.2 +
        df["turbidity_log"] / 3 * 0.2 +
        df["tds"] / 500 * 0.1 +
        df["nitrate"] / 45 * 0.1
    ).clip(0, 1)
    return df


def impute_missing(df: pd.DataFrame, fill_value: float = 0.0) -> pd.DataFrame:
    return df.fillna(fill_value)


# ── Water Quality Model ───────────────────────────────────────────────────────

class WaterQualityModel:
    """
    Classifies water as: 0=Safe, 1=Moderate Risk, 2=High Risk
    Uses Random Forest with feature engineering pipeline
    """

    MODEL_PATH = MODEL_DIR / settings.WATER_QUALITY_MODEL

    def __init__(self):
        self.pipeline: Optional[Pipeline] = None
        self.feature_names = WATER_FEATURES
        self._load()

    def _load(self):
        if self.MODEL_PATH.exists():
            self.pipeline = joblib.load(self.MODEL_PATH)
            logger.info(f"Water quality model loaded from {self.MODEL_PATH}")
        else:
            logger.warning("Water quality model not found — train first or use synthetic fallback")

    def _prepare(self, features: Dict[str, Any]) -> pd.DataFrame:
        df = pd.DataFrame([features])
        df = engineer_water_features(df)
        df = impute_missing(df)
        # Ensure all feature columns present
        for col in self.feature_names:
            if col not in df.columns:
                df[col] = 0.0
        return df[self.feature_names]

    def predict(self, features: Dict[str, Any]) -> Dict[str, Any]:
        if self.pipeline is None:
            return self._synthetic_predict(features)

        X = self._prepare(features)
        pred = self.pipeline.predict(X)[0]
        proba = self.pipeline.predict_proba(X)[0]

        return {
            "prediction": int(pred),
            "label": ["safe", "moderate_risk", "high_risk"][int(pred)],
            "probabilities": {
                "safe": round(float(proba[0]), 4),
                "moderate_risk": round(float(proba[1]), 4),
                "high_risk": round(float(proba[2]), 4),
            },
            "risk_score": round(float(proba[1] * 50 + proba[2] * 100), 2),
        }

    def _synthetic_predict(self, features: Dict[str, Any]) -> Dict[str, Any]:
        """Rule-based fallback when model is not trained"""
        score = 0
        if features.get("ecoli", 0) > 0:
            score += 40
        if features.get("ph", 7) < 6.5 or features.get("ph", 7) > 8.5:
            score += 20
        if features.get("turbidity", 0) > 4:
            score += 20
        if features.get("tds", 0) > 500:
            score += 10
        if features.get("nitrate", 0) > 45:
            score += 10

        if score >= 60:
            pred, label = 2, "high_risk"
        elif score >= 30:
            pred, label = 1, "moderate_risk"
        else:
            pred, label = 0, "safe"

        return {
            "prediction": pred,
            "label": label,
            "probabilities": {"safe": 0, "moderate_risk": 0, "high_risk": 0},
            "risk_score": float(score),
            "source": "rule_based_fallback",
        }

    def train(self, X: pd.DataFrame, y: pd.Series) -> Dict[str, Any]:
        X_eng = engineer_water_features(X)
        X_eng = impute_missing(X_eng)

        for col in self.feature_names:
            if col not in X_eng.columns:
                X_eng[col] = 0.0

        X_feat = X_eng[self.feature_names]
        X_train, X_test, y_train, y_test = train_test_split(X_feat, y, test_size=0.2, random_state=42)

        self.pipeline = Pipeline([
            ("scaler", StandardScaler()),
            ("clf", RandomForestClassifier(n_estimators=200, random_state=42, n_jobs=1)),
        ])
        self.pipeline.fit(X_train, y_train)

        y_pred = self.pipeline.predict(X_test)
        report = classification_report(y_test, y_pred, output_dict=True)

        joblib.dump(self.pipeline, self.MODEL_PATH)
        logger.info(f"Water quality model trained and saved to {self.MODEL_PATH}")
        return {"report": report, "model_path": str(self.MODEL_PATH)}


# ── Disease Outbreak Model ────────────────────────────────────────────────────

class DiseaseOutbreakModel:
    """
    Binary classifier: 0 = No outbreak, 1 = Outbreak likely (next 7 days)
    Uses XGBoost
    """

    MODEL_PATH = MODEL_DIR / settings.DISEASE_OUTBREAK_MODEL

    def __init__(self):
        self.model: Optional[xgb.XGBClassifier] = None
        self.scaler: Optional[StandardScaler] = None
        self.feature_names = DISEASE_FEATURES
        self._load()

    def _load(self):
        if self.MODEL_PATH.exists():
            saved = joblib.load(self.MODEL_PATH)
            self.model = saved["model"]
            self.scaler = saved["scaler"]
            logger.info(f"Disease outbreak model loaded from {self.MODEL_PATH}")
        else:
            logger.warning("Disease outbreak model not found — use synthetic fallback")

    def _prepare(self, features: Dict[str, Any]) -> np.ndarray:
        df = pd.DataFrame([features])
        for col in self.feature_names:
            if col not in df.columns:
                df[col] = 0.0
        df = impute_missing(df)
        X = df[self.feature_names].values
        if self.scaler:
            X = self.scaler.transform(X)
        return X

    def predict(self, features: Dict[str, Any]) -> Dict[str, Any]:
        if self.model is None:
            return self._synthetic_predict(features)

        X = self._prepare(features)
        pred = self.model.predict(X)[0]
        proba = self.model.predict_proba(X)[0]

        return {
            "outbreak_predicted": bool(pred),
            "outbreak_probability": round(float(proba[1]), 4),
            "risk_score": round(float(proba[1] * 100), 2),
        }

    def _synthetic_predict(self, features: Dict[str, Any]) -> Dict[str, Any]:
        score = 0
        score += min(40, features.get("fever_cases", 0) * 5)
        score += min(30, features.get("diarrhea_cases", 0) * 4)
        score += min(20, features.get("symptom_count", 0) * 2)
        score += 10 if features.get("ecoli", 0) > 0 else 0

        prob = min(1.0, score / 100)
        return {
            "outbreak_predicted": score >= 50,
            "outbreak_probability": round(prob, 4),
            "risk_score": float(score),
            "source": "rule_based_fallback",
        }

    def train(self, X: pd.DataFrame, y: pd.Series) -> Dict[str, Any]:
        for col in self.feature_names:
            if col not in X.columns:
                X[col] = 0.0
        X = impute_missing(X[self.feature_names])
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

        self.scaler = StandardScaler()
        X_train_s = self.scaler.fit_transform(X_train)
        X_test_s = self.scaler.transform(X_test)

        self.model = xgb.XGBClassifier(
            n_estimators=200, learning_rate=0.05, max_depth=6,
            scale_pos_weight=3, use_label_encoder=False,
            eval_metric="logloss", random_state=42, n_jobs=1,
        )
        self.model.fit(X_train_s, y_train, eval_set=[(X_test_s, y_test)], verbose=False)

        y_pred = self.model.predict(X_test_s)
        report = classification_report(y_test, y_pred, output_dict=True)
        try:
            auc = roc_auc_score(y_test, self.model.predict_proba(X_test_s)[:, 1])
        except Exception:
            auc = None

        joblib.dump({"model": self.model, "scaler": self.scaler}, self.MODEL_PATH)
        logger.info(f"Disease outbreak model trained and saved to {self.MODEL_PATH}")
        return {"report": report, "auc": auc, "model_path": str(self.MODEL_PATH)}


# ── SHAP Explainer ────────────────────────────────────────────────────────────

class ExplainabilityService:
    """SHAP-based feature importance and prediction explanation"""

    @staticmethod
    def _extract_sample_values(raw_values: Any, preferred_index: int = 0) -> np.ndarray:
        values = np.asarray(raw_values)
        if values.ndim == 3:
            index = min(preferred_index, values.shape[-1] - 1)
            return np.asarray(values[0, :, index], dtype=float)
        if values.ndim == 2:
            return np.asarray(values[0], dtype=float)
        return np.asarray(values.reshape(-1), dtype=float)

    @staticmethod
    def _extract_expected_value(raw_expected: Any, preferred_index: int = 0) -> float:
        values = np.asarray(raw_expected)
        if values.ndim == 0:
            return float(values)
        flat = values.reshape(-1)
        index = min(preferred_index, len(flat) - 1)
        return float(flat[index])

    @staticmethod
    def explain_water_quality(model: WaterQualityModel, features: Dict[str, Any]) -> Dict[str, Any]:
        try:
            import shap
            if model.pipeline is None:
                return {"error": "Model not trained"}

            X = model._prepare(features)
            clf = model.pipeline.named_steps["clf"]
            explainer = shap.TreeExplainer(clf)
            shap_values = explainer.shap_values(X)

            if isinstance(shap_values, list):
                shap_vals = ExplainabilityService._extract_sample_values(
                    shap_values[min(2, len(shap_values) - 1)]
                )
            else:
                shap_vals = ExplainabilityService._extract_sample_values(shap_values, preferred_index=2)

            importance = {
                feat: round(float(val), 4)
                for feat, val in zip(model.feature_names, shap_vals)
            }
            sorted_imp = dict(sorted(importance.items(), key=lambda x: abs(x[1]), reverse=True))

            return {
                "feature_importance": sorted_imp,
                "top_risk_factors": list(sorted_imp.keys())[:5],
                "base_value": round(
                    ExplainabilityService._extract_expected_value(
                        explainer.expected_value,
                        preferred_index=2,
                    ),
                    4,
                ),
            }
        except Exception as e:
            logger.error(f"SHAP explanation failed: {e}")
            return {"error": str(e)}

    @staticmethod
    def explain_disease_outbreak(model: DiseaseOutbreakModel, features: Dict[str, Any]) -> Dict[str, Any]:
        try:
            import shap
            if model.model is None:
                return {"error": "Model not trained"}

            X = model._prepare(features)
            explainer = shap.TreeExplainer(model.model)
            shap_values = explainer.shap_values(X)
            if isinstance(shap_values, list):
                shap_vals = ExplainabilityService._extract_sample_values(shap_values[-1])
            else:
                shap_vals = ExplainabilityService._extract_sample_values(shap_values)

            importance = {
                feat: round(float(val), 4)
                for feat, val in zip(model.feature_names, shap_vals)
            }
            sorted_imp = dict(sorted(importance.items(), key=lambda x: abs(x[1]), reverse=True))

            return {
                "feature_importance": sorted_imp,
                "top_risk_factors": list(sorted_imp.keys())[:5],
            }
        except Exception as e:
            logger.error(f"SHAP explanation failed: {e}")
            return {"error": str(e)}


# ── Singletons ────────────────────────────────────────────────────────────────

water_quality_model = WaterQualityModel()
disease_outbreak_model = DiseaseOutbreakModel()
explainability = ExplainabilityService()
