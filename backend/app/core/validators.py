"""
Input validation and sanitization module for BSMarker API.

This module provides comprehensive input validation and sanitization
to prevent injection attacks and ensure data integrity.
"""

import re
import html
from typing import Any, Optional
from pathlib import Path
import bleach
from pydantic import validator, ValidationError
from fastapi import HTTPException

# Allowed HTML tags for sanitization (empty for complete sanitization)
ALLOWED_TAGS = []
ALLOWED_ATTRIBUTES = {}

# Regular expressions for validation
EMAIL_REGEX = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
USERNAME_REGEX = re.compile(r'^[a-zA-Z0-9_-]{3,30}$')
PROJECT_NAME_REGEX = re.compile(r'^[a-zA-Z0-9\s\-_]{1,100}$')
LABEL_REGEX = re.compile(r'^[a-zA-Z0-9\s\-_,().]{1,100}$')
FILENAME_REGEX = re.compile(r'^[a-zA-Z0-9\-_.]{1,255}$')

# SQL injection patterns to detect
SQL_INJECTION_PATTERNS = [
    r"(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|FROM|WHERE|AND|OR|ORDER\s+BY|GROUP\s+BY)\b)",
    r"(--|#|/\*|\*/)",
    r"(\bxp_\w+|\bsp_\w+)",
    r"(;.*?(SELECT|INSERT|UPDATE|DELETE|DROP))",
]

# XSS patterns to detect
XSS_PATTERNS = [
    r"<script[^>]*>.*?</script>",
    r"javascript:",
    r"on\w+\s*=",
    r"<iframe[^>]*>",
    r"<object[^>]*>",
    r"<embed[^>]*>",
]

def sanitize_html(text: str) -> str:
    """
    Sanitize HTML content to prevent XSS attacks.
    
    Args:
        text: Input text that may contain HTML
        
    Returns:
        Sanitized text with dangerous HTML removed
    """
    if not text:
        return text
    
    # Use bleach to clean HTML
    cleaned = bleach.clean(
        text,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        strip=True
    )
    
    # Additional HTML entity escaping
    return html.escape(cleaned)

def validate_email(email: str) -> str:
    """
    Validate and sanitize email address.
    
    Args:
        email: Email address to validate
        
    Returns:
        Sanitized email address
        
    Raises:
        ValueError: If email format is invalid
    """
    email = email.strip().lower()
    
    if not EMAIL_REGEX.match(email):
        raise ValueError("Invalid email format")
    
    if len(email) > 254:  # RFC 5321
        raise ValueError("Email address too long")
    
    return email

def validate_username(username: str) -> str:
    """
    Validate and sanitize username.
    
    Args:
        username: Username to validate
        
    Returns:
        Sanitized username
        
    Raises:
        ValueError: If username format is invalid
    """
    username = username.strip()
    
    if not USERNAME_REGEX.match(username):
        raise ValueError("Username must be 3-30 characters, alphanumeric with underscores and hyphens only")
    
    return username

def validate_project_name(name: str) -> str:
    """
    Validate and sanitize project name.
    
    Args:
        name: Project name to validate
        
    Returns:
        Sanitized project name
        
    Raises:
        ValueError: If project name format is invalid
    """
    name = name.strip()
    
    if not name:
        raise ValueError("Project name cannot be empty")
    
    if not PROJECT_NAME_REGEX.match(name):
        raise ValueError("Project name contains invalid characters")
    
    # Remove any potential HTML/script tags
    name = sanitize_html(name)
    
    return name

def validate_label(label: str) -> str:
    """
    Validate and sanitize annotation label.
    
    Args:
        label: Label to validate
        
    Returns:
        Sanitized label
        
    Raises:
        ValueError: If label format is invalid
    """
    label = label.strip()
    
    if not label:
        raise ValueError("Label cannot be empty")
    
    if not LABEL_REGEX.match(label):
        raise ValueError("Label contains invalid characters")
    
    # Remove any potential HTML/script tags
    label = sanitize_html(label)
    
    return label

def validate_filename(filename: str) -> str:
    """
    Validate and sanitize filename to prevent path traversal.
    
    Args:
        filename: Filename to validate
        
    Returns:
        Sanitized filename
        
    Raises:
        ValueError: If filename is invalid or contains path traversal attempts
    """
    if not filename:
        raise ValueError("Filename cannot be empty")
    
    # Remove any path components
    filename = Path(filename).name
    
    # Check for path traversal attempts
    if ".." in filename or "/" in filename or "\\" in filename:
        raise ValueError("Invalid filename: path traversal detected")
    
    # Validate filename format
    if not FILENAME_REGEX.match(filename):
        raise ValueError("Filename contains invalid characters")
    
    # Check file extension is allowed
    allowed_extensions = {'.mp3', '.wav', '.m4a', '.flac', '.ogg', '.aac'}
    file_ext = Path(filename).suffix.lower()
    if file_ext not in allowed_extensions:
        raise ValueError(f"File type {file_ext} not allowed")
    
    return filename

