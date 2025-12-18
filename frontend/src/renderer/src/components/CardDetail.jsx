import React, { useState } from 'react'
import { ConfirmModal } from './ConfirmModal'

const statusConfig = {
  pending: { label: '분석 중', color: 'var(--action-primary)', glow: 'rgba(59, 130, 246, 0.4)' },
  analyzed: { label: '임시 저장', color: 'var(--status-analyzing)', glow: 'rgba(245, 158, 11, 0.45)' },
  completed: { label: '완료', color: 'var(--status-completed)', glow: 'rgba(16, 185, 129, 0.4)' }
}

const categoryTypeConfig = {
  '일정': { color: '#4285F4', bg: 'rgba(66, 133, 244, 0.15)', border: 'rgba(66, 133, 244, 0.3)', icon: '📅' },
  '메모': { color: '#9AA0A6', bg: 'rgba(154, 160, 166, 0.15)', border: 'rgba(154, 160, 166, 0.3)', icon: '📝' }
}

export function CardDetail({ summary, category, categoryType, date, status, rawData, onClose, onUpload, onDelete, isUploading }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [validationError, setValidationError] = useState(null)
  const config = statusConfig[status] || statusConfig.pending
  const typeConfig = categoryTypeConfig[categoryType] || categoryTypeConfig['메모']

  const isTemporary = status === 'analyzed'
  const analysis = rawData?.result || {}
  const initialBody = typeof analysis.body === 'string'
    ? analysis.body
    : (typeof analysis.content === 'string' ? analysis.content : '')

  const [draftSummary, setDraftSummary] = useState(analysis.summary || summary || '')
  const [draftBody, setDraftBody] = useState(initialBody)

  const validateBeforeUpload = (data, type) => {
    if (!data?.summary?.trim()) {
      return { valid: false, error: '제목을 입력해주세요.' }
    }
    if (type === 'CALENDAR' && !data.start_time && !data.end_time) {
      // 시간이 없어도 fallback이 있으므로 경고만 표시
      console.warn('일정 시간이 없습니다. 기본 시간이 적용됩니다.')
    }
    return { valid: true }
  }

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true)
  }

  const handleUploadClick = () => {
    setValidationError(null)

    // 수정된 데이터가 있으면 final_data로 전달
    const hasChanges = draftSummary !== (analysis.summary || summary || '') ||
                       draftBody !== initialBody

    let finalData
    if (hasChanges) {
      finalData = { ...analysis, summary: draftSummary }
      if (Object.prototype.hasOwnProperty.call(analysis, 'body')) {
        finalData.body = draftBody
      } else {
        finalData.content = draftBody
      }
    } else {
      finalData = { ...analysis }
    }

    // 입력 검증
    const validation = validateBeforeUpload(finalData, rawData?.type)
    if (!validation.valid) {
      setValidationError(validation.error)
      return
    }

    onUpload?.(hasChanges ? finalData : null)
  }

  const handleConfirmDelete = () => {
    setShowDeleteConfirm(false)
    onDelete?.()
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 flex items-center justify-center p-6 z-40"
        style={{
          background: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(8px)'
        }}
        onClick={onClose}
      >
        {/* Modal */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md rounded-[28px] overflow-hidden animate-scale-in"
          style={{
            background: 'linear-gradient(180deg, var(--surface-elevated) 0%, var(--surface-primary) 100%)',
            border: '1px solid var(--divider)',
            boxShadow: 'var(--shadow-deep)'
          }}
        >
          {/* Header */}
          <div
            className="p-6 pb-4"
            style={{
              background: `linear-gradient(135deg, ${typeConfig.bg}, transparent)`
            }}
          >
            <div className="flex items-center justify-between mb-4">
              {/* Category Type */}
              <div className="flex items-center gap-2">
                <span style={{ fontSize: '20px' }}>{typeConfig.icon}</span>
                <span
                  className="px-3 py-1 rounded-xl text-sm font-medium"
                  style={{
                    background: typeConfig.bg,
                    color: typeConfig.color,
                    border: `1px solid ${typeConfig.border}`
                  }}
                >
                  {categoryType}
                </span>
              </div>

              {/* Close Button */}
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:opacity-70"
                style={{
                  background: 'var(--surface-gradient-top)',
                  color: 'var(--text-secondary)'
                }}
              >
                ✕
              </button>
            </div>

            {/* Status */}
            <div className="flex items-center gap-2">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{
                  background: config.color,
                  boxShadow: `0 0 10px ${config.glow}`
                }}
              />
              <small style={{ color: config.color, fontWeight: '500' }}>{config.label}</small>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 pb-6">
            {/* Summary */}
            {isTemporary ? (
              <div className="mb-4">
                <label className="block text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>
                  제목
                </label>
                <input
                  value={draftSummary}
                  onChange={(e) => setDraftSummary(e.target.value)}
                  className="w-full border-none outline-none rounded-2xl px-4 py-3"
                  style={{
                    background: 'var(--surface-gradient-top)',
                    color: 'var(--text-primary)',
                    fontSize: '15px',
                    fontWeight: '500'
                  }}
                  disabled={isUploading}
                />
              </div>
            ) : (
              <p
                className="mb-4"
                style={{
                  color: 'var(--text-primary)',
                  fontSize: '16px',
                  fontWeight: '500',
                  lineHeight: '1.6'
                }}
              >
                {summary}
              </p>
            )}

            {/* Meta Info */}
            <div className="flex items-center gap-3 mb-6">
              {category && category !== 'general' && (
                <span
                  className="px-3 py-1 rounded-lg"
                  style={{
                    background: 'var(--surface-gradient-top)',
                    color: 'var(--text-secondary)',
                    fontSize: '13px',
                    border: '1px solid var(--divider)'
                  }}
                >
                  #{category}
                </span>
              )}
              <small style={{ color: 'var(--text-tertiary)' }}>{date}</small>
            </div>

            {/* Divider */}
            <div
              className="h-px mb-5"
              style={{ background: 'linear-gradient(90deg, transparent, var(--divider), transparent)' }}
            />

            {/* Body (temporary only) */}
            {isTemporary && (
              <div className="mb-5">
                <label className="block text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>
                  본문
                </label>
                <textarea
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.target.value)}
                  className="w-full border-none outline-none resize-none rounded-2xl px-4 py-3"
                  style={{
                    background: 'var(--surface-gradient-top)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    minHeight: '120px'
                  }}
                  disabled={isUploading}
                />
              </div>
            )}

            {/* Validation Error */}
            {validationError && (
              <div
                className="mb-4 px-4 py-2 rounded-xl text-sm"
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#EF4444'
                }}
              >
                {validationError}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={handleDeleteClick}
                disabled={isUploading}
                className="flex-1 py-3 rounded-2xl transition-all hover:opacity-80 disabled:opacity-50"
                style={{
                  background: 'var(--surface-gradient-top)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--divider)',
                  fontWeight: '500',
                  fontSize: '14px'
                }}
              >
                삭제
              </button>

              <button
                onClick={handleUploadClick}
                disabled={isUploading || status === 'pending'}
                className="flex-1 py-3 rounded-2xl transition-all hover:opacity-90 disabled:opacity-70 flex items-center justify-center gap-2"
                style={{
                  background: 'linear-gradient(135deg, var(--action-primary), var(--action-primary-hover))',
                  color: '#fff',
                  fontWeight: '500',
                  fontSize: '14px',
                  boxShadow: 'var(--shadow-glow-blue)'
                }}
              >
                {isUploading ? (
                  <>
                    <div
                      className="w-4 h-4 rounded-full animate-spin"
                      style={{ border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff' }}
                    />
                    <span>업로드 중...</span>
                  </>
                ) : (
                  '업로드'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        title="삭제 확인"
        message="정말 삭제하시겠습니까?"
        confirmText="삭제"
        cancelText="취소"
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
        isDanger={true}
      />
    </>
  )
}

export default CardDetail
