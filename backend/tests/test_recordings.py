"""Tests for the recordings API.

Covers upload + metadata extraction, listing, finished toggle, backfill, audio
streaming and deletion.

PostgreSQL, Redis and MinIO are real (throwaway) services; audio is decoded by the real
librosa from a small MP3 fixture, so no mocks are needed here.
"""

import pytest
from fastapi import status
from minio.error import S3Error

from app.core.config import settings
from app.models.annotation import Annotation, BoundingBox
from app.models.recording import Recording
from app.services.minio_client import minio_client

from .conftest import SAMPLE_MP3_DURATION, SAMPLE_MP3_SAMPLE_RATE


def add_recording(db, project, name, duration=10.0, is_finished=False, **kwargs):
    recording = Recording(
        filename=name,
        original_filename=name,
        file_path=f"project_{project.id}/{name}",
        duration=duration,
        sample_rate=kwargs.pop("sample_rate", 44100 if duration is not None else None),
        is_finished=is_finished,
        project_id=project.id,
        **kwargs,
    )
    db.add(recording)
    db.commit()
    db.refresh(recording)
    return recording


def add_annotation(db, recording, user, n_boxes=1):
    annotation = Annotation(recording_id=recording.id, user_id=user.id)
    db.add(annotation)
    db.flush()
    for i in range(n_boxes):
        db.add(
            BoundingBox(
                annotation_id=annotation.id,
                x=i,
                y=0,
                width=10,
                height=10,
                start_time=i,
                end_time=i + 1,
                label="bird",
            )
        )
    db.commit()
    return annotation


def list_recordings(client, project_id, headers, **params):
    response = client.get(
        f"/api/v1/recordings/{project_id}/recordings", params=params, headers=headers
    )
    assert response.status_code == status.HTTP_200_OK, response.text
    return response.json()


