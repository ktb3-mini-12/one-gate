import React, { useState, useEffect } from 'react'
import axios from 'axios'

export function Settings({ user, onBack }) {
  const [connections, setConnections] = useState([
    { id: 'calendar', name: 'Google Calendar', isConnected: false },
    { id: 'notion', name: 'Notion', isConnected: false }
  ])
  const [syncLoading, setSyncLoading] = useState(false)

  // Calendar tags (CALENDAR type)
  const [calendarTags, setCalendarTags] = useState([])

  // Memo tags (MEMO type)
  const [memoTags, setMemoTags] = useState([])
  const [isAddingMemoTag, setIsAddingMemoTag] = useState(false)
  const [newMemoTagName, setNewMemoTagName] = useState('')

  const getGoogleToken = () => localStorage.getItem('google_provider_token')

  // Check connection status and fetch data on mount
  useEffect(() => {
    const googleToken = getGoogleToken()
    if (googleToken) {
      setConnections((prev) =>
        prev.map((conn) => (conn.id === 'calendar' ? { ...conn, isConnected: true } : conn))
      )
      fetchCalendarTags()
    }
    fetchMemoTags()
  }, [])

  // Fetch calendar tags (CALENDAR type)
  const fetchCalendarTags = async () => {
    try {
      const res = await fetch('http://localhost:8000/tags?category_type=CALENDAR')
      const data = await res.json()
      if (data.status === 'success') {
        setCalendarTags(data.data || [])
      }
    } catch (err) {
      console.error('캘린더 태그 로드 실패:', err)
    }
  }

  // Fetch memo tags (MEMO type)
  const fetchMemoTags = async () => {
    try {
      const res = await axios.get('http://localhost:8000/tags?category_type=MEMO')
      if (res.data.status === 'success') {
        setMemoTags(res.data.data || [])
      }
    } catch (err) {
      console.error('메모 태그 로드 실패:', err)
    }
  }

  // Sync calendars from Google
  const handleSyncCalendars = async () => {
    const token = getGoogleToken()
    if (!token) {
      alert('Google 토큰이 없습니다. 재로그인 해주세요.')
      return
    }

    setSyncLoading(true)
    try {
      const res = await fetch('http://localhost:8000/sync/calendars', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Google-Token': token
        }
      })
      const data = await res.json()

      if (data.status === 'success') {
        alert(
          `캘린더 동기화 완료!\n추가: ${data.added?.length || 0}개\n삭제: ${data.deleted?.length || 0}개`
        )
        await fetchCalendarTags()
      } else {
        alert('동기화 실패: ' + data.message)
      }
    } catch (err) {
      console.error('캘린더 동기화 실패:', err)
      alert('캘린더 동기화 중 오류가 발생했습니다.')
    } finally {
      setSyncLoading(false)
    }
  }

  const toggleConnection = (id) => {
    if (id === 'calendar') {
      const googleToken = getGoogleToken()
      if (!googleToken) {
        alert('Google 로그인이 필요합니다.')
        return
      }
      handleSyncCalendars()
    }
  }

  const handleAddMemoTag = async () => {
    if (newMemoTagName.trim()) {
      const tagName = newMemoTagName.trim()
      const tempId = `temp-${Date.now()}`

      const newTag = {
        id: tempId,
        name: tagName,
        category_type: 'MEMO'
      }
      setMemoTags((prev) => [...prev, newTag])
      setNewMemoTagName('')
      setIsAddingMemoTag(false)

      try {
        const res = await axios.post('http://localhost:8000/tags', {
          name: tagName,
          category_type: 'MEMO'
        })
        if (res.data.data) {
          setMemoTags((prev) =>
            prev.map((tag) => (tag.id === tempId ? { ...tag, id: res.data.data.id } : tag))
          )
        }
      } catch (err) {
        console.error('태그 서버 저장 실패:', err)
      }
    }
  }

  const handleDeleteMemoTag = (tagId) => {
    setMemoTags(memoTags.filter((tag) => tag.id !== tagId))
  }

  return (
    <div className="min-h-full p-8 pb-16" style={{ background: 'var(--app-bg)' }}>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={onBack}
            className="transition-all hover:opacity-80"
            style={{
              fontSize: '36px',
              color: 'var(--text-secondary)'
            }}
          >
            ←
          </button>
          <h1 style={{ color: 'var(--text-primary)' }}>설정</h1>
        </div>

        {/* User Info */}
        {user && (
          <div
            className="rounded-[28px] p-6 mb-6 flex items-center gap-4"
            style={{ background: 'var(--surface-primary)' }}
          >
            {user.user_metadata?.avatar_url && (
              <img
                src={user.user_metadata.avatar_url}
                alt="profile"
                className="w-12 h-12 rounded-full"
              />
            )}
            <div>
              <div style={{ color: 'var(--text-primary)', fontWeight: '500' }}>
                {user.user_metadata?.name || 'User'}
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>{user.email}</div>
            </div>
          </div>
        )}

        {/* Connections Section */}
        <div className="rounded-[28px] p-8 mb-6" style={{ background: 'var(--surface-primary)' }}>
          <h2 className="mb-6" style={{ color: 'var(--text-primary)' }}>
            연결 설정
          </h2>

          <div className="space-y-4">
            {connections.map((conn) => (
              <div
                key={conn.id}
                className="flex items-center justify-between p-4 rounded-2xl"
                style={{ background: 'var(--surface-gradient-top)' }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{
                      background: conn.isConnected
                        ? 'var(--status-completed)'
                        : 'var(--text-secondary)'
                    }}
                  />
                  <span style={{ color: 'var(--text-primary)' }}>{conn.name}</span>
                </div>

                <button
                  onClick={() => toggleConnection(conn.id)}
                  disabled={syncLoading && conn.id === 'calendar'}
                  className="px-4 py-2 rounded-xl transition-all hover:opacity-80 disabled:opacity-50"
                  style={{
                    background: conn.isConnected ? 'var(--divider)' : 'var(--action-primary)',
                    color: conn.isConnected ? 'var(--text-secondary)' : '#FFFFFF'
                  }}
                >
                  {syncLoading && conn.id === 'calendar'
                    ? '연결 중'
                    : conn.isConnected
                      ? '연결됨'
                      : '연결하기'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Calendar Tag Management Section */}
        <div className="rounded-[28px] p-8 mb-6" style={{ background: 'var(--surface-primary)' }}>
          <div className="flex items-center justify-between mb-6">
            <h2 style={{ color: 'var(--text-primary)' }}>일정 카테고리 관리</h2>
          </div>

          <div className="flex flex-wrap gap-3">
            {calendarTags.length === 0 ? (
              <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                일정 카테고리가 존재하지 않습니다.<div className=""></div>
              </span>
            ) : (
              calendarTags.map((tag) => (
                <div
                  key={tag.id}
                  className="px-4 py-2 rounded-full"
                  style={{ background: 'var(--surface-gradient-top)' }}
                >
                  <span style={{ color: 'var(--text-primary)' }}># {tag.name}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Memo Tag Management Section */}
        <div className="rounded-[28px] p-8" style={{ background: 'var(--surface-primary)' }}>
          <h2 className="mb-6" style={{ color: 'var(--text-primary)' }}>
            메모 카테고리 관리
          </h2>

          <div className="flex flex-wrap gap-3">
            {memoTags.map((tag) => (
              <div
                key={tag.id}
                className="group relative px-4 py-2 rounded-full transition-all hover:pr-10"
                style={{ background: 'var(--surface-gradient-top)' }}
              >
                <span style={{ color: 'var(--text-primary)' }}>#{tag.name}</span>
                <button
                  onClick={() => handleDeleteMemoTag(tag.id)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  ×
                </button>
              </div>
            ))}

            {isAddingMemoTag ? (
              <div
                className="px-4 py-2 rounded-full flex items-center gap-2"
                style={{ background: 'var(--surface-gradient-top)' }}
              >
                <span style={{ color: 'var(--text-secondary)' }}># </span>
                <input
                  type="text"
                  value={newMemoTagName}
                  onChange={(e) => setNewMemoTagName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                      handleAddMemoTag()
                    } else if (e.key === 'Escape') {
                      setIsAddingMemoTag(false)
                      setNewMemoTagName('')
                    }
                  }}
                  autoFocus
                  className="bg-transparent border-none outline-none"
                  style={{
                    color: 'var(--text-primary)',
                    width: '100px'
                  }}
                  placeholder="태그명 입력"
                />
              </div>
            ) : null}

            <button
              onClick={() => setIsAddingMemoTag(true)}
              className="px-4 py-2 rounded-full transition-all hover:opacity-80"
              style={{
                background: 'var(--action-primary)',
                color: '#FFFFFF'
              }}
            >
              + 태그 추가
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Settings
