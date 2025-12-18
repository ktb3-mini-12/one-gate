// CardItem용 상태 설정 (카드 목록에서 사용)
export const cardStatusConfig = {
  pending: { label: '진행 중', color: 'var(--action-primary)', glow: 'rgba(59, 130, 246, 0.3)' },
  analyzed: { label: '완료', color: 'var(--status-completed)', glow: 'rgba(16, 185, 129, 0.3)' },
  failed: { label: '실패', color: '#EF4444', glow: 'rgba(239, 68, 68, 0.4)' }
}

// CardDetail용 상태 설정 (상세 모달에서 사용)
export const detailStatusConfig = {
  pending: { label: '진행 중', color: 'var(--action-primary)', glow: 'rgba(59, 130, 246, 0.4)' },
  analyzed: { label: '완료', color: 'var(--status-completed)', glow: 'rgba(16, 185, 129, 0.4)' },
  completed: { label: '완료', color: 'var(--status-completed)', glow: 'rgba(16, 185, 129, 0.4)' },
  failed: { label: '실패', color: '#EF4444', glow: 'rgba(239, 68, 68, 0.4)' }
}

// 카테고리 타입 설정 (공용)
export const categoryTypeConfig = {
  일정: {
    color: '#4285F4',
    bg: 'rgba(66, 133, 244, 0.15)',
    border: 'rgba(66, 133, 244, 0.3)',
    icon: '📅'
  },
  메모: {
    color: '#9AA0A6',
    bg: 'rgba(154, 160, 166, 0.15)',
    border: 'rgba(154, 160, 166, 0.3)',
    icon: '📝'
  }
}

// 반복 옵션 (CardDetail에서 사용)
export const recurrenceOptions = [
  { value: '', label: '없음' },
  { value: 'daily', label: '매일' },
  { value: 'weekly', label: '매주' },
  { value: 'monthly', label: '매월' },
  { value: 'yearly', label: '매년' }
]
