import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'
import { CardItem } from './CardItem'
import { CardDetail } from './CardDetail'
import { ConfirmModal } from './ConfirmModal'

const { ipcRenderer } = window.require('electron')

// Toast Component
function Toast({ message, type, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div
      className="fixed top-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl flex items-center gap-3 z-50"
      style={{
        background: type === 'success'
          ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.95), rgba(5, 150, 105, 0.95))'
          : 'linear-gradient(135deg, rgba(239, 68, 68, 0.95), rgba(185, 28, 28, 0.95))',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(12px)',
        animation: 'slide-down 0.3s ease-out'
      }}
    >
      {type === 'success' && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
      <span style={{ color: '#fff', fontSize: '14px', fontWeight: '500' }}>{message}</span>
    </div>
  )
}

// Icon components
const SettingsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)

const RefreshIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10" />
    <polyline points="23 20 23 14 17 14" />
    <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
  </svg>
)

const LogoutIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
  const [toast, setToast] = useState(null)

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
  }

  // Fetch records from backend
  const fetchRecords = async () => {
    if (!user?.id) return

    setLoading(true)
    try {
      const res = await api.get('/records', { params: { user_id: user.id } })
      if (res.data?.status === 'success') {
        const transformedCards = (res.data?.data || []).map((record) => ({
          id: String(record.id),
          summary: record.text,
          category: record.category?.name || 'general',
          date: record.created_at ? new Date(record.created_at).toLocaleDateString('ko-KR') : '',
          status: record.status?.toLowerCase() || 'pending',
          categoryType: record.type === 'CALENDAR' ? '일정' : '메모',
          imageUrl: record.image_url || null,
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

  // 레코드 완료 처리 (soft delete)
  const completeRecord = async (recordId) => {
    try {
      await api.post(`/records/${recordId}/complete`)
      return true
    } catch (err) {
      console.error('완료 처리 실패:', err)
      return false
    }
  }

  // 카드를 UI에서 제거
  const removeCardFromUI = (cardId) => {
    setCards((prev) => prev.filter((card) => card.id !== String(cardId)))
  }

  const handleBulkUpload = async () => {
    const googleToken = localStorage.getItem('google_provider_token')

    setIsUploading(true)
    let successCount = 0

    try {
      for (const cardId of selectedCards) {
        const card = cards.find((c) => c.id === cardId)
        if (!card) continue

        let uploadSuccess = false

        if (card.rawData.type === 'CALENDAR') {
          if (!googleToken) continue
          try {
            await addToCalendar(card.rawData, googleToken)
            uploadSuccess = true
          } catch (err) {
            console.error('캘린더 등록 실패:', err)
          }
        } else {
          try {
            await addToNotion(card.rawData)
            uploadSuccess = true
          } catch (err) {
            console.error('노션 등록 실패:', err)
          }
        }

        if (uploadSuccess) {
          await completeRecord(cardId)
          removeCardFromUI(cardId)
          successCount++
        }
      }

      if (successCount > 0) {
        showToast(`${successCount}개 항목이 업로드되었습니다.`, 'success')
      }

      setSelectedCards(new Set())
      setIsBulkSelectMode(false)
    } catch (err) {
      console.error('업로드 실패:', err)
      showToast('업로드 중 오류가 발생했습니다.', 'error')
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
        summary: record.text,
        description: 'One Gate에서 등록된 일정',
        start_time: formatDateTime(tomorrow),
        end_time: formatDateTime(endTime)
      },
      {
        headers: { 'X-Google-Token': googleToken }
      }
    )

    if (res.data?.status !== 'success') {
      throw new Error(res.data?.message || 'Calendar upload failed')
    }

    return res.data
  }

  const addToNotion = async (record) => {
    // 새로운 OAuth 기반 API 사용
    const res = await api.post('/notion/save-memo', {
      user_id: user.id,
      title: record.text,
      category: record.category?.name || '메모',
      content_type: record.type || 'MEMO',
      body: record.result?.body || null
    })

    if (res.data?.status !== 'success') {
      throw new Error(res.data?.message || 'Notion upload failed')
    }

    return res.data
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
      showToast(`${selectedCards.size}개 항목이 삭제되었습니다.`, 'success')
    } catch (err) {
      console.error('삭제 실패:', err)
      showToast('삭제 중 오류가 발생했습니다.', 'error')
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
    if (!card?.rawData?.type) return

    setIsUploading(true)

    try {
      if (card.rawData.type === 'CALENDAR') {
        if (!googleToken) {
          showToast('Google 토큰이 없습니다. 재로그인 해주세요.', 'error')
          return
        }
        await addToCalendar(card.rawData, googleToken)
        showToast('Google 캘린더에 등록되었습니다.', 'success')
      } else {
        await addToNotion(card.rawData)
        showToast('Notion에 업로드되었습니다.', 'success')
      }

      // 완료 처리 후 UI에서 제거
      await completeRecord(selectedCardId)
      removeCardFromUI(selectedCardId)
    } catch (err) {
      console.error('업로드 실패:', err)
      showToast('업로드 중 오류가 발생했습니다.', 'error')
    } finally {
      setIsUploading(false)
      setSelectedCardId(null)
    }
  }

  const handleDeleteSingle = async () => {
    if (selectedCardId) {
      try {
        await api.delete(`/records/${selectedCardId}`)
        setCards(cards.filter((card) => card.id !== selectedCardId))
        setSelectedCardId(null)
        showToast('삭제되었습니다.', 'success')
      } catch (err) {
        console.error('삭제 실패:', err)
        showToast('삭제 중 오류가 발생했습니다.', 'error')
      }
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('google_provider_token')
    supabase.auth.signOut()
  }

  return (
    <div className="min-h-full p-8 pb-16" style={{ background: 'var(--app-bg)' }}>
      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Header */}
      <div className="max-w-6xl mx-auto mb-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            {user?.user_metadata?.avatar_url && (
              <img
                src={user.user_metadata.avatar_url}
                alt="profile"
                className="w-9 h-9 rounded-full"
                style={{ border: '2px solid var(--divider)' }}
              />
            )}
            <h3 style={{ color: 'var(--text-secondary)' }}>
              {user?.user_metadata?.name || user?.email}
            </h3>
          </div>

          <div className="flex items-center gap-4">
            {/* Upload progress indicator */}
            {isUploading && (
              <div className="flex items-center gap-2 mr-2">
                <div
                  className="w-2 h-2 rounded-full animate-pulse"
                  style={{ background: 'var(--action-primary)' }}
                />
                <small style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                  업로드 중...
                </small>
              </div>
            )}

            <button
              onClick={fetchRecords}
              className="p-2 rounded-xl transition-all hover:opacity-80"
              style={{ color: 'var(--text-secondary)' }}
            >
              <RefreshIcon />
            </button>

            <button
              onClick={handleLogout}
              className="p-2 rounded-xl transition-all hover:opacity-80"
              style={{ color: 'var(--text-secondary)' }}
            >
              <LogoutIcon />
            </button>

            <button
              onClick={onNavigateToSettings}
              className="p-2 rounded-xl transition-all hover:opacity-80"
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
                  fontWeight: activeTab === tab ? '600' : '500',
                  color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-secondary)',
                  borderBottom: activeTab === tab
                    ? '2px solid var(--action-primary)'
                    : '2px solid transparent'
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
                  className="px-5 py-2 rounded-xl transition-all disabled:opacity-40"
                  style={{
                    background: 'linear-gradient(135deg, var(--action-primary), var(--action-primary-hover))',
                    color: '#FFFFFF',
                    fontWeight: '500',
                    fontSize: '14px'
                  }}
                >
                  업로드 ({selectedCards.size})
                </button>
                <button
                  onClick={handleBulkDeleteClick}
                  disabled={selectedCards.size === 0}
                  className="px-5 py-2 rounded-xl transition-all disabled:opacity-40"
                  style={{
                    background: 'var(--surface-primary)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--divider)',
                    fontWeight: '500',
                    fontSize: '14px'
                  }}
                >
                  삭제
                </button>
              </>
            )}

            <button
              onClick={handleToggleBulkSelect}
              className="px-4 py-2 rounded-xl transition-all"
              style={{
                background: isBulkSelectMode ? 'var(--action-primary)' : 'transparent',
                color: isBulkSelectMode ? '#fff' : 'var(--text-secondary)',
                fontWeight: '500',
                fontSize: '14px'
              }}
            >
              {isBulkSelectMode ? '취소' : '선택'}
            </button>
          </div>
        </div>
      </div>

      {/* Cards grid */}
      <div className="max-w-6xl mx-auto">
        {loading ? (
          <div className="text-center py-20" style={{ color: 'var(--text-secondary)' }}>
            <div className="flex justify-center mb-4">
              <div
                className="w-8 h-8 rounded-full animate-spin"
                style={{ border: '2px solid var(--divider)', borderTopColor: 'var(--action-primary)' }}
              />
            </div>
            <div>로딩 중...</div>
          </div>
        ) : filteredCards.length === 0 ? (
          <div className="text-center py-20" style={{ color: 'var(--text-secondary)' }}>
            <div className="text-4xl mb-4">📭</div>
            <div style={{ fontSize: '16px', fontWeight: '500' }}>저장된 항목이 없습니다</div>
            <div className="text-sm mt-2" style={{ color: 'var(--text-tertiary)' }}>
              Cmd+Shift+Space로 새 항목을 추가하세요
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
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
          isUploading={isUploading}
        />
      )}

      {/* Bulk Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={showBulkDeleteConfirm}
        title="삭제 확인"
        message={`선택한 ${selectedCards.size}개 항목을 정말 삭제하시겠습니까?`}
        confirmText="삭제"
        cancelText="취소"
        onConfirm={handleBulkDelete}
        onCancel={() => setShowBulkDeleteConfirm(false)}
        isDanger={true}
      />

      {/* Animation styles */}
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
      `}</style>
    </div>
  )
}

export default Home
