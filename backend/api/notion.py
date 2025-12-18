"""
Notion OAuth and management endpoints.
"""

import base64
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import RedirectResponse
from notion_client import Client as NotionClient

from database import (
    supabase,
    notion,
    NOTION_CLIENT_ID,
    NOTION_CLIENT_SECRET,
    NOTION_REDIRECT_URI,
    NOTION_DB_ID,
)
from models.schemas import NotionMemoRequest, CreateDatabaseRequest
from helpers.notion_helpers import (
    get_notion_properties_cached,
    add_notion_property,
    _notion_property_cache,
)


# OAuth constants
NOTION_AUTH_URL = "https://api.notion.com/v1/oauth/authorize"
NOTION_TOKEN_URL = "https://api.notion.com/v1/oauth/token"


# ============================================================
# Auth Router - Notion OAuth Flow
# ============================================================

auth_router = APIRouter(prefix="/auth/notion", tags=["Notion OAuth"])


@auth_router.get("")
async def notion_auth(user_id: str):
    """
    Start Notion OAuth authentication.

    - Includes user_id in state parameter for callback
    - Returns authorization URL for frontend to open
    """
    if not NOTION_CLIENT_ID or not NOTION_REDIRECT_URI:
        raise HTTPException(status_code=500, detail="Notion OAuth not configured")

    auth_url = (
        f"{NOTION_AUTH_URL}"
        f"?client_id={NOTION_CLIENT_ID}"
        f"&response_type=code"
        f"&owner=user"
        f"&redirect_uri={NOTION_REDIRECT_URI}"
        f"&state={user_id}"
    )
    return {"auth_url": auth_url}


