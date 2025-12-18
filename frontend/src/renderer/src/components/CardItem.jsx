import React from 'react'

const statusConfig = {
  pending: { label: '진행 중', color: 'var(--action-primary)', glow: 'rgba(59, 130, 246, 0.3)' },
  analyzed: { label: '완료', color: 'var(--status-completed)', glow: 'rgba(16, 185, 129, 0.3)' },
  failed: { label: '실패', color: '#EF4444', glow: 'rgba(239, 68, 68, 0.4)' }
}

const categoryTypeConfig = {
  '일정': { color: '#4285F4', bg: 'rgba(66, 133, 244, 0.1)', border: 'rgba(66, 133, 244, 0.2)' },
  '메모': { color: '#9AA0A6', bg: 'rgba(154, 160, 166, 0.1)', border: 'rgba(154, 160, 166, 0.2)' }
}

export function CardItem({
  id,
  summary,
  category,
  categoryType,
  date,
  status,
  isSelected,
  showCheckbox,
  onSelect,
  onClick,
  uploadFailed,
  failReason
}) {
  // 업로드 실패 시 failed 상태로 표시
  const effectiveStatus = uploadFailed ? 'failed' : status
  const config = statusConfig[effectiveStatus] || statusConfig.pending

  // 실패 시 라벨에 원인 표시
  const statusLabel = effectiveStatus === 'failed' && failReason
    ? `${config.label} (${failReason})`
    : config.label
  const typeConfig = categoryTypeConfig[categoryType] || categoryTypeConfig['메모']

  return (
    <div
      onClick={() => onClick?.(id)}
      className="group relative rounded-[24px] p-5 transition-all duration-300 cursor-pointer"
      style={{
        background: isSelected
          ? 'linear-gradient(180deg, var(--surface-elevated) 0%, var(--surface-primary) 100%)'
          : 'linear-gradient(180deg, var(--surface-primary) 0%, var(--surface-secondary) 100%)',
        border: isSelected
          ? '1px solid var(--action-primary)'
          : '1px solid var(--divider)',
        boxShadow: isSelected ? 'var(--shadow-glow-blue)' : 'var(--shadow-sm)',
        transform: 'translateY(0)'
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          e.currentTarget.style.transform = 'translateY(-2px)'
          e.currentTarget.style.boxShadow = 'var(--shadow-md)'
          e.currentTarget.style.borderColor = 'var(--divider-light)'
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = 'var(--shadow-sm)'
          e.currentTarget.style.borderColor = 'var(--divider)'
        }
      }}
    >
      {/* Checkbox */}
      {showCheckbox && (
        <div className="absolute top-5 right-5">
          <div
            className="w-5 h-5 rounded-lg flex items-center justify-center cursor-pointer transition-all"
            onClick={(e) => {
              e.stopPropagation()
              onSelect?.(id)
            }}
            style={{
              background: isSelected
                ? 'var(--action-primary)'
                : 'var(--surface-gradient-top)',
              border: isSelected
                ? '1px solid var(--action-primary)'
                : '1px solid var(--divider-light)'
            }}
          >
            {isSelected && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </div>
        </div>
      )}

      {/* Category Type Badge */}
      <div className="mb-3">
        <span
          className="px-2.5 py-1 rounded-lg text-xs font-medium"
          style={{
            background: typeConfig.bg,
            color: typeConfig.color,
            border: `1px solid ${typeConfig.border}`
          }}
        >
          {categoryType}
        </span>
      </div>

      {/* Content */}
      <div className={`mb-4 ${showCheckbox ? 'pr-8' : ''}`}>
        <p
          className="line-clamp-2"
          style={{
            color: 'var(--text-primary)',
            fontSize: '15px',
            fontWeight: '500',
            lineHeight: '1.5'
          }}
        >
          {summary}
        </p>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        {/* Status */}
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{
              background: config.color,
              boxShadow: `0 0 8px ${config.glow}`
            }}
          />
          <small style={{ color: config.color, fontSize: '11px', fontWeight: '500' }}>
            {statusLabel}
          </small>
        </div>

        {/* Date & Category */}
        <div className="flex items-center gap-2">
          {category && category !== 'general' && (
            <span
              className="px-2 py-0.5 rounded-md"
              style={{
                background: 'var(--surface-gradient-top)',
                color: 'var(--text-secondary)',
                fontSize: '11px'
              }}
            >
              #{category}
            </span>
          )}
          <small style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>{date}</small>
        </div>
      </div>
    </div>
  )
}

export default CardItem