def check_sql_injection(text: str) -> bool:
    """
    Check if text contains potential SQL injection patterns.
    
    Args:
        text: Text to check
        
    Returns:
        True if potential SQL injection detected, False otherwise
    """
    if not text:
        return False
    
    text_upper = text.upper()
    
    for pattern in SQL_INJECTION_PATTERNS:
        if re.search(pattern, text_upper, re.IGNORECASE):
            return True
    
    return False

def check_xss(text: str) -> bool:
    """
    Check if text contains potential XSS patterns.
    
    Args:
        text: Text to check
        
    Returns:
        True if potential XSS detected, False otherwise
    """
    if not text:
        return False
    
    for pattern in XSS_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            return True
    
    return False

def validate_pagination(skip: int, limit: int) -> tuple[int, int]:
    """
    Validate pagination parameters.
    
    Args:
        skip: Number of items to skip
        limit: Maximum number of items to return
        
    Returns:
        Validated (skip, limit) tuple
        
    Raises:
        ValueError: If pagination parameters are invalid
    """
    if skip < 0:
        raise ValueError("Skip value must be non-negative")
    
    if limit <= 0:
        raise ValueError("Limit must be positive")
    
    if limit > 100:
        raise ValueError("Limit cannot exceed 100")
    
    return skip, limit

def validate_coordinates(x: float, y: float, width: float, height: float) -> tuple[float, float, float, float]:
    """
    Validate bounding box coordinates.
    
    Args:
        x: X coordinate
        y: Y coordinate
        width: Width of bounding box
        height: Height of bounding box
        
    Returns:
        Validated coordinates tuple
        
    Raises:
        ValueError: If coordinates are invalid
    """
    if x < 0 or y < 0:
        raise ValueError("Coordinates must be non-negative")
    
    if width <= 0 or height <= 0:
        raise ValueError("Width and height must be positive")
    
    if x > 10000 or y > 10000 or width > 10000 or height > 10000:
        raise ValueError("Coordinates exceed maximum allowed values")
    
    return x, y, width, height

def validate_time_range(start_time: float, end_time: float, max_duration: float = 3600.0) -> tuple[float, float]:
    """
    Validate time range for annotations.
    
    Args:
        start_time: Start time in seconds
        end_time: End time in seconds
        max_duration: Maximum allowed duration
        
    Returns:
        Validated (start_time, end_time) tuple
        
    Raises:
        ValueError: If time range is invalid
    """
    if start_time < 0:
        raise ValueError("Start time must be non-negative")
    
    if end_time <= start_time:
        raise ValueError("End time must be greater than start time")
    
    if end_time > max_duration:
        raise ValueError(f"End time exceeds maximum duration of {max_duration} seconds")
    
    return start_time, end_time

def validate_frequency_range(min_freq: float, max_freq: float) -> tuple[float, float]:
    """
    Validate frequency range for annotations.
    
    Args:
        min_freq: Minimum frequency in Hz
        max_freq: Maximum frequency in Hz
        
    Returns:
        Validated (min_freq, max_freq) tuple
        
    Raises:
        ValueError: If frequency range is invalid
    """
    if min_freq < 0:
        raise ValueError("Minimum frequency must be non-negative")
    
    if max_freq <= min_freq:
        raise ValueError("Maximum frequency must be greater than minimum frequency")
    
    if max_freq > 48000:  # Typical audio sample rate limit
        raise ValueError("Maximum frequency exceeds typical audio range")
    
    return min_freq, max_freq

def sanitize_description(description: Optional[str]) -> Optional[str]:
    """
    Sanitize description text.
    
    Args:
        description: Description text to sanitize
        
    Returns:
        Sanitized description or None
    """
    if not description:
        return None
    
    description = description.strip()
    
    if len(description) > 1000:
        raise ValueError("Description too long (max 1000 characters)")
    
    # Check for injection attempts
    if check_sql_injection(description) or check_xss(description):
        raise ValueError("Description contains potentially malicious content")
    
    # Sanitize HTML
    return sanitize_html(description)

class ValidationMiddleware:
    """
    Middleware for automatic input validation on all requests.
    """
    
    @staticmethod
    def validate_request_data(data: dict) -> dict:
        """
        Validate and sanitize all request data.
        
        Args:
            data: Request data dictionary
            
        Returns:
            Sanitized data dictionary
        """
        sanitized = {}
        
        for key, value in data.items():
            if isinstance(value, str):
                # Check for common injection patterns
                if check_sql_injection(value) or check_xss(value):
                    raise HTTPException(
                        status_code=400,
                        detail=f"Invalid input detected in field: {key}"
                    )
                
                # Sanitize string values
                sanitized[key] = sanitize_html(value)
            else:
                sanitized[key] = value
        
        return sanitized