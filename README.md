# JALERT — Intelligent Water & Health Alert System

> **Mission-critical AI-powered backend** for real-time water quality monitoring, multi-agent disease outbreak prediction, and community health protection in rural India.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        JALERT Backend                           │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ Auth API │  │Sensor API│  │Alert API │  │ AI Predict.  │   │
│  │  /auth   │  │/sensors  │  │ /alerts  │  │/predictions  │   │
│  └────┬─────┘  └─────┬────┘  └─────┬────┘  └──────┬───────┘   │
│       │              │             │               │            │
│  ┌────▼──────────────▼─────────────▼───────────────▼───────┐   │
│  │                   FastAPI Application                    │   │
│  │         JWT Auth · Rate Limiting · Audit Logs           │   │
│  └─────────┬────────────────────────────────────┬──────────┘   │
│            │                                    │               │
│  ┌─────────▼──────────┐            ┌────────────▼──────────┐   │
│  │   PostgreSQL DB    │            │     Redis Cache        │   │
│  │  (Async SQLAlchemy)│            │  Pub/Sub · Rate Limit  │   │
│  └────────────────────┘            └────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              AI Multi-Agent Orchestrator                 │   │
│  │  ┌───────────┐ ┌──────────┐ ┌────────┐ ┌───────────┐   │   │
│  │  │   Water   │ │ Disease  │ │Weather │ │ Community │   │   │
│  │  │  Quality  │ │Prediction│ │& Flood │ │  Health   │   │   │
│  │  │  Agent    │ │  Agent   │ │ Agent  │ │  Agent    │   │   │
│  │  └─────┬─────┘ └────┬─────┘ └───┬────┘ └─────┬─────┘   │   │
│  │        └────────────┴───────────┴─────────────┘         │   │
│  │                         │                               │   │
│  │              ┌──────────▼──────────┐                    │   │
│  │              │  Alert Strategy     │                    │   │
│  │              │     Agent           │                    │   │
│  │              └──────────┬──────────┘                    │   │
│  │                         │                               │   │
│  │              ┌──────────▼──────────┐                    │   │
│  │              │  Final Risk Score   │                    │   │
│  │              │  0-100 · Category   │                    │   │
│  │              │  Timeline · Actions │                    │   │
│  │              └─────────────────────┘                    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │  ML      │  │  Kafka   │  │WebSockets│  │   Celery     │   │
│  │ RF+XGB   │  │Pipeline  │  │Real-time │  │  Scheduler   │   │
│  │ + SHAP   │  │          │  │  Streams │  │              │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
jalert/
├── app/
│   ├── main.py                    # FastAPI app factory + lifespan
│   ├── core/
│   │   ├── config.py              # Pydantic settings (all env vars)
│   │   ├── database.py            # Async SQLAlchemy engine + session
│   │   ├── redis_manager.py       # Redis cache + pub/sub
│   │   └── security.py           # JWT, bcrypt, RBAC dependencies
│   ├── models/
│   │   └── user.py               # All SQLAlchemy ORM models + enums
│   ├── schemas/
│   │   └── schemas.py            # Pydantic request/response schemas
│   ├── routers/
│   │   ├── auth.py               # POST /auth/register, /login, /me
│   │   ├── villages.py           # Village CRUD + dashboard
│   │   ├── sensors.py            # IoT ingestion + readings
│   │   ├── alerts.py             # Alert management
│   │   ├── predictions.py        # AI risk scoring + XAI
│   │   ├── health.py             # Symptom reports + clusters
│   │   ├── reports.py            # PDF/CSV generation
│   │   ├── ml_training.py        # Model training endpoints
│   │   └── websockets.py         # Real-time WS streams
│   ├── services/
│   │   ├── auth_service.py       # Register, login logic
│   │   ├── sensor_service.py     # Ingestion + anomaly detection
│   │   ├── alert_service.py      # Threshold engine + notifications
│   │   ├── prediction_service.py # AI orchestration + ML blend
│   │   ├── report_service.py     # PDF (ReportLab) + S3 upload
│   │   └── audit_service.py      # Audit log writer
│   ├── agents/
│   │   └── orchestrator.py       # 5-agent LangChain system + orchestrator
│   ├── ml/
│   │   └── models.py             # Random Forest + XGBoost + SHAP
│   ├── utils/
│   │   ├── websocket_manager.py  # WS connection manager + Redis bridge
│   │   ├── kafka_pipeline.py     # Kafka producer/consumer + IoT simulator
│   │   └── middleware.py         # Rate limiting + request logging
│   └── tasks.py                  # Celery background tasks + scheduler
├── tests/
│   └── test_main.py              # Full pytest async test suite
├── scripts/
│   └── 001_initial_schema.py     # Alembic migration
├── docker/
│   ├── Dockerfile
│   ├── docker-compose.yml        # Full stack: PG + Redis + Kafka + Nginx
│   └── nginx.conf                # Reverse proxy + WS support
├── ml_models/                    # Trained model artifacts (joblib)
├── logs/                         # Rotating log files
├── .env.example                  # Environment variables template
└── requirements.txt
```

---

## Quick Start

### 1. Prerequisites
- Python 3.11+
- PostgreSQL 15+
- Redis 7+
- Docker & Docker Compose (recommended)

### 2. Setup

```bash
# Clone and enter directory
git clone <repo>
cd jalert

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env — set DATABASE_URL, REDIS_URL, OPENAI_API_KEY, etc.

