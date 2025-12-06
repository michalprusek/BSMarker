#!/usr/bin/env python3
"""
Check if annotations exist for recordings.
"""
import sys

import requests

API_BASE_URL = "https://bsmarker.utia.cas.cz/api/v1"
USERNAME = "remisvoj@cvut.cz"
PASSWORD = "bsmarker20250903"  # pragma: allowlist secret


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


def get_recordings_with_annotations(token: str, project_id: int = 1):
    """Get recordings that have annotation_count > 0.

    Returns:
        List of recordings with annotations, or None on API error.
    """
    headers = {"Authorization": f"Bearer {token}"}

    response = requests.get(
        f"{API_BASE_URL}/recordings/{project_id}/recordings",
        params={"page": 1, "page_size": 10},
        headers=headers,
    )

    if response.status_code != 200:
        print(f"❌ Failed to fetch recordings: {response.status_code}")
        print(f"Response: {response.text}")
        return None  # Return None to indicate error

    data = response.json()
    all_recordings = data.get("items", [])

    # Filter those with annotations
    annotated = [r for r in all_recordings if r.get("annotation_count", 0) > 0]

    return annotated


def get_annotations(token: str, recording_id: int):
    """Get annotations for a specific recording.

    Returns:
        List of annotations, or None on API error.
    """
    headers = {"Authorization": f"Bearer {token}"}

    response = requests.get(
        f"{API_BASE_URL}/annotations/{recording_id}",
        headers=headers,
    )

    if response.status_code != 200:
        print(f"  ❌ Failed to fetch annotations: {response.status_code}")
        return None  # Return None to indicate error

    return response.json()


def main():
    print("🔍 Checking annotations...")

    # Login
    token = login(USERNAME, PASSWORD)
    print("✅ Logged in")

    # Get recordings marked as annotated
    recordings = get_recordings_with_annotations(token)

    if recordings is None:
        print("\n❌ Failed to fetch recordings. Aborting.")
        sys.exit(1)

    print(f"\n📊 Found {len(recordings)} recordings marked as 'annotated'")

    if len(recordings) == 0:
        print("\n❌ No recordings with annotations found!")
        return

    # Check first 5 recordings
    print("\n🔍 Checking actual annotations in database:\n")

    for recording in recordings[:5]:
        rec_id = recording["id"]
        filename = recording.get("original_filename", "unknown")
        annotation_count = recording.get("annotation_count", 0)

        print(f"📝 {filename}")
        print(f"   Recording ID: {rec_id}")
        print(f"   Annotation count (metadata): {annotation_count}")

        # Get actual annotations
        annotations = get_annotations(token, rec_id)

        if annotations is None:
            print("   ⚠️  Failed to fetch annotations!")
            print()
            continue

        print(f"   Actual annotations in DB: {len(annotations)}")

        if annotations:
            ann = annotations[0]
            boxes = ann.get("bounding_boxes", [])
            print(f"   First annotation (ID: {ann.get('id')}):")
            print(f"     - Bounding boxes: {len(boxes)}")
            if boxes:
                box = boxes[0]
                print(f"     - First box label: {box.get('label')}")
                print(f"     - Time: {box.get('start_time')} - {box.get('end_time')}")
                print(f"     - Freq: {box.get('min_frequency')} - {box.get('max_frequency')}")
        else:
            print("   ⚠️  No annotations found in database!")

        print()


if __name__ == "__main__":
    main()
