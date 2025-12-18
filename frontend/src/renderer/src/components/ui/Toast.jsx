import React, { useEffect } from 'react'
import { CheckIcon } from './Icons'

export function Toast({ message, type, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div
      className="fixed top-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl flex items-center gap-3 z-50"
      style={{
        background: type === 'success'
          ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.95), rgba(5, 150, 105, 0.95))'
          : 'linear-gradient(135deg, rgba(239, 68, 68, 0.95), rgba(185, 28, 28, 0.95))',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(12px)',
        animation: 'slide-down 0.3s ease-out'
      }}
    >
      {type === 'success' && <CheckIcon />}
      <span style={{ color: '#fff', fontSize: '14px', fontWeight: '500' }}>{message}</span>
    </div>
  )
}

export default Toast
