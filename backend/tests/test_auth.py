"""Tests for the auth endpoints that keep a session alive."""

from datetime import timedelta

from jose import jwt

from app.core.config import settings
from app.core.security import create_access_token


def test_refresh_returns_new_token_for_same_user(client, test_user):
    old = create_access_token(data={"sub": str(test_user.id)}, expires_delta=timedelta(minutes=1))
    response = client.post(
        f"{settings.API_V1_STR}/auth/refresh", headers={"Authorization": f"Bearer {old}"}
    )
    assert response.status_code == 200
    token = response.json()["access_token"]
    new_payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    old_payload = jwt.decode(old, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    assert new_payload["sub"] == str(test_user.id)
    assert new_payload["exp"] > old_payload["exp"]

    # The new token actually works.
    me = client.get(f"{settings.API_V1_STR}/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200


def test_refresh_rejects_expired_token(client, test_user):
    expired = create_access_token(
        data={"sub": str(test_user.id)}, expires_delta=timedelta(minutes=-1)
    )
    response = client.post(
        f"{settings.API_V1_STR}/auth/refresh", headers={"Authorization": f"Bearer {expired}"}
    )
    assert response.status_code == 403


def test_refresh_requires_token(client):
    response = client.post(f"{settings.API_V1_STR}/auth/refresh")
    assert response.status_code == 401


def test_refresh_rejects_inactive_user(client, test_user, test_db):
    token = create_access_token(data={"sub": str(test_user.id)})
    headers = {"Authorization": f"Bearer {token}"}
    test_user.is_active = False
    test_db.commit()
    response = client.post(f"{settings.API_V1_STR}/auth/refresh", headers=headers)
    assert response.status_code == 400
