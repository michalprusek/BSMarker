#!/usr/bin/env python3
"""
Generate and upload test recordings for performance testing.
This script creates synthetic audio files and uploads them to test the system with 1000+ recordings.
"""

import os
import sys
import time
import random
import tempfile
import asyncio
import aiohttp
import numpy as np
import soundfile as sf
from pathlib import Path
from typing import List, Dict, Any
from concurrent.futures import ThreadPoolExecutor, as_completed

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

# Configuration
API_URL = os.getenv("API_URL", "https://bsmarker.utia.cas.cz/api/v1")
USERNAME = os.getenv("TEST_USERNAME", "newcastlea@gmail.com")
PASSWORD = os.getenv("TEST_PASSWORD", "bsmarker")
PROJECT_ID = int(os.getenv("TEST_PROJECT_ID", "1"))
NUM_RECORDINGS = int(os.getenv("NUM_RECORDINGS", "1000"))
BATCH_SIZE = 10  # Upload in batches to avoid overwhelming the server
CONCURRENT_UPLOADS = 5  # Number of concurrent upload threads


def generate_synthetic_audio(duration: float = 5.0, sample_rate: int = 22050) -> tuple:
    """
    Generate synthetic bird-like audio using sine waves and noise.

    Args:
        duration: Duration in seconds
        sample_rate: Sample rate in Hz

    Returns:
        Tuple of (audio_data, sample_rate)
    """
    t = np.linspace(0, duration, int(duration * sample_rate))

    # Generate bird-like chirps with varying frequencies
    num_chirps = random.randint(3, 8)
    audio = np.zeros_like(t)

    for _ in range(num_chirps):
        # Random chirp parameters
        start_time = random.uniform(0, duration - 0.5)
        chirp_duration = random.uniform(0.1, 0.5)
        start_freq = random.uniform(1000, 4000)
        end_freq = random.uniform(2000, 8000)

        # Create chirp
        start_idx = int(start_time * sample_rate)
        end_idx = min(start_idx + int(chirp_duration * sample_rate), len(t))

        if start_idx < len(t) and end_idx > start_idx:
            chirp_t = t[start_idx:end_idx] - t[start_idx]
            freq_sweep = np.linspace(start_freq, end_freq, len(chirp_t))

            # Apply frequency modulation
            chirp = np.sin(2 * np.pi * freq_sweep * chirp_t)

            # Apply envelope
            envelope = np.hanning(len(chirp))
            chirp *= envelope

            # Add to audio
            audio[start_idx:end_idx] += chirp * random.uniform(0.3, 0.8)

    # Add some background noise
    noise = np.random.normal(0, 0.01, len(audio))
    audio += noise

    # Normalize
    audio = audio / (np.max(np.abs(audio)) + 1e-6)
    audio = (audio * 0.8).astype(np.float32)

    return audio, sample_rate


def create_test_audio_file(filename: str, duration: float = None) -> str:
    """
    Create a test audio file with synthetic bird sounds.

    Args:
        filename: Output filename
        duration: Duration in seconds (random if None)

    Returns:
        Path to created file
    """
    if duration is None:
        duration = random.uniform(2.0, 30.0)  # Random duration between 2-30 seconds

    audio_data, sample_rate = generate_synthetic_audio(duration)

    # Save to temporary file
    temp_path = os.path.join(tempfile.gettempdir(), filename)
    sf.write(temp_path, audio_data, sample_rate)

    return temp_path


async def login(session: aiohttp.ClientSession) -> str:
    """
    Login and get authentication token.

    Args:
        session: aiohttp session

    Returns:
        Authentication token
    """
    print(f"🔐 Logging in as {USERNAME}...")

    data = aiohttp.FormData()
    data.add_field('username', USERNAME)
    data.add_field('password', PASSWORD)

    async with session.post(f"{API_URL}/auth/login", data=data) as response:
        if response.status != 200:
            text = await response.text()
            raise Exception(f"Login failed: {response.status} - {text}")

        result = await response.json()
        token = result.get('access_token')

        if not token:
            raise Exception("No access token received")

        print("✅ Login successful")
        return token


async def upload_recording(
    session: aiohttp.ClientSession,
    token: str,
    project_id: int,
    file_path: str,
    file_num: int
) -> Dict[str, Any]:
    """
    Upload a single recording.

    Args:
        session: aiohttp session
        token: Auth token
        project_id: Project ID
        file_path: Path to audio file
        file_num: File number for logging

    Returns:
        Upload result
    """
    headers = {'Authorization': f'Bearer {token}'}

    with open(file_path, 'rb') as f:
        data = aiohttp.FormData()
        data.add_field('file',
                      f,
                      filename=os.path.basename(file_path),
                      content_type='audio/wav')

        start_time = time.time()

        try:
            async with session.post(
                f"{API_URL}/recordings/{project_id}/upload",
                data=data,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=60)
            ) as response:
                upload_time = time.time() - start_time

                if response.status == 200:
                    result = await response.json()
                    return {
                        'success': True,
                        'file_num': file_num,
                        'recording_id': result.get('id'),
                        'upload_time': upload_time,
                        'filename': os.path.basename(file_path)
                    }
                else:
                    text = await response.text()
                    return {
                        'success': False,
                        'file_num': file_num,
                        'error': f"Status {response.status}: {text}",
                        'upload_time': upload_time
                    }

        except asyncio.TimeoutError:
            return {
                'success': False,
                'file_num': file_num,
                'error': 'Upload timeout',
                'upload_time': time.time() - start_time
            }
        except Exception as e:
            return {
                'success': False,
                'file_num': file_num,
                'error': str(e),
                'upload_time': time.time() - start_time
            }


