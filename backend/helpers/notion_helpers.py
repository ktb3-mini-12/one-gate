"""
Notion property detection and page building utilities.
"""

import time


# Cache for Notion property detection (1-hour TTL)
_notion_property_cache = {}
CACHE_TTL = 3600  # 1 hour


def detect_notion_properties(notion_client, database_id: str):
    """
    Detect existing properties in Notion database and determine what to use/create.

    Returns:
        dict: {
            'title_property': str,  # Name of the title property to use
            'category_property': str,  # Name of the category property to use
            'needs_category': bool  # Whether we need to create Category property
        }
    """
    # 1. Retrieve database schema
    db_info = notion_client.databases.retrieve(database_id=database_id)
    existing_properties = db_info.get("properties", {})

    # Debug logging
    print(f"[Notion] Database ID: {database_id}")
    print(f"[Notion] Found {len(existing_properties)} properties:")
    for prop_name, prop_config in existing_properties.items():
        print(f"  - {prop_name}: {prop_config.get('type')}")

    # Check if properties are empty (permission issue)
    if not existing_properties:
        raise PermissionError(
            "Notion 데이터베이스에 접근 권한이 없습니다. "
            "Notion에서 해당 데이터베이스를 Integration에 공유해주세요. "
            "(데이터베이스 우측 상단 ··· → 연결 → One Gate 선택)"
        )

    # 2. Find title property (must exist, use whatever name it has)
    title_property = None
    for prop_name, prop_config in existing_properties.items():
        if prop_config.get("type") == "title":
            title_property = prop_name
            break

    if not title_property:
        # Try to find any property that could be title-like
        prop_types = {name: cfg.get("type") for name, cfg in existing_properties.items()}
        raise ValueError(f"데이터베이스에 title 속성이 없습니다. 발견된 속성: {prop_types}")

    # 3. Find category property (try '카테고리' or 'Category')
    category_property = None
    for prop_name, prop_config in existing_properties.items():
        if prop_config.get("type") == "select" and prop_name in ["카테고리", "Category"]:
            category_property = prop_name
            break

    # 4. If no category found, we'll create 'Category'
    needs_category = category_property is None
    if needs_category:
        category_property = "Category"

    return {
        "title_property": title_property,
        "category_property": category_property,
        "needs_category": needs_category
    }


def add_notion_property(notion_client, database_id: str, property_name: str, property_config: dict):
    """
    Add a single property to Notion database.
    """
    notion_client.databases.update(
        database_id=database_id,
        properties={
            property_name: property_config
        }
    )


def clear_notion_cache(database_id: str = None):
    """Clear Notion property cache for a specific database or all."""
    if database_id:
        _notion_property_cache.pop(database_id, None)
        print(f"[Notion] Cache cleared for database: {database_id}")
    else:
        _notion_property_cache.clear()
        print("[Notion] All cache cleared")


def get_notion_properties_cached(notion_client, database_id: str, force_refresh: bool = False):
    """
    Get properties with caching to avoid repeated API calls.
    """
    now = time.time()

    # Force refresh if requested
    if force_refresh and database_id in _notion_property_cache:
        del _notion_property_cache[database_id]
        print(f"[Notion] Force refreshing cache for: {database_id}")

    # Check cache
    if database_id in _notion_property_cache:
        cached = _notion_property_cache[database_id]
        if now - cached["timestamp"] < CACHE_TTL:
            print(f"[Notion] Using cached properties for: {database_id}")
            return cached["props_info"]

    # Not cached or expired, detect fresh
    print(f"[Notion] Fetching fresh properties for: {database_id}")
    props_info = detect_notion_properties(notion_client, database_id)
    _notion_property_cache[database_id] = {
        "props_info": props_info,
        "timestamp": now
    }

    return props_info


def build_notion_page_blocks(record, upload_data):
    """
    Build Notion page body blocks including image and analysis text.

    Args:
        record: Database record with image_url, text fields
        upload_data: AI analysis data with content, body fields

    Returns:
        List of Notion block objects
    """
    blocks = []

    # 1. Add image block if image exists
    if record.get("image_url"):
        blocks.append({
            "object": "block",
            "type": "image",
            "image": {
                "type": "external",
                "external": {"url": record["image_url"]}
            }
        })

    # 2. Add analysis heading + content
    analysis_content = upload_data.get("content") or upload_data.get("body")
    if analysis_content:
        blocks.append({
            "object": "block",
            "type": "heading_3",
            "heading_3": {
                "rich_text": [{"type": "text", "text": {"content": "분석 내용"}}]
            }
        })
        blocks.append({
            "object": "block",
            "type": "paragraph",
            "paragraph": {
                "rich_text": [{"type": "text", "text": {"content": analysis_content}}]
            }
        })

    # 3. Add original text if different from analysis content
    original_text = record.get("text", "")
    if original_text and original_text != analysis_content:
        blocks.append({
            "object": "block",
            "type": "heading_3",
            "heading_3": {
                "rich_text": [{"type": "text", "text": {"content": "원본 메모"}}]
            }
        })
        blocks.append({
            "object": "block",
            "type": "paragraph",
            "paragraph": {
                "rich_text": [{"type": "text", "text": {"content": original_text}}]
            }
        })

    # Fallback: if no blocks were added, add a simple paragraph
    if not blocks:
        fallback_content = upload_data.get("body") or upload_data.get("content") or original_text or "내용 없음"
        blocks.append({
            "object": "block",
            "type": "paragraph",
            "paragraph": {
                "rich_text": [{"type": "text", "text": {"content": fallback_content}}]
            }
        })

    return blocks
