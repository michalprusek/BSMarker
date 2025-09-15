#!/usr/bin/env python3
"""Script to create multiple admin users in the BSMarker database."""

import os
import sys

sys.path.append("/app")

from app.core.config import settings
from app.core.security import get_password_hash
from app.models.user import User
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


def create_or_update_admin_user(db, email, username, password, full_name):
    """Create or update a user to admin status."""
    try:
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
                print(f"✅ User {email} has been updated to admin status.")
            else:
                print(f"ℹ️  User {email} is already an admin.")

            # Update password if different
            if not existing_user.verify_password(password):
                existing_user.hashed_password = get_password_hash(password)
                db.commit()
                print(f"🔐 Password updated for {email}")
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

        return True
    except Exception as e:
        print(f"❌ Error processing user {email}: {e}")
        db.rollback()
        return False


def create_admin_users():
    """Create multiple admin users with specified credentials."""

    # Database connection
    engine = create_engine(settings.DATABASE_URL)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()

    # List of admin users to create/update
    admin_users = [
        {
            "email": "newcastlea@gmail.com",
            "username": "newcastlea",
            "password": "bsmarker",
            "full_name": "Newcastle Admin",
        },
        {
            "email": "remisvoj@cvut.cz",
            "username": "remisvoj",
            "password": "bsmarker",
            "full_name": "Remi Svoj",
        },
        {
            "email": "prusemic@cvut.cz",
            "username": "prusemic",
            "password": "bsmarker",
            "full_name": "Michal Prusek",
        },
    ]

    print("=" * 60)
    print("Creating/Updating Admin Users for BSMarker")
    print("=" * 60)

    success_count = 0
    failed_count = 0

    try:
        for user_data in admin_users:
            print(f"\nProcessing user: {user_data['email']}")
            print("-" * 40)

            success = create_or_update_admin_user(
                db,
                user_data["email"],
                user_data["username"],
                user_data["password"],
                user_data["full_name"],
            )

            if success:
                success_count += 1
            else:
                failed_count += 1

        print("\n" + "=" * 60)
        print(f"Summary: {success_count} successful, {failed_count} failed")
        print("=" * 60)

    except Exception as e:
        print(f"❌ Fatal error: {e}")
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    create_admin_users()
