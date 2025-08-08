from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from app.core.config import settings
from app.api.api_v1.api import api_router
from app.db.init_db import init_db
from app.db.session import SessionLocal
from app.services.minio_client import minio_client
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

@app.get("/api/v1/audio/{file_path:path}")
async def get_audio(file_path: str):
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
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/spectrograms/{recording_id}")
async def get_spectrogram(recording_id: int):
    try:
        spectrogram_path = f"spectrograms/{recording_id}_spectrogram.png"
        image_data = minio_client.download_file(
            settings.MINIO_BUCKET_SPECTROGRAMS,
            spectrogram_path
        )
        if image_data:
            return StreamingResponse(io.BytesIO(image_data), media_type="image/png")
        else:
            raise HTTPException(status_code=404, detail="Spectrogram not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))