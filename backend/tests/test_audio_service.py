"""Tests for AudioService functionality."""

import os
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from app.services.audio_service import (
    AudioMetadata,
    AudioProcessingError,
    AudioService,
    audio_service,
)

from .conftest import SAMPLE_MP3_DURATION, SAMPLE_MP3_SAMPLE_RATE


@pytest.fixture
def service():
    """Create AudioService instance for testing."""
    return AudioService()


@pytest.fixture
def mock_audio_data():
    """Create mock audio data."""
    # 1 second of 44100 Hz audio (44100 samples)
    return np.random.random(44100).astype(np.float32)


@pytest.fixture
def mock_librosa_success():
    """Mock successful librosa operations."""
    with patch("app.services.audio_service.librosa") as mock_librosa:
        # Mock audio data: 2 seconds at 22050 Hz
        mock_audio_data = np.random.random(44100).astype(np.float32)
        mock_sample_rate = 22050
        mock_duration = 2.0

        mock_librosa.load.return_value = (mock_audio_data, mock_sample_rate)
        mock_librosa.get_duration.return_value = mock_duration

        yield {
            "librosa": mock_librosa,
            "audio_data": mock_audio_data,
            "sample_rate": mock_sample_rate,
            "duration": mock_duration,
        }


@pytest.fixture
def mock_librosa_failure():
    """Mock failing librosa operations."""
    with patch("app.services.audio_service.librosa") as mock_librosa:
        mock_librosa.load.side_effect = Exception("Failed to load audio")
        mock_librosa.get_duration.side_effect = Exception("Failed to get duration")
        yield mock_librosa


class TestAudioMetadata:
    """Test AudioMetadata class."""

    def test_init(self):
        """Test AudioMetadata initialization."""
        metadata = AudioMetadata(duration=30.5, sample_rate=44100, channels=2)

        assert metadata.duration == 30.5
        assert metadata.sample_rate == 44100
        assert metadata.channels == 2

    def test_init_default_channels(self):
        """Test AudioMetadata initialization with default channels."""
        metadata = AudioMetadata(duration=15.0, sample_rate=22050)

        assert metadata.duration == 15.0
        assert metadata.sample_rate == 22050
        assert metadata.channels == 1

    def test_to_dict(self):
        """Test AudioMetadata to_dict conversion."""
        metadata = AudioMetadata(duration=45.7, sample_rate=48000, channels=1)
        result = metadata.to_dict()

        expected = {"duration": 45.7, "sample_rate": 48000, "channels": 1}
        assert result == expected


class TestAudioService:
    """Test AudioService class."""

    def test_init(self, service):
        """Test AudioService initialization."""
        assert isinstance(service, AudioService)
        # Check that NUMBA_CACHE_DIR is set
        assert os.environ.get("NUMBA_CACHE_DIR") == "/tmp"

    def test_global_instance(self):
        """Test that global audio_service instance exists."""
        assert audio_service is not None
        assert isinstance(audio_service, AudioService)


