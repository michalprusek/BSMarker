#!/usr/bin/env python3
"""
Debug API pagination to understand why we only see 50 unique recordings.
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


def main():
    print("🔍 Debug Pagination")
    print("=" * 60)

    token = login(USERNAME, PASSWORD)
    print("✅ Logged in\n")

    headers = {"Authorization": f"Bearer {token}"}

    # First, check pagination metadata
    response = requests.get(
        f"{API_BASE_URL}/recordings/1/recordings",
        params={"page": 1, "page_size": 100},
        headers=headers,
    )

    data = response.json()
    pagination = data.get("pagination", {})

    print("📊 Pagination metadata from first request:")
    print(f"   Total items: {pagination.get('total', 'N/A')}")
    print(f"   Page: {pagination.get('page', 'N/A')}")
    print(f"   Page size: {pagination.get('page_size', 'N/A')}")
    print(f"   Total pages: {pagination.get('total_pages', 'N/A')}")

    # Check first few pages to see what IDs we get
    all_ids = []
    id_to_page = {}

    print(f"\n📄 Checking first 5 pages (100 items each):\n")

    for page in range(1, 6):
        response = requests.get(
            f"{API_BASE_URL}/recordings/1/recordings",
            params={"page": page, "page_size": 100},
            headers=headers,
        )

        data = response.json()
        recordings = data.get("items", [])

        ids = [r["id"] for r in recordings]
        unique_on_page = len(set(ids))

        print(f"   Page {page}: {len(recordings)} items, {unique_on_page} unique IDs")
        print(f"      ID range: {min(ids) if ids else 'N/A'} - {max(ids) if ids else 'N/A'}")
        print(f"      First 5 IDs: {ids[:5]}")

        for rec_id in ids:
            if rec_id in id_to_page:
                id_to_page[rec_id].append(page)
            else:
                id_to_page[rec_id] = [page]

        all_ids.extend(ids)

    print(f"\n📊 Summary of first 5 pages:")
    print(f"   Total records: {len(all_ids)}")
    print(f"   Unique IDs: {len(set(all_ids))}")

    # Find IDs that appear on multiple pages
    duplicates = {k: v for k, v in id_to_page.items() if len(v) > 1}
    if duplicates:
        print(f"\n⚠️  IDs appearing on multiple pages: {len(duplicates)}")
        for rec_id, pages in list(duplicates.items())[:5]:
            print(f"      ID {rec_id}: pages {pages}")

    # Now check what the actual min and max IDs are in the database
    # by fetching with different sort orders
    print(f"\n🔍 Checking ID range in database:")

    # Sort by ID ascending
    response = requests.get(
        f"{API_BASE_URL}/recordings/1/recordings",
        params={"page": 1, "page_size": 5, "sort_by": "id", "sort_order": "asc"},
        headers=headers,
    )
    data = response.json()
    recordings = data.get("items", [])
    if recordings:
        print(f"   Lowest IDs: {[r['id'] for r in recordings]}")

    # Sort by ID descending
    response = requests.get(
        f"{API_BASE_URL}/recordings/1/recordings",
        params={"page": 1, "page_size": 5, "sort_by": "id", "sort_order": "desc"},
        headers=headers,
    )
    data = response.json()
    recordings = data.get("items", [])
    if recordings:
        print(f"   Highest IDs: {[r['id'] for r in recordings]}")

    print(f"\n{'='*60}")


if __name__ == "__main__":
    main()
