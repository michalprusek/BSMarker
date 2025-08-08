from typing import Optional
from pydantic import BaseModel
from datetime import datetime

class RecordingBase(BaseModel):
    original_filename: str

class RecordingCreate(RecordingBase):
    project_id: int

class RecordingInDBBase(RecordingBase):
    id: int
    filename: str
    file_path: str
    duration: Optional[float] = None
    sample_rate: Optional[int] = None
    project_id: int
    created_at: datetime

    class Config:
        from_attributes = True

class Recording(RecordingInDBBase):
    pass