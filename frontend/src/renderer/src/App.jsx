// frontend/src/renderer/src/App.jsx

import React, { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import Login from './Login'
import MiniInput from './MiniInput'
import MainApp from './MainApp'

const { ipcRenderer } = window.require('electron')

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  const params = new URLSearchParams(window.location.search)
  const mode = params.get('mode') || 'main'

  useEffect(() => {
    // 기존 세션 확인
    const checkSession = async () => {
      console.log('[App] Checking existing session...')
      const { data: { session } } = await supabase.auth.getSession()
      console.log('[App] Existing session:', session ? 'found' : 'none')
      setLoading(false)
    }

    checkSession()

    // 인증 상태 변화 감지 (단일 소스)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        console.log('[App] Auth state changed:', _event, session ? 'logged in' : 'logged out')
        setSession(session)
      }
    )

    // OAuth 콜백 수신 (Electron main process에서 토큰 전달)
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
        // onAuthStateChange가 자동으로 setSession 처리
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

  return <MainApp user={session.user} />
}

export default App
