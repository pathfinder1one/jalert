"""
JALERT - Test Suite
Tests for Auth, Sensors, Alerts, Predictions
"""
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from unittest.mock import patch, AsyncMock

from app.main import app
from app.core.database import Base, get_db
from app.core.redis_manager import redis_manager

# ── Test DB (SQLite in-memory) ────────────────────────────────────────────────
TEST_DB_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(TEST_DB_URL, echo=False)
TestingSessionLocal = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)


async def override_get_db():
    async with TestingSessionLocal() as session:
        yield session


app.dependency_overrides[get_db] = override_get_db


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def auth_headers(client):
    """Register and login, return auth headers"""
    reg = await client.post("/api/v1/auth/register", json={
        "name": "Test Admin",
        "email": "admin@jalert.test",
        "password": "SecurePass123!",
        "role": "admin",
    })
    assert reg.status_code == 201

    login = await client.post("/api/v1/auth/login", json={
        "email": "admin@jalert.test",
        "password": "SecurePass123!",
    })
    assert login.status_code == 200
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# ── Auth Tests ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_register_user(client):
    response = await client.post("/api/v1/auth/register", json={
        "name": "Ravi Kumar",
        "email": "ravi@test.com",
        "password": "Test1234!",
        "role": "public",
    })
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "ravi@test.com"
    assert data["role"] == "public"


@pytest.mark.asyncio
async def test_register_duplicate_email(client):
    payload = {"name": "A", "email": "dup@test.com", "password": "Test1234!", "role": "public"}
    await client.post("/api/v1/auth/register", json=payload)
    r2 = await client.post("/api/v1/auth/register", json=payload)
    assert r2.status_code == 409


@pytest.mark.asyncio
async def test_login_success(client):
    await client.post("/api/v1/auth/register", json={
        "name": "Login Test", "email": "login@test.com", "password": "Pass1234!", "role": "public"
    })
    r = await client.post("/api/v1/auth/login", json={"email": "login@test.com", "password": "Pass1234!"})
    assert r.status_code == 200
    assert "access_token" in r.json()


@pytest.mark.asyncio
async def test_login_invalid_credentials(client):
    r = await client.post("/api/v1/auth/login", json={"email": "nobody@test.com", "password": "wrong"})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_get_me(client, auth_headers):
    r = await client.get("/api/v1/auth/me", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["email"] == "admin@jalert.test"


# ── Village Tests ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_village(client, auth_headers):
    r = await client.post("/api/v1/villages/", json={
        "name": "Rampur", "district": "Meerut", "state": "Uttar Pradesh",
        "latitude": 28.8, "longitude": 78.0, "population": 5000
    }, headers=auth_headers)
    assert r.status_code == 201
    assert r.json()["name"] == "Rampur"


@pytest.mark.asyncio
async def test_list_villages(client, auth_headers):
    # Create one
    await client.post("/api/v1/villages/", json={
        "name": "V1", "district": "D1", "state": "UP",
        "latitude": 28.0, "longitude": 77.0
    }, headers=auth_headers)
    r = await client.get("/api/v1/villages/", headers=auth_headers)
    assert r.status_code == 200
    assert len(r.json()) >= 1


# ── Sensor Tests ──────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def village_id(client, auth_headers):
    r = await client.post("/api/v1/villages/", json={
        "name": "TestVillage", "district": "Dist", "state": "UP",
        "latitude": 28.5, "longitude": 77.5
    }, headers=auth_headers)
    return r.json()["id"]


@pytest.mark.asyncio
async def test_create_and_ingest_sensor(client, auth_headers, village_id):
    # Create sensor
    r = await client.post("/api/v1/sensors/", json={
        "village_id": village_id,
        "sensor_code": "SEN-001",
        "sensor_type": "water_quality",
    }, headers=auth_headers)
    assert r.status_code == 201

    # Ingest reading
    r2 = await client.post("/api/v1/sensors/ingest", json={
        "sensor_code": "SEN-001",
        "ph": 7.2, "turbidity": 2.1, "ecoli": 0.0, "tds": 280,
    })
    assert r2.status_code == 201
    data = r2.json()
    assert data["ph"] == 7.2
    assert data["is_anomaly"] is False


@pytest.mark.asyncio
async def test_ingest_anomalous_reading(client, auth_headers, village_id):
    await client.post("/api/v1/sensors/", json={
        "village_id": village_id, "sensor_code": "SEN-002", "sensor_type": "water_quality"
    }, headers=auth_headers)

    r = await client.post("/api/v1/sensors/ingest", json={
        "sensor_code": "SEN-002",
        "ph": 4.5,       # Very acidic - anomaly
        "ecoli": 8.0,    # High E.coli - anomaly
        "turbidity": 15.0,
    })
    assert r.status_code == 201
    data = r.json()
    assert data["is_anomaly"] is True
    assert data["quality_score"] < 50  # Low quality score


# ── Alert Tests ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_threshold_alert_generated(client, auth_headers, village_id):
    """Ingesting dangerous readings should auto-create alerts"""
    await client.post("/api/v1/sensors/", json={
        "village_id": village_id, "sensor_code": "SEN-003", "sensor_type": "water_quality"
    }, headers=auth_headers)

    await client.post("/api/v1/sensors/ingest", json={
        "sensor_code": "SEN-003",
        "ph": 4.0,       # Critical pH
        "ecoli": 12.0,   # Critical E.coli
    })

    r = await client.get(f"/api/v1/alerts/?village_id={village_id}", headers=auth_headers)
    assert r.status_code == 200
    alerts = r.json()
    assert len(alerts) > 0
    severities = {a["severity"] for a in alerts}
    assert "critical" in severities


@pytest.mark.asyncio
async def test_manual_alert(client, auth_headers, village_id):
    r = await client.post("/api/v1/alerts/manual", json={
        "village_id": village_id,
        "alert_type": "manual",
        "severity": "high",
        "title": "Manual Test Alert",
        "description": "Testing manual alert creation",
    }, headers=auth_headers)
    assert r.status_code == 201
    assert r.json()["severity"] == "high"


# ── Health Report Tests ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_submit_health_report(client, auth_headers, village_id):
    r = await client.post("/api/v1/health/report", json={
        "village_id": village_id,
        "reporter_name": "Ram Singh",
        "age": 35,
        "gender": "male",
        "symptoms": {"fever": "high", "diarrhea": "moderate"},
    }, headers=auth_headers)
    assert r.status_code == 201
    assert r.json()["village_id"] == village_id


@pytest.mark.asyncio
async def test_outbreak_clusters(client, auth_headers, village_id):
    # Submit multiple reports
    for i in range(7):
        await client.post("/api/v1/health/report", json={
            "village_id": village_id,
            "symptoms": {"fever": "high", "vomiting": "moderate"},
        }, headers=auth_headers)

    r = await client.get(f"/api/v1/health/clusters/{village_id}", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["total_reports"] >= 7
    assert data["cluster_detected"] is True


# ── System Tests ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_health_endpoint(client):
    with patch.object(redis_manager, 'client') as mock_redis:
        mock_redis.ping = AsyncMock(return_value=True)
        r = await client.get("/health")
        assert r.status_code in (200, 207)


@pytest.mark.asyncio
async def test_root(client):
    r = await client.get("/")
    assert r.status_code == 200
    assert "JALERT" in r.json()["system"]
