"""Tests for the per-project overlap rule (projects.allow_overlaps)."""

from fastapi import status

from app.models.annotation import Annotation, BoundingBox


def project_url(project_id):
    return f"/api/v1/projects/{project_id}"


class TestAllowOverlaps:
    def test_off_by_default(self, client, test_project, test_recording, auth_headers):
        assert (
            client.get(project_url(test_project.id), headers=auth_headers).json()["allow_overlaps"]
            is False
        )
        recording = client.get(f"/api/v1/recordings/{test_recording.id}", headers=auth_headers)
        assert recording.json()["allow_overlaps"] is False

    def test_owner_can_switch_it(self, client, test_project, test_recording, auth_headers):
        response = client.put(
            project_url(test_project.id), json={"allow_overlaps": True}, headers=auth_headers
        )
        assert response.status_code == status.HTTP_200_OK, response.text
        assert response.json()["allow_overlaps"] is True
        recording = client.get(f"/api/v1/recordings/{test_recording.id}", headers=auth_headers)
        assert recording.json()["allow_overlaps"] is True

    def test_editing_name_keeps_the_rule(self, client, test_project, auth_headers):
        client.put(
            project_url(test_project.id), json={"allow_overlaps": True}, headers=auth_headers
        )
        response = client.put(
            project_url(test_project.id), json={"name": "Renamed"}, headers=auth_headers
        )
        assert response.json()["allow_overlaps"] is True

    def test_null_is_rejected(self, client, test_project, auth_headers):
        response = client.put(
            project_url(test_project.id), json={"allow_overlaps": None}, headers=auth_headers
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_other_user_cannot_switch_it(self, client, test_project, other_auth_headers):
        response = client.put(
            project_url(test_project.id), json={"allow_overlaps": True}, headers=other_auth_headers
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_switching_never_touches_annotations(
        self, client, test_db, test_project, test_recording, test_user, auth_headers
    ):
        # Two overlapping boxes, saved while overlaps are not allowed.
        boxes = [
            {
                "x": 0,
                "y": 0,
                "width": 1,
                "height": 1,
                "start_time": 1.0,
                "end_time": 2.0,
                "min_frequency": 1000.0,
                "max_frequency": 2000.0,
                "label": "A",
            },
            {
                "x": 0,
                "y": 0,
                "width": 1,
                "height": 1,
                "start_time": 1.5,
                "end_time": 2.5,
                "min_frequency": 1000.0,
                "max_frequency": 2000.0,
                "label": "B",
            },
        ]
        client.post(
            f"/api/v1/annotations/{test_recording.id}",
            json={"recording_id": test_recording.id, "bounding_boxes": boxes},
            headers=auth_headers,
        )

        def snapshot():
            test_db.expire_all()
            return sorted(
                (b.id, b.start_time, b.end_time, b.label) for b in test_db.query(BoundingBox).all()
            )

        before = snapshot()
        assert len(before) == 2
        for value in (True, False, True):
            client.put(
                project_url(test_project.id), json={"allow_overlaps": value}, headers=auth_headers
            )
            assert snapshot() == before
        assert test_db.query(Annotation).count() == 1