async def upload_batch(
    session: aiohttp.ClientSession,
    token: str,
    project_id: int,
    files: List[tuple]
) -> List[Dict[str, Any]]:
    """
    Upload a batch of files concurrently.

    Args:
        session: aiohttp session
        token: Auth token
        project_id: Project ID
        files: List of (file_path, file_num) tuples

    Returns:
        List of upload results
    """
    tasks = []
    for file_path, file_num in files:
        task = upload_recording(session, token, project_id, file_path, file_num)
        tasks.append(task)

    results = await asyncio.gather(*tasks)
    return results


async def test_pagination_performance(session: aiohttp.ClientSession, token: str, project_id: int):
    """
    Test pagination performance with different page sizes.

    Args:
        session: aiohttp session
        token: Auth token
        project_id: Project ID
    """
    print("\n📊 Testing pagination performance...")

    headers = {'Authorization': f'Bearer {token}'}
    page_sizes = [10, 50, 100, 200]

    for page_size in page_sizes:
        start_time = time.time()

        params = {
            'skip': 0,
            'limit': page_size
        }

        async with session.get(
            f"{API_URL}/recordings/{project_id}/recordings",
            headers=headers,
            params=params
        ) as response:
            if response.status == 200:
                data = await response.json()
                response_time = time.time() - start_time

                print(f"  Page size {page_size}: {response_time:.2f}s - "
                      f"Got {len(data.get('items', []))} items")
            else:
                print(f"  Page size {page_size}: Failed - Status {response.status}")


async def main():
    """Main execution function."""
    print("🚀 BSMarker Performance Test Script")
    print("=" * 60)
    print(f"Target: {API_URL}")
    print(f"Project ID: {PROJECT_ID}")
    print(f"Recordings to generate: {NUM_RECORDINGS}")
    print(f"Batch size: {BATCH_SIZE}")
    print(f"Concurrent uploads: {CONCURRENT_UPLOADS}")
    print("=" * 60)

    # Create temporary files
    print(f"\n🎵 Generating {NUM_RECORDINGS} synthetic audio files...")
    temp_files = []

    for i in range(NUM_RECORDINGS):
        if i % 100 == 0:
            print(f"  Generated {i}/{NUM_RECORDINGS} files...")

        filename = f"test_recording_{i+1:04d}.wav"
        file_path = create_test_audio_file(filename)
        temp_files.append((file_path, i + 1))

    print(f"✅ Generated {len(temp_files)} audio files")

    # Upload files
    async with aiohttp.ClientSession() as session:
        # Login
        token = await login(session)

        # Upload in batches
        print(f"\n📤 Uploading {NUM_RECORDINGS} recordings...")
        all_results = []
        total_start_time = time.time()

        for i in range(0, len(temp_files), BATCH_SIZE):
            batch = temp_files[i:i + BATCH_SIZE]
            batch_num = (i // BATCH_SIZE) + 1
            total_batches = (len(temp_files) + BATCH_SIZE - 1) // BATCH_SIZE

            print(f"\n  Batch {batch_num}/{total_batches} ({len(batch)} files)...")

            batch_results = await upload_batch(session, token, PROJECT_ID, batch)
            all_results.extend(batch_results)

            # Print batch summary
            successful = sum(1 for r in batch_results if r['success'])
            avg_time = np.mean([r['upload_time'] for r in batch_results])

            print(f"    ✅ Success: {successful}/{len(batch)}")
            print(f"    ⏱️  Avg upload time: {avg_time:.2f}s")

            # Small delay between batches
            if i + BATCH_SIZE < len(temp_files):
                await asyncio.sleep(1)

        total_time = time.time() - total_start_time

        # Summary statistics
        print("\n" + "=" * 60)
        print("📊 Upload Summary")
        print("=" * 60)

        successful_uploads = [r for r in all_results if r['success']]
        failed_uploads = [r for r in all_results if not r['success']]

        print(f"✅ Successful uploads: {len(successful_uploads)}/{NUM_RECORDINGS}")
        print(f"❌ Failed uploads: {len(failed_uploads)}/{NUM_RECORDINGS}")

        if successful_uploads:
            upload_times = [r['upload_time'] for r in successful_uploads]
            print(f"\n⏱️  Upload Time Statistics:")
            print(f"  Min: {np.min(upload_times):.2f}s")
            print(f"  Max: {np.max(upload_times):.2f}s")
            print(f"  Mean: {np.mean(upload_times):.2f}s")
            print(f"  Median: {np.median(upload_times):.2f}s")

        print(f"\n⏱️  Total upload time: {total_time:.2f}s")
        print(f"  Average throughput: {NUM_RECORDINGS / total_time:.2f} recordings/second")

        if failed_uploads:
            print(f"\n❌ Failed uploads:")
            for r in failed_uploads[:10]:  # Show first 10 failures
                print(f"  File {r['file_num']}: {r['error']}")

        # Test pagination performance
        await test_pagination_performance(session, token, PROJECT_ID)

        # Cleanup
        print("\n🧹 Cleaning up temporary files...")
        for file_path, _ in temp_files:
            try:
                os.unlink(file_path)
            except:
                pass

    print("\n✅ Test completed!")
    print(f"   You can now test the application with {len(successful_uploads)} recordings")
    print(f"   Visit: {API_URL.replace('/api/v1', '')}/projects/{PROJECT_ID}")


if __name__ == "__main__":
    asyncio.run(main())