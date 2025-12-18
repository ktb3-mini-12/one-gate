import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { api, API_BASE_URL } from '../lib/api'
import { CardItem } from './CardItem'
import { CardDetail } from './CardDetail'
import { ConfirmModal } from './ConfirmModal'
import { Toast } from './ui/Toast'
import { SettingsIcon, RefreshIcon, LogoutIcon } from './ui/Icons'

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
        const now = new Date()
        const transformedCards = (res.data?.data || []).map((record) => {
          const createdAt = record.created_at ? new Date(record.created_at) : null
          const pendingMinutes = createdAt ? (now - createdAt) / 1000 / 60 : 0
          const isStale = record.status === 'PENDING' && pendingMinutes > 2

          return {
            id: String(record.id),
            summary: record.result?.summary || record.text,
            category: record.category?.name || 'general',
            date: createdAt ? createdAt.toLocaleDateString('ko-KR') : '',
            status: record.status?.toLowerCase() || 'pending',
            categoryType: record.type === 'CALENDAR' ? '일정' : '메모',
            isStale,
            rawData: record
          }
        })
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
  }, [user?.id])

  // SSE: analysis completion / record updates with auto-reconnect
  const [sseStatus, setSseStatus] = useState('connecting')

  useEffect(() => {
    if (!user?.id) return

    let es = null
    let reconnectAttempts = 0
    let reconnectTimer = null
    const maxReconnectAttempts = 5
    const baseDelay = 1000

    const applyRecordEvent = (payload) => {
      const recordId = payload?.record_id
      if (!recordId) return

      setCards((prev) => {
        const id = String(recordId)
        const exists = prev.some((c) => c.id === id)
        if (!exists) {
          queueMicrotask(() => fetchRecords())
          return prev
        }

        return prev.map((card) => {
          if (card.id !== id) return card

          const nextRaw = {
            ...card.rawData,
            status: payload?.status || card.rawData?.status,
            result: payload?.analysis_data || card.rawData?.result
          }

          if (payload?.analysis_data?.type) {
            nextRaw.type = payload.analysis_data.type
          }

          return {
            ...card,
            rawData: nextRaw,
            status: (nextRaw.status || card.rawData?.status || 'PENDING').toLowerCase(),
            summary: nextRaw.result?.summary || nextRaw.text || card.summary,
            categoryType: nextRaw.type === 'CALENDAR' ? '일정' : '메모'
          }
        })
      })
    }

    const connect = () => {
      const streamUrl = `${API_BASE_URL}/records/stream?user_id=${encodeURIComponent(user.id)}`
      es = new EventSource(streamUrl)
      setSseStatus('connecting')

      es.addEventListener('connected', () => {
        setSseStatus('connected')
        reconnectAttempts = 0
      })

      // record_created: 새 PENDING 카드 추가 (전체 재조회 없이 즉시 추가)
      es.addEventListener('record_created', (evt) => {
        try {
          const payload = JSON.parse(evt.data)
          const recordId = payload?.record_id
          if (!recordId) return

          // 새 카드를 목록 최상단에 추가
          const newCard = {
            id: String(recordId),
            summary: payload.text || '분석 중...',
            category: 'general',
            date: payload.created_at
              ? new Date(payload.created_at).toLocaleDateString('ko-KR')
              : new Date().toLocaleDateString('ko-KR'),
            status: 'pending',
            categoryType: payload.type === 'CALENDAR' ? '일정' : '메모',
            isStale: false,
            rawData: {
              id: recordId,
              status: 'PENDING',
              type: payload.type || 'MEMO',
              text: payload.text,
              created_at: payload.created_at
            }
          }

          setCards((prev) => {
            // 이미 존재하면 추가하지 않음
            if (prev.some((c) => c.id === String(recordId))) return prev
            return [newCard, ...prev]
          })
        } catch (e) {
          console.error('SSE record_created parse error:', e)
        }
      })

      es.addEventListener('analysis_completed', (evt) => {
        try {
          applyRecordEvent(JSON.parse(evt.data))
        } catch (e) {
          console.error('SSE parse error:', e)
        }
      })

      es.addEventListener('record_updated', (evt) => {
        try {
          applyRecordEvent(JSON.parse(evt.data))
        } catch (e) {
          console.error('SSE parse error:', e)
        }
      })

      es.onerror = () => {
        es.close()
        setSseStatus('disconnected')

        if (reconnectAttempts < maxReconnectAttempts) {
          const delay = baseDelay * Math.pow(2, reconnectAttempts)
          reconnectAttempts++
          console.log(`SSE reconnecting in ${delay}ms (attempt ${reconnectAttempts})`)
          reconnectTimer = setTimeout(connect, delay)
        } else {
          console.error('SSE max reconnect attempts reached')
          showToast('실시간 연결이 끊어졌습니다. 새로고침해주세요.', 'error')
        }
      }
    }

    connect()

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (es) es.close()
    }
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

  // 카드를 UI에서 제거
  const removeCardFromUI = (cardId) => {
    setCards((prev) => prev.filter((card) => card.id !== String(cardId)))
  }

  const handleBulkUpload = async () => {
    const googleToken = localStorage.getItem('google_provider_token')

    setIsUploading(true)
    let successCount = 0
    let failedCount = 0
    const newFailedIds = new Set()

    try {
      for (const cardId of selectedCards) {
        const card = cards.find((c) => c.id === cardId)
        if (!card) continue

        if (card.rawData?.status !== 'ANALYZED') {
          continue
        }

        const recordType = card.rawData?.result?.type || card.rawData?.type
        if (recordType === 'CALENDAR' && !googleToken) {
          newFailedIds.add(cardId)
          failedCount++
          continue
        }

        try {
          const res = await api.post(
            `/records/${cardId}/upload`,
            { final_data: null },
            {
              headers: recordType === 'CALENDAR' ? { 'X-Google-Token': googleToken } : {}
            }
          )

          if (res.data?.status === 'success') {
            removeCardFromUI(cardId)
            successCount++
          }
        } catch (err) {
          console.error(`업로드 실패 (${cardId}):`, err)
          newFailedIds.add(cardId)
          failedCount++
        }
      }

      // 실패한 카드 표시
      if (newFailedIds.size > 0) {
        setFailedCardIds((prev) => new Set([...prev, ...newFailedIds]))
      }

      if (successCount > 0) {
        showToast(`${successCount}개 항목이 업로드되었습니다.`, 'success')
      }
      if (failedCount > 0) {
        showToast(`${failedCount}개 항목 업로드에 실패했습니다.`, 'error')
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

  // 업로드 실패한 카드 ID 추적 (UI 전용)
  const [failedCardIds, setFailedCardIds] = useState(new Set())

  const handleUploadSingle = async (finalData = null) => {
    if (!selectedCardId) return

    const googleToken = localStorage.getItem('google_provider_token')
    const card = cards.find((c) => c.id === selectedCardId)
    if (!card?.rawData) return

    if (card.rawData?.status !== 'ANALYZED') {
      showToast('분석이 완료된 항목만 업로드할 수 있습니다.', 'error')
      return
    }

    // CALENDAR 타입인데 Google 토큰이 없으면 에러
    const recordType = finalData?.type || card.rawData?.result?.type || card.rawData?.type
    if (recordType === 'CALENDAR' && !googleToken) {
      showToast('Google 토큰이 없습니다. 재로그인 해주세요.', 'error')
      return
    }

    setIsUploading(true)
    // 실패 상태 초기화
    setFailedCardIds((prev) => {
      const next = new Set(prev)
      next.delete(selectedCardId)
      return next
    })

    try {
      const res = await api.post(
        `/records/${selectedCardId}/upload`,
        { final_data: finalData },
        {
          headers: recordType === 'CALENDAR' ? { 'X-Google-Token': googleToken } : {}
        }
      )

      if (res.data?.status === 'success') {
        const uploadType = res.data?.data?.type
        if (uploadType === 'calendar') {
          showToast('Google 캘린더에 등록되었습니다.', 'success')
        } else {
          showToast('Notion에 업로드되었습니다.', 'success')
        }
        // 성공 시 화면에서 제거
        removeCardFromUI(selectedCardId)
      }
    } catch (err) {
      console.error('업로드 실패:', err)
      showToast('업로드 중 오류가 발생했습니다.', 'error')
      // 실패 시 카드에 실패 표시
      setFailedCardIds((prev) => new Set(prev).add(selectedCardId))
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
                uploadFailed={failedCardIds.has(card.id)}
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