class TestExtractAudioMetadata:
    """Test extract_audio_metadata method."""

    def test_extract_metadata_success(self, service, mock_librosa_success, temp_audio_file):
        """Test successful metadata extraction."""
        result = service.extract_audio_metadata(temp_audio_file)

        assert isinstance(result, AudioMetadata)
        assert result.duration == mock_librosa_success["duration"]
        assert result.sample_rate == mock_librosa_success["sample_rate"]
        assert result.channels == 1

        # Verify librosa was called correctly
        mock_librosa_success["librosa"].load.assert_called_once_with(
            temp_audio_file, sr=None, mono=True
        )
        mock_librosa_success["librosa"].get_duration.assert_called_once()

    def test_extract_metadata_file_not_found(self, service):
        """Test metadata extraction with non-existent file."""
        non_existent_file = "/path/to/nonexistent/file.mp3"

        with pytest.raises(FileNotFoundError) as exc_info:
            service.extract_audio_metadata(non_existent_file)

        assert "Audio file not found" in str(exc_info.value)

    def test_extract_metadata_librosa_failure(self, service, mock_librosa_failure, temp_audio_file):
        """Test metadata extraction when librosa fails."""
        with pytest.raises(AudioProcessingError) as exc_info:
            service.extract_audio_metadata(temp_audio_file)

        assert "Failed to extract audio metadata" in str(exc_info.value)
        assert "Failed to load audio" in str(exc_info.value)

    def test_extract_metadata_pathlib_input(self, service, mock_librosa_success, temp_audio_file):
        """Test metadata extraction with Path object input."""
        path_obj = Path(temp_audio_file)
        result = service.extract_audio_metadata(path_obj)

        assert isinstance(result, AudioMetadata)
        assert result.duration == mock_librosa_success["duration"]

    @pytest.mark.audio
    def test_extract_metadata_different_formats(self, service, mock_librosa_success):
        """Test metadata extraction with different audio formats."""
        formats = [".mp3", ".wav", ".m4a", ".flac"]

        for fmt in formats:
            with tempfile.NamedTemporaryFile(suffix=fmt, delete=False) as tmp_file:
                tmp_file.write(b"fake audio content")
                tmp_file.flush()

                try:
                    result = service.extract_audio_metadata(tmp_file.name)
                    assert isinstance(result, AudioMetadata)
                finally:
                    os.unlink(tmp_file.name)


class TestExtractAudioMetadataFromBytes:
    """Test extract_audio_metadata_from_bytes method."""

    def test_extract_from_bytes_writes_temp_file_and_removes_it(self, service):
        """The bytes are written to a temp file with the given suffix, which is removed after."""
        audio_bytes = b"fake mp3 content for testing"
        seen = {}

        def fake_extract(path):
            seen["path"] = str(path)
            seen["content"] = Path(path).read_bytes()
            return AudioMetadata(duration=3.5, sample_rate=44100)

        with patch.object(service, "extract_audio_metadata", side_effect=fake_extract):
            result = service.extract_audio_metadata_from_bytes(audio_bytes, ".wav")

        assert result.duration == 3.5
        assert result.sample_rate == 44100
        assert seen["path"].endswith(".wav")
        assert seen["content"] == audio_bytes
        assert not os.path.exists(seen["path"])

    def test_extract_from_bytes_failure(self, service):
        """Test metadata extraction from bytes with failure."""
        audio_bytes = b"invalid audio data"

        with patch("tempfile.NamedTemporaryFile") as mock_temp:
            mock_temp.side_effect = Exception("Temp file creation failed")

            with pytest.raises(AudioProcessingError) as exc_info:
                service.extract_audio_metadata_from_bytes(audio_bytes)

            assert "Failed to extract audio metadata from bytes" in str(exc_info.value)

    def test_extract_from_bytes_cleanup(self, service, mock_librosa_success):
        """Test that temporary files are cleaned up properly."""
        audio_bytes = b"fake mp3 content"

        with patch("tempfile.NamedTemporaryFile") as mock_temp, patch("os.unlink") as mock_unlink:

            mock_file = MagicMock()
            mock_file.name = "/tmp/test_audio.mp3"
            mock_file.__enter__.return_value = mock_file
            mock_temp.return_value = mock_file

            with patch.object(service, "extract_audio_metadata") as mock_extract:
                mock_extract.return_value = AudioMetadata(duration=1.0, sample_rate=22050)

                service.extract_audio_metadata_from_bytes(audio_bytes)

                # Verify cleanup
                mock_unlink.assert_called_once_with("/tmp/test_audio.mp3")


