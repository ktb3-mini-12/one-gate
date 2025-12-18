import React, { useState, useEffect } from 'react'
import { api } from '../lib/api'

// Icons
const SyncIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10" />
    <polyline points="23 20 23 14 17 14" />
    <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
  </svg>
)

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
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
    style={{
      transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
      transition: 'transform 0.3s ease'
    }}
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
)

// Toast Component
function Toast({ message, type, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div
      className="fixed top-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl flex items-center gap-3 z-50 animate-slide-down"
      style={{
        background: type === 'success'
          ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.95), rgba(5, 150, 105, 0.95))'
          : 'linear-gradient(135deg, rgba(239, 68, 68, 0.95), rgba(185, 28, 28, 0.95))',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(12px)'
      }}
    >
      {type === 'success' && <CheckIcon />}
      <span style={{ color: '#fff', fontSize: '14px', fontWeight: '500' }}>{message}</span>
    </div>
  )
}

// Service Card Component
function ServiceCard({ icon, name, description, isConnected, isExpanded, onToggle, children, accentColor }) {
  return (
    <div
      className="rounded-[24px] overflow-hidden transition-all duration-300"
      style={{
        background: 'linear-gradient(180deg, var(--surface-primary) 0%, rgba(28, 29, 31, 0.8) 100%)',
        border: isExpanded ? `1px solid ${accentColor}30` : '1px solid transparent'
      }}
    >
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full p-5 flex items-center justify-between transition-all hover:opacity-90"
      >
        <div className="flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl"
            style={{
              background: `linear-gradient(135deg, ${accentColor}20, ${accentColor}10)`,
              border: `1px solid ${accentColor}30`
            }}
          >
            {icon}
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '15px' }}>
                {name}
              </span>
              {isConnected && (
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ background: '#10B981', boxShadow: '0 0 8px rgba(16, 185, 129, 0.6)' }}
                />
              )}
            </div>
            <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
              {description}
            </span>
          </div>
        </div>
        <div style={{ color: 'var(--text-secondary)' }}>
          <ChevronIcon isOpen={isExpanded} />
        </div>
      </button>

      {/* Expandable Content */}
      <div
        className="overflow-hidden transition-all duration-300"
        style={{
          maxHeight: isExpanded ? '500px' : '0',
          opacity: isExpanded ? 1 : 0
        }}
      >
        <div className="px-5 pb-5">
          <div
            className="h-px mb-4"
            style={{ background: 'linear-gradient(90deg, transparent, var(--divider), transparent)' }}
          />
          {children}
        </div>
      </div>
    </div>
  )
}

