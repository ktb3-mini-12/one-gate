import React, { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { setGoogleToken } from './lib/tokenManager'
import MiniInput from './MiniInput'
import { Login } from './components/Login'
import { Home } from './components/Home'
import { Settings } from './components/Settings'

const { ipcRenderer } = window.require('electron')

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [currentView, setCurrentView] = useState('home')

  const params = new URLSearchParams(window.location.search)
  const mode = params.get('mode') || 'main'

  useEffect(() => {
    const checkSession = async () => {
      console.log('[App] Checking existing session...')
      const {
        data: { session }
      } = await supabase.auth.getSession()
      console.log('[App] Existing session:', session ? 'found' : 'none')
      setSession(session)
      setLoading(false)
    }

    checkSession()

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log('[App] Auth state changed:', _event, session ? 'logged in' : 'logged out')
      setSession(session)
    })

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
          setGoogleToken(tokens.provider_token)
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

  // Loading state
  if (loading) {
    return (
      <div
        className="flex items-center justify-center h-screen"
        style={{ background: 'var(--app-bg)' }}
      >
        <div className="text-center">
          <div className="text-5xl mb-4">⚡</div>
          <div style={{ color: 'var(--text-secondary)' }}>로딩 중...</div>
        </div>
      </div>
    )
  }

  // Mini mode
  if (mode === 'mini') {
    if (!session) {
      return (
        <div
          style={{
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
            background: 'var(--surface-primary)',
            borderRadius: '24px',
            height: '60px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-secondary)',
            fontSize: '14px'
          }}
        >
          먼저 메인 앱에서 로그인해주세요
        </div>
      )
    }
    return <MiniInput user={session.user} />
  }

  // Main mode - not logged in
  if (!session) {
    return <Login />
  }

  // Main mode - logged in
  return (
    <div className="h-full overflow-auto" style={{ background: 'var(--app-bg)' }}>
      {currentView === 'home' && (
        <Home
          user={session.user}
          session={session}
          onNavigateToSettings={() => setCurrentView('settings')}
        />
      )}

      {currentView === 'settings' && (
        <Settings user={session.user} onBack={() => setCurrentView('home')} />
      )}
    </div>
  )
}

export default App
