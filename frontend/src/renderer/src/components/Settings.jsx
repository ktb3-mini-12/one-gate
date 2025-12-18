import React, { useState, useEffect } from 'react'
import { api } from '../lib/api'

// Icons
const SyncIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="1 4 1 10 7 10" />
    <polyline points="23 20 23 14 17 14" />
    <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
  </svg>
)

const ChevronIcon = ({ isOpen }) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
)

const BackIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="15 18 9 12 15 6" />
  </svg>
)

// Toast
function Toast({ message, type, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div
      className="fixed top-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl flex items-center gap-3 z-50 animate-slide-up"
      style={{
        background: type === 'success' ? 'var(--status-completed)' : 'var(--status-error)',
        boxShadow: 'var(--shadow-lg)'
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
        {type === 'success' ? (
          <polyline points="20 6 9 17 4 12" />
        ) : (
          <>
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </>
        )}
      </svg>
      <span style={{ color: '#fff', fontSize: '14px', fontWeight: '500' }}>{message}</span>
    </div>
  )
}

// Service Card
function ServiceCard({ icon, name, description, isConnected, isExpanded, onToggle, children, isLoading }) {
  return (
    <div
      className="card-premium overflow-hidden transition-all"
      style={{ borderColor: isExpanded ? 'var(--divider-light)' : undefined }}
    >
      <button
        onClick={onToggle}
        className="w-full p-5 flex items-center justify-between"
        style={{ background: 'transparent' }}
      >
        <div className="flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
            style={{ background: 'var(--surface-secondary)' }}
          >
            {icon}
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '15px' }}>
                {name}
              </span>
              {!isLoading && isConnected && (
                <div className="w-2 h-2 rounded-full" style={{ background: 'var(--status-completed)' }} />
              )}
              {isLoading && (
                <div
                  className="w-3.5 h-3.5 rounded-full animate-spin"
                  style={{ border: '2px solid var(--divider)', borderTopColor: 'var(--action-primary)' }}
                />
              )}
            </div>
            <span style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>{description}</span>
          </div>
        </div>
        <div style={{ color: 'var(--text-tertiary)' }}>
          <ChevronIcon isOpen={isExpanded} />
        </div>
      </button>

      <div
        style={{
          maxHeight: isExpanded ? '600px' : '0',
          opacity: isExpanded ? 1 : 0,
          overflow: 'hidden',
          transition: 'all 0.3s ease'
        }}
      >
        <div className="px-5 pb-5">
          <div style={{ height: '1px', marginBottom: '16px', background: 'var(--divider)' }} />
          {children}
        </div>
      </div>
    </div>
  )
}

