#!/usr/bin/env python3
"""
Verify what annotations were actually created.
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


def get_all_recordings(token: str, project_id: int = 1):
    """Get all recordings with their IDs."""
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

    return all_recordings


def get_annotations(token: str, recording_id: int):
    """Get annotations for a recording."""
    headers = {"Authorization": f"Bearer {token}"}

    response = requests.get(
        f"{API_BASE_URL}/annotations/{recording_id}",
        headers=headers,
    )

    if response.status_code != 200:
        return []

    return response.json()


def check_box_overlap(box1, box2):
    """Check if two boxes overlap in time."""
    time_overlap = not (
        box1["end_time"] <= box2["start_time"] or box1["start_time"] >= box2["end_time"]
    )
    return time_overlap


def main():
    print("🔍 Verifying Annotations State")
    print("=" * 60)

    token = login(USERNAME, PASSWORD)
    print("✅ Logged in\n")

    # Get all recordings
    print("📊 Fetching recordings...")
    recordings = get_all_recordings(token)

    # Check for unique IDs
    unique_ids = set()
    duplicate_count = 0
    for rec in recordings:
        rec_id = rec["id"]
        if rec_id in unique_ids:
            duplicate_count += 1
        else:
            unique_ids.add(rec_id)

    print(f"   Total recordings fetched: {len(recordings)}")
    print(f"   Unique recording IDs: {len(unique_ids)}")
    print(f"   Duplicate records: {duplicate_count}")

    # Check annotations
    print(f"\n📝 Checking annotations...")

    annotated_recordings = [r for r in recordings if r.get("annotation_count", 0) > 0]
    print(f"   Recordings with annotations: {len(set(r['id'] for r in annotated_recordings))}")

    # Sample 5 annotated recordings
    print(f"\n🔍 Sampling 5 recordings with annotations:\n")

    checked_ids = set()
    sample_count = 0

    for recording in recordings:
        if sample_count >= 5:
            break

        rec_id = recording["id"]
        if rec_id in checked_ids:
            continue
        if recording.get("annotation_count", 0) == 0:
            continue

        checked_ids.add(rec_id)
        sample_count += 1

        filename = recording.get("original_filename", "unknown")
        annotations = get_annotations(token, rec_id)

        total_boxes = sum(len(ann.get("bounding_boxes", [])) for ann in annotations)

        print(f"{sample_count}. {filename} (ID: {rec_id})")
        print(f"   Annotations: {len(annotations)}")
        print(f"   Total boxes: {total_boxes}")

        # Check for overlaps
        for ann_idx, ann in enumerate(annotations):
            boxes = ann.get("bounding_boxes", [])
            print(f"   Annotation {ann_idx + 1}: {len(boxes)} boxes")

            # Check overlaps within this annotation
            overlaps = []
            for i, box1 in enumerate(boxes):
                for j, box2 in enumerate(boxes[i + 1 :], i + 1):
                    if check_box_overlap(box1, box2):
                        overlaps.append((i, j))

            if overlaps:
                print(f"      ⚠️  {len(overlaps)} overlapping pairs:")
                for i, j in overlaps[:3]:  # Show first 3
                    b1 = boxes[i]
                    b2 = boxes[j]
                    print(
                        f"         Box {i} ({b1['start_time']:.2f}-{b1['end_time']:.2f}s) overlaps Box {j} ({b2['start_time']:.2f}-{b2['end_time']:.2f}s)"
                    )

        print()

    print(f"{'='*60}")


if __name__ == "__main__":
    main()
