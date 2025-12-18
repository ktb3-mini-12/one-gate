import React, { useState } from 'react'
import { supabase } from '../lib/supabase'

const { ipcRenderer } = window.require('electron')

export function Login() {
  const [loading, setLoading] = useState(false)

  const handleGoogleLogin = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          skipBrowserRedirect: true,
          redirectTo: 'http://localhost:5173',
          scopes: 'https://www.googleapis.com/auth/calendar',
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account'
          }
        }
      })

      if (error) throw error

      if (data?.url) {
        ipcRenderer.send('open-auth-window', data.url)
      } else {
        console.error('[Login] No URL received from Supabase')
      }
    } catch (error) {
      console.error('[Login] 로그인 실패:', error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-8"
      style={{ background: 'var(--app-bg)' }}
    >
      <div
        className="w-full max-w-sm text-center"
        style={{
          background: 'var(--surface-primary)',
          borderRadius: 'var(--radius-2xl)',
          border: '1px solid var(--divider)',
          boxShadow: 'var(--shadow-deep)',
          padding: '48px 40px'
        }}
      >
        {/* Logo Icon */}
        <div
          className="mx-auto mb-6 flex items-center justify-center"
          style={{
            width: '64px',
            height: '64px',
            borderRadius: 'var(--radius-xl)',
            background:
              'linear-gradient(135deg, var(--action-primary) 0%, var(--action-secondary) 100%)',
            boxShadow: 'var(--shadow-glow-blue)'
          }}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fff"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>

        {/* Title */}
        <h1
          className="mb-2"
          style={{
            color: 'var(--text-primary)',
            fontSize: '28px',
            fontWeight: '700',
            letterSpacing: '-0.5px'
          }}
        >
          OneGate
        </h1>

        {/* Subtitle */}
        <p
          className="mb-10"
          style={{
            color: 'var(--text-tertiary)',
            fontSize: '14px',
            fontWeight: '400'
          }}
        >
          정리는 맡기고 중요한 일에만 집중하세요
        </p>

        {/* Google Login Button */}
        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full py-3.5 rounded-xl font-medium transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-3"
          style={{
            background: '#fff',
            color: '#1f1f1f',
            border: '1px solid var(--divider)',
            fontSize: '14px'
          }}
        >
          {loading ? (
            <>
              <div
                className="w-5 h-5 rounded-full animate-spin"
                style={{ border: '2px solid #ddd', borderTopColor: '#4285F4' }}
              />
              <span>로그인 중...</span>
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <span>Google로 계속하기</span>
            </>
          )}
        </button>
      </div>

      {/* Footer */}
      <p
        className="mt-8"
        style={{
          color: 'var(--text-tertiary)',
          fontSize: '12px'
        }}
      >
        v1.0.0
      </p>
    </div>
  )
}

export default Login
