// frontend/src/renderer/src/MiniInput.jsx

import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
const { ipcRenderer } = window.require('electron');

function MiniInput({ user }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  // 창이 켜질 때 입력창 포커스
  useEffect(() => {
    ipcRenderer.on('focus-input', () => {
      setQuery('');
      if (inputRef.current) inputRef.current.focus();
    });
    return () => ipcRenderer.removeAllListeners('focus-input');
  }, []);

  const handleKeyDown = async (e) => {
    // ESC 누르면 창 닫기
    if (e.key === 'Escape') {
      ipcRenderer.send('close-mini-window');
      return;
    }

    // Enter 누르면 분석 후 창 닫기 (한글 IME 조합 중이면 무시)
    if (e.key === 'Enter' && !e.nativeEvent.isComposing && query.trim()) {
      await analyze(query);
    }
  };

  const analyze = async (content) => {
    setLoading(true);
    try {
      await axios.post('http://localhost:8000/analyze', {
        type: 'text',
        content,
        user_id: user.id
      });

      // 메인 창에 새로고침 요청 보내기
      ipcRenderer.send('refresh-main-window');

      // 입력 완료 후 창 닫기
      setQuery('');
      ipcRenderer.send('close-mini-window');
    } catch (err) {
      console.error('분석 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      background: 'rgba(255, 255, 255, 0.98)',
      borderRadius: '12px',
      overflow: 'hidden',
      height: '60px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 20px',
    }}>
      <span style={{ fontSize: '22px', marginRight: '12px' }}>⚡</span>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="할 일이나 일정을 입력하세요..."
        autoFocus
        style={{
          flex: 1,
          border: 'none',
          outline: 'none',
          fontSize: '18px',
          background: 'transparent',
          height: '100%',
          color: '#333'
        }}
      />
      {loading && <span style={{ color: '#888', fontSize: '14px' }}>저장 중...</span>}
    </div>
  );
}

export default MiniInput;
