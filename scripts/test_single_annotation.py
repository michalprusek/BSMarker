#!/usr/bin/env python3
"""
Test annotation generation on a single recording.
"""
import random
import sys
from typing import Dict

import requests

API_BASE_URL = "https://bsmarker.utia.cas.cz/api/v1"
USERNAME = "remisvoj@cvut.cz"
PASSWORD = "bsmarker20250903"  # pragma: allowlist secret

LABELS = [chr(65 + i) for i in range(26)]  # A-Z


def login(username: str, password: str) -> str:
    """Login and return access token."""
    response = requests.post(
        f"{API_BASE_URL}/auth/login",
        data={"username": username, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )

    if response.status_code != 200:
        print(f"❌ Login failed: {response.status_code}")
        sys.exit(1)

    return response.json()["access_token"]


def get_first_recording(token: str, project_id: int = 1) -> Dict:
    """Get first recording from project."""
    headers = {"Authorization": f"Bearer {token}"}

    response = requests.get(
        f"{API_BASE_URL}/recordings/{project_id}/recordings",
        params={"page": 1, "page_size": 1},
        headers=headers,
    )

    if response.status_code != 200:
        print(f"❌ Failed to fetch recordings: {response.status_code}")
        sys.exit(1)

    data = response.json()
    recordings = data.get("items", [])

    if not recordings:
        print("❌ No recordings found!")
        sys.exit(1)

    return recordings[0]


def generate_random_bounding_box(
    recording: Dict, label: str, spectrogram_width: int = 2000, spectrogram_height: int = 400
) -> Dict:
    """Generate random bounding box data for a recording."""
    duration = recording.get("duration", 10.0)

    # Spectrogram: 200 px/second width, 400px height
    pixels_per_second = spectrogram_width / duration

    # Random start time (leave some margin)
    max_start = max(0.1, duration - 2.0)
    start_time = random.uniform(0, max_start)

    # Random duration (0.5 to 2.0 seconds)
    box_duration = random.uniform(0.5, min(2.0, duration - start_time))
    end_time = start_time + box_duration

    # Random frequency range (500 Hz to 8000 Hz)
    max_frequency_range = 10000
    min_freq = random.uniform(500, 6000)
    max_freq = min_freq + random.uniform(500, 2000)

    # Convert to pixel coordinates
    x = start_time * pixels_per_second
    width = box_duration * pixels_per_second

    # Y coordinate is from top, but frequencies go bottom to top
    y = (1 - max_freq / max_frequency_range) * spectrogram_height
    height = (max_freq - min_freq) / max_frequency_range * spectrogram_height

    return {
        "x": round(x, 2),
        "y": round(y, 2),
        "width": round(width, 2),
        "height": round(height, 2),
        "start_time": round(start_time, 3),
        "end_time": round(end_time, 3),
        "min_frequency": round(min_freq, 1),
        "max_frequency": round(max_freq, 1),
        "label": label,
    }


def create_annotation(token: str, recording_id: int, annotation_data: Dict) -> bool:
    """Create annotation."""
    headers = {"Authorization": f"Bearer {token}"}

    response = requests.post(
        f"{API_BASE_URL}/annotations/{recording_id}",
        json=annotation_data,
        headers=headers,
    )

    if response.status_code not in [200, 201]:
        print(f"\n❌ Failed to create annotation: {response.status_code}")
        print(f"Response: {response.text}")
        return False

    print(f"\n✅ Annotation created successfully!")
    print(f"Response: {response.json()}")
    return True


def boxes_overlap(box1: Dict, box2: Dict) -> bool:
    """Check if two bounding boxes conflict (share any time OR frequency range).

    This uses a strict definition where boxes cannot share ANY time range
    OR ANY frequency range. This prevents "stacking" of boxes vertically
    at the same time or horizontally at the same frequency.

    For true 2D spatial overlap (requiring BOTH dimensions to overlap),
    use: return time_overlap and freq_overlap

    Returns:
        True if boxes share any time range OR any frequency range.
    """
    # Check time overlap
    time_overlap = not (
        box1["end_time"] <= box2["start_time"] or box1["start_time"] >= box2["end_time"]
    )

    # Check frequency overlap
    freq_overlap = not (
        box1["max_frequency"] <= box2["min_frequency"]
        or box1["min_frequency"] >= box2["max_frequency"]
    )

    # Boxes conflict if EITHER time OR frequency overlaps (strict mode - no stacking)
    return time_overlap or freq_overlap


def main():
    print("🧪 Test Single Annotation Generation (Non-overlapping)")
    print("=" * 60)

    # Login
    token = login(USERNAME, PASSWORD)
    print("✅ Logged in")

    # Get first recording
    recording = get_first_recording(token)
    rec_id = recording["id"]
    filename = recording.get("original_filename", "unknown")
    duration = recording.get("duration", 0)

    print(f"\n📝 Test recording:")
    print(f"   File: {filename}")
    print(f"   ID: {rec_id}")
    print(f"   Duration: {duration:.2f}s")

    # Generate 5 test bounding boxes (non-overlapping)
    num_boxes = 5
    max_retries = 50
    print(f"\n🎯 Generating annotation with {num_boxes} NON-OVERLAPPING bounding boxes...")

    bounding_boxes = []
    for i in range(num_boxes):
        label = LABELS[i % len(LABELS)]

        # Try to find non-overlapping position
        box = None
        for attempt in range(max_retries):
            candidate = generate_random_bounding_box(recording, label)

            # Check if it overlaps with any existing box
            overlaps = any(boxes_overlap(candidate, existing) for existing in bounding_boxes)

            if not overlaps:
                box = candidate
                break

        if box:
            bounding_boxes.append(box)
            print(f"\n   Box {len(bounding_boxes)} (label {label}):")
            print(f"     Time: {box['start_time']:.3f} - {box['end_time']:.3f}s")
            print(f"     Freq: {box['min_frequency']:.1f} - {box['max_frequency']:.1f} Hz")
            print(
                f"     Pixels: x={box['x']:.1f}, y={box['y']:.1f}, w={box['width']:.1f}, h={box['height']:.1f}"
            )
        else:
            print(
                f"\n   ⚠️  Could not find non-overlapping position for box {i+1} after {max_retries} attempts"
            )

    print(f"\n✅ Generated {len(bounding_boxes)} non-overlapping boxes (requested {num_boxes})")

    annotation_data = {
        "recording_id": rec_id,
        "bounding_boxes": bounding_boxes,
    }

    print(f"\n📤 Sending annotation to API...")
    success = create_annotation(token, rec_id, annotation_data)

    if success:
        print(f"\n{'='*60}")
        print(f"✅ TEST SUCCESSFUL!")
        print(f"   Recording ID: {rec_id}")
        print(f"   Bounding boxes: {num_boxes}")
        print(f"\n🔍 Check the annotation editor:")
        print(f"   https://bsmarker.utia.cas.cz/projects/1/recordings/{rec_id}")
        print(f"{'='*60}")
    else:
        print(f"\n❌ TEST FAILED")
        sys.exit(1)


if __name__ == "__main__":
    main()
