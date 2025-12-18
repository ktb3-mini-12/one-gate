import React, { useState, useEffect, useRef } from 'react'
import axios from 'axios'
const { ipcRenderer } = window.require('electron')

function MiniInput({ user }) {
  const [query, setQuery] = useState('')
  const [image, setImage] = useState(null) // { file: File, preview: string }
  const [loading, setLoading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef(null)
  const containerRef = useRef(null)

  // Mini mode: body/html 배경 투명하게 설정
  useEffect(() => {
    document.body.style.background = 'transparent'
    document.documentElement.style.background = 'transparent'
  }, [])

  useEffect(() => {
    ipcRenderer.on('focus-input', () => {
      setQuery('')
      setImage(null)
      if (inputRef.current) inputRef.current.focus()
    })
    return () => ipcRenderer.removeAllListeners('focus-input')
  }, [])

  // 이미지 파일 처리
  const handleImageFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return

    const reader = new FileReader()
    reader.onload = (e) => {
      setImage({
        file,
        preview: e.target.result
      })
    }
    reader.readAsDataURL(file)
  }

  // 붙여넣기 핸들러
  const handlePaste = (e) => {
    const items = e.clipboardData?.items
    if (!items) return

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        handleImageFile(file)
        break
      }
    }
  }

  // 드래그 이벤트 핸들러
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
    if (files && files.length > 0) {
      const file = files[0]
      if (file.type.startsWith('image/')) {
        handleImageFile(file)
      }
    }
  }

  // 이미지 제거
  const removeImage = () => {
    setImage(null)
    if (inputRef.current) inputRef.current.focus()
  }

  const handleKeyDown = async (e) => {
    if (e.key === 'Escape') {
      if (image) {
        removeImage()
        return
      }
      ipcRenderer.send('close-mini-window')
      return
    }

    if (e.key === 'Enter' && !e.nativeEvent.isComposing && (query.trim() || image)) {
      await analyze()
    }
  }

  const analyze = async () => {
    if (!query.trim() && !image) return

    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('user_id', user.id)

      if (query.trim()) {
        formData.append('text', query.trim())
      }

      if (image?.file) {
        formData.append('image', image.file)
      }

      await axios.post('http://localhost:8000/analyze', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      // 메인 창에 새로고침 요청 보내기
      ipcRenderer.send('refresh-main-window')

      // 입력 완료 후 창 닫기
      setQuery('')
      setImage(null)
      ipcRenderer.send('close-mini-window')
    } catch (err) {
      console.error('분석 실패:', err)
    } finally {
      setLoading(false)
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
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        background: 'var(--surface-primary)',
        borderRadius: '24px',
        overflow: 'hidden',
        minHeight: '60px',
        boxShadow: 'var(--shadow-deep)',
        border: isDragging ? '2px dashed var(--action-primary)' : '2px solid transparent',
        transition: 'border-color 0.2s ease'
      }}
    >
      {/* 이미지 미리보기 */}
      {image && (
        <div
          style={{
            padding: '12px 16px 8px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            borderBottom: '1px solid var(--divider)'
          }}
        >
          <div style={{ position: 'relative' }}>
            <img
              src={image.preview}
              alt="preview"
              style={{
                height: '48px',
                maxWidth: '120px',
                objectFit: 'cover',
                borderRadius: '8px',
                border: '1px solid var(--divider)'
              }}
            />
            <button
              onClick={removeImage}
              style={{
                position: 'absolute',
                top: '-6px',
                right: '-6px',
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: 'rgba(239, 68, 68, 0.9)',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold'
              }}
            >
              ×
            </button>
          </div>
          <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
            이미지가 추가되었습니다
          </span>
        </div>
      )}

      {/* 입력 영역 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0 20px',
          height: '60px'
        }}
      >
        <span style={{ fontSize: '22px', marginRight: '12px' }}>
          {image ? '🖼️' : '⚡'}
        </span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={image ? '이미지에 대한 설명을 추가하세요...' : '할 일이나 일정을 입력하세요... (이미지 붙여넣기 가능)'}
          autoFocus
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            fontSize: '16px',
            background: 'transparent',
            height: '100%',
            color: 'var(--text-primary)'
          }}
        />
        {loading && (
          <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>저장 중</span>
        )}
        {!loading && hasContent && (
          <span
            style={{
              color: 'var(--action-primary)',
              fontSize: '12px',
              padding: '4px 8px',
              background: 'rgba(14, 123, 246, 0.1)',
              borderRadius: '6px'
            }}
          >
            Enter로 저장
          </span>
        )}
      </div>

      {/* 드래그 오버레이 */}
      {isDragging && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(14, 123, 246, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '24px',
            pointerEvents: 'none'
          }}
        >
          <span style={{ color: 'var(--action-primary)', fontSize: '14px', fontWeight: '500' }}>
            이미지를 놓으세요
          </span>
        </div>
      )}
    </div>
  )
}

export default MiniInput
