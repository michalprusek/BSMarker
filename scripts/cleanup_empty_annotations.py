#!/usr/bin/env python3
"""
Delete empty annotations (those with no bounding boxes).
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


def get_recordings(token: str, project_id: int = 1):
    """Get all recordings with annotations.

    Returns:
        List of recordings with annotation_count > 0, or None on API error.
    """
    headers = {"Authorization": f"Bearer {token}"}

    all_recordings = []
    page = 1

    while True:
        response = requests.get(
            f"{API_BASE_URL}/recordings/{project_id}/recordings",
            params={"page": page, "page_size": 100},
            headers=headers,
        )

        if response.status_code != 200:
            print(f"❌ API error on page {page}: {response.status_code}")
            print(f"   Response: {response.text[:200]}")
            return None  # Return None to indicate error, not empty list

        data = response.json()
        recordings = data.get("items", [])

        if not recordings:
            break

        all_recordings.extend(recordings)

        pagination = data.get("pagination", {})
        if page >= pagination.get("total_pages", 1):
            break

        page += 1

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
        print(f"  ❌ Failed to fetch annotations for recording {recording_id}: {response.status_code}")
        return None  # Return None to indicate error, not empty list

    return response.json()


def delete_annotation(token: str, annotation_id: int) -> tuple[bool, str]:
    """Delete an annotation.

    Returns:
        Tuple of (success: bool, message: str with error details if failed).
    """
    headers = {"Authorization": f"Bearer {token}"}

    response = requests.delete(
        f"{API_BASE_URL}/annotations/{annotation_id}",
        headers=headers,
    )

    if response.status_code in [200, 204]:
        return True, "OK"
    else:
        return False, f"HTTP {response.status_code}: {response.text[:100]}"


def main():
    print("🧹 Cleanup Empty Annotations")
    print("=" * 60)

    # Login
    token = login(USERNAME, PASSWORD)
    print("✅ Logged in")

    # Get recordings with annotations
    recordings = get_recordings(token)

    if recordings is None:
        print("\n❌ Failed to fetch recordings. Aborting to prevent data loss.")
        sys.exit(1)

    print(f"📊 Found {len(recordings)} recordings with annotations")

    if len(recordings) == 0:
        print("\n✅ No annotations to clean up!")
        return

    # Check each recording
    print("\n🔍 Checking annotations...\n")

    total_deleted = 0
    total_kept = 0
    total_errors = 0

    for recording in recordings:
        rec_id = recording["id"]
        filename = recording.get("original_filename", "unknown")

        annotations = get_annotations(token, rec_id)

        if annotations is None:
            # API error - skip this recording to prevent data loss
            print(f"⚠️  Skipping recording {filename} due to API error")
            total_errors += 1
            continue

        for ann in annotations:
            ann_id = ann["id"]
            bounding_boxes = ann.get("bounding_boxes", [])

            if len(bounding_boxes) == 0:
                # Empty annotation - delete it
                success, message = delete_annotation(token, ann_id)
                if success:
                    print(f"🗑️  Deleted empty annotation {ann_id} from {filename}")
                    total_deleted += 1
                else:
                    print(f"❌ Failed to delete annotation {ann_id}: {message}")
                    total_errors += 1
            else:
                total_kept += 1

    print(f"\n{'='*60}")
    print("✅ CLEANUP COMPLETED!")
    print(f"   Deleted: {total_deleted} empty annotations")
    print(f"   Kept: {total_kept} annotations with bounding boxes")
    if total_errors > 0:
        print(f"   ⚠️  Errors: {total_errors}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
