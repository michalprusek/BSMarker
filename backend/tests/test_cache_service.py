"""Tests for the Redis cache connection (app/services/cache_service.py).

Regression: the pool used to be built from host and port only, so the password
from REDIS_URL was dropped and the cache silently stayed disabled in production.
"""

import pytest
import redis

from app.core.config import settings
from app.services.cache_service import CACHE_DB, CacheService


@pytest.fixture
def no_ping(monkeypatch):
    """Build the client without talking to a server."""
    monkeypatch.setattr(redis.Redis, "ping", lambda self: True)


def test_credentials_from_url_reach_the_connection(monkeypatch, no_ping):
    url = "redis://user:p%40ss%3Aword@cache-host:6380/0"  # pragma: allowlist secret
    monkeypatch.setattr(settings, "REDIS_URL", url)

    kwargs = CacheService().redis_client.connection_pool.connection_kwargs

    assert kwargs["host"] == "cache-host"
    assert kwargs["port"] == 6380
    assert kwargs["username"] == "user"
    assert kwargs["password"] == "p@ss:word"  # pragma: allowlist secret


def test_cache_uses_its_own_database_not_the_one_in_the_url(monkeypatch, no_ping):
    """Database 0 in the URL belongs to the rate limiter."""
    monkeypatch.setattr(settings, "REDIS_URL", "redis://redis:6379/0")

    assert CacheService().redis_client.connection_pool.connection_kwargs["db"] == CACHE_DB


def test_passwordless_url_has_no_credentials(monkeypatch, no_ping):
    monkeypatch.setattr(settings, "REDIS_URL", "redis://redis:6379/0")

    kwargs = CacheService().redis_client.connection_pool.connection_kwargs

    assert kwargs["username"] is None
    assert kwargs["password"] is None


def test_unreachable_redis_disables_the_cache_instead_of_failing(monkeypatch):
    monkeypatch.setattr(settings, "REDIS_URL", "redis://127.0.0.1:1/0")

    service = CacheService()

    assert service.enabled is False
    assert service.get("bsmarker:cache:whatever") is None


def test_round_trip_against_a_real_redis():
    """The test environment provides Redis; values must survive a set/get."""
    service = CacheService()
    assert service.enabled is True, "test Redis is not reachable"

    assert service.set("bsmarker:cache:test:key", {"a": 1}, ttl=30) is True
    assert service.get("bsmarker:cache:test:key") == {"a": 1}
    service.delete("bsmarker:cache:test:key")
    assert service.get("bsmarker:cache:test:key") is None
