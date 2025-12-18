import React from 'react'

export function ConfirmModal({
  isOpen,
  title = '확인',
  message = '정말 삭제하시겠습니까?',
  confirmText = '예',
  cancelText = '아니오',
  onConfirm,
  onCancel,
  isDanger = true
}) {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-8 z-50"
      style={{ background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(8px)' }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-[28px] p-8 text-center"
        style={{
          background: 'var(--surface-primary)',
          boxShadow: 'var(--shadow-deep)'
        }}
      >
        {/* Icon */}
        <div className="w-16 h-16 mx-auto rounded-full flex items-center justify-center">
          <span className="text-3xl">{isDanger ? '⚠️' : '❓'}</span>
        </div>

        {/* Title */}
        <h3
          className="mb-3"
          style={{ color: 'var(--text-primary)', fontSize: '18px', fontWeight: '600' }}
        >
          {title}
        </h3>

        {/* Message */}
        <p className="mb-8" style={{ color: 'var(--text-secondary)', lineHeight: '1.5' }}>
          {message}
        </p>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-6 py-3 rounded-2xl transition-all hover:opacity-80"
            style={{
              background: 'var(--surface-gradient-top)',
              color: 'var(--text-secondary)'
            }}
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-6 py-3 rounded-2xl transition-all hover:opacity-90"
            style={{
              background: isDanger ? '#EF4444' : 'var(--action-primary)',
              color: '#FFFFFF'
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmModal
