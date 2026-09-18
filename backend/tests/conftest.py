"""Test configuration and shared fixtures."""

import os
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Test environment. Tests run against a real, throwaway PostgreSQL and Redis
# (like production); CI provides them as service containers, locally see
# scripts/run-backend-tests.sh. Values satisfy the settings validators; they are
# throwaway credentials for those test containers only.
os.environ["TESTING"] = "1"
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/bsmarker_test",  # pragma: allowlist secret
)
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")
os.environ["SECRET_KEY"] = "Kx7vQ2mP9wR4tY8uZ1aB3cD5eF6gH0jLnM"  # pragma: allowlist secret
os.environ.setdefault("MINIO_ENDPOINT", "localhost:9000")
os.environ["MINIO_ACCESS_KEY"] = "test-access-key"
os.environ["MINIO_SECRET_KEY"] = "test-secret-key-minio"  # pragma: allowlist secret
os.environ["FIRST_ADMIN_PASSWORD"] = "Test-Admin-Password-123!"  # pragma: allowlist secret
os.environ["NUMBA_CACHE_DIR"] = "/tmp"

from app.api.deps import get_db
from app.db.base import Base
from app.main import app
from app.models.project import Project
from app.models.recording import Recording
from app.models.spectrogram import Spectrogram
from app.models.user import User

FIXTURES_DIR = Path(__file__).parent / "fixtures"
SAMPLE_MP3 = FIXTURES_DIR / "bird_call.mp3"
SAMPLE_MP3_DURATION = 5.642  # seconds, as decoded by librosa
SAMPLE_MP3_SAMPLE_RATE = 44100


@pytest.fixture(autouse=True)
def clean_redis():
    """Start every test with empty Redis (rate-limit counters and cached list responses).

    Database ids restart from 1 in each test, so stale cache entries or rate-limit
    counters keyed by user id would otherwise leak between tests.
    """
    import redis

    try:
        client = redis.from_url(os.environ["REDIS_URL"])
        client.flushdb()
    except redis.exceptions.RedisError:
        pass  # No Redis: the app runs without cache / with in-memory limits.
    yield


@pytest.fixture(scope="session")
def test_engine():
    """Create test database engine."""
    test_engine = create_engine(os.environ["DATABASE_URL"])
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    return test_engine


@pytest.fixture(scope="function")
def test_db(test_engine):
    """Create test database session."""
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

    # Create tables for each test
    Base.metadata.create_all(bind=test_engine)

    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        # Clean up tables after each test
        Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def client(test_db):
    """Create test client with database override."""

    def override_get_db():
        try:
            yield test_db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


@pytest.fixture
def test_user(test_db):
    """Create a test user."""
    from app.core.security import get_password_hash

    user = User(
        email="test@example.com",
        username="test",
        hashed_password=get_password_hash("testpassword"),
        is_active=True,
        is_admin=False,
    )
    test_db.add(user)
    test_db.commit()
    test_db.refresh(user)
    return user


@pytest.fixture
def admin_user(test_db):
    """Create an admin test user."""
    from app.core.security import get_password_hash

    user = User(
        email="admin@example.com",
        username="admin_test",  # "admin" is taken by the startup-created FIRST_ADMIN user
        hashed_password=get_password_hash("adminpassword"),
        is_active=True,
        is_admin=True,
    )
    test_db.add(user)
    test_db.commit()
    test_db.refresh(user)
    return user


@pytest.fixture
def test_project(test_db, test_user):
    """Create a test project."""
    project = Project(name="Test Project", description="A test project", owner_id=test_user.id)
    test_db.add(project)
    test_db.commit()
    test_db.refresh(project)
    return project


@pytest.fixture
def test_recording(test_db, test_project):
    """Create a test recording."""
    recording = Recording(
        filename="test_audio.mp3",
        original_filename="test_audio.mp3",
        file_path="recordings/test_audio.mp3",
        duration=30.5,
        sample_rate=44100,
        project_id=test_project.id,
    )
    test_db.add(recording)
    test_db.commit()
    test_db.refresh(recording)
    return recording


@pytest.fixture
def test_recording_no_duration(test_db, test_project):
    """Create a test recording without duration."""
    recording = Recording(
        filename="test_audio_no_duration.mp3",
        original_filename="test_audio_no_duration.mp3",
        file_path="recordings/test_audio_no_duration.mp3",
        duration=None,
        sample_rate=None,
        project_id=test_project.id,
    )
    test_db.add(recording)
    test_db.commit()
    test_db.refresh(recording)
    return recording


@pytest.fixture
def temp_audio_file():
    """Create a temporary audio file for testing."""
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp_file:
        # Write some fake MP3 content
        tmp_file.write(b"fake mp3 content for testing")
        tmp_file.flush()
        yield tmp_file.name

    # Clean up
    os.unlink(tmp_file.name)


def make_auth_headers(user):
    """Bearer headers for ``user``; tokens carry the user id in ``sub`` (see auth/login)."""
    from app.core.security import create_access_token

    token = create_access_token(data={"sub": str(user.id)})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def auth_headers(client, test_user):
    """Authentication headers for the regular test user (owner of test_project)."""
    return make_auth_headers(test_user)


@pytest.fixture
def admin_auth_headers(client, admin_user):
    """Authentication headers for the admin test user."""
    return make_auth_headers(admin_user)


@pytest.fixture
def other_user(test_db):
    """A second regular user who does not own test_project."""
    from app.core.security import get_password_hash

    user = User(
        email="other@example.com",
        username="other",
        hashed_password=get_password_hash("otherpassword"),
        is_active=True,
        is_admin=False,
    )
    test_db.add(user)
    test_db.commit()
    test_db.refresh(user)
    return user


@pytest.fixture
def other_auth_headers(client, other_user):
    """Authentication headers for other_user."""
    return make_auth_headers(other_user)


@pytest.fixture
def sample_mp3_bytes():
    """A real, short (~5.6 s, 44.1 kHz) MP3 recording of a bird call."""
    return SAMPLE_MP3.read_bytes()


@pytest.fixture
def store_object():
    """Put bytes into the (throwaway) MinIO recordings bucket; removed after the test."""
    from app.core.config import settings
    from app.services.minio_client import minio_client

    stored = []

    def _store(object_name: str, data: bytes) -> str:
        minio_client.upload_file(
            bucket_name=settings.MINIO_BUCKET_RECORDINGS,
            object_name=object_name,
            data=data,
            content_type="audio/mpeg",
        )
        stored.append(object_name)
        return object_name

    yield _store
    for name in stored:
        minio_client.delete_file(settings.MINIO_BUCKET_RECORDINGS, name)
