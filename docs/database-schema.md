# One-Gate Database Schema

## ERD 개요

```
users ──────┬────────── categories
            │
            └────────── inputs ────────── input_tags ────────── tags
```

---

## 테이블 명세

### 1. users (사용자)

| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| id | UUID | PK, DEFAULT uuid_generate_v4() | 사용자 고유 ID |
| email | VARCHAR(255) | UNIQUE, NOT NULL | 이메일 |
| name | VARCHAR(100) | | 사용자 이름 |
| avatar_url | TEXT | | 프로필 이미지 URL |
| created_at | TIMESTAMP | DEFAULT NOW() | 생성일 |
| updated_at | TIMESTAMP | DEFAULT NOW() | 수정일 |

---

### 2. categories (카테고리)

| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| id | SERIAL | PK | 카테고리 ID |
| user_id | UUID | FK → users.id, NULL 허용 | 소유자 (NULL이면 시스템 기본) |
| name | VARCHAR(50) | NOT NULL | 카테고리명 (예: CALENDAR, MEMO) |
| icon | VARCHAR(10) | | 아이콘 이모지 (예: 📅, 📝) |
| color | VARCHAR(7) | | HEX 색상 코드 (예: #FFF3E0) |
| is_default | BOOLEAN | DEFAULT FALSE | 시스템 기본 카테고리 여부 |
| sort_order | INTEGER | DEFAULT 0 | 정렬 순서 |
| created_at | TIMESTAMP | DEFAULT NOW() | 생성일 |

**기본 카테고리 (시드 데이터):**
| name | icon | color | is_default |
|------|------|-------|------------|
| CALENDAR | 📅 | #FFF3E0 | TRUE |
| MEMO | 📝 | #E3F2FD | TRUE |
| TODO | ✅ | #E8F5E9 | TRUE |
| IDEA | 💡 | #FFF8E1 | TRUE |

---

### 3. inputs (입력 데이터)

| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| id | SERIAL | PK | 입력 ID |
| user_id | UUID | FK → users.id, NOT NULL | 소유자 |
| category_id | INTEGER | FK → categories.id | 카테고리 |
| type | VARCHAR(20) | NOT NULL | 입력 타입 (text, image) |
| content | TEXT | NOT NULL | 원본 입력 내용 |
| summary | VARCHAR(500) | | AI 요약 결과 |
| event_date | TIMESTAMP | | 일정 날짜/시간 (CALENDAR용) |
| is_completed | BOOLEAN | DEFAULT FALSE | 완료 여부 (TODO용) |
| created_at | TIMESTAMP | DEFAULT NOW() | 생성일 |
| updated_at | TIMESTAMP | DEFAULT NOW() | 수정일 |

---

### 4. tags (태그)

| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| id | SERIAL | PK | 태그 ID |
| user_id | UUID | FK → users.id, NOT NULL | 소유자 |
| name | VARCHAR(50) | NOT NULL | 태그명 (# 제외) |
| color | VARCHAR(7) | | HEX 색상 코드 |
| created_at | TIMESTAMP | DEFAULT NOW() | 생성일 |

**UNIQUE 제약:** (user_id, name)

---

### 5. input_tags (입력-태그 연결)

| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| input_id | INTEGER | FK → inputs.id, ON DELETE CASCADE | 입력 ID |
| tag_id | INTEGER | FK → tags.id, ON DELETE CASCADE | 태그 ID |

**PK:** (input_id, tag_id)

---

## SQL 생성문 (Supabase/PostgreSQL)

```sql
-- UUID 확장 활성화
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(100),
    avatar_url TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. categories
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    icon VARCHAR(10),
    color VARCHAR(7),
    is_default BOOLEAN DEFAULT FALSE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 기본 카테고리 시드
INSERT INTO categories (name, icon, color, is_default, sort_order) VALUES
    ('CALENDAR', '📅', '#FFF3E0', TRUE, 1),
    ('MEMO', '📝', '#E3F2FD', TRUE, 2),
    ('TODO', '✅', '#E8F5E9', TRUE, 3),
    ('IDEA', '💡', '#FFF8E1', TRUE, 4);

-- 3. inputs
CREATE TABLE inputs (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    type VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    summary VARCHAR(500),
    event_date TIMESTAMP,
    is_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 4. tags
CREATE TABLE tags (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    color VARCHAR(7),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, name)
);

-- 5. input_tags
CREATE TABLE input_tags (
    input_id INTEGER REFERENCES inputs(id) ON DELETE CASCADE,
    tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (input_id, tag_id)
);

-- 인덱스
CREATE INDEX idx_inputs_user_id ON inputs(user_id);
CREATE INDEX idx_inputs_category_id ON inputs(category_id);
CREATE INDEX idx_inputs_created_at ON inputs(created_at DESC);
CREATE INDEX idx_tags_user_id ON tags(user_id);
```

---

## RLS (Row Level Security) - Supabase용

```sql
-- users: 본인만 조회/수정 가능
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own data" ON users
    FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own data" ON users
    FOR UPDATE USING (auth.uid() = id);

-- categories: 기본 카테고리는 전체 조회, 커스텀은 본인만
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view default categories" ON categories
    FOR SELECT USING (is_default = TRUE OR user_id = auth.uid());
CREATE POLICY "Users can manage own categories" ON categories
    FOR ALL USING (user_id = auth.uid());

-- inputs: 본인만 접근
ALTER TABLE inputs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own inputs" ON inputs
    FOR ALL USING (user_id = auth.uid());

-- tags: 본인만 접근
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own tags" ON tags
    FOR ALL USING (user_id = auth.uid());

-- input_tags: inputs 기준으로 본인만
ALTER TABLE input_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own input_tags" ON input_tags
    FOR ALL USING (
        input_id IN (SELECT id FROM inputs WHERE user_id = auth.uid())
    );
```

---

## 관계 요약

| 관계 | 설명 |
|------|------|
| users → categories | 1:N (사용자별 커스텀 카테고리) |
| users → inputs | 1:N (사용자별 입력 데이터) |
| users → tags | 1:N (사용자별 태그) |
| categories → inputs | 1:N (카테고리별 입력) |
| inputs ↔ tags | N:M (input_tags로 연결) |

---

## 도메인별 타입 정의

### TypeScript (Frontend)

```typescript
// types/user.ts
export interface User {
  id: string;                  // UUID
  email: string;
  name: string | null;
  avatar_url: string | null;
  created_at: string;          // ISO 8601
  updated_at: string;
}

// types/category.ts
export interface Category {
  id: number;
  user_id: string | null;      // null이면 시스템 기본
  name: string;
  icon: string | null;         // 이모지
  color: string | null;        // HEX (#FFF3E0)
  is_default: boolean;
  sort_order: number;
  created_at: string;
}

export type CategoryName = 'CALENDAR' | 'MEMO' | 'TODO' | 'IDEA' | string;

// types/input.ts
export interface Input {
  id: number;
  user_id: string;
  category_id: number | null;
  type: InputType;
  content: string;
  summary: string | null;
  event_date: string | null;   // ISO 8601
  is_completed: boolean;
  created_at: string;
  updated_at: string;
  // Relations (optional, for joined queries)
  category?: Category;
  tags?: Tag[];
}

export type InputType = 'text' | 'image';

// types/tag.ts
export interface Tag {
  id: number;
  user_id: string;
  name: string;
  color: string | null;
  created_at: string;
}

// types/input-tag.ts
export interface InputTag {
  input_id: number;
  tag_id: number;
}

// types/api.ts (API 요청/응답)
export interface CreateInputRequest {
  type: InputType;
  content: string;
  category_id?: number;
  tags?: string[];             // 태그명 배열
}

export interface CreateInputResponse {
  id: number;
  category: CategoryName;
  summary: string;
  event_date: string | null;
  tags: string[];
}

export interface ApiResponse<T> {
  status: 'success' | 'error';
  data?: T;
  message?: string;
}
```

---

### Python (Backend)

```python
# schemas/user.py
from pydantic import BaseModel
from datetime import datetime
from typing import Optional
import uuid

class UserBase(BaseModel):
    email: str
    name: Optional[str] = None
    avatar_url: Optional[str] = None

class UserCreate(UserBase):
    pass

class User(UserBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# schemas/category.py
from pydantic import BaseModel
from datetime import datetime
from typing import Optional
import uuid

class CategoryBase(BaseModel):
    name: str
    icon: Optional[str] = None
    color: Optional[str] = None
    sort_order: int = 0

class CategoryCreate(CategoryBase):
    pass

class Category(CategoryBase):
    id: int
    user_id: Optional[uuid.UUID] = None
    is_default: bool = False
    created_at: datetime

    class Config:
        from_attributes = True


# schemas/input.py
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List, Literal
import uuid

InputType = Literal['text', 'image']

class InputBase(BaseModel):
    type: InputType
    content: str
    category_id: Optional[int] = None
    event_date: Optional[datetime] = None

class InputCreate(InputBase):
    tags: Optional[List[str]] = []

class Input(InputBase):
    id: int
    user_id: uuid.UUID
    summary: Optional[str] = None
    is_completed: bool = False
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class InputWithRelations(Input):
    category: Optional['Category'] = None
    tags: List['Tag'] = []


# schemas/tag.py
from pydantic import BaseModel
from datetime import datetime
from typing import Optional
import uuid

class TagBase(BaseModel):
    name: str
    color: Optional[str] = None

class TagCreate(TagBase):
    pass

class Tag(TagBase):
    id: int
    user_id: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True


# schemas/api.py
from pydantic import BaseModel
from typing import Optional, List, Generic, TypeVar, Literal

T = TypeVar('T')

class ApiResponse(BaseModel, Generic[T]):
    status: Literal['success', 'error']
    data: Optional[T] = None
    message: Optional[str] = None

class AnalyzeRequest(BaseModel):
    type: Literal['text', 'image']
    content: str
    category_id: Optional[int] = None
    tags: Optional[List[str]] = []

class AnalyzeResponse(BaseModel):
    id: int
    category: str
    summary: str
    event_date: Optional[str] = None
    tags: List[str] = []
```

---

### Enum 정의

```typescript
// TypeScript
export enum CategoryType {
  CALENDAR = 'CALENDAR',
  MEMO = 'MEMO',
  TODO = 'TODO',
  IDEA = 'IDEA'
}

export enum InputType {
  TEXT = 'text',
  IMAGE = 'image'
}
```

```python
# Python
from enum import Enum

class CategoryType(str, Enum):
    CALENDAR = "CALENDAR"
    MEMO = "MEMO"
    TODO = "TODO"
    IDEA = "IDEA"

class InputType(str, Enum):
    TEXT = "text"
    IMAGE = "image"
```
