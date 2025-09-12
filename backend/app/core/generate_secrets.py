"""Secret generation utility for BSMarker.

Generates cryptographically secure secrets for various purposes.
"""

import base64
import secrets
import string
from pathlib import Path
from typing import Any, Dict


def generate_secret_key(length: int = 64) -> str:
    """
    Generate a cryptographically secure secret key for JWT signing

    Args:
        length: Length of the secret key in bytes (default 64 = 512 bits)

    Returns:
        Base64-encoded secret key suitable for JWT signing
    """
    return base64.urlsafe_b64encode(secrets.token_bytes(length)).decode("utf-8")


def generate_password(
    length: int = 16,
    include_uppercase: bool = True,
    include_lowercase: bool = True,
    include_numbers: bool = True,
    include_symbols: bool = True,
    exclude_ambiguous: bool = True,
) -> str:
    """
    Generate a cryptographically secure password

    Args:
        length: Length of the password
        include_uppercase: Include uppercase letters
        include_lowercase: Include lowercase letters
        include_numbers: Include numbers
        include_symbols: Include symbols
        exclude_ambiguous: Exclude ambiguous characters (0, O, l, I, etc.)

    Returns:
        Generated password
    """
    if length < 8:
        raise ValueError("Password length must be at least 8 characters")

    chars = ""

    if include_lowercase:
        chars += string.ascii_lowercase
    if include_uppercase:
        chars += string.ascii_uppercase
    if include_numbers:
        chars += string.digits
    if include_symbols:
        chars += "!@#$%^&*()_+-=[]{}|;:,.<>?"

    if exclude_ambiguous:
        ambiguous = "0O1lI"
        chars = "".join(c for c in chars if c not in ambiguous)

    if not chars:
        raise ValueError("At least one character set must be included")

    # Ensure at least one character from each selected set
    password = []
    if include_lowercase:
        password.append(secrets.choice(string.ascii_lowercase))
    if include_uppercase:
        password.append(secrets.choice(string.ascii_uppercase))
    if include_numbers:
        available_digits = string.digits
        if exclude_ambiguous:
            available_digits = available_digits.replace("0", "")
        password.append(secrets.choice(available_digits))
    if include_symbols:
        password.append(secrets.choice("!@#$%^&*()_+-=[]{}|;:,.<>?"))

    # Fill remaining length with random characters
    for _ in range(length - len(password)):
        password.append(secrets.choice(chars))

    # Shuffle to avoid predictable patterns
    secrets.SystemRandom().shuffle(password)

    return "".join(password)


def generate_database_credentials() -> Dict[str, str]:
    """
    Generate secure database credentials

    Returns:
        Dictionary with database username and password
    """
    return {
        "username": f"bsmarker_{secrets.token_hex(4)}",
        "password": generate_password(20, exclude_ambiguous=True),
    }


def generate_minio_credentials() -> Dict[str, str]:
    """
    Generate secure MinIO credentials

    Returns:
        Dictionary with MinIO access key and secret key
    """
    return {
        "access_key": f"BSMARKER{secrets.token_hex(8).upper()}",
        "secret_key": generate_password(24, exclude_ambiguous=True),
    }


def generate_redis_password() -> str:
    """
    Generate secure Redis password

    Returns:
        Redis password
    """
    return generate_password(16, exclude_ambiguous=True)


def generate_all_secrets() -> Dict[str, Any]:
    """
    Generate all secrets needed for BSMarker deployment

    Returns:
        Dictionary containing all generated secrets
    """
    db_creds = generate_database_credentials()
    minio_creds = generate_minio_credentials()

    return {
        "SECRET_KEY": generate_secret_key(),
        "DATABASE_URL": f"postgresql://{db_creds['username']}:{db_creds['password']}@localhost:5432/bsmarker_db",
        "DATABASE_USER": db_creds["username"],
        "DATABASE_PASSWORD": db_creds["password"],
        "REDIS_PASSWORD": generate_redis_password(),
        "REDIS_URL": f"redis://:{generate_redis_password()}@localhost:6379/0",
        "MINIO_ACCESS_KEY": minio_creds["access_key"],
        "MINIO_SECRET_KEY": minio_creds["secret_key"],
        "FIRST_ADMIN_PASSWORD": generate_password(12, exclude_ambiguous=True),
    }


def write_env_file(secrets_dict: Dict[str, Any], output_path: Path) -> None:
    """
    Write secrets to .env file

    Args:
        secrets_dict: Dictionary of secrets to write
        output_path: Path to write the .env file
    """
    lines = []
    lines.append("# BSMarker Environment Configuration")
    lines.append("# Generated on: " + str(Path(__file__).stat().st_mtime))
    lines.append("# DO NOT COMMIT THIS FILE TO VERSION CONTROL")
    lines.append("")

    # Core application settings
    lines.append("# Application Settings")
    lines.append(f'SECRET_KEY="{secrets_dict["SECRET_KEY"]}"')
    lines.append("ALGORITHM=HS256")
    lines.append("ACCESS_TOKEN_EXPIRE_MINUTES=30")
    lines.append("")

    # Database settings
    lines.append("# Database Settings")
    lines.append(f'DATABASE_URL="{secrets_dict["DATABASE_URL"]}"')
    lines.append("")

    # Redis settings
    lines.append("# Redis Settings")
    lines.append(f'REDIS_URL="{secrets_dict["REDIS_URL"]}"')
    lines.append("")

    # MinIO settings
    lines.append("# MinIO Settings")
    lines.append("MINIO_ENDPOINT=localhost:9000")
    lines.append(f'MINIO_ACCESS_KEY="{secrets_dict["MINIO_ACCESS_KEY"]}"')
    lines.append(f'MINIO_SECRET_KEY="{secrets_dict["MINIO_SECRET_KEY"]}"')
    lines.append("MINIO_SECURE=false")
    lines.append("")

    # Admin settings
    lines.append("# Initial Admin User")
    lines.append("FIRST_ADMIN_EMAIL=admin@bsmarker.com")
    lines.append(f'FIRST_ADMIN_PASSWORD="{secrets_dict["FIRST_ADMIN_PASSWORD"]}"')
    lines.append("")

    # CORS settings
    lines.append("# CORS Settings")
    lines.append('CORS_ORIGINS=["http://localhost:3456"]')

    output_path.write_text("\n".join(lines))


if __name__ == "__main__":
    # Generate new secrets and write to .env file
    import logging
    
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger(__name__)
    
    secrets_dict = generate_all_secrets()

    logger.info("Generated secrets for BSMarker:")
    logger.info("=" * 40)
    for key, value in secrets_dict.items():
        if "PASSWORD" in key or "SECRET" in key or "KEY" in key:
            logger.info(f"{key}: {'*' * 20}")
        else:
            logger.info(f"{key}: {value}")

    # Write to .env file
    env_path = Path(__file__).parent.parent.parent / ".env"
    write_env_file(secrets_dict, env_path)
    logger.info(f"\n✓ Secrets written to: {env_path}")
    logger.info("⚠️  Remember to update your database and MinIO with new credentials!")
