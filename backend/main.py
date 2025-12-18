"""
OneGate Backend - FastAPI Server

Refactored main entry point with modular structure:
- api/ - API router modules
- helpers/ - Utility functions
- models/ - Pydantic schemas
- database.py - Database clients
"""

import asyncio
import json
from typing import Any, Dict

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware


# ============================================================
# Database and Services
# ============================================================

from database import supabase


# ============================================================
# AI Module Loading
# ============================================================

def _load_ai_module():
    """Load AI module (router + service functions)"""
    try:
        from ai.app import router as ai_router, analyze_text, analyze_image_bytes, is_ai_available
        return ai_router, analyze_text, analyze_image_bytes, is_ai_available
    except Exception as e:
        print(f"[AI] Module load failed: {e}")
        return None, None, None, lambda: False


ai_router, ai_analyze_text, ai_analyze_image_bytes, ai_is_available = _load_ai_module()


# ============================================================
# SSE Broker for Real-time Updates
# ============================================================

class _SseBroker:
    """Server-Sent Events broker for user-specific event streams."""

    def __init__(self) -> None:
        self._queues_by_user: Dict[str, set[asyncio.Queue[str]]] = {}
        self._lock = asyncio.Lock()

    async def subscribe(self, user_id: str) -> asyncio.Queue[str]:
        """Subscribe to user's event stream."""
        queue: asyncio.Queue[str] = asyncio.Queue()
        async with self._lock:
            self._queues_by_user.setdefault(user_id, set()).add(queue)
        return queue

    async def unsubscribe(self, user_id: str, queue: asyncio.Queue[str]) -> None:
        """Unsubscribe from user's event stream."""
        async with self._lock:
            queues = self._queues_by_user.get(user_id)
            if not queues:
                return
            queues.discard(queue)
            if not queues:
                self._queues_by_user.pop(user_id, None)

    async def publish(self, user_id: str, event: str, data: Dict[str, Any]) -> None:
        """Publish event to user's subscribers."""
        payload = json.dumps(data, ensure_ascii=False)
        message = f"event: {event}\ndata: {payload}\n\n"
        async with self._lock:
            queues = list(self._queues_by_user.get(user_id, set()))
        for queue in queues:
            try:
                queue.put_nowait(message)
            except asyncio.QueueFull:
                pass


_broker = _SseBroker()


# ============================================================
# FastAPI Application Setup
# ============================================================

app = FastAPI(
    title="OneGate API",
    description="AI-powered quick input backend for Calendar and Notion",
    version="1.0.0"
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# Router Mounting
# ============================================================

# AI Router (if available)
if ai_router is not None:
    app.include_router(ai_router)
    print("[AI] Gemini AI router mounted")
else:
    print("[AI] AI router disabled - fallback classification mode")

# API Routers
from api import records, notion, calendar, categories

# Records router (/records/*)
app.include_router(records.router)

# Notion router (/notion/*)
app.include_router(notion.router)

# Calendar router (/calendar/*)
app.include_router(calendar.router)

# Categories router (/categories/*)
app.include_router(categories.router)

print("[API] All routers mounted successfully")


# ============================================================
# Health Check
# ============================================================

@app.get("/health")
async def health_check():
    """Health check endpoint for monitoring."""
    return {
        "status": "ok",
        "ai_available": ai_is_available() if ai_is_available else False
    }


# ============================================================
# Application Lifecycle
# ============================================================

@app.on_event("startup")
async def startup_event():
    """Run on application startup."""
    print("=" * 50)
    print("OneGate Backend Started")
    print("=" * 50)
    print(f"AI Module: {'Enabled' if ai_router else 'Disabled (Fallback Mode)'}")
    print(f"Database: Connected to Supabase")
    print("=" * 50)


@app.on_event("shutdown")
async def shutdown_event():
    """Run on application shutdown."""
    print("OneGate Backend Shutting Down...")
