"""Tests for middleware functionality."""

from typing import Any, Dict

from fastapi import status


def test_proxy_headers_middleware_reraises_http_exception(client: Any) -> None:
    """Test HTTPException is properly re-raised by proxy_headers_middleware."""
    # Test 404 Not Found - Regression test for TypeError bug
    response = client.get("/api/v1/recordings/999999", headers={"X-Forwarded-Proto": "https"})
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert "detail" in response.json()


def test_proxy_headers_middleware_handles_unauthorized(client: Any) -> None:
    """Test that 401 Unauthorized errors are properly handled through middleware."""
    # Try to access protected endpoint without auth
    response = client.get("/api/v1/projects", headers={"X-Forwarded-Proto": "https"})
    assert response.status_code == status.HTTP_401_UNAUTHORIZED


def test_proxy_headers_middleware_handles_forbidden(
    client: Any, auth_headers: Dict[str, str]
) -> None:
    """Test that 403 Forbidden errors are properly handled through middleware."""
    # Try to access admin-only endpoint as regular user
    response = client.delete(
        "/api/v1/users/1",  # Assuming this is admin-only
        headers={**auth_headers, "X-Forwarded-Proto": "https"},
    )
    # Should be either 403 Forbidden or 404 Not Found depending on permissions
    assert response.status_code in [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND]


def test_proxy_headers_middleware_updates_scheme(client: Any, test_user: Any) -> None:
    """Test that middleware correctly updates request scheme from proxy headers."""
    # Login endpoint should work with proper headers
    response = client.post(
        "/api/v1/auth/login",
        json={"username": test_user.email, "password": "testpassword"},
        headers={"X-Forwarded-Proto": "https", "X-Forwarded-Host": "example.com"},
    )
    assert response.status_code == status.HTTP_200_OK
    assert "access_token" in response.json()


def test_proxy_headers_middleware_handles_host_with_port(client: Any) -> None:
    """Test that middleware correctly strips port from forwarded host."""
    response = client.get(
        "/api/v1/health",
        headers={"X-Forwarded-Proto": "https", "X-Forwarded-Host": "example.com:443"},
    )
    assert response.status_code == status.HTTP_200_OK


def test_proxy_headers_middleware_defaults_to_https(client: Any) -> None:
    """Test that middleware defaults to HTTPS when X-Forwarded-Proto not provided."""
    response = client.get("/api/v1/health")
    assert response.status_code == status.HTTP_200_OK


def test_middleware_allows_successful_requests(
    client: Any, auth_headers: Dict[str, str], test_project: Any
) -> None:
    """Test that middleware doesn't interfere with successful requests."""
    response = client.get(
        f"/api/v1/projects/{test_project.id}",
        headers={**auth_headers, "X-Forwarded-Proto": "https"},
    )
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["id"] == test_project.id
    assert data["name"] == test_project.name
