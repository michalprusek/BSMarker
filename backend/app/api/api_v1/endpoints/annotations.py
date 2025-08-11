from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from app.api import deps
from app.models.annotation import Annotation, BoundingBox
from app.models.recording import Recording
from app.models.project import Project
from app.models.user import User
from app.schemas.annotation import (
    Annotation as AnnotationSchema,
    AnnotationCreate,
    AnnotationUpdate
)
from app.core.rate_limiter import limiter, RATE_LIMITS

router = APIRouter()

@router.post("/{recording_id}", response_model=AnnotationSchema)
@limiter.limit(RATE_LIMITS["crud_write"])
def create_annotation(
    request: Request,
    recording_id: int,
    annotation_in: AnnotationCreate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    recording = db.query(Recording).filter(Recording.id == recording_id).first()
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")
    
    project = db.query(Project).filter(Project.id == recording.project_id).first()
    if not current_user.is_admin and project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    annotation = Annotation(
        recording_id=recording_id,
        user_id=current_user.id
    )
    db.add(annotation)
    db.flush()
    
    for box_data in annotation_in.bounding_boxes:
        box_dict = box_data.dict()
        # Map 'metadata' from schema to 'extra_metadata' for database column
        if 'metadata' in box_dict:
            box_dict['extra_metadata'] = box_dict.pop('metadata')
        box = BoundingBox(
            annotation_id=annotation.id,
            **box_dict
        )
        db.add(box)
    
    db.commit()
    db.refresh(annotation)
    return annotation

@router.get("/{recording_id}", response_model=List[AnnotationSchema])
@limiter.limit(RATE_LIMITS["crud_read"])
def read_annotations(
    request: Request,
    recording_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    recording = db.query(Recording).filter(Recording.id == recording_id).first()
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")
    
    project = db.query(Project).filter(Project.id == recording.project_id).first()
    if not current_user.is_admin and project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    annotations = db.query(Annotation).filter(
        Annotation.recording_id == recording_id
    ).all()
    return annotations

@router.put("/{annotation_id}", response_model=AnnotationSchema)
@limiter.limit(RATE_LIMITS["crud_write"])
def update_annotation(
    request: Request,
    annotation_id: int,
    annotation_in: AnnotationUpdate,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    annotation = db.query(Annotation).filter(Annotation.id == annotation_id).first()
    if not annotation:
        raise HTTPException(status_code=404, detail="Annotation not found")
    
    if annotation.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    if annotation_in.bounding_boxes is not None:
        db.query(BoundingBox).filter(
            BoundingBox.annotation_id == annotation_id
        ).delete()
        
        for box_data in annotation_in.bounding_boxes:
            box_dict = box_data.dict()
            # Map 'metadata' from schema to 'extra_metadata' for database column
            if 'metadata' in box_dict:
                box_dict['extra_metadata'] = box_dict.pop('metadata')
            box = BoundingBox(
                annotation_id=annotation_id,
                **box_dict
            )
            db.add(box)
    
    db.commit()
    db.refresh(annotation)
    return annotation

@router.delete("/{annotation_id}")
@limiter.limit(RATE_LIMITS["crud_write"])
def delete_annotation(
    request: Request,
    annotation_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    annotation = db.query(Annotation).filter(Annotation.id == annotation_id).first()
    if not annotation:
        raise HTTPException(status_code=404, detail="Annotation not found")
    
    if annotation.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    db.delete(annotation)
    db.commit()
    return {"message": "Annotation deleted successfully"}