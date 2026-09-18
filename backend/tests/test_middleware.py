"""Tests for proxy_headers_middleware in app/main.py."""

import pytest
from fastapi import status


def test_http_exceptions_pass_through_middleware(client, auth_headers):
    """Endpoint HTTP exceptions reach the client unchanged (regression: TypeError)."""
    response = client.get(
        "/api/v1/recordings/999999", headers={**auth_headers, "X-Forwarded-Proto": "https"}
    )
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.json() == {"detail": "Recording not found"}


def test_unauthenticated_request_returns_401(client):
    response = client.get("/api/v1/projects/", headers={"X-Forwarded-Proto": "https"})
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


def test_invalid_token_returns_403(client):
    response = client.get(
        "/api/v1/projects/",
        headers={"Authorization": "Bearer not-a-jwt", "X-Forwarded-Proto": "https"},
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN


def test_non_admin_forbidden_on_admin_endpoint(client, auth_headers):
    response = client.get("/api/v1/users/", headers={**auth_headers, "X-Forwarded-Proto": "https"})
    assert response.status_code == status.HTTP_403_FORBIDDEN


def test_login_works_behind_proxy(client, test_user):
    response = client.post(
        "/api/v1/auth/login",
        data={"username": test_user.email, "password": "testpassword"},
        headers={"X-Forwarded-Proto": "https", "X-Forwarded-Host": "example.com"},
    )
    assert response.status_code == status.HTTP_200_OK
    token = response.json()["access_token"]

    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == status.HTTP_200_OK
    assert me.json()["email"] == test_user.email


def test_login_rejects_wrong_password(client, test_user):
    response = client.post(
        "/api/v1/auth/login",
        data={"username": test_user.email, "password": "wrong"},  # pragma: allowlist secret
    )
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


def test_redirect_uses_forwarded_host_without_port(client):
    """Slash redirects point at the public host (port stripped) over https."""
    response = client.get(
        "/api/v1/projects",
        headers={"X-Forwarded-Proto": "https", "X-Forwarded-Host": "example.com:8443"},
        follow_redirects=False,
    )
    assert response.status_code == status.HTTP_307_TEMPORARY_REDIRECT
    assert response.headers["location"] == "https://example.com/api/v1/projects/"


def test_redirect_is_upgraded_to_https(client):
    """Even when the proxy reports plain http, redirect locations are rewritten to https."""
    response = client.get(
        "/api/v1/projects",
        headers={"X-Forwarded-Proto": "http", "X-Forwarded-Host": "example.com"},
        follow_redirects=False,
    )
    assert response.status_code == status.HTTP_307_TEMPORARY_REDIRECT
    assert response.headers["location"] == "https://example.com/api/v1/projects/"


def test_scheme_defaults_to_https_without_forwarded_proto(client):
    response = client.get("/api/v1/projects", follow_redirects=False)
    assert response.status_code == status.HTTP_307_TEMPORARY_REDIRECT
    assert response.headers["location"].startswith("https://")


def test_health_endpoint(client):
    response = client.get("/health", headers={"X-Forwarded-Host": "example.com:443"})
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["status"] == "ok"


def test_successful_request_is_untouched(client, auth_headers, test_project):
    response = client.get(
        f"/api/v1/projects/{test_project.id}",
        headers={**auth_headers, "X-Forwarded-Proto": "https"},
    )
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["id"] == test_project.id
    assert data["name"] == test_project.name
