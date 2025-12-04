#!/usr/bin/env python3
"""
Generate test annotations for all recordings of a user.
This script creates 15-25 random annotations on each recording.
"""
import random
import sys
import time
from typing import Dict, List

import requests

API_BASE_URL = "https://bsmarker.utia.cas.cz/api/v1"
USERNAME = "remisvoj@cvut.cz"
PASSWORD = "bsmarker20250903"  # pragma: allowlist secret

# Labels to use (A, B, C, ...)
LABELS = [chr(65 + i) for i in range(26)]  # A-Z


def login(username: str, password: str) -> str:
    """Login and return access token."""
    print(f"🔐 Logging in as {username}...")
    response = requests.post(
        f"{API_BASE_URL}/auth/login",
        data={"username": username, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )

    if response.status_code != 200:
        print(f"❌ Login failed: {response.status_code}")
        print(f"Response: {response.text}")
        sys.exit(1)

    token = response.json()["access_token"]
    print(f"✅ Login successful!")
    return token


def get_all_projects(token: str) -> List[Dict]:
    """Fetch all projects for the user."""
    print(f"\n📁 Fetching all projects...")
    headers = {"Authorization": f"Bearer {token}"}

    response = requests.get(f"{API_BASE_URL}/projects", headers=headers)

    if response.status_code != 200:
        print(f"❌ Failed to fetch projects: {response.status_code}")
        return []

    projects = response.json()
    print(f"✅ Found {len(projects)} projects")
    return projects


def get_project_recordings(token: str, project_id: int) -> List[Dict]:
    """Fetch all recordings for a specific project."""
    headers = {"Authorization": f"Bearer {token}"}

    all_recordings = []
    skip = 0
    limit = 100  # Records per request

    while True:
        # NOTE: API uses 'skip' and 'limit', not 'page' and 'page_size'!
        response = requests.get(
            f"{API_BASE_URL}/recordings/{project_id}/recordings",
            params={
                "skip": skip,
                "limit": limit,
                "sort_by": "id",
                "sort_order": "asc",
            },
            headers=headers,
        )

        if response.status_code != 200:
            print(f"  ❌ Failed to fetch recordings: {response.status_code}")
            break

        data = response.json()
        recordings = data.get("items", [])

        if not recordings:
            break

        all_recordings.extend(recordings)

        # Check if there are more records
        pagination = data.get("pagination", {})
        total = pagination.get("total", 0)

        if skip + limit >= total:
            break

        skip += limit

    return all_recordings


def get_all_recordings(token: str) -> List[Dict]:
    """Fetch all recordings from all projects."""
    print(f"\n📊 Fetching all recordings from all projects...")

    # Get all projects first
    projects = get_all_projects(token)

    if not projects:
        return []

    all_recordings = []

    for project in projects:
        project_id = project["id"]
        project_name = project.get("name", "Unknown")

        print(f"\n  Project: {project_name} (ID: {project_id})")
        recordings = get_project_recordings(token, project_id)
        print(f"  ✅ Loaded {len(recordings)} recordings")

        all_recordings.extend(recordings)

    print(f"\n✅ Total recordings: {len(all_recordings)}")
    return all_recordings


def create_annotation(token: str, recording_id: int, annotation_data: Dict) -> bool:
    """Create a single annotation."""
    headers = {"Authorization": f"Bearer {token}"}

    response = requests.post(
        f"{API_BASE_URL}/annotations/{recording_id}", json=annotation_data, headers=headers
    )

    return response.status_code in [200, 201]


def generate_random_bounding_box(
    recording: Dict, label: str, spectrogram_width: int = 2000, spectrogram_height: int = 400
) -> Dict:
    """Generate random bounding box data for a recording."""
    duration = recording.get("duration", 10.0)

    # Get spectrogram info to calculate pixel coordinates
    # Spectrogram: 200 px/second width, 400px height
    pixels_per_second = spectrogram_width / duration

    # Random start time (leave some margin)
    max_start = max(0.1, duration - 0.8)
    start_time = random.uniform(0, max_start)

    # Random duration (0.3 to 0.8 seconds) - smaller boxes to fit more without time overlap
    box_duration = random.uniform(0.3, min(0.8, duration - start_time))
    end_time = start_time + box_duration

    # Random frequency range (500 Hz to 8000 Hz)
    # Assume spectrogram goes from 0 to ~10000 Hz
    max_frequency_range = 10000
    min_freq = random.uniform(500, 6000)
    max_freq = min_freq + random.uniform(500, 2000)

    # Convert to pixel coordinates
    # x = start_time * pixels_per_second
    # y = (1 - max_freq / max_frequency_range) * spectrogram_height  # Y is inverted
    # width = (end_time - start_time) * pixels_per_second
    # height = (max_freq - min_freq) / max_frequency_range * spectrogram_height

    x = start_time * pixels_per_second
    width = box_duration * pixels_per_second

    # Y coordinate is from top, but frequencies go bottom to top
    # So high frequency = low Y value
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


def boxes_overlap(box1: Dict, box2: Dict) -> bool:
    """Check if two bounding boxes overlap in time (no stacking allowed)."""
    # Check time overlap only - boxes cannot share any time range
    time_overlap = not (
        box1["end_time"] <= box2["start_time"] or box1["start_time"] >= box2["end_time"]
    )

    # Boxes conflict if their time ranges overlap (regardless of frequency)
    return time_overlap


def generate_annotation_with_boxes(recording: Dict, num_boxes: int) -> Dict:
    """Generate annotation with multiple non-overlapping bounding boxes."""
    bounding_boxes = []
    max_retries = 100  # Max attempts to find non-overlapping position (time-only)

    for i in range(num_boxes):
        label = LABELS[i % len(LABELS)]  # Cycle through A-Z

        # Try to find a non-overlapping position
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
        else:
            # Could not find non-overlapping position after max_retries
            # Skip this box (we'll have fewer than requested)
            pass

    return {
        "recording_id": recording["id"],
        "bounding_boxes": bounding_boxes,
    }


def process_recordings(token: str, recordings: List[Dict]):
    """Create annotations for all recordings."""
    print(f"\n🎯 Generating annotations for {len(recordings)} recordings...")
    print(f"   Each recording will get ONE annotation with 50-70 bounding boxes (labels A-Z)")
    print()

    total_boxes = 0
    failed_recordings = []

    for idx, recording in enumerate(recordings, 1):
        recording_id = recording["id"]
        filename = recording.get("original_filename", "unknown")

        # Random number of bounding boxes (50-70)
        num_boxes = random.randint(50, 70)

        print(f"[{idx}/{len(recordings)}] {filename} (ID: {recording_id})")
        print(f"  Creating annotation with {num_boxes} boxes...", end=" ", flush=True)

        # Generate one annotation with multiple bounding boxes
        annotation_data = generate_annotation_with_boxes(recording, num_boxes)

        actual_boxes = len(annotation_data["bounding_boxes"])
        if create_annotation(token, recording_id, annotation_data):
            print(f"✅ Created with {actual_boxes} boxes")
            total_boxes += actual_boxes
        else:
            # Retry once after short delay
            time.sleep(0.1)
            if create_annotation(token, recording_id, annotation_data):
                print(f"✅ Created with {actual_boxes} boxes (retry)")
                total_boxes += actual_boxes
            else:
                print(f"❌ Failed")
                failed_recordings.append(filename)

        # Small delay to avoid overwhelming the server
        if idx % 10 == 0:
            time.sleep(0.5)

    print(f"\n{'='*60}")
    print(f"✅ COMPLETED!")
    print(f"   Total recordings processed: {len(recordings)}")
    print(f"   Successful: {len(recordings) - len(failed_recordings)}")
    print(f"   Failed: {len(failed_recordings)}")
    print(f"   Total bounding boxes created: {total_boxes}")
    print(
        f"   Average boxes per recording: {total_boxes / max(1, len(recordings) - len(failed_recordings)):.1f}"
    )

    if failed_recordings:
        print(f"\n⚠️  Failed recordings:")
        for f in failed_recordings[:10]:  # Show first 10
            print(f"   - {f}")
        if len(failed_recordings) > 10:
            print(f"   ... and {len(failed_recordings) - 10} more")

    print(f"{'='*60}")


def main():
    print("=" * 60)
    print("  BSMarker Test Annotation Generator")
    print("=" * 60)

    # Login
    token = login(USERNAME, PASSWORD)

    # Get all recordings
    recordings = get_all_recordings(token)

    if not recordings:
        print("❌ No recordings found!")
        sys.exit(1)

    # Generate annotations
    process_recordings(token, recordings)


if __name__ == "__main__":
    main()
