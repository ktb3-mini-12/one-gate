"""
Categories CRUD endpoints.
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Optional

from database import supabase
from models.schemas import CategoryRequest


router = APIRouter(prefix="/categories", tags=["Categories"])


@router.get("")
async def get_categories(user_id: str, type: Optional[str] = None):
    """Get user's categories"""
    query = supabase.table("category").select("*").eq("user_id", user_id)
    if type:
        query = query.eq("type", type)
    result = query.execute()
    return {"status": "success", "data": result.data}


@router.post("")
async def create_category(request: CategoryRequest, user_id: str = Query(None)):
    """Create category (user_id from body or query)"""
    final_user_id = request.user_id or user_id
    if not final_user_id:
        raise HTTPException(status_code=400, detail="user_id is required")

    result = supabase.table("category").insert({
        "name": request.name,
        "type": request.type,
        "user_id": final_user_id
    }).execute()
    return {"status": "success", "data": result.data[0] if result.data else None}


@router.delete("/{category_id}")
async def delete_category(category_id: int):
    """Delete category"""
    result = supabase.table("category").delete().eq("id", category_id).execute()
    if result.data:
        return {"status": "success", "message": "Category deleted"}
    return {"status": "error", "message": "Category not found"}
