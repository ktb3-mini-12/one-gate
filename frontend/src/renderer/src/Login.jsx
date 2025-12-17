import React, { useState } from 'react'
import { supabase } from './lib/supabase'
const { ipcRenderer } = window.require('electron')

function Login() {
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
            prompt: 'consent',
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
    <div style={{
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <div style={{
        background: '#fff',
        borderRadius: '16px',
        padding: '48px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        textAlign: 'center',
        maxWidth: '400px',
        width: '90%'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚡</div>

        <h1 style={{
          margin: '0 0 8px 0',
          fontSize: '28px',
          fontWeight: '700',
          color: '#333'
        }}>
          One Gate
        </h1>

        <p style={{
          margin: '0 0 32px 0',
          fontSize: '14px',
          color: '#888'
        }}>
          빠른 메모와 일정 관리
        </p>

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          style={{
            width: '100%',
            padding: '14px 24px',
            fontSize: '16px',
            fontWeight: '500',
            color: '#333',
            background: '#fff',
            border: '1px solid #ddd',
            borderRadius: '8px',
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            transition: 'all 0.2s',
            opacity: loading ? 0.7 : 1
          }}
          onMouseOver={(e) => {
            if (!loading) {
              e.currentTarget.style.background = '#f5f5f5'
              e.currentTarget.style.borderColor = '#ccc'
            }
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = '#fff'
            e.currentTarget.style.borderColor = '#ddd'
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {loading ? '로그인 중...' : 'Google로 계속하기'}
        </button>

        <p style={{
          margin: '24px 0 0 0',
          fontSize: '12px',
          color: '#aaa'
        }}>
          로그인하면 서비스 이용약관에 동의하게 됩니다
        </p>
      </div>
    </div>
  )
}

export default Login
