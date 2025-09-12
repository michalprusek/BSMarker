"""Test configuration and shared fixtures."""

import os
import tempfile
from unittest.mock import MagicMock, Mock

import numpy as np
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Set test environment variables
os.environ["TESTING"] = "1"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["SECRET_KEY"] = "test-secret-key"
os.environ["MINIO_ENDPOINT"] = "localhost:9000"
os.environ["MINIO_ACCESS_KEY"] = "test-key"
os.environ["MINIO_SECRET_KEY"] = "test-secret"
os.environ["REDIS_URL"] = "redis://localhost:6379/1"
os.environ["NUMBA_CACHE_DIR"] = "/tmp"

from app.db.base import Base
from app.db.database import engine, get_db
from app.main import app
from app.models.project import Project
from app.models.recording import Recording
from app.models.spectrogram import Spectrogram
from app.models.user import User


@pytest.fixture(scope="session")
def test_engine():
    """Create test database engine."""
    test_engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
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
def mock_librosa():
    """Mock librosa functions."""
    with pytest.MonkeyPatch().context() as m:
        # Create mock audio data (1 second of 44100 Hz audio)
        mock_audio_data = np.random.random(44100)
        mock_sample_rate = 44100

        # Mock librosa.load
        mock_load = Mock(return_value=(mock_audio_data, mock_sample_rate))
        m.setattr("librosa.load", mock_load)

        # Mock librosa.get_duration
        mock_get_duration = Mock(return_value=1.0)  # 1 second duration
        m.setattr("librosa.get_duration", mock_get_duration)

        yield {
            "load": mock_load,
            "get_duration": mock_get_duration,
            "audio_data": mock_audio_data,
            "sample_rate": mock_sample_rate,
        }


@pytest.fixture
def mock_minio_client():
    """Mock MinIO client."""
    mock_client = MagicMock()

    # Mock file content (fake MP3 data)
    fake_audio_content = b"fake mp3 content for testing"
    mock_client.get_file.return_value = iter([fake_audio_content])
    mock_client.put_file.return_value = True
    mock_client.delete_file.return_value = True

    return mock_client


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


@pytest.fixture
def auth_headers(client, test_user):
    """Create authentication headers for API requests."""
    from app.core.security import create_access_token

    access_token = create_access_token(subject=test_user.email)
    return {"Authorization": f"Bearer {access_token}"}


@pytest.fixture
def admin_auth_headers(client, admin_user):
    """Create admin authentication headers for API requests."""
    from app.core.security import create_access_token

    access_token = create_access_token(subject=admin_user.email)
    return {"Authorization": f"Bearer {access_token}"}
