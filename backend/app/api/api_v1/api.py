from fastapi import APIRouter
from app.api.api_v1.endpoints import auth, users, projects, recordings, annotations

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(projects.router, prefix="/projects", tags=["projects"])
api_router.include_router(recordings.router, prefix="/recordings", tags=["recordings"])
api_router.include_router(annotations.router, prefix="/annotations", tags=["annotations"])