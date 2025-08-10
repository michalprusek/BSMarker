from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api import deps
from app.models.project import Project
from app.models.user import User
from app.schemas.project import Project as ProjectSchema, ProjectCreate, ProjectUpdate

router = APIRouter()

@router.get("/", response_model=List[ProjectSchema])
def read_projects(
    db: Session = Depends(deps.get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    if current_user.is_admin:
        projects = db.query(Project).offset(skip).limit(limit).all()
    else:
        projects = db.query(Project).filter(
            Project.owner_id == current_user.id
        ).offset(skip).limit(limit).all()
    return projects

@router.post("/", response_model=ProjectSchema)
def create_project(
    *,
    db: Session = Depends(deps.get_db),
    project_in: ProjectCreate,
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    project = Project(
        name=project_in.name,
        description=project_in.description,
        owner_id=current_user.id
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project

@router.get("/{project_id}", response_model=ProjectSchema)
def read_project(
    project_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not current_user.is_admin and project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return project

@router.put("/{project_id}", response_model=ProjectSchema)
def update_project(
    *,
    db: Session = Depends(deps.get_db),
    project_id: int,
    project_in: ProjectUpdate,
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not current_user.is_admin and project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    update_data = project_in.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(project, field, value)
    
    db.add(project)
    db.commit()
    db.refresh(project)
    return project

@router.delete("/{project_id}")
def delete_project(
    project_id: int,
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_user),
) -> Any:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not current_user.is_admin and project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    db.delete(project)
    db.commit()
    return {"message": "Project deleted successfully"}