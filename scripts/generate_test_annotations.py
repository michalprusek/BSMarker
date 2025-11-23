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
    page = 1
    page_size = 100

    while True:
        response = requests.get(
            f"{API_BASE_URL}/recordings/{project_id}/recordings",
            params={"page": page, "page_size": page_size},
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

        # Check if there are more pages
        pagination = data.get("pagination", {})
        if page >= pagination.get("total_pages", 1):
            break

        page += 1

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

    print(f"\n✅ Total recordings found across all projects: {len(all_recordings)}")
    return all_recordings


def create_annotation(token: str, recording_id: int, annotation_data: Dict) -> bool:
    """Create a single annotation."""
    headers = {"Authorization": f"Bearer {token}"}

    response = requests.post(
        f"{API_BASE_URL}/annotations/{recording_id}", json=annotation_data, headers=headers
    )

    return response.status_code in [200, 201]


def generate_random_annotation(recording: Dict, label: str, recording_id: int) -> Dict:
    """Generate random annotation data for a recording."""
    duration = recording.get("duration", 10.0)

    # Random start time (leave some margin)
    max_start = max(0.1, duration - 2.0)
    start_time = random.uniform(0, max_start)

    # Random duration (0.5 to 2.0 seconds)
    ann_duration = random.uniform(0.5, min(2.0, duration - start_time))
    end_time = start_time + ann_duration

    # Random frequency range (500 Hz to 8000 Hz)
    min_freq = random.uniform(500, 6000)
    max_freq = min_freq + random.uniform(500, 2000)

    return {
        "recording_id": recording_id,
        "start_time": round(start_time, 3),
        "end_time": round(end_time, 3),
        "min_frequency": round(min_freq, 1),
        "max_frequency": round(max_freq, 1),
        "label": label,
    }


def process_recordings(token: str, recordings: List[Dict]):
    """Create annotations for all recordings."""
    print(f"\n🎯 Generating annotations for {len(recordings)} recordings...")
    print(f"   Each recording will get 15-25 random annotations with labels A-Z")
    print()

    total_annotations = 0
    failed_recordings = []

    for idx, recording in enumerate(recordings, 1):
        recording_id = recording["id"]
        filename = recording.get("original_filename", "unknown")

        # Random number of annotations (15-25)
        num_annotations = random.randint(15, 25)

        print(f"[{idx}/{len(recordings)}] {filename} (ID: {recording_id})")
        print(f"  Creating {num_annotations} annotations...", end=" ", flush=True)

        created = 0
        for i in range(num_annotations):
            # Use labels A-Z cyclically
            label = LABELS[i % len(LABELS)]

            annotation = generate_random_annotation(recording, label, recording_id)

            if create_annotation(token, recording_id, annotation):
                created += 1
            else:
                # Retry once after short delay
                time.sleep(0.1)
                if create_annotation(token, recording_id, annotation):
                    created += 1

        if created == num_annotations:
            print(f"✅ {created}/{num_annotations}")
        else:
            print(f"⚠️  {created}/{num_annotations} (some failed)")
            failed_recordings.append(filename)

        total_annotations += created

        # Small delay to avoid overwhelming the server
        if idx % 10 == 0:
            time.sleep(0.5)

    print(f"\n{'='*60}")
    print(f"✅ COMPLETED!")
    print(f"   Total recordings processed: {len(recordings)}")
    print(f"   Total annotations created: {total_annotations}")
    print(f"   Average per recording: {total_annotations / len(recordings):.1f}")

    if failed_recordings:
        print(f"\n⚠️  Some annotations failed for {len(failed_recordings)} recordings:")
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
