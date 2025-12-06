#!/usr/bin/env python3
"""
Debug specific recording annotations.
"""
import sys

import requests

API_BASE_URL = "https://bsmarker.utia.cas.cz/api/v1"
USERNAME = "remisvoj@cvut.cz"
PASSWORD = "bsmarker20250903"  # pragma: allowlist secret


def login(username: str, password: str) -> str:
    response = requests.post(
        f"{API_BASE_URL}/auth/login",
        data={"username": username, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    if response.status_code != 200:
        print(f"❌ Login failed: {response.status_code}")
        sys.exit(1)
    return response.json()["access_token"]


def find_recording_by_name(token: str, name_part: str, project_id: int = 1):
    """Find recording by partial name match."""
    headers = {"Authorization": f"Bearer {token}"}

    page = 1
    while True:
        response = requests.get(
            f"{API_BASE_URL}/recordings/{project_id}/recordings",
            params={"page": page, "page_size": 100, "search": name_part},
            headers=headers,
        )

        if response.status_code != 200:
            return None

        data = response.json()
        recordings = data.get("items", [])

        if recordings:
            return recordings[0]  # Return first match

        pagination = data.get("pagination", {})
        if page >= pagination.get("total_pages", 1):
            break
        page += 1

    return None


def get_annotations(token: str, recording_id: int):
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(
        f"{API_BASE_URL}/annotations/{recording_id}",
        headers=headers,
    )
    if response.status_code != 200:
        return []
    return response.json()


def main():
    print("🔍 Debug Recording Annotations")
    print("=" * 60)

    token = login(USERNAME, PASSWORD)
    print("✅ Logged in\n")

    # Find the specific recording user mentioned
    recording = find_recording_by_name(token, "XC420104_Mimus_polyglottos")

    if not recording:
        print("❌ Recording not found!")
        # Let's check first 3 recordings instead
        print("\nChecking first 3 recordings...")
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(
            f"{API_BASE_URL}/recordings/1/recordings",
            params={"page": 1, "page_size": 3},
            headers=headers,
        )
        data = response.json()
        recordings = data.get("items", [])
    else:
        recordings = [recording]

    for rec in recordings:
        rec_id = rec["id"]
        filename = rec.get("original_filename", "unknown")
        duration = rec.get("duration", 0)

        print(f"\n{'='*60}")
        print(f"📝 Recording: {filename}")
        print(f"   ID: {rec_id}")
        print(f"   Duration: {duration:.2f}s")
        print(f"   Annotation count (metadata): {rec.get('annotation_count', 0)}")

        annotations = get_annotations(token, rec_id)
        print(f"\n   Actual annotations: {len(annotations)}")

        for ann_idx, ann in enumerate(annotations):
            print(f"\n   📦 Annotation {ann_idx + 1} (ID: {ann['id']})")
            print(f"      Created: {ann.get('created_at', 'N/A')}")
            print(f"      Updated: {ann.get('updated_at', 'N/A')}")

            boxes = ann.get("bounding_boxes", [])
            print(f"      Bounding boxes: {len(boxes)}")

            if boxes:
                print(f"\n      Boxes detail:")
                for i, box in enumerate(boxes):
                    print(
                        f"        [{i+1}] Label: {box.get('label')}, "
                        f"Time: {box.get('start_time'):.2f}-{box.get('end_time'):.2f}s, "
                        f"Freq: {box.get('min_frequency'):.0f}-{box.get('max_frequency'):.0f}Hz"
                    )

                # Check for time overlaps
                print(f"\n      Time overlap check:")
                for i, b1 in enumerate(boxes):
                    for j, b2 in enumerate(boxes[i + 1 :], i + 1):
                        # Check if they overlap in time
                        if not (
                            b1["end_time"] <= b2["start_time"] or b1["start_time"] >= b2["end_time"]
                        ):
                            print(
                                f"        ⚠️  Box {i+1} ({b1['start_time']:.2f}-{b1['end_time']:.2f}s) "
                                f"overlaps Box {j+1} ({b2['start_time']:.2f}-{b2['end_time']:.2f}s)"
                            )

    print(f"\n{'='*60}")


if __name__ == "__main__":
    main()
