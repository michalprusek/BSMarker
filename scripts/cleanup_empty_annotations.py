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
    """Get all recordings."""
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
            break

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
    """Get annotations for a specific recording."""
    headers = {"Authorization": f"Bearer {token}"}

    response = requests.get(
        f"{API_BASE_URL}/annotations/{recording_id}",
        headers=headers,
    )

    if response.status_code != 200:
        return []

    return response.json()


def delete_annotation(token: str, annotation_id: int) -> bool:
    """Delete an annotation."""
    headers = {"Authorization": f"Bearer {token}"}

    response = requests.delete(
        f"{API_BASE_URL}/annotations/{annotation_id}",
        headers=headers,
    )

    return response.status_code in [200, 204]


def main():
    print("🧹 Cleanup Empty Annotations")
    print("=" * 60)

    # Login
    token = login(USERNAME, PASSWORD)
    print("✅ Logged in")

    # Get recordings with annotations
    recordings = get_recordings(token)
    print(f"📊 Found {len(recordings)} recordings with annotations")

    if not recordings:
        print("\n✅ No annotations to clean up!")
        return

    # Check each recording
    print("\n🔍 Checking annotations...\n")

    total_deleted = 0
    total_kept = 0

    for recording in recordings:
        rec_id = recording["id"]
        filename = recording.get("original_filename", "unknown")

        annotations = get_annotations(token, rec_id)

        for ann in annotations:
            ann_id = ann["id"]
            bounding_boxes = ann.get("bounding_boxes", [])

            if len(bounding_boxes) == 0:
                # Empty annotation - delete it
                if delete_annotation(token, ann_id):
                    print(f"🗑️  Deleted empty annotation {ann_id} from {filename}")
                    total_deleted += 1
                else:
                    print(f"❌ Failed to delete annotation {ann_id}")
            else:
                total_kept += 1

    print(f"\n{'='*60}")
    print(f"✅ CLEANUP COMPLETED!")
    print(f"   Deleted: {total_deleted} empty annotations")
    print(f"   Kept: {total_kept} annotations with bounding boxes")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