@auth_router.get("/callback")
async def notion_callback(code: str = Query(...), state: str = Query(...)):
    """
    Handle Notion OAuth callback.

    - Exchanges authorization code for access token
    - Stores token in user's record
    - Redirects to frontend with success message
    """
    if not NOTION_CLIENT_ID or not NOTION_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Notion OAuth not configured")

    user_id = state

    try:
        credentials = f"{NOTION_CLIENT_ID}:{NOTION_CLIENT_SECRET}"
        encoded_credentials = base64.b64encode(credentials.encode()).decode()

        async with httpx.AsyncClient() as client:
            response = await client.post(
                NOTION_TOKEN_URL,
                headers={
                    "Authorization": f"Basic {encoded_credentials}",
                    "Content-Type": "application/json",
                },
                json={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": NOTION_REDIRECT_URI,
                },
            )

        if response.status_code != 200:
            print(f"[Notion OAuth] Token error: {response.text}")
            raise HTTPException(status_code=400, detail="Failed to get access token")

        token_data = response.json()
        access_token = token_data.get("access_token")
        workspace_name = token_data.get("workspace_name")

        print(f"[Notion OAuth] Success - Workspace: {workspace_name}")

        result = supabase.table("users").update({"notion_access_token": access_token}).eq("id", user_id).execute()
        if not result.data:
            print(f"[Notion OAuth] User not found: {user_id}")

        return RedirectResponse(url=f"http://localhost:5173?notion_connected=true&workspace={workspace_name}")

    except httpx.HTTPError as e:
        print(f"[Notion OAuth] HTTP Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        print(f"[Notion OAuth] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@auth_router.get("/status")
async def notion_auth_status(user_id: str):
    """
    Check user's Notion connection status.

    - Returns connection status (connected/not_connected/expired)
    - Validates token by calling Notion API
    - Returns user info if connected
    """
    try:
        result = supabase.table("users")\
            .select("notion_access_token, notion_database_id")\
            .eq("id", user_id)\
            .single()\
            .execute()

        print(f"[Notion Status] User {user_id}: token={'있음' if result.data and result.data.get('notion_access_token') else '없음'}")

        if result.data and result.data.get("notion_access_token"):
            token = result.data["notion_access_token"]
            try:
                notion_client = NotionClient(auth=token)
                user_info = notion_client.users.me()
                print(f"[Notion Status] API 호출 성공: {user_info.get('name')}")
                return {
                    "status": "connected",
                    "user": user_info.get("name"),
                    "bot_id": user_info.get("bot", {}).get("owner", {}).get("user", {}).get("id"),
                }
            except Exception as e:
                print(f"[Notion Status] 토큰 검증 실패: {e}")
                return {"status": "expired", "message": "Token expired or invalid"}

        return {"status": "not_connected"}

    except Exception as e:
        print(f"[Notion Status] Error: {e}")
        return {"status": "error", "message": str(e)}


@auth_router.delete("/disconnect")
async def notion_disconnect(user_id: str):
    """
    Disconnect Notion integration.

    - Removes both access token and database ID
    - Requires re-authentication to reconnect
    """
    try:
        result = supabase.table("users")\
            .update({
                "notion_access_token": None,
                "notion_database_id": None
            })\
            .eq("id", user_id)\
            .execute()

        if result.data:
            return {"status": "success", "message": "Notion disconnected"}
        return {"status": "error", "message": "User not found"}
    except Exception as e:
        print(f"[Notion Disconnect] Error: {e}")
        return {"status": "error", "message": str(e)}


# ============================================================
# Notion Router - Database & Page Management
# ============================================================

notion_router = APIRouter(prefix="/notion", tags=["Notion Management"])


@notion_router.post("/create")
async def create_notion_memo(request: NotionMemoRequest):
    """
    [DEPRECATED - Development Only] Create Notion memo using server integration token.

    Use POST /records/{id}/upload instead for production.
    This endpoint uses the server's NOTION_SECRET and NOTION_DB_ID.
    """
    if not notion or not NOTION_DB_ID:
        return {"status": "error", "message": "Notion integration not configured"}

    try:
        title = request.content.strip().splitlines()[0][:100] if request.content.strip() else "OneGate Memo"

        # Detect or create required properties
        props_info = get_notion_properties_cached(notion, NOTION_DB_ID)

        # If Category property doesn't exist, add it
        if props_info["needs_category"]:
            try:
                add_notion_property(
                    notion,
                    NOTION_DB_ID,
                    "Category",
                    {
                        "select": {
                            "options": [
                                {"name": "아이디어", "color": "blue"},
                                {"name": "할 일", "color": "green"},
                                {"name": "메모", "color": "yellow"},
                                {"name": "일정", "color": "red"},
                                {"name": "기타", "color": "gray"}
                            ]
                        }
                    }
                )
                print(f"[Notion] Added 'Category' property to database {NOTION_DB_ID}")
                # Invalidate cache
                if NOTION_DB_ID in _notion_property_cache:
                    del _notion_property_cache[NOTION_DB_ID]
                props_info = get_notion_properties_cached(notion, NOTION_DB_ID)
            except Exception as e:
                print(f"[Notion] Failed to add Category property: {e}")

        # Create page with detected property names
        page = notion.pages.create(
            parent={"database_id": NOTION_DB_ID},
            properties={
                props_info["title_property"]: {
                    "title": [{"type": "text", "text": {"content": title}}]
                },
                props_info["category_property"]: {
                    "select": {"name": request.category}
                },
            },
            children=[
                {
                    "object": "block",
                    "type": "paragraph",
                    "paragraph": {"rich_text": [{"type": "text", "text": {"content": request.content}}]},
                }
            ],
        )
        return {"status": "success", "data": {"page_id": page.get("id")}}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@notion_router.post("/create-with-token")
async def create_notion_memo_with_token(request: NotionMemoRequest, user_id: str = Query(...)):
    """
    [DEPRECATED - Test Only] Create Notion memo using user's OAuth token.

    Use POST /records/{id}/upload instead for production.
    This endpoint was used for testing user OAuth tokens.
    """
    try:
        user_result = supabase.table("users").select("notion_access_token").eq("id", user_id).single().execute()

        if not user_result.data or not user_result.data.get("notion_access_token"):
            return {"status": "error", "message": "Notion not connected"}

        token = user_result.data["notion_access_token"]
        user_notion = NotionClient(auth=token)

        search_result = user_notion.search(filter={"property": "object", "value": "database"})
        databases = search_result.get("results", [])
        if not databases:
            return {"status": "error", "message": "No accessible databases found"}

        target_db = databases[0]
        db_id = target_db["id"]
        db_info = user_notion.databases.retrieve(db_id)
        properties = db_info.get("properties", {})

        title_prop = None
        for prop_name, prop_info in properties.items():
            if prop_info.get("type") == "title":
                title_prop = prop_name
                break

        if not title_prop:
            return {"status": "error", "message": "No title property found in database"}

        result = user_notion.pages.create(
            parent={"database_id": db_id},
            properties={title_prop: {"title": [{"text": {"content": request.content}}]}},
        )

        notion_url = result.get("url")
        print(f"[Notion OAuth] 메모 생성 완료: {notion_url}")

        return {
            "status": "success",
            "url": notion_url,
            "page_id": result.get("id"),
            "database": target_db.get("title", [{}])[0].get("text", {}).get("content", "Unknown"),
        }

    except Exception as e:
        print(f"[Notion OAuth Create] Error: {e}")
        return {"status": "error", "message": str(e)}


@notion_router.get("/pages")
async def get_notion_pages(user_id: str):
    """
    Get list of accessible Notion pages.

    - Used for selecting parent page when creating database
    - Returns page title, icon, and URL
    - Requires user's OAuth token
    """
    try:
        user_result = supabase.table("users")\
            .select("notion_access_token")\
            .eq("id", user_id)\
            .single()\
            .execute()

        if not user_result.data or not user_result.data.get("notion_access_token"):
            return {"status": "error", "message": "Notion not connected"}

        token = user_result.data["notion_access_token"]
        user_notion = NotionClient(auth=token)

        # Search for pages
        search_result = user_notion.search(
            filter={"property": "object", "value": "page"}
        )

        pages = []
        for page in search_result.get("results", []):
            # Extract page title
            title = "Untitled"
            if page.get("properties"):
                for prop in page["properties"].values():
                    if prop.get("type") == "title" and prop.get("title"):
                        title = prop["title"][0]["text"]["content"] if prop["title"] else "Untitled"
                        break

            # Extract page icon
            icon = None
            if page.get("icon"):
                if page["icon"]["type"] == "emoji":
                    icon = page["icon"]["emoji"]
                elif page["icon"]["type"] == "external":
                    icon = page["icon"]["external"]["url"]

            pages.append({
                "id": page["id"],
                "title": title,
                "icon": icon,
                "url": page.get("url")
            })

        return {"status": "success", "data": pages}

    except Exception as e:
        print(f"[Notion Pages] Error: {e}")
        return {"status": "error", "message": str(e)}


@notion_router.post("/setup-database")
async def setup_notion_database(request: CreateDatabaseRequest):
    """
    Setup One Gate database in selected page.

    - If database exists: Connect to existing database
    - If not: Create new database with default schema
    - Saves database ID to user's record
    """
    try:
        user_result = supabase.table("users")\
            .select("notion_access_token")\
            .eq("id", request.user_id)\
            .single()\
            .execute()

        if not user_result.data or not user_result.data.get("notion_access_token"):
            return {"status": "error", "message": "Notion not connected"}

        token = user_result.data["notion_access_token"]
        user_notion = NotionClient(auth=token)

        # 1. Search for existing "One Gate" database in page
        existing_db = None
        try:
            children = user_notion.blocks.children.list(block_id=request.parent_page_id)
            for block in children.get("results", []):
                if block.get("type") == "child_database":
                    # Check database title
                    db_id = block["id"]
                    db_info = user_notion.databases.retrieve(db_id)
                    db_title = ""
                    if db_info.get("title"):
                        db_title = db_info["title"][0]["text"]["content"] if db_info["title"] else ""

                    # Find database with "One Gate" in title
                    if "One Gate" in db_title or "one gate" in db_title.lower():
                        existing_db = db_info
                        break
        except Exception as e:
            print(f"[Notion] Error searching child blocks (ignored): {e}")

        # 2. If database exists, connect to it
        if existing_db:
            db_id = existing_db["id"]
            db_url = existing_db["url"]
            db_title = existing_db["title"][0]["text"]["content"] if existing_db.get("title") else "One Gate 메모"

            # Save database ID to user record
            supabase.table("users")\
                .update({"notion_database_id": db_id})\
                .eq("id", request.user_id)\
                .execute()

            print(f"[Notion] Existing database connected: {db_url}")

            return {
                "status": "success",
                "database_id": db_id,
                "url": db_url,
                "name": db_title,
                "created": False,
                "message": "기존 데이터베이스에 연결되었습니다"
            }

        # 3. Create new database
        new_db = user_notion.databases.create(
            parent={"type": "page_id", "page_id": request.parent_page_id},
            title=[{"type": "text", "text": {"content": request.database_name}}],
            icon={"type": "emoji", "emoji": "⚡"},
            properties={
                "제목": {"title": {}},
                "카테고리": {
                    "select": {
                        "options": [
                            {"name": "아이디어", "color": "blue"},
                            {"name": "할 일", "color": "green"},
                            {"name": "메모", "color": "yellow"},
                            {"name": "일정", "color": "red"},
                            {"name": "기타", "color": "gray"}
                        ]
                    }
                },
                "타입": {
                    "select": {
                        "options": [
                            {"name": "MEMO", "color": "purple"},
                            {"name": "CALENDAR", "color": "orange"}
                        ]
                    }
                },
                "상태": {
                    "select": {
                        "options": [
                            {"name": "대기", "color": "gray"},
                            {"name": "완료", "color": "green"}
                        ]
                    }
                },
                "생성일": {"date": {}}
            }
        )

        db_id = new_db["id"]
        db_url = new_db["url"]

        # Save database ID to user record
        supabase.table("users")\
            .update({"notion_database_id": db_id})\
            .eq("id", request.user_id)\
            .execute()

        print(f"[Notion] Database created: {db_url}")

        return {
            "status": "success",
            "database_id": db_id,
            "url": db_url,
            "name": request.database_name,
            "created": True,
            "message": "새 데이터베이스가 생성되었습니다"
        }

    except Exception as e:
        print(f"[Notion Setup DB] Error: {e}")
        return {"status": "error", "message": str(e)}


@notion_router.get("/database-status")
async def get_notion_database_status(user_id: str):
    """
    Check user's Notion database setup status.

    - Returns status: not_connected, no_database, database_invalid, or ready
    - If ready, returns database info including name and parent page
    """
    try:
        user_result = supabase.table("users")\
            .select("notion_access_token, notion_database_id")\
            .eq("id", user_id)\
            .single()\
            .execute()

        if not user_result.data:
            return {"status": "error", "message": "User not found"}

        token = user_result.data.get("notion_access_token")
        db_id = user_result.data.get("notion_database_id")

        if not token:
            return {"status": "not_connected"}

        if not db_id:
            return {"status": "no_database", "message": "데이터베이스를 선택해주세요"}

        # Retrieve database info
        try:
            user_notion = NotionClient(auth=token)
            db_info = user_notion.databases.retrieve(db_id)

            db_title = "One Gate 메모"
            if db_info.get("title"):
                db_title = db_info["title"][0]["text"]["content"] if db_info["title"] else db_title

            # Get parent page info
            page_name = None
            parent = db_info.get("parent", {})
            if parent.get("type") == "page_id":
                try:
                    parent_page = user_notion.pages.retrieve(parent["page_id"])
                    # Extract page title
                    if parent_page.get("properties"):
                        for prop in parent_page["properties"].values():
                            if prop.get("type") == "title" and prop.get("title"):
                                page_name = prop["title"][0]["text"]["content"] if prop["title"] else None
                                break
                except Exception:
                    pass

            return {
                "status": "ready",
                "database_id": db_id,
                "database_name": db_title,
                "page_name": page_name,
                "url": db_info.get("url")
            }
        except Exception:
            # Database deleted or inaccessible
            return {"status": "database_invalid", "message": "데이터베이스에 접근할 수 없습니다"}

    except Exception as e:
        print(f"[Notion DB Status] Error: {e}")
        return {"status": "error", "message": str(e)}
