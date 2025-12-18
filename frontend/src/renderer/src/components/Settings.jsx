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

  const getGoogleToken = () => localStorage.getItem('google_provider_token')

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
  }

  useEffect(() => {
    const googleToken = getGoogleToken()
    if (googleToken) {
      setCalendarConnected(true)
      fetchCalendarTags()
    }
    fetchMemoTags()
  }, [])

  const fetchCalendarTags = async () => {
    try {
      const res = await api.get('/categories', { params: { type: 'CALENDAR' } })
      if (res.data.status === 'success') {
        setCalendarTags(res.data.data || [])
      }
    } catch (err) {
      console.error('캘린더 카테고리 로드 실패:', err)
    }
  }

  const fetchMemoTags = async () => {
    try {
      const res = await api.get('/categories', { params: { type: 'MEMO' } })
      if (res.data.status === 'success') {
        setMemoTags(res.data.data || [])
      }
    } catch (err) {
      console.error('메모 카테고리 로드 실패:', err)
    }
  }

  const handleSyncCalendars = async () => {
    const token = getGoogleToken()
    if (!token) {
      showToast('Google 토큰이 없습니다. 재로그인 해주세요.', 'error')
      return
    }

    setSyncLoading(true)

    try {
      const res = await api.post('/sync/calendars', {}, {
        headers: { 'X-Google-Token': token }
      })

      if (res.data.status === 'success') {
        const { added, deleted, kept } = res.data
        showToast(`동기화 완료: +${added?.length || 0} 추가, -${deleted?.length || 0} 삭제`, 'success')
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
    if (!newMemoTagName.trim()) return

    const categoryName = newMemoTagName.trim()
    const tempId = `temp-${Date.now()}`

    setMemoTags((prev) => [...prev, { id: tempId, name: categoryName, type: 'MEMO' }])
    setNewMemoTagName('')
    setIsAddingMemoTag(false)

    try {
      const res = await api.post('/categories', { name: categoryName, type: 'MEMO' })
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

  const toggleSection = (section) => {
    setExpandedSection(expandedSection === section ? null : section)
  }

  // Service configurations
  const calendarServices = [
    { id: 'google', name: 'Google Calendar', icon: '📅', connected: calendarConnected }
  ]

  const memoServices = [
    { id: 'notion', name: 'Notion', icon: '📝', connected: true }
  ]

  return (
    <div className="min-h-full p-6 pb-16" style={{ background: 'var(--app-bg)' }}>
      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="max-w-xl mx-auto">
        {/* Header */}
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

        {/* User Card */}
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

        {/* Section Title */}
        <div className="mb-4 px-1">
          <h2 style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
            일정 연결
          </h2>
        </div>

        {/* Calendar Services */}
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
              {/* Sync Button */}
              <button
                onClick={handleSyncCalendars}
                disabled={syncLoading || !calendarConnected}
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

              {/* Calendar Tags */}
              {calendarTags.length > 0 && (
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

              {!calendarConnected && (
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px', textAlign: 'center' }}>
                  Google 로그인 후 캘린더를 동기화하세요
                </p>
              )}
            </div>
          </ServiceCard>

          {/* Future: Apple Calendar, Outlook 등 추가 가능 */}
        </div>

        {/* Section Title */}
        <div className="mb-4 px-1">
          <h2 style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
            메모 연결
          </h2>
        </div>

        {/* Memo Services */}
        <div className="space-y-3">
          <ServiceCard
            icon="📝"
            name="Notion"
            description={`${memoTags.length}개 카테고리`}
            isConnected={true}
            isExpanded={expandedSection === 'notion'}
            onToggle={() => toggleSection('notion')}
            accentColor="#000000"
          >
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
          </ServiceCard>

          {/* Future: Apple Notes, Obsidian 등 추가 가능 */}
        </div>

        {/* Footer Info */}
        <div className="mt-8 text-center">
          <small style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
            더 많은 서비스가 곧 추가됩니다
          </small>
        </div>
      </div>

      {/* Custom Animation Styles */}
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
