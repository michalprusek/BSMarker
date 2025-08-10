from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from datetime import datetime

class BoundingBoxBase(BaseModel):
    x: float
    y: float
    width: float
    height: float
    start_time: float
    end_time: float
    min_frequency: Optional[float] = None
    max_frequency: Optional[float] = None
    label: str
    confidence: Optional[float] = None
    metadata: Optional[Dict[str, Any]] = None

class BoundingBoxCreate(BoundingBoxBase):
    pass

class BoundingBoxUpdate(BaseModel):
    x: Optional[float] = None
    y: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    min_frequency: Optional[float] = None
    max_frequency: Optional[float] = None
    label: Optional[str] = None
    confidence: Optional[float] = None
    metadata: Optional[Dict[str, Any]] = None

class BoundingBox(BoundingBoxBase):
    id: int
    annotation_id: int

    class Config:
        from_attributes = True

class AnnotationBase(BaseModel):
    recording_id: int

class AnnotationCreate(AnnotationBase):
    bounding_boxes: List[BoundingBoxCreate] = []

class AnnotationUpdate(BaseModel):
    bounding_boxes: Optional[List[BoundingBoxCreate]] = None

class Annotation(AnnotationBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    bounding_boxes: List[BoundingBox] = []

    class Config:
        from_attributes = True