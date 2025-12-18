import React, { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { api, API_BASE_URL } from './lib/api'
const { ipcRenderer } = window.require('electron')

function MiniInput({ user }) {
  const [query, setQuery] = useState('')
  const [image, setImage] = useState(null)
  const [loading, setLoading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [memoCategories, setMemoCategories] = useState([])
  const [calendarCategories, setCalendarCategories] = useState([])
  const inputRef = useRef(null)
  const containerRef = useRef(null)

  useEffect(() => {
    document.body.style.background = 'transparent'
    document.documentElement.style.background = 'transparent'
  }, [])

  // 카테고리 목록 로드
  useEffect(() => {
    if (!user?.id) return

    const fetchCategories = async () => {
      try {
        const [memoRes, calendarRes] = await Promise.all([
          api.get('/categories', { params: { type: 'MEMO', user_id: user.id } }),
          api.get('/categories', { params: { type: 'CALENDAR', user_id: user.id } })
        ])

        if (memoRes.data?.status === 'success') {
          setMemoCategories((memoRes.data.data || []).map((c) => c.name))
        }
        if (calendarRes.data?.status === 'success') {
          setCalendarCategories((calendarRes.data.data || []).map((c) => c.name))
        }
      } catch (err) {
        console.error('카테고리 로드 실패:', err)
      }
    }

    fetchCategories()
  }, [user?.id])

  // 창 크기 동적 조절
  useEffect(() => {
    const baseHeight = 64
    const imagePreviewHeight = image ? 84 : 0
    const totalHeight = baseHeight + imagePreviewHeight
    ipcRenderer.send('resize-mini-window', { height: totalHeight })
  }, [image])

  useEffect(() => {
    ipcRenderer.on('focus-input', () => {
      setQuery('')
      setImage(null)
      if (inputRef.current) inputRef.current.focus()
    })
    return () => ipcRenderer.removeAllListeners('focus-input')
  }, [])

  const handleImageFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (e) => {
      setImage({ file, preview: e.target.result })
    }
    reader.readAsDataURL(file)
  }

  const handlePaste = (e) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        handleImageFile(item.getAsFile())
        break
      }
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    const files = e.dataTransfer?.files
    if (files?.[0]?.type.startsWith('image/')) {
      handleImageFile(files[0])
    }
  }

  const removeImage = () => {
    setImage(null)
    inputRef.current?.focus()
  }

  const handleKeyDown = async (e) => {
    if (e.key === 'Escape') {
      if (image) return removeImage()
      ipcRenderer.send('close-mini-window')
      return
    }
    if (e.key === 'Enter' && !e.nativeEvent.isComposing && (query.trim() || image)) {
      await analyze()
    }
  }

  const analyze = async () => {
    if (!query.trim() && !image) return

    // 데이터 저장해두고 창 바로 닫기
    const queryText = query.trim()
    const imageFile = image?.file

    setQuery('')
    setImage(null)
    ipcRenderer.send('close-mini-window')

    // 백그라운드에서 API 호출
    try {
      const formData = new FormData()
      formData.append('user_id', user.id)
      if (queryText) formData.append('text', queryText)
      if (imageFile) formData.append('image', imageFile)
      formData.append('memo_categories', JSON.stringify(memoCategories))
      formData.append('calendar_categories', JSON.stringify(calendarCategories))

      await axios.post(`${API_BASE_URL}/records/analyze`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      ipcRenderer.send('refresh-main-window')
    } catch (err) {
      console.error('분석 실패:', err)
    }
  }

  const hasContent = query.trim() || image

  return (
    <div
      ref={containerRef}
      onPaste={handlePaste}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
        background: 'linear-gradient(145deg, var(--surface-primary), var(--app-bg))',
        borderRadius: '20px',
        overflow: 'hidden',
        boxShadow: isDragging
          ? '0 0 0 2px transparent, 0 25px 50px -12px var(--action-secondary), 0 0 22px var(--action-secondary)'
          : isFocused
            ? '0 0 0 1px transparent, 0 25px 50px -12px var(--action-secondary), 0 0 18px var(--action-secondary)'
            : '0 25px 50px -12px var(--action-secondary), 0 0 0 1px var(--divider)',
        backdropFilter: 'blur(20px)',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        position: 'relative',
        WebkitAppRegion: 'drag'
      }}
    >
      {/* 이미지 미리보기 */}
      {image && (
        <div
          style={{
            padding: '16px 20px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            borderBottom: '1px solid var(--divider)',
            background:
              'linear-gradient(180deg, var(--surface-gradient-top), var(--surface-primary))',
            WebkitAppRegion: 'no-drag'
          }}
        >
          <div style={{ position: 'relative' }}>
            <div
              style={{
                padding: '3px',
                borderRadius: '12px',
                background:
                  'linear-gradient(135deg, var(--action-primary), var(--action-secondary))'
              }}
            >
              <img
                src={image.preview}
                alt="preview"
                style={{
                  height: '52px',
                  maxWidth: '140px',
                  objectFit: 'cover',
                  borderRadius: '9px',
                  display: 'block'
                }}
              />
            </div>
            <button
              onClick={removeImage}
              style={{
                position: 'absolute',
                top: '-8px',
                right: '-8px',
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                background: 'var(--status-error)',
                color: '#fff',
                border: '2px solid var(--app-bg)',
                cursor: 'pointer',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: '600',
                transition: 'transform 0.2s ease',
                WebkitAppRegion: 'no-drag'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.1)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              ×
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #10b981, #34d399)',
                boxShadow: '0 0 8px #10b981'
              }}
            />
            <span style={{ color: 'var(--text-secondary)', fontSize: '13px', fontWeight: '500' }}>
              이미지 첨부됨
            </span>
          </div>
        </div>
      )}

      {/* 입력 영역 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0 20px',
          height: '64px',
          gap: '14px'
        }}
      >
        {/* 아이콘 */}
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: loading
              ? 'linear-gradient(135deg, var(--action-primary), var(--action-secondary))'
              : image
                ? 'linear-gradient(135deg, #10b981, #34d399)'
                : 'linear-gradient(135deg, var(--action-primary), var(--action-secondary))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transition: 'all 0.3s ease'
          }}
        >
          {loading ? (
            <div
              style={{
                width: '18px',
                height: '18px',
                border: '2px solid var(--divider-light)',
                borderTopColor: 'var(--action-secondary)',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite'
              }}
            />
          ) : (
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke={image ? '#10b981' : '#ffffff'}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {image ? (
                <>
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </>
              ) : (
                <>
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </>
              )}
            </svg>
          )}
        </div>

        {/* 입력 필드 */}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={image ? '이미지 설명 추가...' : '메모, 일정 입력 · 이미지 붙여넣기'}
          autoFocus
          disabled={loading}
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            fontSize: '15px',
            fontWeight: '400',
            background: 'transparent',
            height: '100%',
            color: 'var(--text-primary)',
            letterSpacing: '-0.01em',
            WebkitAppRegion: 'no-drag'
          }}
        />

        {/* 상태 표시 */}
        {loading && (
          <span
            style={{
              color: 'var(--action-secondary)',
              fontSize: '13px',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            저장 중
          </span>
        )}

        {!loading && hasContent && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '8px',
              background: 'var(--action-primary)',
              border: '1px solid var(--action-primary-hover)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              WebkitAppRegion: 'no-drag'
            }}
            onClick={analyze}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--action-primary-hover)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--action-primary)'
            }}
          >
            <span style={{ color: 'var(--text-primary)', fontSize: '12px', fontWeight: '500' }}>
              Enter
            </span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ffffff"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </div>
        )}

        {!loading && !hasContent && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              opacity: 0.4
            }}
          >
            <kbd
              style={{
                padding: '3px 6px',
                borderRadius: '4px',
                background: 'var(--surface-secondary)',
                border: '1px solid var(--divider)',
                fontSize: '10px',
                color: 'var(--text-tertiary)',
                fontFamily: 'inherit'
              }}
            >
              ESC
            </kbd>
          </div>
        )}
      </div>

      {/* 드래그 오버레이 */}
      {isDragging && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(135deg, var(--action-primary), var(--action-secondary))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '20px',
            pointerEvents: 'none',
            backdropFilter: 'blur(4px)'
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 20px',
              borderRadius: '12px',
              background: 'var(--surface-primary)',
              border: '1px dashed #ffffff'
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ffffff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span style={{ color: '#ffffff', fontSize: '14px', fontWeight: '600' }}>
              이미지 놓기
            </span>
          </div>
        </div>
      )}

      {/* 키프레임 애니메이션 */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        input::placeholder {
          color: var(--text-tertiary);
        }
        input:disabled {
          opacity: 0.7;
        }
        ::-webkit-scrollbar {
          display: none;
        }
        html, body {
          overflow: hidden;
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  )
}

export default MiniInput
