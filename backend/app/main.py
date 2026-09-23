# Standard library imports
import logging
from typing import Dict

# Third-party imports
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import RequestResponseEndpoint

# Local application imports
# (app.models is imported for its side effect: it registers all models with SQLAlchemy)
from app import models  # noqa: F401  # pylint: disable=unused-import
from app.api.api_v1.api import api_router
from app.core.config import settings
from app.core.rate_limiter import get_rate_limit, limiter, rate_limit_exceeded_handler
from app.db.init_db import init_db
from app.db.session import SessionLocal
from app.services.cache_service import cache_service

# Imported for its side effect: creating the client ensures the MinIO buckets exist.
from app.services.minio_client import minio_client  # noqa: F401  # pylint: disable=unused-import

# Configure logging
logger = logging.getLogger(__name__)

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json" if settings.OPENAPI_ENABLED else None,
    docs_url="/docs" if settings.OPENAPI_ENABLED else None,
    redoc_url="/redoc" if settings.OPENAPI_ENABLED else None,
)

# Add rate limiter to app state
app.state.limiter = limiter

# Add rate limit exceeded exception handler
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)


# Middleware to handle proxy headers and ensure HTTPS URLs
@app.middleware("http")
async def proxy_headers_middleware(
    request: Request, call_next: RequestResponseEndpoint
) -> Response:
    # Get the forwarded headers from nginx
    forwarded_proto = request.headers.get("X-Forwarded-Proto", "https")
    forwarded_host = request.headers.get("X-Forwarded-Host") or request.headers.get("Host")

    # Ensure we use the correct host for URL generation
    if forwarded_host:
        # Remove port if present
        host_without_port = forwarded_host.split(":")[0]
        port = 443 if forwarded_proto == "https" else 80

        # Update request scope for proper URL generation
        request.scope["scheme"] = forwarded_proto
        request.scope["server"] = (host_without_port, port)

        # Update host header
        new_headers = []
        for header_name, header_value in request.scope["headers"]:
            if header_name == b"host":
                new_headers.append((b"host", host_without_port.encode()))
            else:
                new_headers.append((header_name, header_value))
        request.scope["headers"] = new_headers

    # Process the request - exceptions (including HTTPException) propagate to FastAPI
    response = await call_next(request)

    # Fix redirect URLs to use HTTPS
    if hasattr(response, "headers"):
        # Write to response.headers itself (MutableHeaders(...) would be a copy).
        headers = response.headers
        if response.status_code in (301, 302, 303, 307, 308):
            location = headers.get("location")
            if location:
                # Replace any http:// with https:// and fix the host
                if location.startswith("http://"):
                    location = location.replace("http://", "https://", 1)

                # Also ensure the correct host is used
                if "localhost" in location:
                    location = location.replace("localhost", settings.REDIRECT_HOST)

                headers["location"] = location

    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Health check endpoint for Docker
@app.get("/health", response_model=None)  # keep the untyped (no response model) behaviour
async def health_check() -> Dict[str, str]:
    # The cache falls back to "disabled" on its own; report it so a silent
    # Redis outage doesn't go unnoticed again.
    return {
        "status": "ok",
        "service": "BSMarker API",
        "cache": "on" if cache_service.enabled else "off",
    }


app.include_router(api_router, prefix=settings.API_V1_STR)


@app.on_event("startup")
async def startup_event() -> None:
    # Initialize database
    db = SessionLocal()
    init_db(db)
    db.close()

    # Initialize MinIO buckets
    logger.info("Initializing MinIO storage...")
    # The MinIO client and its buckets are created by _ensure_buckets() when
    # app.services.minio_client is imported at the top of this module.
    logger.info("MinIO client initialized successfully")


@app.get("/", response_model=None)  # keep the untyped (no response model) behaviour
@limiter.limit(get_rate_limit("crud_read"))
def read_root(request: Request) -> Dict[str, str]:
    return {"message": "BSMarker API", "version": settings.VERSION}
