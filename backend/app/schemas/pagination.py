"""
Pagination schemas for API responses.
Provides consistent pagination metadata across all endpoints.
"""

from typing import Generic, List, Optional, TypeVar
from pydantic import BaseModel

T = TypeVar("T")


class PaginationMetadata(BaseModel):
    """Metadata for paginated responses."""

    total: int
    page: int
    page_size: int
    total_pages: int
    has_next: bool
    has_prev: bool


class PaginatedResponse(BaseModel, Generic[T]):
    """Generic paginated response wrapper."""

    items: List[T]
    pagination: PaginationMetadata

    class Config:
        from_attributes = True


class PaginationParams(BaseModel):
    """
    Standardized pagination parameters for API endpoints.
    Provides consistent validation and defaults.
    """

    skip: int = 0
    limit: int = 50

    @property
    def page(self) -> int:
        """Calculate current page number (1-indexed)."""
        return (self.skip // self.limit) + 1

    def validate_limits(self) -> None:
        """Validate pagination limits to prevent DoS."""
        MAX_LIMIT = 200
        if self.limit > MAX_LIMIT:
            self.limit = MAX_LIMIT
        if self.skip < 0:
            self.skip = 0
        if self.limit < 1:
            self.limit = 1

    @classmethod
    def from_page(cls, page: int = 1, page_size: int = 50) -> "PaginationParams":
        """Create pagination params from page number."""
        skip = (page - 1) * page_size
        return cls(skip=skip, limit=page_size)