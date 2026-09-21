"""
Redis caching service for BSMarker application.

Provides efficient caching for database queries and API responses.
"""

import hashlib
import json
import logging
import urllib.parse
from typing import Any, Optional

import redis
from redis.exceptions import RedisError

from app.core.config import settings

logger = logging.getLogger(__name__)

# Database 0 is used by the rate limiter, so the cache lives in database 1.
CACHE_DB = 1


class CacheService:
    """
    Redis-based caching service with automatic serialization and TTL management.

    Implements cache-aside pattern for optimal performance with large datasets.
    """

    def __init__(self) -> None:
        """Initialize Redis connection with connection pooling."""
        self.redis_client: Optional[redis.Redis] = None
        self.enabled = True
        self._initialize_connection()

    def _initialize_connection(self) -> None:
        """Connect to Redis, or run without a cache if it is unreachable."""
        try:
            # The credentials have to be taken from REDIS_URL by hand: building
            # the pool from host and port alone silently dropped the password,
            # and redis.ConnectionPool.from_url would override db with the one
            # in the URL (that one belongs to the rate limiter).
            parsed_url = urllib.parse.urlparse(settings.REDIS_URL)
            unquote = urllib.parse.unquote

            pool = redis.ConnectionPool(
                host=parsed_url.hostname or "localhost",
                port=parsed_url.port or 6379,
                username=unquote(parsed_url.username) if parsed_url.username else None,
                password=unquote(parsed_url.password) if parsed_url.password else None,
                db=CACHE_DB,
                decode_responses=True,
                max_connections=50,
                socket_keepalive=True,
                socket_connect_timeout=5,
                socket_timeout=5,
            )
            self.redis_client = redis.Redis(connection_pool=pool)

            # Test connection
            self.redis_client.ping()
            logger.info("Redis cache service initialized successfully")

        except (RedisError, OSError, ValueError) as e:
            logger.warning(f"Redis cache service unavailable: {str(e)}. Running without cache.")
            self.enabled = False

    def _generate_cache_key(self, prefix: str, **kwargs: Any) -> str:
        """
        Generate a consistent cache key based on prefix and parameters.

        Args:
            prefix: Cache key prefix
            **kwargs: Parameters to include in the key

        Returns:
            Hashed cache key
        """
        # Sort kwargs for consistent key generation
        sorted_params = sorted(kwargs.items())
        param_str = json.dumps(sorted_params, sort_keys=True, default=str)

        # Create hash for long keys
        key_hash = hashlib.md5(param_str.encode(), usedforsecurity=False).hexdigest()[:16]

        return f"bsmarker:cache:{prefix}:{key_hash}"

    def get(self, key: str) -> Optional[Any]:
        """
        Get value from cache.

        Args:
            key: Cache key

        Returns:
            Cached value or None if not found
        """
        if not self.enabled or not self.redis_client:
            return None

        try:
            value = self.redis_client.get(key)
            if value:
                return json.loads(value)
            return None

        except (RedisError, json.JSONDecodeError) as e:
            logger.error(f"Cache get error for key {key}: {str(e)}")
            return None

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """
        Set value in cache with optional TTL.

        Args:
            key: Cache key
            value: Value to cache
            ttl: Time to live in seconds (default: 300)

        Returns:
            True if successful, False otherwise
        """
        if not self.enabled or not self.redis_client:
            return False

        if ttl is None:
            ttl = 300  # Default 5 minutes

        try:
            serialized = json.dumps(value, default=str)
            self.redis_client.setex(key, ttl, serialized)
            return True

        except (RedisError, TypeError) as e:
            logger.error(f"Cache set error for key {key}: {str(e)}")
            return False

    def delete(self, key: str) -> bool:
        """
        Delete a key from cache.

        Args:
            key: Cache key to delete

        Returns:
            True if deleted, False otherwise
        """
        if not self.enabled or not self.redis_client:
            return False

        try:
            self.redis_client.delete(key)
            return True

        except RedisError as e:
            logger.error(f"Cache delete error for key {key}: {str(e)}")
            return False

    def delete_pattern(self, pattern: str) -> int:
        """
        Delete all keys matching a pattern.

        Args:
            pattern: Pattern to match (e.g., "bsmarker:cache:recordings:*")

        Returns:
            Number of keys deleted
        """
        if not self.enabled or not self.redis_client:
            return 0

        try:
            # SCAN, not KEYS: KEYS walks the whole keyspace and blocks Redis,
            # and invalidation runs on every annotation save.
            deleted = 0
            batch: list = []
            for key in self.redis_client.scan_iter(match=pattern, count=500):
                batch.append(key)
                if len(batch) >= 500:
                    deleted += self.redis_client.delete(*batch)
                    batch = []
            if batch:
                deleted += self.redis_client.delete(*batch)
            return deleted

        except RedisError as e:
            logger.error(f"Cache delete pattern error for {pattern}: {str(e)}")
            return 0

    # Specific cache methods for recordings

    def get_project_recordings(
        self,
        project_id: int,
        skip: int,
        limit: int,
        search: Optional[str] = None,
        min_duration: Optional[float] = None,
        max_duration: Optional[float] = None,
        annotation_status: Optional[str] = None,
        sort_by: Optional[str] = "created_at",
        sort_order: Optional[str] = "desc",
    ) -> Optional[dict]:
        """
        Get cached recordings for a project.

        Returns:
            Cached recording data or None
        """
        key = self._generate_cache_key(
            f"recordings:p{project_id}",
            project_id=project_id,
            skip=skip,
            limit=limit,
            search=search,
            min_duration=min_duration,
            max_duration=max_duration,
            annotation_status=annotation_status,
            sort_by=sort_by,
            sort_order=sort_order,
        )
        return self.get(key)

    def set_project_recordings(
        self,
        project_id: int,
        skip: int,
        limit: int,
        data: dict,
        search: Optional[str] = None,
        min_duration: Optional[float] = None,
        max_duration: Optional[float] = None,
        annotation_status: Optional[str] = None,
        sort_by: Optional[str] = "created_at",
        sort_order: Optional[str] = "desc",
        ttl: int = 300,
    ) -> bool:
        """
        Cache recordings for a project.

        Args:
            project_id: Project ID
            skip: Pagination offset
            limit: Pagination limit
            data: Recording data to cache
            search: Filename search filter
            min_duration: Minimum duration filter
            max_duration: Maximum duration filter
            annotation_status: Annotation status filter
            sort_by: Sort field
            sort_order: Sort order
            ttl: Cache TTL in seconds

        Returns:
            True if cached successfully
        """
        key = self._generate_cache_key(
            f"recordings:p{project_id}",
            project_id=project_id,
            skip=skip,
            limit=limit,
            search=search,
            min_duration=min_duration,
            max_duration=max_duration,
            annotation_status=annotation_status,
            sort_by=sort_by,
            sort_order=sort_order,
        )
        return self.set(key, data, ttl)

    def invalidate_project_recordings(self, project_id: int) -> None:
        """
        Invalidate all cached recordings for a project.

        Args:
            project_id: Project ID
        """
        # The project id is part of the key prefix, so only this project's
        # cached pages are dropped.
        deleted = self.delete_pattern(f"bsmarker:cache:recordings:p{project_id}:*")
        logger.info(f"Invalidated {deleted} recording cache entries for project {project_id}")

    def get_recording_detail(self, recording_id: int) -> Optional[dict]:
        """
        Get cached recording detail.

        Args:
            recording_id: Recording ID

        Returns:
            Cached recording or None
        """
        key = f"bsmarker:cache:recording:{recording_id}"
        return self.get(key)

    def set_recording_detail(self, recording_id: int, data: dict, ttl: int = 1800) -> bool:
        """
        Cache recording detail.

        Args:
            recording_id: Recording ID
            data: Recording data
            ttl: Cache TTL (default: 30 minutes)

        Returns:
            True if cached successfully
        """
        key = f"bsmarker:cache:recording:{recording_id}"
        return self.set(key, data, ttl)

    def invalidate_recording(self, recording_id: int) -> None:
        """
        Invalidate cached data for a specific recording.

        Args:
            recording_id: Recording ID
        """
        key = f"bsmarker:cache:recording:{recording_id}"
        self.delete(key)

    def get_cache_stats(self) -> dict:
        """
        Get cache statistics.

        Returns:
            Dictionary with cache stats
        """
        if not self.enabled or not self.redis_client:
            return {"enabled": False}

        try:
            info = self.redis_client.info("stats")
            memory = self.redis_client.info("memory")

            return {
                "enabled": True,
                "total_connections_received": info.get("total_connections_received", 0),
                "total_commands_processed": info.get("total_commands_processed", 0),
                "keyspace_hits": info.get("keyspace_hits", 0),
                "keyspace_misses": info.get("keyspace_misses", 0),
                "hit_rate": (
                    info.get("keyspace_hits", 0)
                    / (info.get("keyspace_hits", 0) + info.get("keyspace_misses", 1))
                    * 100
                ),
                "used_memory_human": memory.get("used_memory_human", "0"),
                "used_memory_peak_human": memory.get("used_memory_peak_human", "0"),
            }

        except RedisError as e:
            logger.error(f"Failed to get cache stats: {str(e)}")
            return {"enabled": True, "error": str(e)}


# Singleton instance
cache_service = CacheService()
