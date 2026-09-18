"""Tests for the annotations API (app/api/api_v1/endpoints/annotations.py)."""

from fastapi import status

from app.core.config import settings
from app.models.annotation import Annotation, BoundingBox


def box(**overrides):
    data = {
        "x": 10,
        "y": 20,
        "width": 30,
        "height": 40,
        "start_time": 1.0,
        "end_time": 2.5,
        "min_frequency": 1000.0,
        "max_frequency": 5000.0,
        "label": "Turdus merula",
        "confidence": 0.9,
    }
    data.update(overrides)
    return data


def save(client, recording_id, boxes, headers):
    return client.post(
        f"/api/v1/annotations/{recording_id}",
        json={"recording_id": recording_id, "bounding_boxes": boxes},
        headers=headers,
    )


class TestSaveAnnotations:
    def test_post_creates_annotation_with_boxes(
        self, client, test_db, test_recording, test_user, auth_headers
    ):
        response = save(client, test_recording.id, [box(), box(label="Parus major")], auth_headers)

        assert response.status_code == status.HTTP_200_OK, response.text
        data = response.json()
        assert data["recording_id"] == test_recording.id
        assert data["user_id"] == test_user.id
        assert sorted(b["label"] for b in data["bounding_boxes"]) == [
            "Parus major",
            "Turdus merula",
        ]
        first = next(b for b in data["bounding_boxes"] if b["label"] == "Turdus merula")
        assert first["start_time"] == 1.0
        assert first["end_time"] == 2.5
        assert first["min_frequency"] == 1000.0
        assert first["max_frequency"] == 5000.0
        assert first["confidence"] == 0.9

    def test_post_is_full_replace_with_one_annotation_per_user(
        self, client, test_db, test_recording, auth_headers
    ):
        first = save(client, test_recording.id, [box(label="a"), box(label="b")], auth_headers)
        second = save(client, test_recording.id, [box(label="c")], auth_headers)

        assert first.status_code == second.status_code == status.HTTP_200_OK
        assert second.json()["id"] == first.json()["id"]
        assert [b["label"] for b in second.json()["bounding_boxes"]] == ["c"]
        assert test_db.query(Annotation).count() == 1
        assert test_db.query(BoundingBox).count() == 1

        listed = client.get(f"/api/v1/annotations/{test_recording.id}", headers=auth_headers)
        assert listed.status_code == status.HTTP_200_OK
        assert len(listed.json()) == 1
        assert [b["label"] for b in listed.json()[0]["bounding_boxes"]] == ["c"]

    def test_post_empty_list_clears_boxes(self, client, test_db, test_recording, auth_headers):
        save(client, test_recording.id, [box(), box()], auth_headers)
        response = save(client, test_recording.id, [], auth_headers)

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["bounding_boxes"] == []
        assert test_db.query(Annotation).count() == 1
        assert test_db.query(BoundingBox).count() == 0

    def test_null_frequencies_round_trip(self, client, test_recording, auth_headers):
        response = save(
            client,
            test_recording.id,
            [box(min_frequency=None, max_frequency=None, confidence=None)],
            auth_headers,
        )
        assert response.status_code == status.HTTP_200_OK
        saved = response.json()["bounding_boxes"][0]
        assert saved["min_frequency"] is None
        assert saved["max_frequency"] is None
        assert saved["confidence"] is None

        listed = client.get(f"/api/v1/annotations/{test_recording.id}", headers=auth_headers)
        fetched = listed.json()[0]["bounding_boxes"][0]
        assert fetched["min_frequency"] is None
        assert fetched["max_frequency"] is None

    def test_extra_metadata_round_trips(self, client, test_db, test_recording, auth_headers):
        metadata = {"call_type": "song", "quality": 4, "tags": ["dawn", "overlap"]}
        response = save(client, test_recording.id, [box(extra_metadata=metadata)], auth_headers)

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["bounding_boxes"][0]["extra_metadata"] == metadata
        assert test_db.query(BoundingBox).one().extra_metadata == metadata

        listed = client.get(f"/api/v1/annotations/{test_recording.id}", headers=auth_headers)
        assert listed.json()[0]["bounding_boxes"][0]["extra_metadata"] == metadata

    def test_pixel_coordinates_are_rounded(self, client, test_recording, auth_headers):
        response = save(
            client,
            test_recording.id,
            [box(x=10.6, y=20.4, width=30.5000001, height=39.9999)],
            auth_headers,
        )
        saved = response.json()["bounding_boxes"][0]
        assert (saved["x"], saved["y"], saved["width"], saved["height"]) == (11, 20, 31, 40)

    def test_missing_recording_returns_404(self, client, auth_headers):
        response = save(client, 999999, [box()], auth_headers)
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_other_user_may_not_save(self, client, test_db, test_recording, other_auth_headers):
        response = save(client, test_recording.id, [box()], other_auth_headers)

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert test_db.query(Annotation).count() == 0

    def test_admin_may_not_save_on_regular_users_project(
        self, client, test_db, test_recording, admin_auth_headers, monkeypatch
    ):
        monkeypatch.setattr(settings, "ADMIN_CAN_EDIT_USER_PROJECTS", False)
        response = save(client, test_recording.id, [box()], admin_auth_headers)

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert test_db.query(Annotation).count() == 0

    def test_admin_may_save_when_setting_allows(
        self, client, test_db, test_recording, admin_user, admin_auth_headers, monkeypatch
    ):
        monkeypatch.setattr(settings, "ADMIN_CAN_EDIT_USER_PROJECTS", True)
        response = save(client, test_recording.id, [box()], admin_auth_headers)

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["user_id"] == admin_user.id

    def test_save_requires_authentication(self, client, test_recording):
        response = client.post(
            f"/api/v1/annotations/{test_recording.id}",
            json={"recording_id": test_recording.id, "bounding_boxes": []},
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestReadAnnotations:
    def test_read_returns_only_current_users_annotation(
        self,
        client,
        test_db,
        test_recording,
        admin_user,
        auth_headers,
        admin_auth_headers,
        monkeypatch,
    ):
        monkeypatch.setattr(settings, "ADMIN_CAN_EDIT_USER_PROJECTS", True)
        save(client, test_recording.id, [box(label="owner")], auth_headers)
        save(client, test_recording.id, [box(label="admin")], admin_auth_headers)
        assert test_db.query(Annotation).count() == 2

        owner_view = client.get(f"/api/v1/annotations/{test_recording.id}", headers=auth_headers)
        admin_view = client.get(
            f"/api/v1/annotations/{test_recording.id}", headers=admin_auth_headers
        )

        assert [b["label"] for b in owner_view.json()[0]["bounding_boxes"]] == ["owner"]
        assert len(admin_view.json()) == 1
        assert admin_view.json()[0]["user_id"] == admin_user.id

    def test_admin_may_read_regular_users_recording(
        self, client, test_recording, admin_auth_headers, monkeypatch
    ):
        monkeypatch.setattr(settings, "ADMIN_CAN_EDIT_USER_PROJECTS", False)
        response = client.get(
            f"/api/v1/annotations/{test_recording.id}", headers=admin_auth_headers
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.json() == []

    def test_other_user_may_not_read(self, client, test_recording, other_auth_headers):
        response = client.get(
            f"/api/v1/annotations/{test_recording.id}", headers=other_auth_headers
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN


class TestUpdateAndDeleteAnnotation:
    def test_put_replaces_boxes(self, client, test_db, test_recording, auth_headers):
        annotation_id = save(client, test_recording.id, [box(label="old")], auth_headers).json()[
            "id"
        ]

        response = client.put(
            f"/api/v1/annotations/{annotation_id}",
            json={"bounding_boxes": [box(label="new1"), box(label="new2")]},
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK
        assert sorted(b["label"] for b in response.json()["bounding_boxes"]) == ["new1", "new2"]
        assert test_db.query(BoundingBox).count() == 2

    def test_put_by_other_user_is_forbidden(
        self, client, test_db, test_recording, auth_headers, other_auth_headers
    ):
        annotation_id = save(client, test_recording.id, [box()], auth_headers).json()["id"]

        response = client.put(
            f"/api/v1/annotations/{annotation_id}",
            json={"bounding_boxes": []},
            headers=other_auth_headers,
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert test_db.query(BoundingBox).count() == 1

    def test_delete_annotation(self, client, test_db, test_recording, auth_headers):
        annotation_id = save(client, test_recording.id, [box(), box()], auth_headers).json()["id"]

        response = client.delete(f"/api/v1/annotations/{annotation_id}", headers=auth_headers)

        assert response.status_code == status.HTTP_200_OK
        test_db.expire_all()
        assert test_db.query(Annotation).count() == 0
        assert test_db.query(BoundingBox).count() == 0

    def test_delete_by_other_user_is_forbidden(
        self, client, test_db, test_recording, auth_headers, other_auth_headers
    ):
        annotation_id = save(client, test_recording.id, [box()], auth_headers).json()["id"]
        response = client.delete(f"/api/v1/annotations/{annotation_id}", headers=other_auth_headers)
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert test_db.query(Annotation).count() == 1
