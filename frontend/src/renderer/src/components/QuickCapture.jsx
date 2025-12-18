import React, { useState } from 'react'
import axios from 'axios'

export function QuickCapture({ onClose, onSaveSuccess }) {
  const [text, setText] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  const handleSave = async () => {
    if (text.trim()) {
      setIsAnalyzing(true)
      try {
        await axios.post('http://localhost:8000/analyze', {
          type: 'text',
          content: text
        })
        setText('')
        onSaveSuccess?.()
        onClose?.()
      } catch (err) {
        console.error('분석 실패:', err)
      } finally {
        setIsAnalyzing(false)
      }
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose?.()
    }
    if (e.key === 'Enter' && e.metaKey && !e.nativeEvent.isComposing && text.trim()) {
      handleSave()
    }
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-8 z-50"
      style={{ background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(8px)' }}
    >
      <div
        className="w-full max-w-2xl rounded-[32px] p-8"
        style={{
          background: 'var(--surface-primary)',
          boxShadow: 'var(--shadow-deep)'
        }}
      >
        <h2 className="mb-6" style={{ color: 'var(--text-primary)' }}>
          Quick Capture
        </h2>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type or paste anything... images, notes, screenshots"
          className="w-full h-48 border-none outline-none resize-none mb-6 p-4 rounded-3xl"
          style={{
            background: 'var(--surface-gradient-top)',
            color: 'var(--text-primary)',
            fontSize: '16px',
            fontWeight: '500'
          }}
          disabled={isAnalyzing}
          autoFocus
        />

        <div className="text-xs mb-6" style={{ color: 'var(--text-secondary)' }}>
          Paste images or screenshots directly - AI will analyze and organize (Cmd+Enter to save)
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-3 rounded-2xl transition-all"
            style={{
              background: 'var(--surface-gradient-top)',
              color: 'var(--text-secondary)'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!text.trim() || isAnalyzing}
            className="px-8 py-3 rounded-2xl transition-all disabled:opacity-40"
            style={{
              background: 'var(--action-primary)',
              color: '#FFFFFF'
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

export default QuickCapture
