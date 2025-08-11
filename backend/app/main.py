from fastapi import FastAPI, HTTPException, Depends, Query, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from slowapi.errors import RateLimitExceeded
from app.core.config import settings
from app.api.api_v1.api import api_router
from app.db.init_db import init_db
from app.db.session import SessionLocal
from app.services.minio_client import minio_client
from app.api.deps import get_current_user
from app.models.user import User
from app.core.security import decode_access_token
from app.core.rate_limiter import limiter, rate_limit_exceeded_handler, get_rate_limit
from typing import Optional
import io

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# Add rate limiter to app state
app.state.limiter = limiter

# Add rate limit exceeded exception handler
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_V1_STR)

@app.on_event("startup")
async def startup_event():
    # Initialize database
    db = SessionLocal()
    init_db(db)
    db.close()
    
    # Initialize MinIO buckets
    print("Initializing MinIO storage...")
    try:
        # Force initialization of MinIO client and buckets
        from app.services.minio_client import minio_client as mc
        # This will trigger _ensure_buckets() in the constructor
        print("MinIO client initialized successfully")
    except Exception as e:
        print(f"Error initializing MinIO: {e}")

@app.get("/")
@limiter.limit(get_rate_limit("crud_read"))
def read_root(request: Request):
    return {"message": "BSMarker API", "version": settings.VERSION}

async def verify_token(token: Optional[str] = Query(None), authorization: Optional[str] = Header(None)):
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
    authorization: Optional[str] = None
):
    await verify_token(token, authorization)
    try:
        audio_data = minio_client.download_file(
            settings.MINIO_BUCKET_RECORDINGS,
            file_path
        )
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
    authorization: Optional[str] = None
):
    await verify_token(token, authorization)
    try:
        image_data = minio_client.download_file(
            settings.MINIO_BUCKET_SPECTROGRAMS,
            file_path
        )
        if image_data:
            return StreamingResponse(io.BytesIO(image_data), media_type="image/png")
        else:
            raise HTTPException(status_code=404, detail="Spectrogram not found")
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))