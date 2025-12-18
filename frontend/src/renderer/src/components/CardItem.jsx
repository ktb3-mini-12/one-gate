import React from 'react'

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

export function CardItem({
  id,
  summary,
  category,
  categoryType,
  date,
  status,
  imageUrl,
  isSelected,
  showCheckbox,
  onSelect,
  onClick
}) {
  const config = statusConfig[status] || statusConfig.pending
  const typeConfig = categoryTypeConfig[categoryType] || categoryTypeConfig['메모']

  return (
    <div
      onClick={() => onClick?.(id)}
      className="card-premium p-5 cursor-pointer transition-all hover:translate-y-[-2px]"
      style={{
        position: 'relative',
        borderColor: isSelected ? 'var(--action-primary)' : undefined,
        boxShadow: isSelected ? 'var(--shadow-glow-blue)' : undefined
      }}
    >
      {/* Checkbox */}
      {showCheckbox && (
        <div style={{ position: 'absolute', top: '16px', right: '16px', zIndex: 10 }}>
          <div
            onClick={(e) => {
              e.stopPropagation()
              onSelect?.(id)
            }}
            className="w-5 h-5 rounded-md flex items-center justify-center cursor-pointer transition-all"
            style={{
              background: isSelected ? 'var(--action-primary)' : 'var(--surface-secondary)',
              border: isSelected ? 'none' : '1px solid var(--divider)'
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

      {/* Image */}
      {imageUrl && (
        <div className="-mx-5 -mt-5 mb-4">
          <img
            src={imageUrl}
            alt=""
            className="w-full h-36 object-cover"
            style={{ borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0' }}
          />
        </div>
      )}

      {/* Category Badge */}
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

      {/* Summary */}
      <p
        className="mb-4 line-clamp-2"
        style={{
          color: 'var(--text-primary)',
          fontSize: '14px',
          fontWeight: '500',
          lineHeight: '1.6',
          paddingRight: showCheckbox ? '28px' : '0'
        }}
      >
        {summary}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between">
        {/* Status */}
        <div className="flex items-center gap-2">
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: config.color }}
          />
          <span style={{ color: config.color, fontSize: '12px', fontWeight: '500' }}>
            {config.label}
          </span>
        </div>

        {/* Meta */}
        <div className="flex items-center gap-2">
          {category && category !== 'general' && (
            <span
              className="px-2 py-0.5 rounded text-xs"
              style={{
                background: 'var(--surface-secondary)',
                color: 'var(--text-tertiary)'
              }}
            >
              #{category}
            </span>
          )}
          <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>
            {date}
          </span>
        </div>
      </div>
    </div>
  )
}

export default CardItem
