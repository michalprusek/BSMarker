"""
Rate limiting module using Redis backend for BSMarker API.

This module provides rate limiting functionality to protect against DoS attacks
and brute force attempts. It uses slowapi (FastAPI wrapper for flask-limiter)
with Redis as the storage backend.
"""

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request, HTTPException
from typing import Optional
import redis
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

# Initialize Redis connection
try:
    redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
    # Test connection
    redis_client.ping()
    logger.info("Redis connection established for rate limiting")
except Exception as e:
    logger.error(f"Failed to connect to Redis for rate limiting: {e}")
    # Fallback to memory storage (not recommended for production)
    redis_client = None

def get_identifier(request: Request) -> str:
    """
    Get unique identifier for rate limiting.
    
    Uses user ID if authenticated, otherwise falls back to IP address.
    This provides better rate limiting for authenticated users while
    still protecting against IP-based attacks.
    
    Args:
        request: FastAPI Request object
        
    Returns:
        Unique identifier string for rate limiting
    """
    # Try to get user ID from request state (set by auth middleware)
    user_id = getattr(request.state, 'user_id', None)
    if user_id:
        return f"user:{user_id}"
    
    # Try to get user ID from JWT token in Authorization header
    try:
        from app.core.security import decode_access_token
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.replace("Bearer ", "")
            payload = decode_access_token(token)
            if payload and payload.get("sub"):
                return f"user:{payload['sub']}"
    except Exception:
        pass
    
    # Fall back to IP address
    return f"ip:{get_remote_address(request)}"

def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> HTTPException:
    """
    Custom handler for rate limit exceeded exceptions.
    
    Returns a structured error response with retry information.
    
    Args:
        request: FastAPI Request object
        exc: RateLimitExceeded exception
        
    Returns:
        HTTPException with rate limit details
    """
    response_data = {
        "error": "Rate limit exceeded",
        "detail": f"Rate limit exceeded: {exc.detail}",
        "retry_after": exc.retry_after if hasattr(exc, 'retry_after') else None
    }
    
    # Log rate limit violation
    identifier = get_identifier(request)
    logger.warning(
        f"Rate limit exceeded for {identifier} on {request.url.path}: {exc.detail}"
    )
    
    return HTTPException(
        status_code=429,
        detail=response_data,
        headers={"Retry-After": str(exc.retry_after)} if hasattr(exc, 'retry_after') else {}
    )

# Initialize the limiter with Redis backend
limiter = Limiter(
    key_func=get_identifier,
    storage_uri=settings.REDIS_URL if redis_client else "memory://",
    default_limits=["1000 per hour"]  # Global default limit
)

# Predefined rate limits for different operation types
RATE_LIMITS = {
    # Authentication endpoints - stricter limits to prevent brute force
    "auth_login": "10 per minute, 30 per hour",
    "auth_me": "60 per minute",
    
    # File upload endpoints - limited due to resource intensity
    "upload": "5 per minute, 20 per hour",
    "spectrogram": "10 per minute, 50 per hour",
    
    # Standard CRUD operations
    "crud_read": "100 per minute",        # GET operations
    "crud_write": "30 per minute",        # POST, PUT, DELETE operations
    
    # Bulk operations - very limited
    "bulk_operation": "5 per minute, 15 per hour",
    
    # Admin operations - moderate limits
    "admin_operation": "20 per minute, 100 per hour",
    
    # File serving endpoints
    "file_serve": "200 per minute, 1000 per hour"
}

def get_rate_limit(operation_type: str) -> str:
    """
    Get rate limit string for a specific operation type.
    
    Args:
        operation_type: Type of operation (key from RATE_LIMITS)
        
    Returns:
        Rate limit string for use with @limiter.limit()
    """
    return RATE_LIMITS.get(operation_type, "100 per minute")  # Default fallback