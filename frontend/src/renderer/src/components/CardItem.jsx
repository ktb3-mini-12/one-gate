import React from 'react'

const statusConfig = {
  analyzing: { label: '분석 중', color: 'var(--status-analyzing)' },
  temporary: { label: '임시 저장', color: 'var(--status-temporary)' },
  completed: { label: '완료', color: 'var(--status-completed)' }
}

export function CardItem({
  id,
  summary,
  category,
  date,
  status,
  isSelected,
  showCheckbox,
  onSelect,
  onClick
}) {
  const config = statusConfig[status]
  const shouldReserveCheckboxSpace = showCheckbox && status === 'temporary'

  return (
    <div
      onClick={() => onClick?.(id)}
      className="group relative rounded-[28px] p-6 transition-all duration-200 cursor-pointer hover:scale-[1.02]"
      style={{
        background: 'var(--surface-primary)',
        border: isSelected ? '2px solid var(--action-primary)' : '2px solid transparent'
      }}
    >
      {shouldReserveCheckboxSpace && (
        <div className="absolute top-6 right-6">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => {
              e.stopPropagation()
              onSelect?.(id)
            }}
            className="w-4 h-4 rounded-lg cursor-pointer"
            style={{
              accentColor: 'var(--action-primary)'
            }}
          />
        </div>
      )}

      <div className={`flex items-start gap-3 mb-4 ${shouldReserveCheckboxSpace ? 'pr-10' : ''}`}>
        <div
          className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
            status === 'analyzing' ? 'animate-pulse' : ''
          }`}
          style={{ background: config.color }}
        />
        <div className="flex-1 min-w-0 overflow-hidden">
          <p className="truncate mb-2" style={{ color: 'var(--text-primary)' }}>
            {summary}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
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

      <div className="absolute bottom-6 left-6">
        <small style={{ color: config.color, fontSize: '12px' }}>{config.label}</small>
      </div>
    </div>
  )
}

export default CardItem
