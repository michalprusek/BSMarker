import io
import logging
from typing import Optional

from app.api.api_v1.api import api_router
from app.api.deps import get_current_user
from app.core.config import settings
from app.core.rate_limiter import get_rate_limit, limiter, rate_limit_exceeded_handler
from app.core.security import decode_access_token
from app.db.init_db import init_db
from app.db.session import SessionLocal

# Import all models first to ensure SQLAlchemy relationships are configured
from app.models import *  # noqa: F403,F401
from app.models.user import User
from app.services.minio_client import minio_client
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import Response, StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from slowapi.errors import RateLimitExceeded
from starlette.datastructures import MutableHeaders

# Configure logging
logger = logging.getLogger(__name__)

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
)

# Add rate limiter to app state
app.state.limiter = limiter

# Add rate limit exceeded exception handler
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)


# Middleware to handle proxy headers and ensure HTTPS URLs
@app.middleware("http")
async def proxy_headers_middleware(request: Request, call_next):
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

    # Process the request
    response = await call_next(request)

    # Fix redirect URLs to use HTTPS
    if hasattr(response, "headers"):
        headers = MutableHeaders(response.headers)
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
@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "BSMarker API"}


app.include_router(api_router, prefix=settings.API_V1_STR)


@app.on_event("startup")
async def startup_event():
    # Initialize database
    db = SessionLocal()
    init_db(db)
    db.close()

    # Initialize MinIO buckets
    logger.info("Initializing MinIO storage...")
    try:
        # Force initialization of MinIO client and buckets
        from app.services.minio_client import minio_client as mc

        # This will trigger _ensure_buckets() in the constructor
        logger.info("MinIO client initialized successfully")
    except Exception as e:
        logger.error(f"Error initializing MinIO: {e}")


@app.get("/")
@limiter.limit(get_rate_limit("crud_read"))
def read_root(request: Request):
    return {"message": "BSMarker API", "version": settings.VERSION}


async def verify_token(
    token: Optional[str] = Query(None), authorization: Optional[str] = Header(None)
):
    """Verify token from query parameter or Authorization header"""
    if token:
        # Token from query parameter
        try:
            payload = decode_access_token(token)
            if payload is None:
                raise HTTPException(status_code=403, detail="Invalid token")
            return True
        except Exception:
            raise HTTPException(status_code=403, detail="Invalid token")
    elif authorization and authorization.startswith("Bearer "):
        # Token from Authorization header
        token_value = authorization.replace("Bearer ", "")
        try:
            payload = decode_access_token(token_value)
            if payload is None:
                raise HTTPException(status_code=403, detail="Invalid token")
            return True
        except Exception:
            raise HTTPException(status_code=403, detail="Invalid token")
    else:
        raise HTTPException(status_code=403, detail="No authentication provided")


@app.get("/files/recordings/{file_path:path}")
@limiter.limit(get_rate_limit("file_serve"))
async def get_audio_file(
    request: Request,
    file_path: str,
    token: Optional[str] = Query(None),
    authorization: Optional[str] = None,
):
    await verify_token(token, authorization)
    try:
        audio_data = minio_client.download_file(settings.MINIO_BUCKET_RECORDINGS, file_path)
        if audio_data:
            return StreamingResponse(io.BytesIO(audio_data), media_type="audio/mpeg")
        else:
            raise HTTPException(status_code=404, detail="Audio file not found")
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/files/spectrograms/{file_path:path}")
@limiter.limit(get_rate_limit("file_serve"))
async def get_spectrogram_file(
    request: Request,
    file_path: str,
    token: Optional[str] = Query(None),
    authorization: Optional[str] = None,
):
    await verify_token(token, authorization)
    try:
        image_data = minio_client.download_file(settings.MINIO_BUCKET_SPECTROGRAMS, file_path)
        if image_data:
            return StreamingResponse(io.BytesIO(image_data), media_type="image/png")
        else:
            raise HTTPException(status_code=404, detail="Spectrogram not found")
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))
