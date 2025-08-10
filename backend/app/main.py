from fastapi import FastAPI, HTTPException, Depends, Query, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.config import settings
from app.api.api_v1.api import api_router
from app.db.init_db import init_db
from app.db.session import SessionLocal
from app.services.minio_client import minio_client
from app.api.deps import get_current_user
from app.models.user import User
from app.core.security import decode_access_token
from typing import Optional
import io

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

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
    db = SessionLocal()
    init_db(db)
    db.close()

@app.get("/")
def read_root():
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
async def get_audio_file(
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
async def get_spectrogram_file(
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