"""Audio processing service for extracting metadata from audio files."""

import logging
import os
import tempfile
from pathlib import Path
from typing import Dict, Optional, Tuple, Union

import librosa
import numpy as np

logger = logging.getLogger(__name__)


class AudioMetadata:
    """Audio metadata container."""

    def __init__(self, duration: float, sample_rate: int, channels: int = 1):
        self.duration = duration
        self.sample_rate = sample_rate
        self.channels = channels

    def to_dict(self) -> Dict[str, Union[float, int]]:
        """Convert to dictionary representation."""
        return {
            "duration": self.duration,
            "sample_rate": self.sample_rate,
            "channels": self.channels,
        }


class AudioProcessingError(Exception):
    """Custom exception for audio processing errors."""

    pass


class AudioService:
    """Service for audio file processing and metadata extraction."""

    def __init__(self):
        """Initialize audio service."""
        # Set cache directory for numba/librosa to avoid permission issues in Docker
        os.environ["NUMBA_CACHE_DIR"] = "/tmp"

    def extract_audio_metadata(self, file_path: Union[str, Path]) -> AudioMetadata:
        """
        Extract audio metadata from file.

        Args:
            file_path: Path to audio file

        Returns:
            AudioMetadata object containing duration, sample_rate, and channels

        Raises:
            AudioProcessingError: If file cannot be processed
            FileNotFoundError: If file does not exist
        """
        file_path = Path(file_path)

        if not file_path.exists():
            raise FileNotFoundError(f"Audio file not found: {file_path}")

        try:
            logger.info(f"Extracting metadata from audio file: {file_path}")

            # Load audio file
            y, sr = librosa.load(str(file_path), sr=None, mono=True)

            # Calculate duration using librosa's built-in method
            # This is more reliable than len(y) / sr for edge cases
            duration = librosa.get_duration(y=y, sr=sr)

            # Determine number of channels (librosa loads as mono by default)
            # For accurate channel detection, we'd need to use librosa.load with mono=False
            # but for this application, we typically work with mono spectrograms
            channels = 1

            metadata = AudioMetadata(duration=duration, sample_rate=int(sr), channels=channels)

            logger.info(
                f"Extracted metadata - Duration: {duration:.2f}s, "
                f"Sample Rate: {sr} Hz, Channels: {channels}"
            )

            return metadata

        except Exception as e:
            error_msg = f"Failed to extract audio metadata from {file_path}: {str(e)}"
            logger.error(error_msg)
            raise AudioProcessingError(error_msg) from e

    def extract_audio_metadata_from_bytes(
        self, audio_data: bytes, file_extension: str = ".mp3"
    ) -> AudioMetadata:
        """
        Extract audio metadata from bytes data.

        Args:
            audio_data: Raw audio file bytes
            file_extension: File extension to determine format

        Returns:
            AudioMetadata object containing duration, sample_rate, and channels

        Raises:
            AudioProcessingError: If data cannot be processed
        """
        try:
            # Create temporary file with the audio data
            with tempfile.NamedTemporaryFile(suffix=file_extension, delete=False) as temp_file:
                temp_file.write(audio_data)
                temp_file.flush()
                temp_path = temp_file.name

            try:
                # Extract metadata from temporary file
                metadata = self.extract_audio_metadata(temp_path)
                return metadata
            finally:
                # Clean up temporary file
                os.unlink(temp_path)

        except Exception as e:
            error_msg = f"Failed to extract audio metadata from bytes: {str(e)}"
            logger.error(error_msg)
            raise AudioProcessingError(error_msg) from e

    def load_audio_for_processing(
        self, file_path: Union[str, Path], target_sr: Optional[int] = None
    ) -> Tuple[np.ndarray, int]:
        """
        Load audio file for processing (e.g., spectrogram generation).

        Args:
            file_path: Path to audio file
            target_sr: Target sample rate (None to preserve original)

        Returns:
            Tuple of (audio_data, sample_rate)

        Raises:
            AudioProcessingError: If file cannot be loaded
        """
        file_path = Path(file_path)

        if not file_path.exists():
            raise FileNotFoundError(f"Audio file not found: {file_path}")

        try:
            logger.info(f"Loading audio for processing: {file_path}")

            # Load audio with specified sample rate
            y, sr = librosa.load(str(file_path), sr=target_sr, mono=True)

            logger.info(f"Audio loaded - Length: {len(y)} samples, Sample Rate: {sr} Hz")

            return y, int(sr)

        except Exception as e:
            error_msg = f"Failed to load audio for processing from {file_path}: {str(e)}"
            logger.error(error_msg)
            raise AudioProcessingError(error_msg) from e

    def get_duration_from_samples(self, audio_data: np.ndarray, sample_rate: int) -> float:
        """
        Calculate duration from audio samples.

        Args:
            audio_data: Audio samples array
            sample_rate: Sample rate in Hz

        Returns:
            Duration in seconds
        """
        return len(audio_data) / sample_rate

    def validate_audio_format(self, file_path: Union[str, Path]) -> bool:
        """
        Validate if file is a supported audio format.

        Args:
            file_path: Path to audio file

        Returns:
            True if format is supported, False otherwise
        """
        supported_extensions = {".mp3", ".wav", ".m4a", ".flac", ".ogg"}

        file_path = Path(file_path)
        extension = file_path.suffix.lower()

        if extension not in supported_extensions:
            logger.warning(f"Unsupported audio format: {extension}")
            return False

        # Try to load a small portion to verify it's actually an audio file
        try:
            librosa.load(str(file_path), sr=None, duration=0.1)
            return True
        except Exception as e:
            logger.warning(f"File validation failed for {file_path}: {str(e)}")
            return False


# Global instance
audio_service = AudioService()
