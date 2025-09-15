#!/usr/bin/env python3
"""Script to create an admin user in the BSMarker database."""

import os
import sys

sys.path.append("/app")

from app.core.config import settings
from app.core.security import get_password_hash
from app.models.user import User
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


def create_admin_user():
    """Create an admin user with specified credentials."""

    # Database connection
    engine = create_engine(settings.DATABASE_URL)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()

    try:
        # User details
        email = "newcastlea@gmail.com"
        username = "newcastlea"
        password = "bsmarker"
        full_name = "Admin User"

        # Check if user already exists
        existing_user = (
            db.query(User).filter((User.email == email) | (User.username == username)).first()
        )

        if existing_user:
            print(f"User with email {email} or username {username} already exists!")

            # Update to admin if not already
            if not existing_user.is_admin:
                existing_user.is_admin = True
                existing_user.is_active = True
                db.commit()
                print(f"User {email} has been updated to admin status.")
            else:
                print(f"User {email} is already an admin.")
        else:
            # Create new admin user
            hashed_password = get_password_hash(password)

            new_user = User(
                email=email,
                username=username,
                hashed_password=hashed_password,
                full_name=full_name,
                is_active=True,
                is_admin=True,
            )

            db.add(new_user)
            db.commit()
            db.refresh(new_user)

            print(f"✅ Admin user created successfully!")
            print(f"   Email: {email}")
            print(f"   Username: {username}")
            print(f"   Password: {password}")
            print(f"   Admin: Yes")
            print(f"   Active: Yes")
            print(f"   User ID: {new_user.id}")

    except Exception as e:
        print(f"❌ Error creating admin user: {e}")
        db.rollback()
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    create_admin_user()
