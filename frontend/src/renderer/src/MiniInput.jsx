import React, { useState, useEffect, useRef } from 'react'
import { api } from './lib/api'
const { ipcRenderer } = window.require('electron')

function MiniInput({ user }) {
  const [query, setQuery] = useState('')
  const [image, setImage] = useState(null)
  const [loading, setLoading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const inputRef = useRef(null)
  const containerRef = useRef(null)

  useEffect(() => {
    document.body.style.background = 'transparent'
    document.documentElement.style.background = 'transparent'
  }, [])

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

      await axios.post('http://localhost:8000/analyze', formData, {
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
        background: 'linear-gradient(145deg, rgba(30, 32, 38, 0.95), rgba(22, 24, 28, 0.98))',
        borderRadius: '20px',
        overflow: 'hidden',
        boxShadow: isDragging
          ? '0 0 0 2px rgba(99, 102, 241, 0.6), 0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 40px rgba(99, 102, 241, 0.15)'
          : isFocused
          ? '0 0 0 1px rgba(99, 102, 241, 0.4), 0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 30px rgba(99, 102, 241, 0.1)'
          : '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)',
        backdropFilter: 'blur(20px)',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        position: 'relative'
      }}
    >
      {/* 상단 그라데이션 라인 */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: '10%',
          right: '10%',
          height: '1px',
          background: 'linear-gradient(90deg, transparent, rgba(99, 102, 241, 0.5), rgba(168, 85, 247, 0.5), transparent)',
          opacity: isFocused || hasContent ? 1 : 0.5,
          transition: 'opacity 0.3s ease'
        }}
      />

      {/* 이미지 미리보기 */}
      {image && (
        <div
          style={{
            padding: '16px 20px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            background: 'linear-gradient(180deg, rgba(99, 102, 241, 0.08), transparent)'
          }}
        >
          <div style={{ position: 'relative' }}>
            <div
              style={{
                padding: '3px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.4), rgba(168, 85, 247, 0.4))'
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
                background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                color: '#fff',
                border: '2px solid rgba(22, 24, 28, 0.9)',
                cursor: 'pointer',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: '600',
                boxShadow: '0 2px 8px rgba(239, 68, 68, 0.4)',
                transition: 'transform 0.2s ease'
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
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
                boxShadow: '0 0 8px rgba(16, 185, 129, 0.6)'
              }}
            />
            <span style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '13px', fontWeight: '500' }}>
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
              ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(168, 85, 247, 0.2))'
              : image
              ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(52, 211, 153, 0.2))'
              : 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(168, 85, 247, 0.15))',
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
                border: '2px solid rgba(99, 102, 241, 0.3)',
                borderTopColor: '#6366f1',
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
              stroke={image ? '#10b981' : '#6366f1'}
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
          placeholder={image ? '이미지 설명 추가...' : '할 일, 일정 입력 · 이미지 붙여넣기'}
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
            color: 'rgba(255, 255, 255, 0.95)',
            letterSpacing: '-0.01em'
          }}
        />

        {/* 상태 표시 */}
        {loading && (
          <span
            style={{
              color: 'rgba(99, 102, 241, 0.9)',
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
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(168, 85, 247, 0.15))',
              border: '1px solid rgba(99, 102, 241, 0.2)',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onClick={analyze}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(168, 85, 247, 0.25))'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(168, 85, 247, 0.15))'
            }}
          >
            <span style={{ color: 'rgba(255, 255, 255, 0.9)', fontSize: '12px', fontWeight: '500' }}>
              Enter
            </span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(99, 102, 241, 0.9)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                fontSize: '10px',
                color: 'rgba(255, 255, 255, 0.5)',
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
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(168, 85, 247, 0.15))',
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
              background: 'rgba(99, 102, 241, 0.2)',
              border: '1px dashed rgba(99, 102, 241, 0.5)'
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span style={{ color: 'rgba(99, 102, 241, 0.9)', fontSize: '14px', fontWeight: '600' }}>
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
          color: rgba(255, 255, 255, 0.35);
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