class TestLoadAudioForProcessing:
    """Test load_audio_for_processing method."""

    def test_load_audio_success(self, service, mock_librosa_success, temp_audio_file):
        """Test successful audio loading for processing."""
        y, sr = service.load_audio_for_processing(temp_audio_file)

        assert isinstance(y, np.ndarray)
        assert isinstance(sr, int)
        assert sr == mock_librosa_success["sample_rate"]

        # Verify librosa was called correctly
        mock_librosa_success["librosa"].load.assert_called_once_with(
            temp_audio_file, sr=None, mono=True
        )

    def test_load_audio_with_target_sr(self, service, mock_librosa_success, temp_audio_file):
        """Test audio loading with target sample rate."""
        target_sr = 16000

        y, sr = service.load_audio_for_processing(temp_audio_file, target_sr=target_sr)

        # Verify librosa was called with target sample rate
        mock_librosa_success["librosa"].load.assert_called_once_with(
            temp_audio_file, sr=target_sr, mono=True
        )

    def test_load_audio_file_not_found(self, service):
        """Test audio loading with non-existent file."""
        non_existent_file = "/path/to/nonexistent/file.wav"

        with pytest.raises(FileNotFoundError):
            service.load_audio_for_processing(non_existent_file)

    def test_load_audio_librosa_failure(self, service, mock_librosa_failure, temp_audio_file):
        """Test audio loading when librosa fails."""
        with pytest.raises(AudioProcessingError) as exc_info:
            service.load_audio_for_processing(temp_audio_file)

        assert "Failed to load audio for processing" in str(exc_info.value)


class TestGetDurationFromSamples:
    """Test get_duration_from_samples method."""

    def test_duration_calculation(self, service, mock_audio_data):
        """Test duration calculation from samples."""
        sample_rate = 22050
        expected_duration = len(mock_audio_data) / sample_rate

        duration = service.get_duration_from_samples(mock_audio_data, sample_rate)

        assert duration == expected_duration
        assert isinstance(duration, float)

    def test_duration_different_sample_rates(self, service):
        """Test duration calculation with different sample rates."""
        audio_data = np.random.random(88200)  # 88200 samples

        test_cases = [
            (44100, 2.0),  # 88200 / 44100 = 2.0
            (22050, 4.0),  # 88200 / 22050 = 4.0
            (48000, 1.8375),  # 88200 / 48000 = 1.8375
        ]

        for sample_rate, expected_duration in test_cases:
            duration = service.get_duration_from_samples(audio_data, sample_rate)
            assert abs(duration - expected_duration) < 0.001  # Allow small floating point errors


class TestValidateAudioFormat:
    """Test validate_audio_format method."""

    def test_supported_formats(self, service, mock_librosa_success):
        """Test validation of supported audio formats."""
        supported_formats = [".mp3", ".wav", ".m4a", ".flac", ".ogg"]

        for fmt in supported_formats:
            with tempfile.NamedTemporaryFile(suffix=fmt, delete=False) as tmp_file:
                tmp_file.write(b"fake audio content")
                tmp_file.flush()

                try:
                    # Mock librosa.load for validation
                    with patch("app.services.audio_service.librosa.load") as mock_load:
                        mock_load.return_value = (np.array([1, 2, 3]), 22050)

                        result = service.validate_audio_format(tmp_file.name)
                        assert result is True
                finally:
                    os.unlink(tmp_file.name)

    def test_unsupported_format(self, service):
        """Test validation of unsupported audio format."""
        with tempfile.NamedTemporaryFile(suffix=".txt", delete=False) as tmp_file:
            tmp_file.write(b"not audio content")
            tmp_file.flush()

            try:
                result = service.validate_audio_format(tmp_file.name)
                assert result is False
            finally:
                os.unlink(tmp_file.name)

    def test_format_validation_librosa_failure(self, service):
        """Test format validation when librosa fails to load."""
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp_file:
            tmp_file.write(b"corrupt audio data")
            tmp_file.flush()

            try:
                with patch("app.services.audio_service.librosa.load") as mock_load:
                    mock_load.side_effect = Exception("Corrupt file")

                    result = service.validate_audio_format(tmp_file.name)
                    assert result is False
            finally:
                os.unlink(tmp_file.name)

    def test_format_validation_pathlib(self, service, mock_librosa_success):
        """Test format validation with Path object."""
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_file:
            tmp_file.write(b"fake audio content")
            tmp_file.flush()

            try:
                with patch("app.services.audio_service.librosa.load") as mock_load:
                    mock_load.return_value = (np.array([1, 2, 3]), 22050)

                    path_obj = Path(tmp_file.name)
                    result = service.validate_audio_format(path_obj)
                    assert result is True
            finally:
                os.unlink(tmp_file.name)


