"""Tests for recordings API endpoints, especially duration extraction and backfill functionality."""

import io
import json
from unittest.mock import MagicMock, Mock, patch

import numpy as np
import pytest
from app.models.project import Project
from app.models.recording import Recording
from app.services.audio_service import AudioMetadata
from fastapi import status


class TestRecordingUpload:
    """Test recording upload with duration extraction."""

    def test_upload_with_successful_duration_extraction(
        self, client, test_db, test_project, auth_headers, mock_minio_client
    ):
        """Test successful recording upload with duration extraction."""
        project_id = test_project.id

        # Create fake audio file
        audio_content = b"fake mp3 content for testing duration extraction"
        audio_file = io.BytesIO(audio_content)

        # Mock librosa operations for duration extraction
        with patch("app.api.api_v1.endpoints.recordings.librosa") as mock_librosa:
            mock_audio_data = np.random.random(88200)  # 2 seconds at 44100 Hz
            mock_sample_rate = 44100
            mock_duration = 2.0

            mock_librosa.load.return_value = (mock_audio_data, mock_sample_rate)
            mock_librosa.get_duration.return_value = mock_duration

            # Mock MinIO upload
            with patch("app.api.api_v1.endpoints.recordings.minio_client") as mock_minio:
                mock_minio.put_file.return_value = True

                # Mock secure temp file
                with patch("app.api.api_v1.endpoints.recordings.secure_temp_file") as mock_temp:
                    mock_temp.return_value.__enter__.return_value = "/tmp/test_audio.mp3"

                    # Mock file writing
                    with patch("builtins.open", create=True) as mock_open:
                        mock_file = MagicMock()
                        mock_open.return_value.__enter__.return_value = mock_file

                        # Upload file
                        response = client.post(
                            f"/api/v1/recordings/{project_id}/upload",
                            files={"file": ("test_audio.mp3", audio_file, "audio/mpeg")},
                            headers=auth_headers,
                        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        # Verify recording was created with duration
        assert "id" in data
        assert data["filename"].endswith("test_audio.mp3")
        assert data["original_filename"] == "test_audio.mp3"
        assert data["duration"] == mock_duration
        assert data["sample_rate"] == mock_sample_rate
        assert data["project_id"] == project_id

        # Verify recording exists in database
        recording = test_db.query(Recording).filter(Recording.id == data["id"]).first()
        assert recording is not None
        assert recording.duration == mock_duration
        assert recording.sample_rate == mock_sample_rate

    def test_upload_with_duration_extraction_failure(
        self, client, test_db, test_project, auth_headers
    ):
        """Test recording upload when duration extraction fails."""
        project_id = test_project.id

        # Create fake audio file
        audio_content = b"fake corrupted mp3 content"
        audio_file = io.BytesIO(audio_content)

        # Mock librosa failure
        with patch("app.api.api_v1.endpoints.recordings.librosa") as mock_librosa:
            mock_librosa.load.side_effect = Exception("Failed to load corrupted audio")

            with patch("app.api.api_v1.endpoints.recordings.minio_client") as mock_minio:
                mock_minio.put_file.return_value = True

                with patch("app.api.api_v1.endpoints.recordings.secure_temp_file") as mock_temp:
                    mock_temp.return_value.__enter__.return_value = "/tmp/test_audio.mp3"

                    with patch("builtins.open", create=True) as mock_open:
                        mock_file = MagicMock()
                        mock_open.return_value.__enter__.return_value = mock_file

                        response = client.post(
                            f"/api/v1/recordings/{project_id}/upload",
                            files={"file": ("corrupted.mp3", audio_file, "audio/mpeg")},
                            headers=auth_headers,
                        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        # Verify recording was created even with failed duration extraction
        assert "id" in data
        assert data["duration"] is None  # Should be None when extraction fails
        assert data["sample_rate"] is None

        # Verify recording exists in database with null duration
        recording = test_db.query(Recording).filter(Recording.id == data["id"]).first()
        assert recording is not None
        assert recording.duration is None
        assert recording.sample_rate is None

    def test_upload_with_unsupported_file_type(self, client, test_project, auth_headers):
        """Test upload with unsupported file type."""
        project_id = test_project.id

        # Create fake text file
        text_content = b"This is not an audio file"
        text_file = io.BytesIO(text_content)

        response = client.post(
            f"/api/v1/recordings/{project_id}/upload",
            files={"file": ("test.txt", text_file, "text/plain")},
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "not supported" in response.json()["detail"].lower()

    def test_upload_with_large_file(self, client, test_project, auth_headers):
        """Test upload with file size limit exceeded."""
        project_id = test_project.id

        # Create oversized content (simulate large file)
        large_content = b"x" * (100 * 1024 * 1024 + 1)  # Over 100MB
        large_file = io.BytesIO(large_content)

        response = client.post(
            f"/api/v1/recordings/{project_id}/upload",
            files={"file": ("large_audio.mp3", large_file, "audio/mpeg")},
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "too large" in response.json()["detail"].lower()

    def test_upload_triggers_spectrogram_task(self, client, test_db, test_project, auth_headers):
        """Test that upload triggers spectrogram generation task."""
        project_id = test_project.id

        audio_content = b"fake mp3 content"
        audio_file = io.BytesIO(audio_content)

        # Mock librosa and other dependencies
        with patch("app.api.api_v1.endpoints.recordings.librosa") as mock_librosa, patch(
            "app.api.api_v1.endpoints.recordings.minio_client"
        ) as mock_minio, patch(
            "app.api.api_v1.endpoints.recordings.secure_temp_file"
        ) as mock_temp, patch(
            "builtins.open", create=True
        ):

            mock_librosa.load.return_value = (np.random.random(44100), 44100)
            mock_librosa.get_duration.return_value = 1.0
            mock_minio.put_file.return_value = True
            mock_temp.return_value.__enter__.return_value = "/tmp/test.mp3"

            # Mock Celery task
            with patch(
                "app.api.api_v1.endpoints.recordings.generate_spectrogram_task"
            ) as mock_task:
                mock_task.delay.return_value.id = "test-task-id"

                response = client.post(
                    f"/api/v1/recordings/{project_id}/upload",
                    files={"file": ("test.mp3", audio_file, "audio/mpeg")},
                    headers=auth_headers,
                )

                assert response.status_code == status.HTTP_200_OK

                # Verify task was queued
                mock_task.delay.assert_called_once()
                called_recording_id = mock_task.delay.call_args[0][0]
                assert isinstance(called_recording_id, int)


class TestBackfillDurations:
    """Test backfill missing durations endpoint."""

    def test_backfill_missing_durations_success(
        self, client, test_db, test_project, admin_auth_headers
    ):
        """Test successful backfill of missing durations."""
        # Create recordings with missing durations
        recordings_without_duration = []
        for i in range(3):
            recording = Recording(
                filename=f"test_audio_{i}.mp3",
                original_filename=f"test_audio_{i}.mp3",
                file_path=f"recordings/test_audio_{i}.mp3",
                duration=None,
                sample_rate=None,
                project_id=test_project.id,
            )
            test_db.add(recording)
            recordings_without_duration.append(recording)

        test_db.commit()

        # Mock MinIO and librosa operations
        with patch("app.api.api_v1.endpoints.recordings.minio_client") as mock_minio, patch(
            "app.api.api_v1.endpoints.recordings.librosa"
        ) as mock_librosa:

            # Mock MinIO file download
            fake_audio_content = b"fake mp3 content"
            mock_minio.get_file.return_value = iter([fake_audio_content])

            # Mock librosa analysis
            mock_audio_data = np.random.random(66150)  # 1.5 seconds at 44100 Hz
            mock_sample_rate = 44100
            mock_duration = 1.5

            mock_librosa.load.return_value = (mock_audio_data, mock_sample_rate)
            mock_librosa.get_duration.return_value = mock_duration

            # Mock tempfile operations
            with patch("tempfile.NamedTemporaryFile") as mock_temp, patch(
                "os.unlink"
            ) as mock_unlink:

                mock_file = MagicMock()
                mock_file.name = "/tmp/backfill_audio.mp3"
                mock_file.__enter__.return_value = mock_file
                mock_temp.return_value = mock_file

                response = client.post(
                    "/api/v1/recordings/backfill-durations", headers=admin_auth_headers
                )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        # Verify response structure
        assert data["updated_count"] == 3
        assert data["failed_count"] == 0
        assert data["total_processed"] == 3
        assert "No recordings found" not in data["message"]

        # Verify recordings were updated in database
        for recording in recordings_without_duration:
            test_db.refresh(recording)
            assert recording.duration == mock_duration
            assert recording.sample_rate == mock_sample_rate

    def test_backfill_no_missing_durations(
        self,
        client,
        test_db,
        test_recording,  # This recording already has duration
        admin_auth_headers,
    ):
        """Test backfill when no recordings have missing durations."""
        response = client.post("/api/v1/recordings/backfill-durations", headers=admin_auth_headers)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        assert data["updated_count"] == 0
        assert data["failed_count"] == 0
        assert data["total_processed"] == 0
        assert "No recordings found with missing duration" in data["message"]

    def test_backfill_with_some_failures(self, client, test_db, test_project, admin_auth_headers):
        """Test backfill with some recordings failing to process."""
        # Create recordings with missing durations
        success_recording = Recording(
            filename="success.mp3",
            original_filename="success.mp3",
            file_path="recordings/success.mp3",
            duration=None,
            project_id=test_project.id,
        )

        fail_recording = Recording(
            filename="fail.mp3",
            original_filename="fail.mp3",
            file_path="recordings/fail.mp3",
            duration=None,
            project_id=test_project.id,
        )

        test_db.add(success_recording)
        test_db.add(fail_recording)
        test_db.commit()

        with patch("app.api.api_v1.endpoints.recordings.minio_client") as mock_minio, patch(
            "app.api.api_v1.endpoints.recordings.librosa"
        ) as mock_librosa:

            # Mock MinIO to succeed for first file, fail for second
            def mock_get_file(bucket_name, object_name):
                if "success" in object_name:
                    return iter([b"fake audio content"])
                else:
                    raise Exception("Failed to download file")

            mock_minio.get_file.side_effect = mock_get_file

            # Mock librosa for successful case
            mock_librosa.load.return_value = (np.random.random(44100), 44100)
            mock_librosa.get_duration.return_value = 1.0

            with patch("tempfile.NamedTemporaryFile") as mock_temp, patch("os.unlink"):

                mock_file = MagicMock()
                mock_file.name = "/tmp/test.mp3"
                mock_file.__enter__.return_value = mock_file
                mock_temp.return_value = mock_file

                response = client.post(
                    "/api/v1/recordings/backfill-durations", headers=admin_auth_headers
                )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        assert data["updated_count"] == 1  # Only success_recording
        assert data["failed_count"] == 1  # fail_recording failed
        assert data["total_processed"] == 2
        assert "errors" in data
        assert len(data["errors"]) == 1

    def test_backfill_requires_admin(self, client, auth_headers):  # Regular user, not admin
        """Test that backfill requires admin privileges."""
        response = client.post("/api/v1/recordings/backfill-durations", headers=auth_headers)

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "Only admins can perform bulk operations" in response.json()["detail"]

    def test_backfill_unauthenticated(self, client):
        """Test backfill without authentication."""
        response = client.post("/api/v1/recordings/backfill-durations")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_backfill_with_librosa_failures(
        self, client, test_db, test_project, admin_auth_headers
    ):
        """Test backfill when librosa fails to process files."""
        # Create recording with missing duration
        recording = Recording(
            filename="corrupted.mp3",
            original_filename="corrupted.mp3",
            file_path="recordings/corrupted.mp3",
            duration=None,
            project_id=test_project.id,
        )
        test_db.add(recording)
        test_db.commit()

        with patch("app.api.api_v1.endpoints.recordings.minio_client") as mock_minio, patch(
            "app.api.api_v1.endpoints.recordings.librosa"
        ) as mock_librosa:

            # Mock successful MinIO download
            mock_minio.get_file.return_value = iter([b"corrupted audio content"])

            # Mock librosa failure
            mock_librosa.load.side_effect = Exception("Corrupted audio file")

            with patch("tempfile.NamedTemporaryFile") as mock_temp, patch(
                "os.unlink"
            ) as mock_unlink:

                mock_file = MagicMock()
                mock_file.name = "/tmp/corrupted.mp3"
                mock_file.__enter__.return_value = mock_file
                mock_temp.return_value = mock_file

                response = client.post(
                    "/api/v1/recordings/backfill-durations", headers=admin_auth_headers
                )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        assert data["updated_count"] == 0
        assert data["failed_count"] == 1
        assert data["total_processed"] == 1
        assert "errors" in data
        assert "Corrupted audio file" in data["errors"][0]

    def test_backfill_error_limit(self, client, test_db, test_project, admin_auth_headers):
        """Test that backfill limits the number of errors returned."""
        # Create many recordings that will fail
        for i in range(15):  # More than the 10 error limit
            recording = Recording(
                filename=f"fail_{i}.mp3",
                original_filename=f"fail_{i}.mp3",
                file_path=f"recordings/fail_{i}.mp3",
                duration=None,
                project_id=test_project.id,
            )
            test_db.add(recording)

        test_db.commit()

        with patch("app.api.api_v1.endpoints.recordings.minio_client") as mock_minio:
            # Mock all files to fail download
            mock_minio.get_file.side_effect = Exception("Failed to download")

            response = client.post(
                "/api/v1/recordings/backfill-durations", headers=admin_auth_headers
            )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        assert data["failed_count"] == 15
        assert data["updated_count"] == 0
        assert len(data["errors"]) == 10  # Limited to 10 errors
        assert "additional_errors" in data
        assert data["additional_errors"] == 5  # 15 - 10 = 5


class TestRecordingDurationFiltering:
    """Test duration-based filtering in recording list endpoint."""

    def test_duration_filter_min(self, client, test_db, test_project, auth_headers):
        """Test filtering recordings by minimum duration."""
        # Create recordings with different durations
        short_recording = Recording(
            filename="short.mp3",
            original_filename="short.mp3",
            file_path="recordings/short.mp3",
            duration=2.5,
            project_id=test_project.id,
        )

        long_recording = Recording(
            filename="long.mp3",
            original_filename="long.mp3",
            file_path="recordings/long.mp3",
            duration=10.0,
            project_id=test_project.id,
        )

        test_db.add(short_recording)
        test_db.add(long_recording)
        test_db.commit()

        # Filter for recordings longer than 5 seconds
        response = client.get(
            f"/api/v1/recordings/{test_project.id}/recordings?min_duration=5.0",
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK
        recordings = response.json()

        # Should only return the long recording
        assert len(recordings) == 1
        assert recordings[0]["id"] == long_recording.id
        assert recordings[0]["duration"] == 10.0

    def test_duration_filter_max(self, client, test_db, test_project, auth_headers):
        """Test filtering recordings by maximum duration."""
        # Use existing recordings from previous test
        response = client.get(
            f"/api/v1/recordings/{test_project.id}/recordings?max_duration=5.0",
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK
        recordings = response.json()

        # Should only return recordings <= 5 seconds
        for recording in recordings:
            if recording["duration"] is not None:
                assert recording["duration"] <= 5.0

    def test_duration_filter_range(self, client, test_db, test_project, auth_headers):
        """Test filtering recordings by duration range."""
        response = client.get(
            f"/api/v1/recordings/{test_project.id}/recordings?min_duration=1.0&max_duration=15.0",
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK
        recordings = response.json()

        # All returned recordings should be within range
        for recording in recordings:
            if recording["duration"] is not None:
                assert 1.0 <= recording["duration"] <= 15.0

    def test_duration_sort(self, client, test_db, test_project, auth_headers):
        """Test sorting recordings by duration."""
        # Sort by duration ascending
        response = client.get(
            f"/api/v1/recordings/{test_project.id}/recordings?sort_by=duration&sort_order=asc",
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK
        recordings = response.json()

        # Check that recordings are sorted by duration (ascending)
        durations = [r["duration"] for r in recordings if r["duration"] is not None]
        if len(durations) > 1:
            assert durations == sorted(durations)


class TestRecordingIntegration:
    """Integration tests for recording-related functionality."""

    def test_upload_to_backfill_workflow(
        self, client, test_db, test_project, auth_headers, admin_auth_headers
    ):
        """Test complete workflow: upload with failed duration -> backfill."""
        project_id = test_project.id

        # Step 1: Upload file with duration extraction failure
        audio_content = b"fake corrupted mp3"
        audio_file = io.BytesIO(audio_content)

        with patch("app.api.api_v1.endpoints.recordings.librosa") as mock_librosa, patch(
            "app.api.api_v1.endpoints.recordings.minio_client"
        ) as mock_minio, patch(
            "app.api.api_v1.endpoints.recordings.secure_temp_file"
        ) as mock_temp, patch(
            "builtins.open", create=True
        ):

            # Mock failed duration extraction during upload
            mock_librosa.load.side_effect = Exception("Failed during upload")
            mock_minio.put_file.return_value = True
            mock_temp.return_value.__enter__.return_value = "/tmp/test.mp3"

            upload_response = client.post(
                f"/api/v1/recordings/{project_id}/upload",
                files={"file": ("test.mp3", audio_file, "audio/mpeg")},
                headers=auth_headers,
            )

        assert upload_response.status_code == status.HTTP_200_OK
        upload_data = upload_response.json()
        assert upload_data["duration"] is None

        recording_id = upload_data["id"]

        # Step 2: Run backfill to fix the duration
        with patch("app.api.api_v1.endpoints.recordings.minio_client") as mock_minio, patch(
            "app.api.api_v1.endpoints.recordings.librosa"
        ) as mock_librosa, patch("tempfile.NamedTemporaryFile") as mock_temp, patch("os.unlink"):

            # Mock successful duration extraction during backfill
            mock_minio.get_file.return_value = iter([b"fake audio content"])
            mock_librosa.load.return_value = (np.random.random(88200), 44100)
            mock_librosa.get_duration.return_value = 2.0

            mock_file = MagicMock()
            mock_file.name = "/tmp/backfill.mp3"
            mock_file.__enter__.return_value = mock_file
            mock_temp.return_value = mock_file

            backfill_response = client.post(
                "/api/v1/recordings/backfill-durations", headers=admin_auth_headers
            )

        assert backfill_response.status_code == status.HTTP_200_OK
        backfill_data = backfill_response.json()
        assert backfill_data["updated_count"] == 1

        # Step 3: Verify the recording now has duration
        recording = test_db.query(Recording).filter(Recording.id == recording_id).first()
        assert recording.duration == 2.0
        assert recording.sample_rate == 44100