export function Settings({ user, onBack }) {
  const [toast, setToast] = useState(null)
  const [syncLoading, setSyncLoading] = useState(false)
  const [expandedSection, setExpandedSection] = useState(null)

  // Calendar
  const [calendarTags, setCalendarTags] = useState([])
  const [calendarConnected, setCalendarConnected] = useState(false)

  // Memo
  const [memoTags, setMemoTags] = useState([])
  const [isAddingMemoTag, setIsAddingMemoTag] = useState(false)
  const [newMemoTagName, setNewMemoTagName] = useState('')

  // Notion
  const [notionConnected, setNotionConnected] = useState(false)
  const [notionDbStatus, setNotionDbStatus] = useState(null)
  const [notionDbName, setNotionDbName] = useState(null)
  const [notionPageName, setNotionPageName] = useState(null)
  const [notionPages, setNotionPages] = useState([])
  const [selectedPageId, setSelectedPageId] = useState(null)
  const [isCreatingDb, setIsCreatingDb] = useState(false)
  const [showPageSelector, setShowPageSelector] = useState(false)
  const [isLoadingNotion, setIsLoadingNotion] = useState(true)

  const getGoogleToken = () => localStorage.getItem('google_provider_token')
  const showToast = (message, type = 'success') => setToast({ message, type })

  const refreshAllData = async () => {
    const googleToken = getGoogleToken()
    if (googleToken) {
      setCalendarConnected(true)
      await fetchCalendarTags()
    } else {
      setCalendarConnected(false)
      setCalendarTags([])
    }
    await fetchMemoTags()
    await checkNotionStatus()
  }

  const checkNotionStatus = async () => {
    if (!user?.id) return
    setIsLoadingNotion(true)
    try {
      const res = await api.get('/auth/notion/status', { params: { user_id: user.id } })
      if (res.data.status === 'connected') {
        setNotionConnected(true)
        await checkNotionDatabaseStatus()
      } else {
        setNotionConnected(false)
        setNotionDbStatus(null)
        setNotionDbName(null)
        setNotionPageName(null)
      }
    } catch {
      setNotionConnected(false)
    } finally {
      setIsLoadingNotion(false)
    }
  }

  const checkNotionDatabaseStatus = async () => {
    if (!user?.id) return
    try {
      const res = await api.get('/notion/database-status', { params: { user_id: user.id } })
      setNotionDbStatus(res.data.status)
      if (res.data.status === 'ready') {
        setNotionDbName(res.data.database_name)
        setNotionPageName(res.data.page_name)
      }
    } catch {}
  }

  const fetchNotionPages = async () => {
    if (!user?.id) return
    try {
      const res = await api.get('/notion/pages', { params: { user_id: user.id } })
      if (res.data.status === 'success') setNotionPages(res.data.data || [])
    } catch {}
  }

  const handleSetupNotionDatabase = async () => {
    if (!selectedPageId) return showToast('페이지를 선택해주세요', 'error')
    setIsCreatingDb(true)
    try {
      const res = await api.post('/notion/setup-database', {
        user_id: user.id,
        parent_page_id: selectedPageId,
        database_name: 'One Gate 메모'
      })
      if (res.data.status === 'success') {
        showToast(res.data.created ? '데이터베이스가 생성되었습니다!' : '기존 데이터베이스에 연결되었습니다!')
        setShowPageSelector(false)
        setSelectedPageId(null)
        await checkNotionDatabaseStatus()
      }
    } catch {
      showToast('설정 중 오류가 발생했습니다', 'error')
    } finally {
      setIsCreatingDb(false)
    }
  }

  useEffect(() => {
    refreshAllData()
    const ipc = window.electron?.ipcRenderer || window.ipcRenderer
    if (ipc) {
      const removeListener = ipc.on('refresh-data', () => {
        setTimeout(() => {
          refreshAllData()
          showToast('연동 정보가 업데이트되었습니다.')
        }, 500)
      })
      return () => { if (typeof removeListener === 'function') removeListener() }
    }
  }, [])

  const fetchCalendarTags = async () => {
    if (!user?.id) return
    try {
      const res = await api.get('/categories', { params: { type: 'CALENDAR', user_id: user.id } })
      if (res.data.status === 'success') setCalendarTags(res.data.data || [])
    } catch {}
  }

  const fetchMemoTags = async () => {
    if (!user?.id) return
    try {
      const res = await api.get('/categories', { params: { type: 'MEMO', user_id: user.id } })
      if (res.data.status === 'success') setMemoTags(res.data.data || [])
    } catch {}
  }

  const handleSyncCalendars = async () => {
    const token = getGoogleToken()
    if (!user?.id || !token) return showToast('Google 토큰이 없습니다.', 'error')
    setSyncLoading(true)
    try {
      const res = await api.post(`/sync/calendars?user_id=${user.id}`, {}, { headers: { 'X-Google-Token': token } })
      if (res.data.status === 'success') {
        showToast(`동기화 완료: +${res.data.added?.length || 0} 추가`)
        await fetchCalendarTags()
      }
    } catch {
      showToast('동기화 실패', 'error')
    } finally {
      setSyncLoading(false)
    }
  }

  const handleAddMemoTag = async () => {
    if (!newMemoTagName.trim() || !user?.id) return
    const name = newMemoTagName.trim()
    const tempId = `temp-${Date.now()}`
    setMemoTags((prev) => [...prev, { id: tempId, name, type: 'MEMO' }])
    setNewMemoTagName('')
    setIsAddingMemoTag(false)
    try {
      const res = await api.post('/categories', { name, type: 'MEMO', user_id: user.id })
      if (res.data.data) {
        setMemoTags((prev) => prev.map((c) => (c.id === tempId ? { ...c, id: res.data.data.id } : c)))
        showToast(`"${name}" 추가됨`)
      }
    } catch {
      setMemoTags((prev) => prev.filter((c) => c.id !== tempId))
      showToast('추가 실패', 'error')
    }
  }

  const handleDeleteMemoTag = async (id, name) => {
    const backup = memoTags.find((c) => c.id === id)
    setMemoTags((prev) => prev.filter((c) => c.id !== id))
    try {
      await api.delete(`/categories/${id}`)
      showToast(`"${name}" 삭제됨`)
    } catch {
      if (backup) setMemoTags((prev) => [...prev, backup])
      showToast('삭제 실패', 'error')
    }
  }

  const handleConnectGoogle = () => {
    const authUrl = `https://mzjeavvumjqgmbkszahs.supabase.co/auth/v1/authorize?provider=google&redirect_to=http://localhost:5173&scopes=https://www.googleapis.com/auth/calendar&access_type=offline&prompt=consent`
    const ipc = window.electron?.ipcRenderer || window.ipcRenderer
    if (ipc) ipc.send('open-auth-window', authUrl)
  }

  const handleConnectNotion = async () => {
    if (!user?.id) return
    try {
      const res = await api.get('/auth/notion', { params: { user_id: user.id } })
      const ipc = window.electron?.ipcRenderer || window.ipcRenderer
      if (ipc && res.data.auth_url) ipc.send('open-notion-auth-window', res.data.auth_url)
    } catch {}
  }

  const handleDisconnectGoogle = async () => {
    if (!window.confirm('구글 캘린더 연동을 해제하시겠습니까?')) return
    try {
      await api.post('/auth/update-google-token', { user_id: user.id, token: null })
      localStorage.removeItem('google_provider_token')
      setCalendarConnected(false)
      setCalendarTags([])
      showToast('연동이 해제되었습니다.')
    } catch {}
  }

  const handleDisconnectNotion = async () => {
    if (!window.confirm('노션 연동을 해제하시겠습니까?')) return
    try {
      await api.delete('/auth/notion/disconnect', { params: { user_id: user.id } })
      setNotionConnected(false)
      setNotionDbStatus(null)
      setNotionDbName(null)
      setNotionPageName(null)
      setNotionPages([])
      setSelectedPageId(null)
      setShowPageSelector(false)
      showToast('연동이 해제되었습니다.')
    } catch {}
  }

  const toggleSection = (section) => setExpandedSection(expandedSection === section ? null : section)

  return (
    <div className="min-h-full p-8 pb-16" style={{ background: 'var(--app-bg)' }}>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="max-w-xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={onBack}
            className="w-11 h-11 rounded-xl flex items-center justify-center transition-all hover:opacity-70"
            style={{ background: 'var(--surface-primary)', color: 'var(--text-secondary)', border: '1px solid var(--divider)' }}
          >
            <BackIcon />
          </button>
          <div>
            <h1 style={{ color: 'var(--text-primary)', fontSize: '24px', fontWeight: '700', margin: 0 }}>설정</h1>
            <small style={{ color: 'var(--text-tertiary)' }}>서비스 연결 및 카테고리 관리</small>
          </div>
        </div>

        {/* Profile */}
        {user && (
          <div
            className="rounded-2xl p-5 flex items-center gap-4 mb-8"
            style={{ background: 'var(--surface-primary)', border: '1px solid var(--divider)' }}
          >
            {user.user_metadata?.avatar_url ? (
              <img
                src={user.user_metadata.avatar_url}
                alt="profile"
                className="w-14 h-14 rounded-xl"
                style={{ border: '2px solid var(--divider)' }}
              />
            ) : (
              <div className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl" style={{ background: 'var(--surface-secondary)' }}>
                👤
              </div>
            )}
            <div>
              <div style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '16px' }}>
                {user.user_metadata?.name || 'User'}
              </div>
              <div style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>{user.email}</div>
            </div>
          </div>
        )}

        {/* Calendar Section */}
        <div className="mb-2 pl-1">
          <small style={{ color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>
            일정 연결
          </small>
        </div>

        <div className="mb-8">
          <ServiceCard
            icon="📅"
            name="Google Calendar"
            description={calendarConnected ? `${calendarTags.length}개 캘린더` : '연결 안됨'}
            isConnected={calendarConnected}
            isExpanded={expandedSection === 'google-calendar'}
            onToggle={() => toggleSection('google-calendar')}
          >
            <div className="flex flex-col gap-4">
              {calendarConnected ? (
                <>
                  <button
                    onClick={handleSyncCalendars}
                    disabled={syncLoading}
                    className="w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-60"
                    style={{ background: 'var(--google-blue)', color: '#fff' }}
                  >
                    <span className={syncLoading ? 'animate-spin' : ''}><SyncIcon /></span>
                    {syncLoading ? '동기화 중...' : '캘린더 동기화'}
                  </button>

                  {calendarTags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {calendarTags.map((tag) => (
                        <span
                          key={tag.id}
                          className="px-3 py-1.5 rounded-lg text-sm"
                          style={{ background: 'rgba(66, 133, 244, 0.1)', color: 'var(--google-blue)' }}
                        >
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={handleDisconnectGoogle}
                    className="text-sm opacity-70 hover:opacity-100"
                    style={{ color: 'var(--status-error)', background: 'none', border: 'none' }}
                  >
                    연동 해제
                  </button>
                </>
              ) : (
                <button
                  onClick={handleConnectGoogle}
                  className="w-full py-3 rounded-xl font-semibold"
                  style={{ background: 'var(--google-blue)', color: '#fff' }}
                >
                  구글 계정 연동하기
                </button>
              )}
            </div>
          </ServiceCard>
        </div>

        {/* Memo Section */}
        <div className="mb-2 pl-1">
          <small style={{ color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>
            메모 연결
          </small>
        </div>

        <div className="mb-8">
          <ServiceCard
            icon="📝"
            name="Notion"
            description={
              isLoadingNotion ? '확인 중...' : notionConnected
                ? notionDbStatus === 'ready' ? `${notionPageName || '페이지'}에 연결됨` : '설정 필요'
                : '연결 안됨'
            }
            isConnected={!isLoadingNotion && notionConnected && notionDbStatus === 'ready'}
            isLoading={isLoadingNotion}
            isExpanded={expandedSection === 'notion'}
            onToggle={() => toggleSection('notion')}
          >
            <div className="flex flex-col gap-4">
              {isLoadingNotion && (
                <div className="flex items-center justify-center py-4 gap-3">
                  <div className="w-5 h-5 rounded-full animate-spin" style={{ border: '2px solid var(--divider)', borderTopColor: 'var(--action-primary)' }} />
                  <span style={{ color: 'var(--text-secondary)' }}>연동 상태 확인 중...</span>
                </div>
              )}

              {!isLoadingNotion && !notionConnected && (
                <button
                  onClick={handleConnectNotion}
                  className="w-full py-3 rounded-xl font-semibold"
                  style={{ background: 'var(--action-secondary)', color: '#fff' }}
                >
                  노션 연동하기
                </button>
              )}

              {!isLoadingNotion && notionConnected && notionDbStatus !== 'ready' && (
                <>
                  <div className="p-4 rounded-xl" style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span>⚠️</span>
                      <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>데이터베이스 설정 필요</span>
                    </div>
                    <small style={{ color: 'var(--text-secondary)' }}>메모를 저장할 페이지를 선택해주세요.</small>
                  </div>

                  {!showPageSelector ? (
                    <button
                      onClick={() => { setShowPageSelector(true); fetchNotionPages() }}
                      className="w-full py-3 rounded-xl font-semibold"
                      style={{ background: 'var(--action-secondary)', color: '#fff' }}
                    >
                      페이지 선택하기
                    </button>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--divider)', maxHeight: '180px', overflowY: 'auto' }}>
                        {notionPages.length === 0 ? (
                          <div className="p-4 text-center" style={{ color: 'var(--text-tertiary)' }}>불러오는 중...</div>
                        ) : (
                          notionPages.map((page) => (
                            <button
                              key={page.id}
                              onClick={() => setSelectedPageId(page.id)}
                              className="w-full p-3 flex items-center gap-3 text-left transition-all"
                              style={{
                                background: selectedPageId === page.id ? 'var(--surface-secondary)' : 'transparent',
                                borderBottom: '1px solid var(--divider)'
                              }}
                            >
                              <span className="text-lg">{page.icon || '📄'}</span>
                              <span style={{ color: 'var(--text-primary)', flex: 1 }}>{page.title}</span>
                              {selectedPageId === page.id && <span style={{ color: 'var(--status-completed)' }}>✓</span>}
                            </button>
                          ))
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setShowPageSelector(false); setSelectedPageId(null) }}
                          className="flex-1 py-2.5 rounded-xl"
                          style={{ background: 'var(--surface-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--divider)' }}
                        >
                          취소
                        </button>
                        <button
                          onClick={handleSetupNotionDatabase}
                          disabled={!selectedPageId || isCreatingDb}
                          className="flex-1 py-2.5 rounded-xl font-semibold disabled:opacity-50"
                          style={{ background: 'var(--action-secondary)', color: '#fff' }}
                        >
                          {isCreatingDb ? '설정 중...' : '연결하기'}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {!isLoadingNotion && notionConnected && notionDbStatus === 'ready' && (
                <>
                  <div className="p-4 rounded-xl" style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: 'var(--status-completed)' }} />
                      <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>연결됨</span>
                    </div>
                    <small style={{ color: 'var(--text-secondary)' }}>
                      📄 {notionPageName || '알 수 없음'} · ⚡ {notionDbName || 'One Gate 메모'}
                    </small>
                  </div>

                  <div>
                    <small style={{ color: 'var(--text-tertiary)', display: 'block', marginBottom: '8px' }}>메모 카테고리</small>
                    <div className="flex flex-wrap gap-2">
                      {memoTags.map((tag) => (
                        <div
                          key={tag.id}
                          className="px-3 py-1.5 pr-7 rounded-lg text-sm relative"
                          style={{ background: 'var(--surface-secondary)', color: 'var(--text-primary)' }}
                        >
                          {tag.name}
                          <button
                            onClick={() => handleDeleteMemoTag(tag.id, tag.name)}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full flex items-center justify-center"
                            style={{ background: 'rgba(239, 68, 68, 0.2)', color: 'var(--status-error)', fontSize: '10px', border: 'none' }}
                          >
                            ×
                          </button>
                        </div>
                      ))}

                      {isAddingMemoTag ? (
                        <div className="px-3 py-1.5 rounded-lg" style={{ background: 'var(--surface-secondary)', border: '1px solid var(--action-primary)' }}>
                          <input
                            type="text"
                            value={newMemoTagName}
                            onChange={(e) => setNewMemoTagName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAddMemoTag()
                              if (e.key === 'Escape') { setIsAddingMemoTag(false); setNewMemoTagName('') }
                            }}
                            autoFocus
                            placeholder="태그명"
                            className="w-16 text-sm"
                            style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)' }}
                          />
                        </div>
                      ) : (
                        <button
                          onClick={() => setIsAddingMemoTag(true)}
                          className="px-3 py-1.5 rounded-lg text-sm"
                          style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--action-secondary)', border: '1px solid rgba(99, 102, 241, 0.2)' }}
                        >
                          + 추가
                        </button>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={handleDisconnectNotion}
                    className="text-sm opacity-70 hover:opacity-100"
                    style={{ color: 'var(--status-error)', background: 'none', border: 'none' }}
                  >
                    연동 해제
                  </button>
                </>
              )}
            </div>
          </ServiceCard>
        </div>

        <div className="text-center pt-4">
          <small style={{ color: 'var(--text-tertiary)' }}>더 많은 서비스가 곧 추가됩니다</small>
        </div>
      </div>
    </div>
  )
}

export default Settings
