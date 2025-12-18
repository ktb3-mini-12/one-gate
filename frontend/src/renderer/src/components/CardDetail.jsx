import React, { useState } from 'react'
import { ConfirmModal } from './ConfirmModal'

const statusConfig = {
  analyzing: { label: '분석 중', color: 'var(--status-analyzing)' },
  temporary: { label: '임시 저장', color: 'var(--status-temporary)' },
  completed: { label: '완료', color: 'var(--status-completed)' }
}

export function CardDetail({ summary, category, date, status, onClose, onUpload, onDelete }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const config = statusConfig[status]

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true)
  }

  const handleConfirmDelete = () => {
    setShowDeleteConfirm(false)
    onDelete?.()
  }

  return (
    <>
      <div
        className="fixed inset-0 flex items-center justify-center p-8 z-40"
        style={{ background: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(8px)' }}
        onClick={onClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg rounded-[32px] p-8"
          style={{
            background: 'var(--surface-primary)',
            boxShadow: 'var(--shadow-deep)'
          }}
        >
          {/* Status indicator */}
          <div className="flex items-center gap-2 mb-6">
            <div className="w-3 h-3 rounded-full" style={{ background: config.color }} />
            <small style={{ color: config.color }}>{config.label}</small>
          </div>

          {/* Preview area */}
          <div
            className="w-full h-48 rounded-3xl mb-6 flex items-center justify-center"
            style={{ background: 'var(--surface-gradient-top)' }}
          >
            <span style={{ color: 'var(--text-secondary)' }}>Preview area</span>
          </div>

          {/* Content */}
          <div className="mb-6">
            <p
              className="mb-4"
              style={{
                color: 'var(--text-primary)',
                lineHeight: '1.6'
              }}
            >
              {summary}
            </p>

            <div className="flex items-center justify-between">
              <span
                className="px-3 py-1 rounded-full"
                style={{
                  background: 'var(--surface-gradient-top)',
                  color: 'var(--text-secondary)',
                  fontSize: '12px'
                }}
              >
                #{category}
              </span>
              <small style={{ color: 'var(--text-secondary)' }}>{date}</small>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            {status !== 'analyzing' && (
              <button
                onClick={handleDeleteClick}
                className="flex-1 px-6 py-3 rounded-2xl transition-all hover:opacity-80"
                style={{
                  background: 'var(--surface-gradient-top)',
                  color: 'var(--text-secondary)',
                  borderTop: '1px solid var(--divider)'
                }}
              >
                삭제
              </button>
            )}
            {status === 'temporary' && (
              <button
                onClick={onUpload}
                className="flex-1 px-6 py-3 rounded-2xl transition-all hover:opacity-90"
                style={{
                  background: 'var(--action-primary)',
                  color: '#FFFFFF'
                }}
              >
                업로드
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        title="삭제 확인"
        message="정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다."
        confirmText="예"
        cancelText="아니오"
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
        isDanger={true}
      />
    </>
  )
}

export default CardDetail
