import React, { useState, useEffect, useRef } from 'react'
import { api } from './lib/api'
const { ipcRenderer } = window.require('electron')

function MiniInput({ user }) {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)

  // Mini mode: body/html 배경 투명하게 설정
  useEffect(() => {
    document.body.style.background = 'transparent'
    document.documentElement.style.background = 'transparent'
  }, [])

  useEffect(() => {
    ipcRenderer.on('focus-input', () => {
      setQuery('')
      if (inputRef.current) inputRef.current.focus()
    })
    return () => ipcRenderer.removeAllListeners('focus-input')
  }, [])

  const handleKeyDown = async (e) => {
    if (e.key === 'Escape') {
      ipcRenderer.send('close-mini-window')
      return
    }

    if (e.key === 'Enter' && !e.nativeEvent.isComposing && query.trim()) {
      await analyze(query)
    }
  }

  const analyze = async (text) => {
    setLoading(true)
    try {
      await api.post('/analyze', {
        text,
        user_id: user.id
      })

      // 메인 창에 새로고침 요청 보내기
      ipcRenderer.send('refresh-main-window')

      // 입력 완료 후 창 닫기
      setQuery('')
      ipcRenderer.send('close-mini-window')
    } catch (err) {
      console.error('분석 실패:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        background: 'var(--surface-primary)',
        borderRadius: '24px',
        overflow: 'hidden',
        height: '60px',
        boxShadow: 'var(--shadow-deep)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px'
      }}
    >
      <span style={{ fontSize: '22px', marginRight: '12px' }}>⚡</span>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="할 일이나 일정을 입력하세요..."
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
      {loading && <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>저장 중</span>}
    </div>
  )
}

export default MiniInput