# Run database migrations
alembic upgrade head

# Start server
uvicorn app.main:app --reload --port 8000
```

### 3. Docker (Recommended — Full Stack)

```bash
cd docker
docker compose up -d
```

This starts: PostgreSQL · Redis · Kafka · Zookeeper · API · Celery Worker · Celery Beat · Nginx

---

## API Reference

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/register` | Register user |
| POST | `/api/v1/auth/login` | Login → JWT tokens |
| GET | `/api/v1/auth/me` | Current user profile |

### Villages
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/villages/` | Create village (Admin) |
| GET | `/api/v1/villages/` | List all villages |
| GET | `/api/v1/villages/{id}/dashboard` | Full village snapshot |

### Sensors (IoT)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/sensors/ingest` | Ingest single reading |
| POST | `/api/v1/sensors/ingest/batch` | Batch ingest |
| POST | `/api/v1/sensors/` | Register sensor |
| GET | `/api/v1/sensors/village/{id}` | List sensors |
| GET | `/api/v1/sensors/readings/{id}` | Historical readings |

### Alerts
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/alerts/` | Fetch alerts (filterable) |
| POST | `/api/v1/alerts/manual` | Trigger manual alert |
| PATCH | `/api/v1/alerts/{id}/resolve` | Resolve alert |

### AI Predictions
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/predictions/{village_id}` | Run full AI assessment |
| GET | `/api/v1/predictions/{village_id}/latest` | Latest prediction |
| GET | `/api/v1/predictions/{village_id}/history` | Trend data |
| GET | `/api/v1/predictions/{village_id}/explain` | XAI explanation |

### Health Reports
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/health/report` | Submit symptom report |
| GET | `/api/v1/health/reports/{village_id}` | Get reports |
| GET | `/api/v1/health/clusters/{village_id}` | Outbreak cluster detection |
| PATCH | `/api/v1/health/report/{id}/assign` | Assign health worker |
| PATCH | `/api/v1/health/report/{id}/resolve` | Mark recovered |

### Reports
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/reports/{id}/pdf` | Download PDF report |
| GET | `/api/v1/reports/{id}/csv/sensors` | Download CSV |
| POST | `/api/v1/reports/{id}/pdf/upload` | Upload to S3 |

### ML Training (Admin)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/ml/train/water-quality` | Train RF model |
| POST | `/api/v1/ml/train/disease-outbreak` | Train XGBoost model |
| GET | `/api/v1/ml/status` | Model availability |

