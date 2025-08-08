from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.security import get_password_hash
from app.models.user import User
from app.db.base import Base
from app.db.session import engine

def init_db(db: Session) -> None:
    Base.metadata.create_all(bind=engine)
    
    admin = db.query(User).filter(User.email == settings.FIRST_ADMIN_EMAIL).first()
    if not admin:
        admin = User(
            email=settings.FIRST_ADMIN_EMAIL,
            username="admin",
            hashed_password=get_password_hash(settings.FIRST_ADMIN_PASSWORD),
            full_name="Admin User",
            is_admin=True,
            is_active=True
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)