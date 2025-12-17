// frontend/src/renderer/src/App.jsx

import React, { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import Login from './Login'
import MiniInput from './MiniInput'
import MainApp from './MainApp'

const { ipcRenderer } = window.require('electron')

// Dev Tools 컴포넌트
function DevTools() {
  const [loading, setLoading] = useState(null)
  const [result, setResult] = useState(null)
  const [calendars, setCalendars] = useState([])
  const [selectedCalendar, setSelectedCalendar] = useState('')

  const getGoogleToken = () => localStorage.getItem('google_provider_token')

  // 동기화된 캘린더 태그 불러오기
  const fetchCalendarTags = async () => {
    try {
      const res = await fetch('http://localhost:8000/tags?category_type=CALENDAR')
      const data = await res.json()
      if (data.status === 'success') {
        setCalendars(data.data || [])
        if (data.data?.length > 0 && !selectedCalendar) {
          setSelectedCalendar(data.data[0].name)
        }
      }
    } catch (err) {
      console.error('[DevTools] Failed to fetch tags:', err)
    }
  }

  // 컴포넌트 마운트 시 태그 불러오기
  useEffect(() => {
    fetchCalendarTags()
  }, [])

  const handleSyncCalendars = async () => {
    const token = getGoogleToken()
    if (!token) {
      alert('Google 토큰이 없습니다. 재로그인 해주세요.')
      return
    }

    setLoading('sync')
    setResult(null)

    try {
      const res = await fetch('http://localhost:8000/sync/calendars', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Google-Token': token
        }
      })
      const data = await res.json()
      setResult({ type: 'sync', data })
      console.log('[DevTools] Sync result:', data)

      // 동기화 후 태그 목록 갱신
      if (data.status === 'success') {
        await fetchCalendarTags()
      }
    } catch (err) {
      setResult({ type: 'sync', error: err.message })
    } finally {
      setLoading(null)
    }
  }

  const handleTestCreate = async () => {
    const token = getGoogleToken()
    if (!token) {
      alert('Google 토큰이 없습니다. 재로그인 해주세요.')
      return
    }

    if (!selectedCalendar) {
      alert('캘린더를 선택해주세요.\n먼저 Sync Calendars를 실행하세요.')
      return
    }

    setLoading('create')
    setResult(null)

    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(14, 0, 0, 0)
    const endTime = new Date(tomorrow)
    endTime.setHours(15, 0, 0, 0)

    const formatDT = (d) => d.toISOString().slice(0, 19)

    try {
      const res = await fetch('http://localhost:8000/calendar/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Google-Token': token
        },
        body: JSON.stringify({
          summary: '[Test] One Gate 테스트 일정',
          description: 'Dev Tools에서 생성된 테스트 일정입니다.',
          start_time: formatDT(tomorrow),
          end_time: formatDT(endTime),
          calendar_name: selectedCalendar  // 선택된 캘린더에 생성
        })
      })
      const data = await res.json()
      setResult({ type: 'create', data })
      console.log('[DevTools] Create result:', data)

      if (data.status === 'success') {
        alert(`"${selectedCalendar}" 캘린더에 일정이 생성되었습니다!`)
      } else {
        alert('생성 실패: ' + data.message)
      }
    } catch (err) {
      setResult({ type: 'create', error: err.message })
    } finally {
      setLoading(null)
    }
  }

  const buttonStyle = (isLoading) => ({
    padding: '8px 12px',
    border: 'none',
    borderRadius: '6px',
    fontSize: '12px',
    cursor: isLoading ? 'not-allowed' : 'pointer',
    fontWeight: '500',
    opacity: isLoading ? 0.6 : 1,
    transition: 'all 0.2s'
  })

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      zIndex: 9999,
      background: 'rgba(0, 0, 0, 0.85)',
      padding: '12px',
      borderRadius: '10px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
      minWidth: '200px'
    }}>
      <div style={{
        color: '#888',
        fontSize: '10px',
        fontWeight: '600',
        marginBottom: '10px',
        textTransform: 'uppercase',
        letterSpacing: '1px'
      }}>
        Dev Tools
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <button
          onClick={handleSyncCalendars}
          disabled={loading === 'sync'}
          style={{
            ...buttonStyle(loading === 'sync'),
            background: '#4285F4',
            color: 'white'
          }}
        >
          {loading === 'sync' ? 'Syncing...' : 'Sync Calendars'}
        </button>

        {/* 캘린더 선택 드롭다운 */}
        {calendars.length > 0 && (
          <select
            value={selectedCalendar}
            onChange={(e) => setSelectedCalendar(e.target.value)}
            style={{
              padding: '8px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '12px',
              background: '#333',
              color: '#fff',
              cursor: 'pointer'
            }}
          >
            {calendars.map(cal => (
              <option key={cal.id} value={cal.name}>
                {cal.name}
              </option>
            ))}
          </select>
        )}

        {calendars.length === 0 && (
          <div style={{ color: '#888', fontSize: '11px', textAlign: 'center', padding: '4px' }}>
            Sync 먼저 실행하세요
          </div>
        )}

        <button
          onClick={handleTestCreate}
          disabled={loading === 'create' || calendars.length === 0}
          style={{
            ...buttonStyle(loading === 'create' || calendars.length === 0),
            background: calendars.length === 0 ? '#555' : '#34A853',
            color: 'white'
          }}
        >
          {loading === 'create' ? 'Creating...' : 'Test Create Event'}
        </button>
      </div>

      {result && (
        <div style={{
          marginTop: '10px',
          padding: '8px',
          background: result.error ? 'rgba(234,67,53,0.2)' : 'rgba(52,168,83,0.2)',
          borderRadius: '6px',
          fontSize: '10px',
          color: result.error ? '#EA4335' : '#34A853',
          maxHeight: '80px',
          overflow: 'auto'
        }}>
          {result.error ? (
            <span>Error: {result.error}</span>
          ) : (
            <span>
              {result.type === 'sync' && (
                <>
                  +{result.data.added?.length || 0} added,
                  -{result.data.deleted?.length || 0} deleted,
                  {result.data.kept?.length || 0} kept
                </>
              )}
              {result.type === 'create' && `Created: ${result.data.status}`}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  const params = new URLSearchParams(window.location.search)
  const mode = params.get('mode') || 'main'

  useEffect(() => {
    const checkSession = async () => {
      console.log('[App] Checking existing session...')
      const { data: { session } } = await supabase.auth.getSession()
      console.log('[App] Existing session:', session ? 'found' : 'none')
      setLoading(false)
    }

    checkSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        console.log('[App] Auth state changed:', _event, session ? 'logged in' : 'logged out')
        setSession(session)
      }
    )

    const handleAuthCallback = async (event, tokens) => {
      console.log('[App] Auth callback received from main process')
      try {
        const { error } = await supabase.auth.setSession({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token
        })

        if (error) {
          console.error('[App] 세션 설정 실패:', error)
        }

        if (tokens.provider_token) {
          localStorage.setItem('google_provider_token', tokens.provider_token)
          console.log('[App] Google provider_token saved')
        }
      } catch (err) {
        console.error('[App] Auth callback error:', err)
      }
    }

    ipcRenderer.on('auth-callback', handleAuthCallback)

    return () => {
      subscription.unsubscribe()
      ipcRenderer.removeAllListeners('auth-callback')
    }
  }, [])

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#f5f5f7',
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚡</div>
          <div style={{ color: '#888' }}>로딩 중...</div>
        </div>
      </div>
    )
  }

  // 미니 입력 창
  if (mode === 'mini') {
    if (!session) {
      return (
        <div style={{
          fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
          background: 'rgba(255, 255, 255, 0.98)',
          borderRadius: '12px',
          height: '60px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#888',
          fontSize: '14px'
        }}>
          먼저 메인 앱에서 로그인해주세요
        </div>
      )
    }
    return <MiniInput user={session.user} />
  }

  // 메인 모드
  if (!session) {
    return <Login />
  }

  return (
    <>
      <MainApp user={session.user} session={session} />
      <DevTools />
    </>
  )
}

export default App
