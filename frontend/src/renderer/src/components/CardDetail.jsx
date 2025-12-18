import React, { useState } from 'react'
import { ConfirmModal } from './ConfirmModal'

const statusConfig = {
  pending: {
    label: '진행 중',
    color: 'var(--status-analyzing)',
    bg: 'rgba(245, 158, 11, 0.1)'
  },
  completed: {
    label: '완료',
    color: 'var(--status-completed)',
    bg: 'rgba(16, 185, 129, 0.1)'
  }
}

const categoryTypeConfig = {
  '일정': {
    color: 'var(--google-blue)',
    bg: 'rgba(66, 133, 244, 0.1)',
    border: 'rgba(66, 133, 244, 0.2)'
  },
  '메모': {
    color: 'var(--action-secondary)',
    bg: 'rgba(99, 102, 241, 0.1)',
    border: 'rgba(99, 102, 241, 0.2)'
  }
}

export function CardDetail({ summary, category, categoryType, date, status, imageUrl, onClose, onUpload, onDelete, isUploading }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const config = statusConfig[status] || statusConfig.pending
  const typeConfig = categoryTypeConfig[categoryType] || categoryTypeConfig['메모']

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true)
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
        style={{ background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(8px)' }}
        onClick={onClose}
      >
        {/* Modal */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="animate-scale-in"
          style={{
            width: '100%',
            maxWidth: '400px',
            borderRadius: 'var(--radius-xl)',
            overflow: 'hidden',
            background: 'var(--surface-primary)',
            border: '1px solid var(--divider)',
            boxShadow: 'var(--shadow-deep)'
          }}
        >
          {/* Image */}
          {imageUrl && (
            <div style={{ position: 'relative' }}>
              <img
                src={imageUrl}
                alt=""
                style={{ width: '100%', maxHeight: '200px', objectFit: 'cover' }}
              />
              <button
                onClick={onClose}
                className="absolute top-3 right-3 w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:opacity-80"
                style={{
                  background: 'rgba(0, 0, 0, 0.5)',
                  color: 'var(--text-primary)',
                  border: 'none'
                }}
              >
                ✕
              </button>
            </div>
          )}

          {/* Header */}
          <div style={{ padding: imageUrl ? '16px 20px 0' : '20px 20px 0' }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{
                    background: typeConfig.bg,
                    color: typeConfig.color,
                    border: `1px solid ${typeConfig.border}`
                  }}
                >
                  {categoryType}
                </span>
                <div
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md"
                  style={{ background: config.bg }}
                >
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: config.color }} />
                  <span style={{ color: config.color, fontSize: '11px', fontWeight: '500' }}>
                    {config.label}
                  </span>
                </div>
              </div>

              {!imageUrl && (
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:opacity-70"
                  style={{
                    background: 'var(--surface-secondary)',
                    color: 'var(--text-secondary)',
                    border: 'none'
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Content */}
          <div style={{ padding: '0 20px 20px' }}>
            <p style={{ color: 'var(--text-primary)', fontSize: '15px', fontWeight: '500', lineHeight: '1.7', marginBottom: '12px' }}>
              {summary}
            </p>

            <div className="flex items-center gap-2 mb-5">
              {category && category !== 'general' && (
                <span
                  className="px-2 py-1 rounded-md text-xs"
                  style={{ background: 'var(--surface-secondary)', color: 'var(--text-tertiary)' }}
                >
                  #{category}
                </span>
              )}
              <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>{date}</span>
            </div>

            {/* Divider */}
            <div style={{ height: '1px', marginBottom: '16px', background: 'var(--divider)' }} />

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={handleDeleteClick}
                disabled={isUploading}
                className="flex-1 py-3 rounded-xl font-medium transition-all hover:opacity-80 disabled:opacity-40"
                style={{
                  background: 'var(--surface-secondary)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--divider)'
                }}
              >
                삭제
              </button>

              <button
                onClick={onUpload}
                disabled={isUploading}
                className="flex-1 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-60"
                style={{
                  background: 'var(--action-primary)',
                  color: '#fff',
                  border: 'none',
                  boxShadow: 'var(--shadow-glow-blue)'
                }}
              >
                {isUploading ? (
                  <>
                    <div
                      className="w-4 h-4 rounded-full animate-spin"
                      style={{ border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff' }}
                    />
                    업로드 중...
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    업로드
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation */}
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
