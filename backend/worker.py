#!/usr/bin/env python3
"""
Celery worker entry point for BSMarker spectrogram processing.
"""

import os
import sys
from pathlib import Path

# Add the app directory to Python path
sys.path.insert(0, str(Path(__file__).parent))

from app.core.celery_app import celery_app

if __name__ == "__main__":
    # Set up proper logging
    import logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # Start worker
    celery_app.start()