export function Settings({ user, onBack }) {
  const [toast, setToast] = useState(null)
  const [syncLoading, setSyncLoading] = useState(false)

  // Expanded sections
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
  const [notionUser, setNotionUser] = useState(null)
  const [notionDbStatus, setNotionDbStatus] = useState(null) // ready, no_database, database_invalid
  const [notionDbName, setNotionDbName] = useState(null)
  const [notionPageName, setNotionPageName] = useState(null) // 부모 페이지명
  const [notionPages, setNotionPages] = useState([])
  const [selectedPageId, setSelectedPageId] = useState(null)
  const [isCreatingDb, setIsCreatingDb] = useState(false)
  const [showPageSelector, setShowPageSelector] = useState(false)
  const [isLoadingNotion, setIsLoadingNotion] = useState(true) // 로딩 상태

  const getGoogleToken = () => localStorage.getItem('google_provider_token')

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
  }

  // [수정 포인트 1] 데이터 새로고침 로직을 별도 함수로 분리
  const refreshAllData = async () => {
    console.log('연동 데이터 새로고침 중...')
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

  // Notion 연동 상태 확인
  const checkNotionStatus = async () => {
    if (!user?.id) return
    setIsLoadingNotion(true)
    try {
      const res = await api.get('/auth/notion/status', { params: { user_id: user.id } })
      console.log('[Notion Status]', res.data)

      if (res.data.status === 'connected') {
        setNotionConnected(true)
        setNotionUser(res.data.user || null)
        // 데이터베이스 상태도 확인
        await checkNotionDatabaseStatus()
      } else if (res.data.status === 'expired') {
        // 토큰 만료 - 재연동 필요
        setNotionConnected(false)
        setNotionUser(null)
        setNotionDbStatus(null)
        setNotionDbName(null)
        setNotionPageName(null)
        console.log('[Notion] 토큰 만료됨, 재연동 필요')
      } else {
        setNotionConnected(false)
        setNotionUser(null)
        setNotionDbStatus(null)
        setNotionDbName(null)
        setNotionPageName(null)
      }
    } catch (err) {
      console.error('Notion 상태 확인 실패:', err)
      setNotionConnected(false)
    } finally {
      setIsLoadingNotion(false)
    }
  }

  // Notion 데이터베이스 상태 확인
  const checkNotionDatabaseStatus = async () => {
    if (!user?.id) return
    try {
      const res = await api.get('/notion/database-status', { params: { user_id: user.id } })
      setNotionDbStatus(res.data.status)
      if (res.data.status === 'ready') {
        setNotionDbName(res.data.database_name)
        setNotionPageName(res.data.page_name)
      } else {
        setNotionDbName(null)
        setNotionPageName(null)
      }
    } catch (err) {
      console.error('Notion DB 상태 확인 실패:', err)
    }
  }

  // Notion 페이지 목록 가져오기
  const fetchNotionPages = async () => {
    if (!user?.id) return
    try {
      const res = await api.get('/notion/pages', { params: { user_id: user.id } })
      if (res.data.status === 'success') {
        setNotionPages(res.data.data || [])
      }
    } catch (err) {
      console.error('Notion 페이지 로드 실패:', err)
    }
  }

  // Notion 데이터베이스 설정 (기존 연결 또는 새로 생성)
  const handleSetupNotionDatabase = async () => {
    if (!selectedPageId) {
      showToast('페이지를 선택해주세요', 'error')
      return
    }

    setIsCreatingDb(true)
    try {
      const res = await api.post('/notion/setup-database', {
        user_id: user.id,
        parent_page_id: selectedPageId,
        database_name: 'One Gate 메모'
      })

      if (res.data.status === 'success') {
        // 기존 연결인지 새로 생성인지에 따라 메시지 다르게
        const message = res.data.created
          ? '새 데이터베이스가 생성되었습니다!'
          : '기존 데이터베이스에 연결되었습니다!'
        showToast(message)
        setShowPageSelector(false)
        setSelectedPageId(null)
        await checkNotionDatabaseStatus()
      } else {
        showToast(res.data.message || '설정 실패', 'error')
      }
    } catch (err) {
      showToast('데이터베이스 설정 중 오류가 발생했습니다', 'error')
    } finally {
      setIsCreatingDb(false)
    }
  }

  // [수정 포인트 2] 초기 로드 및 일렉트론 신호 리스너 등록
  useEffect(() => {
    refreshAllData()

    const ipc = window.electron?.ipcRenderer || window.ipcRenderer
    if (ipc) {
      // 신호를 받으면 500ms(0.5초) 뒤에 새로고침 실행
      const removeListener = ipc.on('refresh-data', () => {
        setTimeout(() => {
          refreshAllData()
          showToast('연동 정보가 업데이트되었습니다.', 'success')
        }, 500) // 토큰이 스토리지에 써지는 시간을 벌어줍니다.
      })

      return () => {
        if (typeof removeListener === 'function') removeListener()
      }
    }
  }, [])

  const fetchCalendarTags = async () => {
    if (!user?.id) return; // 유저 정보 없으면 중단

    try {
      // params에 user_id를 포함시켜서 요청
      const res = await api.get('/categories', { 
        params: { 
          type: 'CALENDAR',
          user_id: user.id // <-- 내 ID 추가
        } 
      })
      if (res.data.status === 'success') {
        setCalendarTags(res.data.data || [])
      }
    } catch (err) {
      console.error('캘린더 카테고리 로드 실패:', err)
    }
  }

  const fetchMemoTags = async () => {
    if (!user?.id) return
    try {
      const res = await api.get('/categories', {
        params: {
          type: 'MEMO',
          user_id: user.id
        }
      })
      if (res.data.status === 'success') {
        setMemoTags(res.data.data || [])
      }
    } catch (err) {
      console.error('메모 카테고리 로드 실패:', err)
    }
  }

  const handleSyncCalendars = async () => {
    const token = getGoogleToken()
    
    // 1. 유저 ID가 있는지 먼저 확인합니다.
    if (!user?.id) {
      showToast('사용자 정보를 불러올 수 없습니다.', 'error')
      return
    }

    if (!token) {
      showToast('Google 토큰이 없습니다. 재로그인 해주세요.', 'error')
      return
    }

    setSyncLoading(true)

    try {
      // 2. URL 파라미터에 user_id를 추가하여 백엔드에 보냅니다.
      const res = await api.post(`/sync/calendars?user_id=${user.id}`, {}, {
        headers: { 'X-Google-Token': token }
      })

      if (res.data.status === 'success') {
        const { added, deleted } = res.data
        showToast(`동기화 완료: +${added?.length || 0} 추가, -${deleted?.length || 0} 삭제`, 'success')
        
        // 3. 카테고리 목록을 다시 불러올 때도 내 것만 가져오도록 함수 확인 필요
        await fetchCalendarTags()
      } else {
        showToast(res.data.message || '동기화 실패', 'error')
      }
    } catch (err) {
      showToast('동기화 중 오류가 발생했습니다.', 'error')
    } finally {
      setSyncLoading(false)
    }
  }

  const handleAddMemoTag = async () => {
    if (!newMemoTagName.trim() || !user?.id) return

    const categoryName = newMemoTagName.trim()
    const tempId = `temp-${Date.now()}`

    setMemoTags((prev) => [...prev, { id: tempId, name: categoryName, type: 'MEMO' }])
    setNewMemoTagName('')
    setIsAddingMemoTag(false)

    try {
      const res = await api.post('/categories', {
        name: categoryName,
        type: 'MEMO',
        user_id: user.id
      })
      if (res.data.data) {
        setMemoTags((prev) =>
          prev.map((cat) => (cat.id === tempId ? { ...cat, id: res.data.data.id } : cat))
        )
        showToast(`"${categoryName}" 카테고리가 추가되었습니다.`, 'success')
      }
    } catch (err) {
      setMemoTags((prev) => prev.filter((cat) => cat.id !== tempId))
      showToast('카테고리 추가 실패', 'error')
    }
  }

  const handleDeleteMemoTag = async (categoryId, categoryName) => {
    const categoryToDelete = memoTags.find((cat) => cat.id === categoryId)
    setMemoTags((prev) => prev.filter((cat) => cat.id !== categoryId))

    try {
      await api.delete(`/categories/${categoryId}`)
      showToast(`"${categoryName}" 카테고리가 삭제되었습니다.`, 'success')
    } catch (err) {
      if (categoryToDelete) {
        setMemoTags((prev) => [...prev, categoryToDelete])
      }
      showToast('카테고리 삭제 실패', 'error')
    }
  }

  const handleDisconnect = async (type) => {
    if (!window.confirm(`${type === 'google' ? '구글 캘린더' : '노션'} 연동을 해제하시겠습니까?`)) return;

    try {
      const endpoint = type === 'google' ? '/auth/update-google-token' : '/auth/update-notion-token';
      await api.post(endpoint, {
        user_id: user.id,
        token: null 
      });
      
      if (type === 'google') {
        localStorage.removeItem('google_provider_token');
        setCalendarConnected(false);
        setCalendarTags([]);
      }
      showToast(`${type} 연동이 해제되었습니다.`);
      refreshAllData();
    } catch (err) {
      showToast('연동 해제 중 오류가 발생했습니다.', 'error');
    }
  };

  const handleConnectGoogle = () => {
    const authUrl = `https://mzjeavvumjqgmbkszahs.supabase.co/auth/v1/authorize?provider=google&redirect_to=http://localhost:5173&scopes=https://www.googleapis.com/auth/calendar&access_type=offline&prompt=consent`;

    const ipc = window.electron?.ipcRenderer || window.ipcRenderer
    if (ipc) {
      ipc.send('open-auth-window', authUrl);
    } else {
      console.error('IPC Renderer를 찾을 수 없습니다.');
      showToast('일렉트론 환경이 아닙니다.', 'error');
    }
  };

  const handleConnectNotion = async () => {
    if (!user?.id) {
      showToast('사용자 정보를 불러올 수 없습니다.', 'error')
      return
    }

    try {
      // 백엔드에서 Notion OAuth URL 가져오기
      const res = await api.get('/auth/notion', { params: { user_id: user.id } })
      const authUrl = res.data.auth_url

      if (!authUrl) {
        showToast('Notion OAuth URL을 가져올 수 없습니다.', 'error')
        return
      }

      const ipc = window.electron?.ipcRenderer || window.ipcRenderer
      if (ipc) {
        ipc.send('open-notion-auth-window', authUrl)
      } else {
        // 브라우저 환경에서는 새 창으로 열기
        window.open(authUrl, '_blank')
      }
    } catch (err) {
      console.error('Notion 연동 시작 실패:', err)
      showToast('Notion 연동을 시작할 수 없습니다.', 'error')
    }
  };

  const handleDisconnectNotion = async () => {
    if (!window.confirm('노션 연동을 해제하시겠습니까?')) return

    try {
      await api.delete('/auth/notion/disconnect', { params: { user_id: user.id } })
      setNotionConnected(false)
      setNotionUser(null)
      setNotionDbStatus(null)
      setNotionDbName(null)
      setNotionPageName(null)
      setNotionPages([])
      setSelectedPageId(null)
      setShowPageSelector(false)
      showToast('노션 연동이 해제되었습니다.')
    } catch (err) {
      showToast('연동 해제 중 오류가 발생했습니다.', 'error')
    }
  };

  const toggleSection = (section) => {
    setExpandedSection(expandedSection === section ? null : section)
  }

  return (
    <div className="min-h-full p-6 pb-16" style={{ background: 'var(--app-bg)' }}>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="max-w-xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-2xl flex items-center justify-center transition-all hover:scale-105"
            style={{
              background: 'linear-gradient(135deg, var(--surface-primary), var(--surface-gradient-top))',
              color: 'var(--text-secondary)',
              border: '1px solid var(--divider)'
            }}
          >
            ←
          </button>
          <div>
            <h1 style={{ color: 'var(--text-primary)', fontSize: '24px', fontWeight: '700' }}>설정</h1>
            <small style={{ color: 'var(--text-secondary)' }}>서비스 연결 및 카테고리 관리</small>
          </div>
        </div>

        {user && (
          <div
            className="rounded-[24px] p-5 mb-6 flex items-center gap-4"
            style={{
              background: 'linear-gradient(135deg, var(--surface-primary), rgba(14, 123, 246, 0.05))',
              border: '1px solid var(--divider)'
            }}
          >
            {user.user_metadata?.avatar_url ? (
              <img
                src={user.user_metadata.avatar_url}
                alt="profile"
                className="w-14 h-14 rounded-2xl"
                style={{ border: '2px solid var(--divider)' }}
              />
            ) : (
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl"
                style={{ background: 'var(--surface-gradient-top)' }}
              >
                👤
              </div>
            )}
            <div className="flex-1">
              <div style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '16px' }}>
                {user.user_metadata?.name || 'User'}
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{user.email}</div>
            </div>
          </div>
        )}

        <div className="mb-4 px-1">
          <h2 style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
            일정 연결
          </h2>
        </div>

        <div className="space-y-3 mb-8">
          <ServiceCard
            icon="📅"
            name="Google Calendar"
            description={calendarConnected ? `${calendarTags.length}개 캘린더 연결됨` : '연결 안됨'}
            isConnected={calendarConnected}
            isExpanded={expandedSection === 'google-calendar'}
            onToggle={() => toggleSection('google-calendar')}
            accentColor="#4285F4"
          >
            <div className="space-y-4">
              {calendarConnected ? (
                <>
                  <button
                    onClick={handleSyncCalendars}
                    disabled={syncLoading}
                    className="w-full py-3 rounded-xl flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-50"
                    style={{
                      background: 'linear-gradient(135deg, #4285F4, #1a73e8)',
                      color: '#fff',
                      fontWeight: '500',
                      fontSize: '14px'
                    }}
                  >
                    <span className={syncLoading ? 'animate-spin' : ''}>
                      <SyncIcon />
                    </span>
                    {syncLoading ? '동기화 중...' : '캘린더 동기화'}
                  </button>
                  <button
                    onClick={() => handleDisconnect('google')}
                    className="w-full py-2 text-xs transition-all opacity-60 hover:opacity-100"
                    style={{ color: '#EF4444', textDecoration: 'underline', background: 'none', border: 'none' }}
                  >
                    구글 캘린더 연동 해제하기
                  </button>
                </>
              ) : (
                <button
                  onClick={handleConnectGoogle}
                  className="w-full py-3 rounded-xl flex items-center justify-center gap-2 transition-all hover:opacity-90"
                  style={{
                    background: 'linear-gradient(135deg, #4285F4, #1a73e8)',
                    color: '#fff',
                    fontWeight: '600',
                    fontSize: '14px'
                  }}
                >
                  구글 계정 연동하기
                </button>
              )}

              {calendarConnected && calendarTags.length > 0 && (
                <div>
                  <small style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '10px' }}>
                    동기화된 캘린더
                  </small>
                  <div className="flex flex-wrap gap-2">
                    {calendarTags.map((tag) => (
                      <div
                        key={tag.id}
                        className="px-3 py-1.5 rounded-xl"
                        style={{
                          background: 'rgba(66, 133, 244, 0.1)',
                          border: '1px solid rgba(66, 133, 244, 0.2)',
                          color: '#4285F4',
                          fontSize: '13px',
                          fontWeight: '500'
                        }}
                      >
                        {tag.name}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ServiceCard>
        </div>

        <div className="mb-4 px-1">
          <h2 style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
            메모 연결
          </h2>
        </div>

        <div className="space-y-3">
          <ServiceCard
            icon="📝"
            name="Notion"
            description={
              isLoadingNotion
                ? '연동 상태 확인 중...'
                : notionConnected
                  ? notionDbStatus === 'ready'
                    ? `${notionPageName || '페이지'}에 연결됨`
                    : '데이터베이스 설정 필요'
                  : '연결 안됨'
            }
            isConnected={!isLoadingNotion && notionConnected && notionDbStatus === 'ready'}
            isExpanded={expandedSection === 'notion'}
            onToggle={() => toggleSection('notion')}
            accentColor="#000000"
          >
            <div className="space-y-4">
              {/* 로딩 중 */}
              {isLoadingNotion && (
                <div className="flex items-center justify-center py-4 gap-3">
                  <div
                    className="w-5 h-5 rounded-full animate-spin"
                    style={{ border: '2px solid var(--divider)', borderTopColor: '#000' }}
                  />
                  <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                    연동 상태 확인 중...
                  </span>
                </div>
              )}

              {/* 연결 안됨 */}
              {!isLoadingNotion && !notionConnected && (
                <button
                  onClick={handleConnectNotion}
                  className="w-full py-3 rounded-xl flex items-center justify-center gap-2 transition-all hover:opacity-90"
                  style={{
                    background: 'linear-gradient(135deg, #000000, #333333)',
                    color: '#fff',
                    fontWeight: '600',
                    fontSize: '14px'
                  }}
                >
                  노션 연동하기
                </button>
              )}

              {/* 연결됨 - 데이터베이스 설정 필요 */}
              {!isLoadingNotion && notionConnected && notionDbStatus !== 'ready' && (
                <>
                  <div
                    className="p-3 rounded-xl"
                    style={{
                      background: 'rgba(251, 191, 36, 0.1)',
                      border: '1px solid rgba(251, 191, 36, 0.3)'
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span style={{ fontSize: '16px' }}>⚠️</span>
                      <span style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '500' }}>
                        데이터베이스 설정이 필요합니다
                      </span>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                      메모를 저장할 Notion 페이지를 선택해주세요. 기존 데이터베이스가 있으면 연결하고, 없으면 새로 생성합니다.
                    </p>
                  </div>

                  {!showPageSelector ? (
                    <button
                      onClick={() => {
                        setShowPageSelector(true)
                        fetchNotionPages()
                      }}
                      className="w-full py-3 rounded-xl flex items-center justify-center gap-2 transition-all hover:opacity-90"
                      style={{
                        background: 'linear-gradient(135deg, #000000, #333333)',
                        color: '#fff',
                        fontWeight: '600',
                        fontSize: '14px'
                      }}
                    >
                      📄 페이지 선택하기
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <small style={{ color: 'var(--text-secondary)' }}>
                        데이터베이스를 생성할 페이지 선택:
                      </small>
                      <div
                        className="max-h-48 overflow-y-auto rounded-xl"
                        style={{ background: 'var(--surface-gradient-top)', border: '1px solid var(--divider)' }}
                      >
                        {notionPages.length === 0 ? (
                          <div className="p-4 text-center" style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                            페이지를 불러오는 중...
                          </div>
                        ) : (
                          notionPages.map((page) => (
                            <button
                              key={page.id}
                              onClick={() => setSelectedPageId(page.id)}
                              className="w-full p-3 flex items-center gap-3 transition-all hover:opacity-80"
                              style={{
                                background: selectedPageId === page.id ? 'rgba(0, 0, 0, 0.2)' : 'transparent',
                                borderBottom: '1px solid var(--divider)'
                              }}
                            >
                              <span style={{ fontSize: '18px' }}>{page.icon || '📄'}</span>
                              <span style={{ color: 'var(--text-primary)', fontSize: '14px' }}>
                                {page.title}
                              </span>
                              {selectedPageId === page.id && (
                                <span style={{ marginLeft: 'auto', color: '#10B981' }}>✓</span>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setShowPageSelector(false)
                            setSelectedPageId(null)
                          }}
                          className="flex-1 py-2 rounded-xl transition-all"
                          style={{
                            background: 'var(--surface-gradient-top)',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--divider)',
                            fontSize: '14px'
                          }}
                        >
                          취소
                        </button>
                        <button
                          onClick={handleSetupNotionDatabase}
                          disabled={!selectedPageId || isCreatingDb}
                          className="flex-1 py-2 rounded-xl transition-all disabled:opacity-50"
                          style={{
                            background: 'linear-gradient(135deg, #000000, #333333)',
                            color: '#fff',
                            fontWeight: '600',
                            fontSize: '14px'
                          }}
                        >
                          {isCreatingDb ? '설정 중...' : '연결하기'}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* 연결됨 - 데이터베이스 준비 완료 */}
              {!isLoadingNotion && notionConnected && notionDbStatus === 'ready' && (
                <>
                  <div
                    className="p-3 rounded-xl"
                    style={{
                      background: 'rgba(16, 185, 129, 0.1)',
                      border: '1px solid rgba(16, 185, 129, 0.2)'
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: '#10B981' }} />
                      <span style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '500' }}>
                        연결됨
                      </span>
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                      <div className="flex items-center gap-2 mb-1">
                        <span>📄</span>
                        <span>페이지: <strong style={{ color: 'var(--text-primary)' }}>{notionPageName || '알 수 없음'}</strong></span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span>⚡</span>
                        <span>데이터베이스: <strong style={{ color: 'var(--text-primary)' }}>{notionDbName || 'One Gate 메모'}</strong></span>
                      </div>
                    </div>
                  </div>

                  {/* 메모 카테고리 관리 */}
                  <div>
                    <small style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '10px' }}>
                      메모 카테고리
                    </small>
                    <div className="flex flex-wrap gap-2">
                      {memoTags.map((tag) => (
                        <div
                          key={tag.id}
                          className="group relative px-3 py-1.5 rounded-xl transition-all hover:pr-8"
                          style={{
                            background: 'var(--surface-gradient-top)',
                            border: '1px solid var(--divider)',
                            color: 'var(--text-primary)',
                            fontSize: '13px',
                            fontWeight: '500'
                          }}
                        >
                          {tag.name}
                          <button
                            onClick={() => handleDeleteMemoTag(tag.id, tag.name)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity w-4 h-4 rounded-full flex items-center justify-center"
                            style={{
                              background: 'rgba(239, 68, 68, 0.2)',
                              color: '#EF4444',
                              fontSize: '12px'
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}

                      {isAddingMemoTag ? (
                        <div
                          className="px-3 py-1.5 rounded-xl flex items-center gap-1"
                          style={{
                            background: 'var(--surface-gradient-top)',
                            border: '1px solid var(--action-primary)'
                          }}
                        >
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
                            onBlur={() => {
                              if (!newMemoTagName.trim()) {
                                setIsAddingMemoTag(false)
                              }
                            }}
                            autoFocus
                            className="bg-transparent border-none outline-none"
                            style={{
                              color: 'var(--text-primary)',
                              width: '80px',
                              fontSize: '13px'
                            }}
                            placeholder="태그명"
                          />
                        </div>
                      ) : (
                        <button
                          onClick={() => setIsAddingMemoTag(true)}
                          className="px-3 py-1.5 rounded-xl transition-all hover:opacity-90"
                          style={{
                            background: 'linear-gradient(135deg, var(--action-primary), #0056b3)',
                            color: '#fff',
                            fontSize: '13px',
                            fontWeight: '500'
                          }}
                        >
                          + 추가
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* 연동 해제 버튼 */}
              {!isLoadingNotion && notionConnected && (
                <button
                  onClick={handleDisconnectNotion}
                  className="w-full py-2 text-xs transition-all opacity-60 hover:opacity-100"
                  style={{ color: '#EF4444', textDecoration: 'underline', background: 'none', border: 'none' }}
                >
                  노션 연동 해제하기
                </button>
              )}
            </div>
          </ServiceCard>
        </div>

        <div className="mt-8 text-center">
          <small style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
            더 많은 서비스가 곧 추가됩니다
          </small>
        </div>
      </div>

      <style>{`
        @keyframes slide-down {
          from {
            opacity: 0;
            transform: translate(-50%, -20px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }
        .animate-slide-down {
          animation: slide-down 0.3s ease-out;
        }
      `}</style>
    </div>
  )
}

export default Settings