class TestIntegrationScenarios:
    """Integration tests for common usage scenarios."""

    @pytest.mark.audio
    def test_full_metadata_extraction_workflow(self, service, sample_mp3_bytes):
        """Real MP3 bytes -> real librosa decode -> correct duration and sample rate."""
        metadata = service.extract_audio_metadata_from_bytes(sample_mp3_bytes, ".mp3")

        assert isinstance(metadata, AudioMetadata)
        assert metadata.duration == pytest.approx(SAMPLE_MP3_DURATION, abs=0.05)
        assert metadata.sample_rate == SAMPLE_MP3_SAMPLE_RATE
        assert metadata.channels == 1

    @pytest.mark.audio
    def test_real_wav_file_metadata(self, service, tmp_path):
        """A generated 2 s, 16 kHz WAV is decoded with its native sample rate."""
        import soundfile as sf

        sr = 16000
        t = np.linspace(0, 2.0, 2 * sr, endpoint=False)
        path = tmp_path / "tone.wav"
        sf.write(path, 0.5 * np.sin(2 * np.pi * 440 * t), sr)

        metadata = service.extract_audio_metadata(path)

        assert metadata.sample_rate == sr
        assert metadata.duration == pytest.approx(2.0, abs=1e-3)
        assert service.validate_audio_format(path) is True

    @pytest.mark.audio
    def test_real_decoder_rejects_garbage(self, service):
        with pytest.raises(AudioProcessingError):
            service.extract_audio_metadata_from_bytes(b"definitely not audio data", ".mp3")

    @pytest.mark.audio
    def test_error_handling_chain(self, service):
        """Test that errors propagate correctly through the chain."""
        # Test with invalid bytes that will cause multiple failures
        invalid_bytes = b"definitely not audio data"

        with patch("tempfile.NamedTemporaryFile") as mock_temp:
            mock_file = MagicMock()
            mock_file.name = "/tmp/error_test.mp3"
            mock_file.__enter__.return_value = mock_file
            mock_temp.return_value = mock_file

            with patch.object(service, "extract_audio_metadata") as mock_extract:
                mock_extract.side_effect = AudioProcessingError("Processing failed")

                with pytest.raises(AudioProcessingError) as exc_info:
                    service.extract_audio_metadata_from_bytes(invalid_bytes)

                assert "Failed to extract audio metadata from bytes" in str(exc_info.value)

    def test_consistent_duration_calculation(self, service, mock_librosa_success):
        """Test that duration calculation is consistent across methods."""
        # Create mock audio data
        sample_rate = 44100
        audio_samples = np.random.random(44100)  # 1 second of audio

        # Method 1: Using get_duration_from_samples
        duration1 = service.get_duration_from_samples(audio_samples, sample_rate)

        # Method 2: Using librosa (mocked to return consistent value)
        with patch("app.services.audio_service.librosa") as mock_librosa:
            mock_librosa.load.return_value = (audio_samples, sample_rate)
            mock_librosa.get_duration.return_value = 1.0  # 1 second

            with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp_file:
                tmp_file.write(b"fake content")
                tmp_file.flush()

                try:
                    metadata = service.extract_audio_metadata(tmp_file.name)
                    duration2 = metadata.duration
                finally:
                    os.unlink(tmp_file.name)

        # Durations should be close (allowing for floating point precision)
        assert abs(duration1 - duration2) < 0.001
