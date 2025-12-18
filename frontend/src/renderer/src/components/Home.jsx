import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'
import { CardItem } from './CardItem'
import { CardDetail } from './CardDetail'
import { ConfirmModal } from './ConfirmModal'

const { ipcRenderer } = window.require('electron')

// Icon components
const SettingsIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)

const RefreshIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="1 4 1 10 7 10" />
    <polyline points="23 20 23 14 17 14" />
    <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
  </svg>
)

const LogoutIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
)

export function Home({ user, session, onNavigateToSettings }) {
  const [activeTab, setActiveTab] = useState('전체')
  const [isBulkSelectMode, setIsBulkSelectMode] = useState(false)
  const [selectedCards, setSelectedCards] = useState(new Set())
  const [selectedCardId, setSelectedCardId] = useState(null)
  const [isUploading, setIsUploading] = useState(false)
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(false)
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)

  // Fetch records from backend
  const fetchRecords = async () => {
    if (!user?.id) return

    setLoading(true)
    try {
      const res = await api.get('/records', { params: { user_id: user.id } })
      if (res.data?.status === 'success') {
        const transformedCards = (res.data?.data || []).map((record) => ({
          id: String(record.id),
          summary: record.content,
          category: record.tags?.name || 'general',
          date: record.created_at ? new Date(record.created_at).toLocaleDateString('ko-KR') : '',
          status: 'temporary',
          categoryType: record.category === 'CALENDAR' ? '일정' : '메모',
          rawData: record
        }))
        setCards(transformedCards)
      }
    } catch (err) {
      console.error('데이터 로드 실패:', err)
      setCards([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user?.id) {
      fetchRecords()
    } else {
      setCards([])
      setLoading(false)
    }

    ipcRenderer.on('refresh-data', fetchRecords)

    return () => ipcRenderer.removeAllListeners('refresh-data')
  }, [user?.id])

  const filteredCards = cards.filter(
    (card) => activeTab === '전체' || card.categoryType === activeTab
  )

  const selectedCard = cards.find((card) => card.id === selectedCardId)

  const handleToggleBulkSelect = () => {
    setIsBulkSelectMode(!isBulkSelectMode)
    if (isBulkSelectMode) {
      setSelectedCards(new Set())
    }
  }

  const handleCardSelect = (id) => {
    const newSelected = new Set(selectedCards)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedCards(newSelected)
  }

  const handleBulkUpload = async () => {
    const googleToken = localStorage.getItem('google_provider_token')
    if (!googleToken) {
      alert('Google 토큰이 없습니다. 재로그인 해주세요.')
      return
    }

    setIsUploading(true)
    try {
      for (const cardId of selectedCards) {
        const card = cards.find((c) => c.id === cardId)
        if (card?.rawData?.category === 'CALENDAR') {
          await addToCalendar(card.rawData, googleToken)
        }
      }
      setSelectedCards(new Set())
      setIsBulkSelectMode(false)
    } catch (err) {
      console.error('업로드 실패:', err)
    } finally {
      setIsUploading(false)
    }
  }

  const addToCalendar = async (record, googleToken) => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(14, 0, 0, 0)
    const endTime = new Date(tomorrow)
    endTime.setHours(15, 0, 0, 0)

    const formatDateTime = (date) => date.toISOString().slice(0, 19)

    const res = await api.post(
      '/calendar/create',
      {
        summary: record.content,
        description: `One Gate에서 등록된 일정`,
        start_time: formatDateTime(tomorrow),
        end_time: formatDateTime(endTime)
      },
      {
        headers: {
          'X-Google-Token': googleToken
        }
      }
    )
    return res.data
  }

  const addToNotion = async (record) => {
    const payload = {
      content: record.content,
      category: record.tags?.name || '아이디어'
    }

    const res = await api.post('/notion/test-create', payload)
    if (res.data?.status !== 'success') {
      throw new Error(res.data?.message || 'Notion upload failed')
    }
    return res.data
  }

  const markCardCompleted = (cardId) => {
    setCards((prev) =>
      prev.map((card) => (card.id === String(cardId) ? { ...card, status: 'completed' } : card))
    )
  }

  const handleBulkDeleteClick = () => {
    setShowBulkDeleteConfirm(true)
  }

  const handleBulkDelete = async () => {
    setShowBulkDeleteConfirm(false)
    try {
      for (const cardId of selectedCards) {
        await api.delete(`/records/${cardId}`)
      }
      setCards(cards.filter((card) => !selectedCards.has(card.id)))
      setSelectedCards(new Set())
      setIsBulkSelectMode(false)
    } catch (err) {
      console.error('삭제 실패:', err)
    }
  }

  const handleCardClick = (id) => {
    if (!isBulkSelectMode) {
      setSelectedCardId(id)
    }
  }

  const handleUploadSingle = async () => {
    if (!selectedCardId) return

    const googleToken = localStorage.getItem('google_provider_token')
    const card = cards.find((c) => c.id === selectedCardId)
    if (!card?.rawData?.category) return

    if (card.rawData.category === 'CALENDAR') {
      if (!googleToken) {
        alert('Google 토큰이 없습니다. 재로그인 해주세요.')
        return
      }
      try {
        await addToCalendar(card.rawData, googleToken)
        markCardCompleted(selectedCardId)
        alert('Google 캘린더에 등록되었습니다.')
      } catch (err) {
        console.error('캘린더 등록 실패:', err)
      }
      setSelectedCardId(null)
      return
    }

    try {
      await addToNotion(card.rawData)
      markCardCompleted(selectedCardId)
      alert('Notion에 업로드되었습니다.')
    } catch (err) {
      console.error('Notion 업로드 실패:', err)
    } finally {
      setSelectedCardId(null)
    }
  }

  const handleDeleteSingle = async () => {
    if (selectedCardId) {
      try {
        await api.delete(`/records/${selectedCardId}`)
        setCards(cards.filter((card) => card.id !== selectedCardId))
        setSelectedCardId(null)
      } catch (err) {
        console.error('삭제 실패:', err)
      }
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('google_provider_token')
    supabase.auth.signOut()
  }

  const hasAnalyzing = cards.some((card) => card.status === 'analyzing')
  const hasTemporary = cards.some((card) => card.status === 'temporary')

  return (
    <div className="min-h-full p-8 pb-16" style={{ background: 'var(--app-bg)' }}>
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            {user?.user_metadata?.avatar_url && (
              <img
                src={user.user_metadata.avatar_url}
                alt="profile"
                className="w-9 h-9 rounded-full"
              />
            )}
            <h3 style={{ color: 'var(--text-secondary)' }}>
              {user?.user_metadata?.name || user?.email}
            </h3>
          </div>

          <div className="flex items-center gap-4">
            {/* Upload progress indicator */}
            {(hasAnalyzing || isUploading) && (
              <div className="flex items-center gap-2 mr-2">
                <div
                  className="w-2 h-2 rounded-full animate-pulse"
                  style={{ background: 'var(--status-analyzing)' }}
                />
                <small style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                  {isUploading ? 'Uploading...' : 'Analyzing...'}
                </small>
              </div>
            )}

            <button
              onClick={fetchRecords}
              className="p-2 rounded-full transition-all hover:opacity-80"
              style={{ color: 'var(--text-secondary)' }}
            >
              <RefreshIcon />
            </button>

            <button
              onClick={handleLogout}
              className="p-2 rounded-full transition-all hover:opacity-80"
              style={{ color: 'var(--text-secondary)' }}
            >
              <LogoutIcon />
            </button>

            <button
              onClick={onNavigateToSettings}
              className="p-2 rounded-full transition-all hover:opacity-80"
              style={{ color: 'var(--text-secondary)' }}
            >
              <SettingsIcon />
            </button>
          </div>
        </div>

        {/* Tabs and actions */}
        <div className="flex items-center justify-between">
          <div className="flex gap-6">
            {['전체', '일정', '메모'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="pb-2 transition-all"
                style={{
                  fontSize: '16px',
                  color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-secondary)',
                  borderBottom:
                    activeTab === tab ? '2px solid var(--action-primary)' : '2px solid transparent'
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {isBulkSelectMode && (
              <>
                <button
                  onClick={handleBulkUpload}
                  disabled={selectedCards.size === 0 || isUploading}
                  className="px-5 py-2 rounded-2xl transition-all disabled:opacity-40"
                  style={{
                    background: 'var(--action-primary)',
                    color: '#FFFFFF'
                  }}
                >
                  업로드
                </button>
                <button
                  onClick={handleBulkDeleteClick}
                  disabled={selectedCards.size === 0}
                  className="px-5 py-2 rounded-2xl transition-all disabled:opacity-40"
                  style={{
                    background: 'var(--surface-primary)',
                    color: 'var(--text-secondary)'
                  }}
                >
                  삭제
                </button>
              </>
            )}

            <button
              onClick={handleToggleBulkSelect}
              className="transition-all"
              style={{
                marginLeft: '2px',
                color: isBulkSelectMode ? 'var(--action-primary)' : 'var(--text-secondary)'
              }}
            >
              {isBulkSelectMode ? '취소' : '전체 선택'}
            </button>
          </div>
        </div>
      </div>

      {/* Cards grid */}
      <div className="max-w-6xl mx-auto">
        {loading ? (
          <div className="text-center py-20" style={{ color: 'var(--text-secondary)' }}>
            <div className="flex justify-center mb-2">
              <div className="w-8 h-8 border-3 border-current border-t-transparent rounded-full animate-spin mb-2" />
            </div>
            <div>로딩 중</div>
          </div>
        ) : filteredCards.length === 0 ? (
          <div className="text-center py-20" style={{ color: 'var(--text-secondary)' }}>
            <div>저장된 항목이 없습니다</div>
            <div className="text-sm mt-2">Cmd+Shift+Space로 새 항목을 추가하세요!</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCards.map((card) => (
              <CardItem
                key={card.id}
                {...card}
                isSelected={selectedCards.has(card.id)}
                showCheckbox={isBulkSelectMode}
                onSelect={handleCardSelect}
                onClick={handleCardClick}
              />
            ))}
          </div>
        )}
      </div>

      {/* Card Detail Popover */}
      {selectedCard && (
        <CardDetail
          {...selectedCard}
          onClose={() => setSelectedCardId(null)}
          onUpload={handleUploadSingle}
          onDelete={handleDeleteSingle}
        />
      )}

      {/* Bulk Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={showBulkDeleteConfirm}
        title="삭제 확인"
        message={`선택한 ${selectedCards.size}개 항목을 정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`}
        confirmText="예"
        cancelText="아니오"
        onConfirm={handleBulkDelete}
        onCancel={() => setShowBulkDeleteConfirm(false)}
        isDanger={true}
      />
    </div>
  )
}

export default Home
