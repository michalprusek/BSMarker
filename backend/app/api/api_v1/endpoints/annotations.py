from datetime import datetime
from typing import Any, List

from app.api import deps
from app.core.rate_limiter import RATE_LIMITS, limiter
from app.models.annotation import Annotation, BoundingBox
from app.models.project import Project
from app.models.recording import Recording
from app.models.user import User
from app.schemas.annotation import Annotation as AnnotationSchema
from app.schemas.annotation import AnnotationCreate, AnnotationUpdate
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session, joinedload


def convert_annotation_orm_to_dict(annotation_orm):
    """
    Convert an Annotation ORM object to a dictionary format that works with Pydantic schemas.
    This handles the SQLAlchemy metadata conflict by properly mapping extra_metadata to metadata.
    """
    if not annotation_orm:
        return None

    data = {
        "id": annotation_orm.id,
        "recording_id": annotation_orm.recording_id,
        "user_id": annotation_orm.user_id,
        "created_at": annotation_orm.created_at,
        "updated_at": annotation_orm.updated_at,
        "bounding_boxes": [],
    }

    for bbox in annotation_orm.bounding_boxes:
        bbox_data = {
            "id": bbox.id,
            "annotation_id": bbox.annotation_id,
            "x": round(bbox.x) if bbox.x is not None else None,
            "y": round(bbox.y) if bbox.y is not None else None,
            "width": round(bbox.width) if bbox.width is not None else None,
            "height": round(bbox.height) if bbox.height is not None else None,
            "start_time": bbox.start_time,
            "end_time": bbox.end_time,
            "min_frequency": bbox.min_frequency,
            "max_frequency": bbox.max_frequency,
            "label": bbox.label,
            "confidence": bbox.confidence,
            "metadata": bbox.extra_metadata,  # Map extra_metadata to metadata
        }
        data["bounding_boxes"].append(bbox_data)

    return data


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

    # Check if annotation already exists for this recording and user
    existing_annotation = (
        db.query(Annotation)
        .filter(Annotation.recording_id == recording_id, Annotation.user_id == current_user.id)
        .first()
    )

    if existing_annotation:
        # Update existing annotation: delete old bounding boxes
        db.query(BoundingBox).filter(BoundingBox.annotation_id == existing_annotation.id).delete()
        annotation = existing_annotation
        annotation.updated_at = datetime.utcnow()
    else:
        # Create new annotation
        annotation = Annotation(recording_id=recording_id, user_id=current_user.id)

    if not existing_annotation:
        db.add(annotation)
    db.flush()

    for box_data in annotation_in.bounding_boxes:
        box_dict = box_data.model_dump()
        # Map 'metadata' from schema to 'extra_metadata' for database column
        if "metadata" in box_dict:
            box_dict["extra_metadata"] = box_dict.pop("metadata")

        # Round pixel coordinates to prevent floating-point precision issues
        for coord_field in ["x", "y", "width", "height"]:
            if coord_field in box_dict and box_dict[coord_field] is not None:
                box_dict[coord_field] = round(float(box_dict[coord_field]))

        box = BoundingBox(annotation_id=annotation.id, **box_dict)
        db.add(box)

    db.commit()
    db.refresh(annotation)

    # Reload with bounding boxes and convert to dict to avoid SQLAlchemy metadata conflict
    annotation_with_boxes = (
        db.query(Annotation)
        .options(joinedload(Annotation.bounding_boxes))
        .filter(Annotation.id == annotation.id)
        .first()
    )
    annotation_dict = convert_annotation_orm_to_dict(annotation_with_boxes)
    return AnnotationSchema.model_validate(annotation_dict)


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

    annotations = (
        db.query(Annotation)
        .options(joinedload(Annotation.bounding_boxes))
        .filter(Annotation.recording_id == recording_id)
        .order_by(Annotation.created_at.asc())
        .all()
    )  # Order by creation date ascending

    # Convert all annotations to dict format to avoid SQLAlchemy metadata conflict
    annotation_dicts = [convert_annotation_orm_to_dict(ann) for ann in annotations]
    return [AnnotationSchema.model_validate(ann_dict) for ann_dict in annotation_dicts]


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
        db.query(BoundingBox).filter(BoundingBox.annotation_id == annotation_id).delete()

        for box_data in annotation_in.bounding_boxes:
            box_dict = box_data.model_dump()
            # Map 'metadata' from schema to 'extra_metadata' for database column
            if "metadata" in box_dict:
                box_dict["extra_metadata"] = box_dict.pop("metadata")

            # Round pixel coordinates to prevent floating-point precision issues
            for coord_field in ["x", "y", "width", "height"]:
                if coord_field in box_dict and box_dict[coord_field] is not None:
                    box_dict[coord_field] = round(float(box_dict[coord_field]))

            box = BoundingBox(annotation_id=annotation_id, **box_dict)
            db.add(box)

    db.commit()
    db.refresh(annotation)

    # Reload with bounding boxes and convert to dict to avoid SQLAlchemy metadata conflict
    annotation_with_boxes = (
        db.query(Annotation)
        .options(joinedload(Annotation.bounding_boxes))
        .filter(Annotation.id == annotation.id)
        .first()
    )
    annotation_dict = convert_annotation_orm_to_dict(annotation_with_boxes)
    return AnnotationSchema.model_validate(annotation_dict)


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
