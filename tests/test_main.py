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
from app.core.config import settings
from app.core.security import hash_password
from app.models.user import User, UserRole

# ── Test DB (SQLite in-memory) ────────────────────────────────────────────────
TEST_DB_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(TEST_DB_URL, echo=False)
TestingSessionLocal = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)


async def override_get_db():
    async with TestingSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


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
    """Create an admin directly and login, return auth headers"""
    async with TestingSessionLocal() as session:
        session.add(User(
            name="Test Admin",
            email="admin@example.com",
            hashed_password=hash_password("SecurePass123!"),
            role=UserRole.ADMIN,
        ))
        await session.commit()

    login = await client.post("/api/v1/auth/login", json={
        "email": "admin@example.com",
        "password": "SecurePass123!",
    })
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# ── Auth Tests ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_register_user(client):
    response = await client.post("/api/v1/auth/register", json={
        "name": "Ravi Kumar",
        "email": "ravi@test.com",
        "password": "Test1234!",
    })
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "ravi@test.com"
    assert data["role"] == "public"


@pytest.mark.asyncio
async def test_register_duplicate_email(client):
    payload = {"name": "Anil", "email": "dup@test.com", "password": "Test1234!"}
    await client.post("/api/v1/auth/register", json=payload)
    r2 = await client.post("/api/v1/auth/register", json=payload)
    assert r2.status_code == 409


@pytest.mark.asyncio
async def test_register_cannot_self_assign_admin(client):
    response = await client.post("/api/v1/auth/register", json={
        "name": "Role Test",
        "email": "role@test.com",
        "password": "Test1234!",
        "role": "admin",
    })
    assert response.status_code == 201
    assert response.json()["role"] == "public"


@pytest.mark.asyncio
async def test_login_success(client):
    await client.post("/api/v1/auth/register", json={
        "name": "Login Test", "email": "login@test.com", "password": "Pass1234!"
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
    assert r.json()["email"] == "admin@example.com"


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
async def test_sensor_ingest_requires_configured_api_key(client, auth_headers, village_id):
    await client.post("/api/v1/sensors/", json={
        "village_id": village_id,
        "sensor_code": "SEN-KEY",
        "sensor_type": "water_quality",
    }, headers=auth_headers)

    original_keys = settings.SENSOR_INGEST_API_KEYS
    settings.SENSOR_INGEST_API_KEYS = ["test-sensor-key"]
    try:
        missing = await client.post("/api/v1/sensors/ingest", json={
            "sensor_code": "SEN-KEY",
            "ph": 7.2,
        })
        assert missing.status_code == 401

        accepted = await client.post("/api/v1/sensors/ingest", json={
            "sensor_code": "SEN-KEY",
            "ph": 7.2,
        }, headers={"X-Sensor-Api-Key": "test-sensor-key"})
        assert accepted.status_code == 201
    finally:
        settings.SENSOR_INGEST_API_KEYS = original_keys


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
    mock_redis = AsyncMock()
    mock_redis.ping = AsyncMock(return_value=True)
    with patch.object(redis_manager, '_pool', mock_redis):
        r = await client.get("/health")
        assert r.status_code in (200, 207)


@pytest.mark.asyncio
async def test_root(client):
    r = await client.get("/")
    assert r.status_code == 200
    assert "JALERT" in r.json()["system"]
