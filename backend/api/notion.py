"""
Notion OAuth and management endpoints.
"""

import base64

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import RedirectResponse
from notion_client import Client as NotionClient

from database import (
    supabase,
    NOTION_CLIENT_ID,
    NOTION_CLIENT_SECRET,
    NOTION_REDIRECT_URI,
)
from models.schemas import CreateDatabaseRequest


# OAuth constants
NOTION_AUTH_URL = "https://api.notion.com/v1/oauth/authorize"
NOTION_TOKEN_URL = "https://api.notion.com/v1/oauth/token"


# ============================================================
# Notion Router - Single unified router for all Notion endpoints
# ============================================================

router = APIRouter(prefix="/notion", tags=["Notion"])

# Legacy router for OAuth callback (Notion redirect_uri compatibility)
legacy_auth_router = APIRouter(prefix="/auth/notion", tags=["Notion OAuth Legacy"])


@router.get("/auth")
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


@router.get("/auth/callback")
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


# Legacy callback endpoint for Notion OAuth redirect_uri compatibility
@legacy_auth_router.get("/callback")
async def notion_callback_legacy(code: str = Query(...), state: str = Query(...)):
    """
    Legacy OAuth callback endpoint.
    Notion redirect_uri is set to /auth/notion/callback
    """
    return await notion_callback(code, state)


@router.get("/auth/status")
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


@router.delete("/auth/disconnect")
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
# Notion Database & Page Management
# ============================================================


@router.get("/pages")
async def get_notion_pages(user_id: str):
    """
    Get list of accessible Notion pages.

    - Used for selecting parent page when creating database
    - Returns page title, icon, and URL
    - Requires user's OAuth token
    """
    print(f"[Notion Pages] Fetching pages for user: {user_id}")
    try:
        user_result = supabase.table("users")\
            .select("notion_access_token")\
            .eq("id", user_id)\
            .single()\
            .execute()

        if not user_result.data or not user_result.data.get("notion_access_token"):
            print(f"[Notion Pages] No token found for user: {user_id}")
            return {"status": "error", "message": "Notion not connected"}

        token = user_result.data["notion_access_token"]
        print(f"[Notion Pages] Token found, length: {len(token)}")
        user_notion = NotionClient(auth=token)

        # Search for pages
        print("[Notion Pages] Searching for pages...")
        search_result = user_notion.search(
            filter={"property": "object", "value": "page"}
        )
        print(f"[Notion Pages] Search returned {len(search_result.get('results', []))} results")

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

        print(f"[Notion Pages] Returning {len(pages)} pages")
        return {"status": "success", "data": pages}

    except Exception as e:
        print(f"[Notion Pages] Error: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        return {"status": "error", "message": str(e)}


@router.post("/setup-database")
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


@router.get("/database-status")
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
