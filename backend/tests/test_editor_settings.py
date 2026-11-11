"""Tests for the editor view settings API (app/api/api_v1/endpoints/editor_settings.py)."""

from fastapi import status

from app.models.editor_settings import RecordingViewSettings

DEFAULTS = "/api/v1/editor-settings/defaults"


def rec_url(recording_id):
    return f"/api/v1/editor-settings/recordings/{recording_id}"


class TestDefaults:
    def test_empty_until_saved(self, client, auth_headers):
        response = client.get(DEFAULTS, headers=auth_headers)
        assert response.status_code == status.HTTP_200_OK
        assert response.json() == {"palette": None, "range_db": None}

    def test_save_and_replace(self, client, auth_headers):
        client.put(DEFAULTS, json={"palette": "magma", "range_db": 60}, headers=auth_headers)
        assert client.get(DEFAULTS, headers=auth_headers).json() == {
            "palette": "magma",
            "range_db": 60,
        }
        client.put(DEFAULTS, json={"palette": "gray"}, headers=auth_headers)
        assert client.get(DEFAULTS, headers=auth_headers).json()["palette"] == "gray"

    def test_per_user(self, client, auth_headers, other_auth_headers):
        client.put(DEFAULTS, json={"palette": "magma"}, headers=auth_headers)
        assert client.get(DEFAULTS, headers=other_auth_headers).json()["palette"] is None

    def test_rejects_unknown_palette(self, client, auth_headers):
        response = client.put(DEFAULTS, json={"palette": "rainbow"}, headers=auth_headers)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_requires_login(self, client):
        assert client.get(DEFAULTS).status_code == status.HTTP_401_UNAUTHORIZED


class TestRecordingSettings:
    SETTINGS = {
        "palette": "gray",
        "fft_size": 2048,
        "contrast": "custom",
        "levels": {"floor": -90, "ceil": -40},
        "freq_floor": None,
    }

    def test_round_trip_keeps_explicit_null(self, client, test_recording, auth_headers):
        response = client.put(rec_url(test_recording.id), json=self.SETTINGS, headers=auth_headers)
        assert response.status_code == status.HTTP_200_OK, response.text
        got = client.get(rec_url(test_recording.id), headers=auth_headers).json()
        assert got == self.SETTINGS

    def test_returns_only_stored_keys(self, client, test_recording, auth_headers):
        assert client.get(rec_url(test_recording.id), headers=auth_headers).json() == {}
        client.put(rec_url(test_recording.id), json={"fft_size": 512}, headers=auth_headers)
        assert client.get(rec_url(test_recording.id), headers=auth_headers).json() == {
            "fft_size": 512
        }

    def test_put_replaces_and_ignores_unknown_keys(
        self, client, test_db, test_recording, auth_headers
    ):
        client.put(rec_url(test_recording.id), json=self.SETTINGS, headers=auth_headers)
        client.put(
            rec_url(test_recording.id),
            json={"fft_size": 512, "something_new": 1},
            headers=auth_headers,
        )
        rows = test_db.query(RecordingViewSettings).all()
        assert len(rows) == 1
        assert rows[0].settings == {"fft_size": 512}

    def test_rejects_invalid_fft_size(self, client, test_recording, auth_headers):
        response = client.put(
            rec_url(test_recording.id), json={"fft_size": 1000}, headers=auth_headers
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_other_users_recording_is_forbidden(self, client, test_recording, other_auth_headers):
        assert client.get(rec_url(test_recording.id), headers=other_auth_headers).status_code == 403
        response = client.put(rec_url(test_recording.id), json={}, headers=other_auth_headers)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_admin_keeps_own_settings_on_users_recording(
        self, client, test_recording, auth_headers, admin_auth_headers
    ):
        client.put(
            rec_url(test_recording.id), json={"palette": "magma"}, headers=admin_auth_headers
        )
        assert client.get(rec_url(test_recording.id), headers=auth_headers).json() == {}

    def test_missing_recording(self, client, auth_headers):
        assert client.get(rec_url(99999), headers=auth_headers).status_code == 404

    def test_deleting_recording_deletes_its_settings(
        self, client, test_db, test_recording, auth_headers
    ):
        client.put(rec_url(test_recording.id), json={"palette": "magma"}, headers=auth_headers)
        test_db.delete(test_recording)
        test_db.commit()
        assert test_db.query(RecordingViewSettings).count() == 0