### WebSockets
| Endpoint | Description |
|----------|-------------|
| `ws://host/ws/village/{id}/sensors` | Live sensor stream |
| `ws://host/ws/village/{id}/alerts` | Real-time alert feed |
| `ws://host/ws/admin/dashboard` | Global admin stream |

---

## AI System Design

### Multi-Agent Architecture

```
AgentContext (village data)
        │
        ├──► WaterQualityAgent     → risk_score, contamination_type
        ├──► DiseasePredictionAgent → outbreak_probability, cases_7d
        ├──► WeatherFloodAgent     → flood_risk_level, est_flood_days
        ├──► CommunityHealthAgent  → cluster_detected, symptom_pattern
        └──► AlertStrategyAgent    → priority_actions, escalation_needed
                    │
                    ▼
             Orchestrator
          (weighted scoring)
                    │
                    ▼
        ┌───────────────────────┐
        │  Final Risk Score     │  0–100
        │  Risk Category        │  low/moderate/high/critical
        │  Outbreak Timeline    │  days until outbreak
        │  Recommended Actions  │  top 10 priority actions
        │  SHAP Explanation     │  feature importance
        └───────────────────────┘
```

### Risk Score Weights
| Agent | Weight |
|-------|--------|
| Water Quality | 35% |
| Disease Prediction | 30% |
| Community Health | 20% |
| Weather/Flood | 15% |

### Alert Thresholds (WHO/BIS Standards)
| Parameter | Safe Range | Alert Trigger |
|-----------|-----------|---------------|
| pH | 6.5 – 8.5 | Outside range |
| Turbidity | < 4 NTU | > 4 NTU (HIGH), > 20 (CRITICAL) |
| E.coli | 0 CFU/100ml | Any detection (HIGH), >5 (CRITICAL) |
| TDS | < 500 mg/L | > 500 (MODERATE) |
| Nitrate | < 45 mg/L | > 45 (HIGH) |
| Arsenic | < 0.01 mg/L | > 0.01 (CRITICAL) |
| Fluoride | < 1.5 mg/L | > 1.5 (HIGH) |
| Rainfall | — | > 100mm (HIGH), > 200mm (CRITICAL) |

---

## Security

- **JWT authentication** (access + refresh tokens)
- **bcrypt password hashing** (work factor 12)
- **Role-based access control**: Admin > Health Worker > Public
- **Rate limiting**: 100 req/min per IP via Redis
- **Input validation**: Pydantic v2 with strict types
- **Audit logging**: Every user action recorded
- **CORS**: Configurable per environment
- **Gzip compression**: Automatic on responses > 1KB

---

## Running Tests

```bash
pytest tests/ -v --asyncio-mode=auto
```

Test coverage includes: Auth, Villages, Sensors, Anomaly Detection, Threshold Alerts, Health Reports, Outbreak Clusters.

---

## Celery Tasks (Scheduled)

| Task | Schedule | Description |
|------|----------|-------------|
| `run_all_predictions` | Every 6 hours | AI risk assessment for all villages |
| `check_sensor_health` | Every hour | Mark stale sensors as inactive |
| `send_daily_summary` | 7am IST daily | Email daily risk summary |
| `cleanup_audit_logs` | Weekly Sunday | Delete logs > 90 days |

---

## Deployment

### Environment Variables Required
```
DATABASE_URL         PostgreSQL connection string
REDIS_URL            Redis connection string
SECRET_KEY           JWT signing key (32+ chars)
OPENAI_API_KEY       For LangChain agents
TWILIO_*             SMS/voice notifications
AWS_*                S3 report storage
GOOGLE_APPLICATION_CREDENTIALS  Google TTS
```

### Render / Railway
```bash
# Set env vars in dashboard, then:
web: uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 4
worker: celery -A app.tasks.celery_app worker -c 4
beat: celery -A app.tasks.celery_app beat
```

### AWS ECS / GCP Cloud Run
Use the provided `docker/Dockerfile`. Set all env vars as secrets.

---

## License
MIT — Built for JALERT mission-critical public health infrastructure.
