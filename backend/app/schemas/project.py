from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ProjectBase(BaseModel):
    name: str
    description: Optional[str] = None


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    # Same fields as ProjectBase, but all optional for partial updates
    name: Optional[str] = None
    description: Optional[str] = None


class ProjectInDBBase(ProjectBase):
    id: int
    owner_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        """Pydantic model configuration."""

        from_attributes = True


class Project(ProjectInDBBase):
    pass