class TestRecordingUpload:
    @pytest.mark.audio
    def test_upload_real_mp3_extracts_duration_and_sample_rate(
        self, client, test_db, test_project, auth_headers, sample_mp3_bytes
    ):
        response = client.post(
            f"/api/v1/recordings/{test_project.id}/upload",
            files={"file": ("bird call.mp3", sample_mp3_bytes, "audio/mpeg")},
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK, response.text
        data = response.json()
        assert data["original_filename"] == "bird call.mp3"
        assert data["filename"].endswith(".mp3")
        assert data["filename"] != "bird call.mp3"  # stored under a generated name
        assert data["file_path"] == f"project_{test_project.id}/{data['filename']}"
        assert data["project_id"] == test_project.id
        assert data["is_finished"] is False
        assert data["duration"] == pytest.approx(SAMPLE_MP3_DURATION, abs=0.05)
        assert data["sample_rate"] == SAMPLE_MP3_SAMPLE_RATE

        recording = test_db.query(Recording).filter(Recording.id == data["id"]).one()
        assert recording.duration == pytest.approx(SAMPLE_MP3_DURATION, abs=0.05)
        assert recording.sample_rate == SAMPLE_MP3_SAMPLE_RATE
        assert recording.is_finished is False

        # The file really landed in object storage, byte for byte.
        stored = minio_client.download_file(settings.MINIO_BUCKET_RECORDINGS, data["file_path"])
        assert stored == sample_mp3_bytes
        minio_client.delete_file(settings.MINIO_BUCKET_RECORDINGS, data["file_path"])

    @pytest.mark.audio
    def test_upload_undecodable_audio_is_stored_without_metadata(
        self, client, test_db, test_project, auth_headers
    ):
        response = client.post(
            f"/api/v1/recordings/{test_project.id}/upload",
            files={"file": ("corrupted.mp3", b"this is not audio at all", "audio/mpeg")},
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK, response.text
        data = response.json()
        assert data["duration"] is None
        assert data["sample_rate"] is None
        recording = test_db.query(Recording).filter(Recording.id == data["id"]).one()
        assert recording.duration is None
        assert recording.sample_rate is None
        minio_client.delete_file(settings.MINIO_BUCKET_RECORDINGS, data["file_path"])

    def test_upload_rejects_unsupported_extension(
        self, client, test_db, test_project, auth_headers
    ):
        response = client.post(
            f"/api/v1/recordings/{test_project.id}/upload",
            files={"file": ("notes.txt", b"This is not an audio file", "text/plain")},
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "not allowed" in response.json()["detail"].lower()
        assert test_db.query(Recording).count() == 0

    def test_upload_rejects_empty_file(self, client, test_db, test_project, auth_headers):
        response = client.post(
            f"/api/v1/recordings/{test_project.id}/upload",
            files={"file": ("empty.mp3", b"", "audio/mpeg")},
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "empty" in response.json()["detail"].lower()
        assert test_db.query(Recording).count() == 0

    def test_upload_rejects_file_over_size_limit(
        self, client, test_db, test_project, auth_headers, monkeypatch
    ):
        monkeypatch.setattr(settings, "MAX_UPLOAD_SIZE", 1024)

        response = client.post(
            f"/api/v1/recordings/{test_project.id}/upload",
            files={"file": ("large.mp3", b"x" * 1025, "audio/mpeg")},
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "too large" in response.json()["detail"].lower()
        assert test_db.query(Recording).count() == 0

    def test_upload_to_missing_project_returns_404(self, client, auth_headers):
        response = client.post(
            "/api/v1/recordings/999999/upload",
            files={"file": ("a.mp3", b"abc", "audio/mpeg")},
            headers=auth_headers,
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_upload_to_foreign_project_is_forbidden(
        self, client, test_db, test_project, other_auth_headers
    ):
        response = client.post(
            f"/api/v1/recordings/{test_project.id}/upload",
            files={"file": ("a.mp3", b"abc", "audio/mpeg")},
            headers=other_auth_headers,
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert test_db.query(Recording).count() == 0

    def test_upload_requires_authentication(self, client, test_project):
        response = client.post(
            f"/api/v1/recordings/{test_project.id}/upload",
            files={"file": ("a.mp3", b"abc", "audio/mpeg")},
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestRecordingList:
    def test_min_duration_filter(self, client, test_db, test_project, auth_headers):
        add_recording(test_db, test_project, "short.mp3", duration=2.5)
        long = add_recording(test_db, test_project, "long.mp3", duration=10.0)

        data = list_recordings(client, test_project.id, auth_headers, min_duration=5.0)

        assert [r["id"] for r in data["items"]] == [long.id]
        assert data["pagination"]["total"] == 1
        assert data["pagination"]["total_duration"] == pytest.approx(10.0)

    def test_max_duration_filter(self, client, test_db, test_project, auth_headers):
        short = add_recording(test_db, test_project, "short.mp3", duration=2.5)
        add_recording(test_db, test_project, "long.mp3", duration=10.0)
        add_recording(test_db, test_project, "unknown.mp3", duration=None)

        data = list_recordings(client, test_project.id, auth_headers, max_duration=5.0)

        assert [r["id"] for r in data["items"]] == [short.id]

    def test_duration_range_filter(self, client, test_db, test_project, auth_headers):
        add_recording(test_db, test_project, "a.mp3", duration=0.5)
        mid1 = add_recording(test_db, test_project, "b.mp3", duration=3.0)
        mid2 = add_recording(test_db, test_project, "c.mp3", duration=12.0)
        add_recording(test_db, test_project, "d.mp3", duration=30.0)

        data = list_recordings(
            client, test_project.id, auth_headers, min_duration=1.0, max_duration=15.0
        )

        assert {r["id"] for r in data["items"]} == {mid1.id, mid2.id}
        assert data["pagination"]["total_duration"] == pytest.approx(15.0)

    @pytest.mark.parametrize("order", ["asc", "desc"])
    def test_sort_by_duration(self, client, test_db, test_project, auth_headers, order):
        for name, duration in [("m.mp3", 5.0), ("s.mp3", 1.0), ("l.mp3", 9.0)]:
            add_recording(test_db, test_project, name, duration=duration)

        data = list_recordings(
            client, test_project.id, auth_headers, sort_by="duration", sort_order=order
        )

        durations = [r["duration"] for r in data["items"]]
        assert durations == sorted(durations, reverse=(order == "desc"))
        assert len(durations) == 3

    def test_sort_by_filename_and_search(self, client, test_db, test_project, auth_headers):
        add_recording(test_db, test_project, "robin_2.mp3")
        add_recording(test_db, test_project, "robin_1.mp3")
        add_recording(test_db, test_project, "sparrow.mp3")

        data = list_recordings(
            client,
            test_project.id,
            auth_headers,
            search="ROBIN",
            sort_by="filename",
            sort_order="asc",
        )

        assert [r["original_filename"] for r in data["items"]] == ["robin_1.mp3", "robin_2.mp3"]

    def test_pagination_metadata(self, client, test_db, test_project, auth_headers):
        for i in range(5):
            add_recording(test_db, test_project, f"rec_{i}.mp3", duration=2.0)

        first = list_recordings(client, test_project.id, auth_headers, skip=0, limit=2)
        last = list_recordings(client, test_project.id, auth_headers, skip=4, limit=2)

        assert len(first["items"]) == 2
        assert first["pagination"] == {
            "total": 5,
            "page": 1,
            "page_size": 2,
            "total_pages": 3,
            "has_next": True,
            "has_prev": False,
            "total_duration": pytest.approx(10.0),
            "finished_count": 0,
            "annotated_count": 0,
        }
        assert len(last["items"]) == 1
        assert last["pagination"]["page"] == 3
        assert last["pagination"]["has_next"] is False
        assert last["pagination"]["has_prev"] is True
        all_ids = {r["id"] for r in first["items"]} | {r["id"] for r in last["items"]}
        assert len(all_ids) == 3

    def test_annotation_status_filters_and_counts(
        self, client, test_db, test_project, test_user, auth_headers
    ):
        annotated = add_recording(test_db, test_project, "annotated.mp3")
        plain = add_recording(test_db, test_project, "plain.mp3")
        finished = add_recording(test_db, test_project, "finished.mp3", is_finished=True)
        add_annotation(test_db, annotated, test_user, n_boxes=3)

        everything = list_recordings(client, test_project.id, auth_headers)
        counts = {r["id"]: r["annotation_count"] for r in everything["items"]}
        assert counts == {annotated.id: 1, plain.id: 0, finished.id: 0}
        assert everything["pagination"]["annotated_count"] == 1
        assert everything["pagination"]["finished_count"] == 1

        only_annotated = list_recordings(
            client, test_project.id, auth_headers, annotation_status="annotated"
        )
        assert [r["id"] for r in only_annotated["items"]] == [annotated.id]

        unannotated = list_recordings(
            client, test_project.id, auth_headers, annotation_status="unannotated"
        )
        assert {r["id"] for r in unannotated["items"]} == {plain.id, finished.id}

        only_finished = list_recordings(
            client, test_project.id, auth_headers, annotation_status="finished"
        )
        assert [r["id"] for r in only_finished["items"]] == [finished.id]

    def test_list_items_do_not_expose_removed_spectrogram_fields(
        self, client, test_db, test_project, auth_headers
    ):
        add_recording(test_db, test_project, "a.mp3")
        item = list_recordings(client, test_project.id, auth_headers)["items"][0]
        assert "spectrogram_status" not in item

    def test_list_forbidden_for_other_user(self, client, test_db, test_project, other_auth_headers):
        response = client.get(
            f"/api/v1/recordings/{test_project.id}/recordings", headers=other_auth_headers
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_admin_may_list_any_project(self, client, test_db, test_project, admin_auth_headers):
        rec = add_recording(test_db, test_project, "a.mp3")
        data = list_recordings(client, test_project.id, admin_auth_headers)
        assert [r["id"] for r in data["items"]] == [rec.id]

    def test_list_missing_project_returns_404(self, client, auth_headers):
        response = client.get("/api/v1/recordings/999999/recordings", headers=auth_headers)
        assert response.status_code == status.HTTP_404_NOT_FOUND


class TestReadRecording:
    def test_owner_gets_recording_with_can_edit(self, client, test_recording, auth_headers):
        response = client.get(f"/api/v1/recordings/{test_recording.id}", headers=auth_headers)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["id"] == test_recording.id
        assert data["duration"] == test_recording.duration
        assert data["sample_rate"] == test_recording.sample_rate
        assert data["can_edit"] is True

    def test_admin_reads_regular_users_recording_read_only(
        self, client, test_recording, admin_auth_headers, monkeypatch
    ):
        monkeypatch.setattr(settings, "ADMIN_CAN_EDIT_USER_PROJECTS", False)
        response = client.get(f"/api/v1/recordings/{test_recording.id}", headers=admin_auth_headers)

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["can_edit"] is False

    def test_admin_can_edit_when_setting_allows(
        self, client, test_recording, admin_auth_headers, monkeypatch
    ):
        monkeypatch.setattr(settings, "ADMIN_CAN_EDIT_USER_PROJECTS", True)
        response = client.get(f"/api/v1/recordings/{test_recording.id}", headers=admin_auth_headers)

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["can_edit"] is True

    def test_other_user_is_forbidden(self, client, test_recording, other_auth_headers):
        response = client.get(f"/api/v1/recordings/{test_recording.id}", headers=other_auth_headers)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_missing_recording_returns_404(self, client, auth_headers):
        response = client.get("/api/v1/recordings/999999", headers=auth_headers)
        assert response.status_code == status.HTTP_404_NOT_FOUND


class TestFinishedStatus:
    def test_toggle_finished_on_and_off(self, client, test_db, test_recording, auth_headers):
        assert test_recording.is_finished is False
        url = f"/api/v1/recordings/{test_recording.id}/finished"

        response = client.patch(url, headers=auth_headers)
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["id"] == test_recording.id
        assert response.json()["is_finished"] is True
        test_db.refresh(test_recording)
        assert test_recording.is_finished is True

        response = client.patch(url, headers=auth_headers)
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["is_finished"] is False
        test_db.refresh(test_recording)
        assert test_recording.is_finished is False

    def test_toggle_reports_annotation_count(
        self, client, test_db, test_recording, test_user, auth_headers
    ):
        add_annotation(test_db, test_recording, test_user)
        response = client.patch(
            f"/api/v1/recordings/{test_recording.id}/finished", headers=auth_headers
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["annotation_count"] == 1

    def test_toggle_invalidates_cached_list(
        self, client, test_db, test_project, test_recording, auth_headers
    ):
        before = list_recordings(client, test_project.id, auth_headers)
        assert before["pagination"]["finished_count"] == 0

        client.patch(f"/api/v1/recordings/{test_recording.id}/finished", headers=auth_headers)

        after = list_recordings(client, test_project.id, auth_headers)
        assert after["pagination"]["finished_count"] == 1
        assert after["items"][0]["is_finished"] is True

    def test_toggle_requires_authentication(self, client, test_recording):
        response = client.patch(f"/api/v1/recordings/{test_recording.id}/finished")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_toggle_nonexistent_recording(self, client, auth_headers):
        response = client.patch("/api/v1/recordings/999999/finished", headers=auth_headers)
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_toggle_forbidden_for_other_user(
        self, client, test_db, test_recording, other_auth_headers
    ):
        response = client.patch(
            f"/api/v1/recordings/{test_recording.id}/finished", headers=other_auth_headers
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
        test_db.refresh(test_recording)
        assert test_recording.is_finished is False

    def test_admin_cannot_toggle_regular_users_recording(
        self, client, test_db, test_recording, admin_auth_headers, monkeypatch
    ):
        monkeypatch.setattr(settings, "ADMIN_CAN_EDIT_USER_PROJECTS", False)
        response = client.patch(
            f"/api/v1/recordings/{test_recording.id}/finished", headers=admin_auth_headers
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
        test_db.refresh(test_recording)
        assert test_recording.is_finished is False


class TestBackfillDurations:
    @pytest.mark.audio
    def test_backfill_fills_duration_from_stored_audio(
        self, client, test_db, test_project, admin_auth_headers, sample_mp3_bytes, store_object
    ):
        recording = add_recording(test_db, test_project, "missing.mp3", duration=None)
        store_object(recording.file_path, sample_mp3_bytes)

        response = client.post("/api/v1/recordings/backfill-durations", headers=admin_auth_headers)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["updated_count"] == 1, data
        assert data["failed_count"] == 0
        test_db.refresh(recording)
        assert recording.duration == pytest.approx(SAMPLE_MP3_DURATION, abs=0.05)
        assert recording.sample_rate == SAMPLE_MP3_SAMPLE_RATE

    def test_backfill_nothing_to_do(self, client, test_recording, admin_auth_headers):
        response = client.post("/api/v1/recordings/backfill-durations", headers=admin_auth_headers)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["updated_count"] == 0
        assert data["failed_count"] == 0
        assert data["total_processed"] == 0
        assert "No recordings found with missing duration" in data["message"]

    def test_backfill_counts_missing_and_undecodable_files_as_failures(
        self, client, test_db, test_project, admin_auth_headers, store_object
    ):
        missing = add_recording(test_db, test_project, "not_in_storage.mp3", duration=None)
        corrupt = add_recording(test_db, test_project, "corrupt.mp3", duration=None)
        store_object(corrupt.file_path, b"garbage, not audio")

        response = client.post("/api/v1/recordings/backfill-durations", headers=admin_auth_headers)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["updated_count"] == 0
        assert data["failed_count"] == 2
        assert data["total_processed"] == 2
        assert len(data["errors"]) == 2
        for recording in (missing, corrupt):
            test_db.refresh(recording)
            assert recording.duration is None

    def test_backfill_limits_reported_errors(
        self, client, test_db, test_project, admin_auth_headers
    ):
        for i in range(15):  # none of these exist in object storage
            add_recording(test_db, test_project, f"fail_{i}.mp3", duration=None)

        response = client.post("/api/v1/recordings/backfill-durations", headers=admin_auth_headers)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["failed_count"] == 15
        assert data["updated_count"] == 0
        assert len(data["errors"]) == 10
        assert data["additional_errors"] == 5

    def test_backfill_requires_admin(self, client, auth_headers):
        response = client.post("/api/v1/recordings/backfill-durations", headers=auth_headers)
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "Only admins can perform bulk operations" in response.json()["detail"]

    def test_backfill_requires_authentication(self, client):
        response = client.post("/api/v1/recordings/backfill-durations")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestAudioAndDeletion:
    def test_stream_audio(
        self, client, test_db, test_project, auth_headers, sample_mp3_bytes, store_object
    ):
        recording = add_recording(test_db, test_project, "stream.mp3")
        store_object(recording.file_path, sample_mp3_bytes)

        response = client.get(f"/api/v1/recordings/{recording.id}/audio", headers=auth_headers)

        assert response.status_code == status.HTTP_200_OK
        assert response.headers["content-type"] == "audio/mpeg"
        assert response.headers["content-length"] == str(len(sample_mp3_bytes))
        assert response.content == sample_mp3_bytes

    def test_stream_audio_forbidden_for_other_user(
        self, client, test_recording, other_auth_headers
    ):
        response = client.get(
            f"/api/v1/recordings/{test_recording.id}/audio", headers=other_auth_headers
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_delete_recording_removes_row_annotations_and_object(
        self, client, test_db, test_project, test_user, auth_headers, store_object
    ):
        recording = add_recording(test_db, test_project, "doomed.mp3")
        add_annotation(test_db, recording, test_user, n_boxes=2)
        store_object(recording.file_path, b"data")
        recording_id = recording.id

        response = client.delete(f"/api/v1/recordings/{recording_id}", headers=auth_headers)

        assert response.status_code == status.HTTP_200_OK
        test_db.expire_all()
        assert test_db.query(Recording).filter(Recording.id == recording_id).count() == 0
        assert test_db.query(Annotation).count() == 0
        assert test_db.query(BoundingBox).count() == 0
        with pytest.raises(S3Error):
            minio_client.download_file(settings.MINIO_BUCKET_RECORDINGS, recording.file_path)

    def test_delete_forbidden_for_other_user(
        self, client, test_db, test_recording, other_auth_headers
    ):
        response = client.delete(
            f"/api/v1/recordings/{test_recording.id}", headers=other_auth_headers
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert test_db.query(Recording).count() == 1

    def test_bulk_delete_only_touches_own_project(
        self, client, test_db, test_project, other_user, auth_headers
    ):
        from app.models.project import Project

        keep = add_recording(test_db, test_project, "keep.mp3")
        drop1 = add_recording(test_db, test_project, "drop1.mp3")
        drop2 = add_recording(test_db, test_project, "drop2.mp3")
        foreign_project = Project(name="Foreign", owner_id=other_user.id)
        test_db.add(foreign_project)
        test_db.commit()
        foreign = add_recording(test_db, foreign_project, "foreign.mp3")

        response = client.post(
            f"/api/v1/recordings/{test_project.id}/bulk-delete",
            json=[drop1.id, drop2.id, foreign.id],
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["deleted_count"] == 2
        assert data["total_requested"] == 3
        test_db.expire_all()
        remaining = {r.id for r in test_db.query(Recording).all()}
        assert remaining == {keep.id, foreign.id}
