from typing import TYPE_CHECKING, Any

from sqlalchemy.ext.declarative import as_declarative

if TYPE_CHECKING:
    from sqlalchemy import MetaData


@as_declarative()
class Base:
    id: Any
    __name__: str
    __tablename__: str  # every model sets it explicitly

    if TYPE_CHECKING:
        # Set by @as_declarative at runtime; declared for static analysis only.
        metadata: MetaData

        # The declarative constructor accepts column values as keyword
        # arguments; tell the type checker (no runtime effect).
        def __init__(self, **kwargs: Any) -> None:
            """Accept mapped column values as keyword arguments."""
