from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator


class ProjectBase(BaseModel):
    name: str
    description: Optional[str] = None


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    # Same fields as ProjectBase, but all optional for partial updates
    name: Optional[str] = None
    description: Optional[str] = None
    allow_overlaps: Optional[bool] = None

    @field_validator("allow_overlaps")
    @classmethod
    def _not_null(cls, value: Optional[bool]) -> Optional[bool]:
        # Omit the field to keep the current rule; null would break NOT NULL.
        if value is None:
            raise ValueError("allow_overlaps must be true or false")
        return value


class ProjectInDBBase(ProjectBase):
    id: int
    owner_id: int
    allow_overlaps: bool = False
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        """Pydantic model configuration."""

        from_attributes = True


class Project(ProjectInDBBase):
    pass
