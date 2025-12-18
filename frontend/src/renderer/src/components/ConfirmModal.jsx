import React from 'react'

export function ConfirmModal({
  isOpen,
  title = '확인',
  message = '정말 삭제하시겠습니까?',
  confirmText = '확인',
  cancelText = '취소',
  onConfirm,
  onCancel,
  isDanger = true
}) {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-6 z-50"
      style={{ background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(8px)' }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-[24px] overflow-hidden animate-scale-in"
        style={{
          background:
            'linear-gradient(180deg, var(--surface-elevated) 0%, var(--surface-primary) 100%)',
          border: '1px solid var(--divider)',
          boxShadow: 'var(--shadow-deep)'
        }}
      >
        {/* Header with Icon */}
        <div className="pt-8 pb-4 px-6 text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center">
            <span style={{ fontSize: '24px' }}>{isDanger ? '⚠️' : '❓'}</span>
          </div>

          <h3 style={{ color: 'var(--text-primary)', fontSize: '18px', fontWeight: '600' }}>
            {title}
          </h3>
        </div>

        {/* Content */}
        <div className="px-6 pb-6">
          <p
            className="mb-6 text-center"
            style={{ color: 'var(--text-secondary)', lineHeight: '1.6', fontSize: '14px' }}
          >
            {message}
          </p>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 py-3 rounded-xl transition-all hover:opacity-80"
              style={{
                background: 'var(--surface-gradient-top)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--divider)',
                fontWeight: '500',
                fontSize: '14px'
              }}
            >
              {cancelText}
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 py-3 rounded-xl transition-all hover:opacity-90"
              style={{
                background: isDanger ? 'var(--status-error)' : 'var(--action-primary)',
                color: '#fff',
                fontWeight: '500',
                fontSize: '14px'
              }}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ConfirmModal
