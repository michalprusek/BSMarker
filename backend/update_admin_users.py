#!/usr/bin/env python3
"""Script to update existing users to admin status."""

import os
import sys

sys.path.append("/app")

from app.core.config import settings
from app.core.security import get_password_hash
from app.models.user import User
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


def update_user_to_admin():
    """Update newcastlea@gmail.com to admin status and set password."""

    # Database connection
    engine = create_engine(settings.DATABASE_URL)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()

    try:
        # Find the user
        email = "newcastlea@gmail.com"
        password = "bsmarker"

        existing_user = db.query(User).filter(User.email == email).first()

        if existing_user:
            # Update to admin
            existing_user.is_admin = True
            existing_user.is_active = True
            # Update password
            existing_user.hashed_password = get_password_hash(password)

            db.commit()
            print(f"✅ User {email} has been updated:")
            print(f"   Admin status: Yes")
            print(f"   Active: Yes")
            print(f"   Password: {password}")
        else:
            print(f"❌ User {email} not found!")

    except Exception as e:
        print(f"❌ Error updating user: {e}")
        db.rollback()
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    update_user_to_admin()
