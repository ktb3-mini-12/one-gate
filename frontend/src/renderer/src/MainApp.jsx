// frontend/src/renderer/src/MainApp.jsx

import React, { useState, useEffect } from 'react';
import axios from 'axios';
const { ipcRenderer } = window.require('electron');

function MainApp() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL'); // ALL, CALENDAR, MEMO

  // 데이터 불러오기
  const fetchRecords = async () => {
    setLoading(true);
    try {
      const res = await axios.get('http://localhost:8000/records');
      if (res.data.status === 'success') {
        setRecords(res.data.data);
      }
    } catch (err) {
      console.error('데이터 로드 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  // 처음 로드 & 새로고침 이벤트 수신
  useEffect(() => {
    fetchRecords();

    ipcRenderer.on('refresh-data', () => {
      fetchRecords();
    });

    return () => ipcRenderer.removeAllListeners('refresh-data');
  }, []);

  // 삭제 처리
  const handleDelete = async (id) => {
    try {
      await axios.delete(`http://localhost:8000/records/${id}`);
      setRecords(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      console.error('삭제 실패:', err);
    }
  };

  // 필터링된 레코드
  const filteredRecords = filter === 'ALL'
    ? records
    : records.filter(r => r.category === filter);

  return (
    <div style={{
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      background: '#f5f5f7',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* 헤더 */}
      <div style={{
        background: '#fff',
        padding: '16px 20px',
        borderBottom: '1px solid #e0e0e0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <h1 style={{
          margin: 0,
          fontSize: '20px',
          fontWeight: '600',
          color: '#333'
        }}>
          One Gate
        </h1>
        <button
          onClick={fetchRecords}
          style={{
            background: '#007AFF',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 16px',
            fontSize: '14px',
            cursor: 'pointer'
          }}
        >
          새로고침
        </button>
      </div>

      {/* 필터 탭 */}
      <div style={{
        background: '#fff',
        padding: '12px 20px',
        display: 'flex',
        gap: '8px',
        borderBottom: '1px solid #e0e0e0'
      }}>
        {['ALL', 'CALENDAR', 'MEMO'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              background: filter === f ? '#007AFF' : '#f0f0f0',
              color: filter === f ? '#fff' : '#666',
              border: 'none',
              borderRadius: '16px',
              padding: '6px 16px',
              fontSize: '13px',
              cursor: 'pointer',
              fontWeight: filter === f ? '600' : '400'
            }}
          >
            {f === 'ALL' ? '전체' : f === 'CALENDAR' ? '📅 일정' : '📝 메모'}
          </button>
        ))}
        <span style={{
          marginLeft: 'auto',
          color: '#888',
          fontSize: '13px',
          alignSelf: 'center'
        }}>
          {filteredRecords.length}개
        </span>
      </div>

      {/* 목록 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
            로딩 중...
          </div>
        ) : filteredRecords.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
            <div>저장된 항목이 없습니다</div>
            <div style={{ fontSize: '13px', marginTop: '8px', color: '#aaa' }}>
              Cmd+Shift+Space로 새 항목을 추가하세요
            </div>
          </div>
        ) : (
          filteredRecords.map(record => (
            <div
              key={record.id}
              style={{
                background: '#fff',
                borderRadius: '10px',
                padding: '16px',
                marginBottom: '8px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px'
              }}
            >
              {/* 아이콘 */}
              <div style={{
                fontSize: '28px',
                width: '40px',
                height: '40px',
                background: record.category === 'CALENDAR' ? '#FFF3E0' : '#E3F2FD',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {record.category === 'CALENDAR' ? '📅' : '📝'}
              </div>

              {/* 내용 */}
              <div style={{ flex: 1 }}>
                <div style={{
                  fontWeight: '500',
                  fontSize: '15px',
                  color: '#333',
                  marginBottom: '6px'
                }}>
                  {record.summary}
                </div>

                {record.date && (
                  <div style={{
                    fontSize: '13px',
                    color: '#E91E63',
                    marginBottom: '6px'
                  }}>
                    ⏰ {record.date}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {record.tags?.map(tag => (
                    <span
                      key={tag}
                      style={{
                        fontSize: '11px',
                        color: '#666',
                        background: '#f0f0f0',
                        padding: '2px 8px',
                        borderRadius: '4px'
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                {record.created_at && (
                  <div style={{
                    fontSize: '11px',
                    color: '#aaa',
                    marginTop: '8px'
                  }}>
                    {new Date(record.created_at).toLocaleString('ko-KR')}
                  </div>
                )}
              </div>

              {/* 삭제 버튼 */}
              <button
                onClick={() => handleDelete(record.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#ccc',
                  fontSize: '18px',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: '4px'
                }}
                onMouseOver={(e) => e.target.style.color = '#ff4444'}
                onMouseOut={(e) => e.target.style.color = '#ccc'}
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>

      {/* 푸터 */}
      <div style={{
        background: '#fff',
        padding: '12px 20px',
        borderTop: '1px solid #e0e0e0',
        textAlign: 'center',
        color: '#888',
        fontSize: '12px'
      }}>
        Cmd+Shift+Space로 빠른 입력
      </div>
    </div>
  );
}

export default MainApp;
