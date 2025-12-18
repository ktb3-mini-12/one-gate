# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

One Gate is a productivity application that provides a unified interface for capturing and managing memos and calendar events. It integrates with Google Calendar and Notion, using AI (Gemini) to automatically classify user inputs.

## Architecture

**Frontend** (`/frontend`): Electron + React desktop app with two window modes:
- Main window: Full app interface with Home, Settings views
- Mini window: Spotlight-style quick capture (Cmd/Ctrl+Shift+Space)

**Backend** (`/backend`): FastAPI server providing:
- `/analyze` - Input analysis and storage
- `/records` - CRUD for user inputs
- `/categories` - Category management
- `/calendar/*` - Google Calendar integration
- `/notion/*` - Notion integration
- `/ai/analyze` - Gemini AI classification (text/image/PDF)

**Data Layer**: Supabase (PostgreSQL) with tables: `inputs`, `category`, `users`

## Development Commands

### Frontend (Electron/React)
```bash
cd frontend
npm install
npm run dev          # Start development
npm run lint         # ESLint check
npm run format       # Prettier format
npm run build:mac    # Build for macOS
npm run build:win    # Build for Windows
npm run build:linux  # Build for Linux
```

### Backend (FastAPI)
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
pip install -r ai/requirements.txt  # For Gemini AI features
uvicorn main:app --reload
```

## Environment Variables

### Backend (`.env`)
- `SUPABASE_URL`, `SUPABASE_KEY` - Supabase connection
- `GOOGLE_API_KEY` - Gemini AI API key
- `GEMINI_MODEL` - Model name (default: gemini-2.0-flash)
- `NOTION_SECRET`, `NOTION_DB_ID` - Notion integration
- `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`, `NOTION_REDIRECT_URI` - Notion OAuth

### Frontend (`.env`)
- `VITE_API_BASE_URL` - Backend API URL (default: http://localhost:8000)

## Key Code Paths

- `frontend/src/main/index.js` - Electron main process, window management, IPC handlers
- `frontend/src/renderer/src/App.jsx` - React root with auth state and routing
- `frontend/src/renderer/src/MiniInput.jsx` - Quick capture component
- `frontend/src/renderer/src/lib/supabase.js` - Supabase client configuration
- `backend/main.py` - FastAPI app with all API endpoints
- `backend/ai/app.py` - Gemini AI classification router
- `backend/database.py` - Database client initialization

## Authentication Flow

1. Google OAuth initiated from frontend via Supabase Auth
2. Auth window opened in Electron (`ipcMain: open-auth-window`)
3. Callback with tokens parsed in main process
4. Tokens sent to renderer via `auth-callback` IPC event
5. Google provider token stored in localStorage for Calendar API calls
