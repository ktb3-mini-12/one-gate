import React, { useState } from 'react'
import { ConfirmModal } from './ConfirmModal'
import {
  detailStatusConfig as statusConfig,
  categoryTypeConfig,
  recurrenceOptions
} from '../lib/constants'

// datetime-local input용 변환
const formatDateTimeForInput = (isoString) => {
  if (!isoString) return ''
  try {
    const date = new Date(isoString)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day}T${hours}:${minutes}`
  } catch {
    return ''
  }
}

// date input용 변환
const formatDateForInput = (dateString) => {
  if (!dateString) return ''
  try {
    return dateString.slice(0, 10)
  } catch {
    return ''
  }
}

// 공통 input 스타일
const inputStyle = {
  background: 'var(--surface-gradient-top)',
  color: 'var(--text-primary)',
  fontSize: '14px'
}

export function CardDetail({
  summary,
  category,
  categoryType,
  date,
  status,
  rawData,
  onClose,
  onUpload,
  onDelete,
  isUploading,
  uploadFailed,
  failReason
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [validationError, setValidationError] = useState(null)

  // 업로드 실패 시 failed 상태로 표시 (CardItem과 동일한 로직)
  const effectiveStatus = uploadFailed ? 'failed' : status
  const config = statusConfig[effectiveStatus] || statusConfig.pending
  const typeConfig = categoryTypeConfig[categoryType] || categoryTypeConfig['메모']

  // 실패 시 라벨에 원인 표시
  const statusLabel =
    effectiveStatus === 'failed' && failReason ? `${config.label} (${failReason})` : config.label

  const isTemporary = status === 'analyzed'
  const isCalendar = rawData?.type === 'CALENDAR'
  const analysis = rawData?.result || {}
  const originalText = rawData?.text || ''

  // 초기값 설정
  const initialBody =
    typeof analysis.body === 'string'
      ? analysis.body
      : typeof analysis.content === 'string'
        ? analysis.content
        : ''

  // 공통 State
  const [draftSummary, setDraftSummary] = useState(analysis.summary || summary || '')

  // CALENDAR State
  const [draftStartTime, setDraftStartTime] = useState(formatDateTimeForInput(analysis.start_time))
  const [draftEndTime, setDraftEndTime] = useState(formatDateTimeForInput(analysis.end_time))
  const [draftAllDay, setDraftAllDay] = useState(analysis.all_day || false)
  const [draftLocation, setDraftLocation] = useState(analysis.location || '')
  const [draftAttendees, setDraftAttendees] = useState(
    Array.isArray(analysis.attendees) ? analysis.attendees.join(', ') : ''
  )
  const [draftRecurrence, setDraftRecurrence] = useState(analysis.recurrence || '')

  // MEMO State
  const [draftBody, setDraftBody] = useState(initialBody)
  const [draftDueDate, setDraftDueDate] = useState(formatDateForInput(analysis.due_date))

  const validateBeforeUpload = (data, type) => {
    if (!data?.summary?.trim()) {
      return { valid: false, error: '제목을 입력해주세요.' }
    }
    if (type === 'CALENDAR' && !data.start_time && !data.end_time && !data.all_day) {
      console.warn('일정 시간이 없습니다. 기본 시간이 적용됩니다.')
    }
    return { valid: true }
  }

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true)
  }

  const handleUploadClick = () => {
    setValidationError(null)

    // finalData 구성
    let finalData = { ...analysis, summary: draftSummary }

    if (isCalendar) {
      // CALENDAR 타입
      finalData.start_time = draftStartTime ? new Date(draftStartTime).toISOString() : null
      finalData.end_time = draftEndTime ? new Date(draftEndTime).toISOString() : null
      finalData.all_day = draftAllDay
      finalData.location = draftLocation || null
      finalData.attendees = draftAttendees
        ? draftAttendees
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : []
      finalData.recurrence = draftRecurrence || null
    } else {
      // MEMO 타입
      finalData.body = draftBody
      finalData.content = draftBody
      finalData.due_date = draftDueDate || null
    }

    // 입력 검증
    const validation = validateBeforeUpload(finalData, rawData?.type)
    if (!validation.valid) {
      setValidationError(validation.error)
      return
    }

    onUpload?.(finalData)
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
          className="w-full max-w-md rounded-[28px] overflow-hidden animate-scale-in max-h-[90vh] overflow-y-auto"
          style={{
            background:
              'linear-gradient(180deg, var(--surface-elevated) 0%, var(--surface-primary) 100%)',
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
              <small style={{ color: config.color, fontWeight: '500' }}>{statusLabel}</small>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 pb-6">
            {/* 원본 (수정 불가) */}
            {originalText && (
              <div
                className="mb-4 p-3 rounded-xl"
                style={{ background: 'var(--surface-secondary)' }}
              >
                <label className="block text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>
                  원본
                </label>
                <p className="text-sm line-clamp-3" style={{ color: 'var(--text-secondary)' }}>
                  {originalText}
                </p>
              </div>
            )}

            {/* Divider */}
            <div
              className="h-px mb-4"
              style={{
                background: 'linear-gradient(90deg, transparent, var(--divider), transparent)'
              }}
            />

            {/* 제목 (공통) */}
            {isTemporary ? (
              <div className="mb-4">
                <label className="block text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>
                  제목
                </label>
                <input
                  value={draftSummary}
                  onChange={(e) => setDraftSummary(e.target.value)}
                  className="w-full border-none outline-none rounded-xl px-4 py-2.5"
                  style={inputStyle}
                  disabled={isUploading}
                  placeholder="제목을 입력하세요"
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

            {/* CALENDAR 타입 필드 */}
            {isTemporary && isCalendar && (
              <div className="space-y-3 mb-4">
                {/* 시작 시간 */}
                <div>
                  <label className="block text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>
                    시작 시간
                  </label>
                  <input
                    type="datetime-local"
                    value={draftStartTime}
                    onChange={(e) => setDraftStartTime(e.target.value)}
                    className="w-full border-none outline-none rounded-xl px-4 py-2.5"
                    style={inputStyle}
                    disabled={isUploading || draftAllDay}
                  />
                </div>

                {/* 종료 시간 */}
                <div>
                  <label className="block text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>
                    종료 시간
                  </label>
                  <input
                    type="datetime-local"
                    value={draftEndTime}
                    onChange={(e) => setDraftEndTime(e.target.value)}
                    className="w-full border-none outline-none rounded-xl px-4 py-2.5"
                    style={inputStyle}
                    disabled={isUploading || draftAllDay}
                  />
                </div>

                {/* 하루 종일 */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draftAllDay}
                    onChange={(e) => setDraftAllDay(e.target.checked)}
                    className="w-4 h-4 rounded"
                    disabled={isUploading}
                  />
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    하루 종일
                  </span>
                </label>

                {/* 장소 */}
                <div>
                  <label className="block text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>
                    장소
                  </label>
                  <input
                    type="text"
                    value={draftLocation}
                    onChange={(e) => setDraftLocation(e.target.value)}
                    className="w-full border-none outline-none rounded-xl px-4 py-2.5"
                    style={inputStyle}
                    disabled={isUploading}
                    placeholder="장소를 입력하세요 (선택)"
                  />
                </div>

                {/* 참석자 */}
                <div>
                  <label className="block text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>
                    참석자 (쉼표로 구분)
                  </label>
                  <input
                    type="text"
                    value={draftAttendees}
                    onChange={(e) => setDraftAttendees(e.target.value)}
                    className="w-full border-none outline-none rounded-xl px-4 py-2.5"
                    style={inputStyle}
                    disabled={isUploading}
                    placeholder="홍길동, 김철수 (선택)"
                  />
                </div>

                {/* 반복 */}
                <div>
                  <label className="block text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>
                    반복
                  </label>
                  <select
                    value={draftRecurrence}
                    onChange={(e) => setDraftRecurrence(e.target.value)}
                    className="w-full border-none outline-none rounded-xl px-4 py-2.5"
                    style={inputStyle}
                    disabled={isUploading}
                  >
                    {recurrenceOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* MEMO 타입 필드 */}
            {isTemporary && !isCalendar && (
              <div className="space-y-3 mb-4">
                {/* 본문 */}
                <div>
                  <label className="block text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>
                    본문
                  </label>
                  <textarea
                    value={draftBody}
                    onChange={(e) => setDraftBody(e.target.value)}
                    className="w-full border-none outline-none resize-none rounded-xl px-4 py-3"
                    style={{
                      ...inputStyle,
                      minHeight: '100px'
                    }}
                    disabled={isUploading}
                    placeholder="내용을 입력하세요"
                  />
                </div>
              </div>
            )}

            {/* Meta Info */}
            <div className="flex items-center gap-3 mb-4">
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
                  background:
                    'linear-gradient(135deg, var(--action-primary), var(--action-primary-hover))',
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
