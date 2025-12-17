// frontend/src/renderer/src/MainApp.jsx

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { supabase } from './lib/supabase';
const { ipcRenderer } = window.require('electron');

function MainApp({ user, session }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');
  const [addingToCalendar, setAddingToCalendar] = useState(null);

  // 데이터 불러오기
  const fetchRecords = async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      const res = await axios.get(`http://localhost:8000/records?user_id=${user.id}`);
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
    if (user?.id) {
      fetchRecords();
    }

    ipcRenderer.on('refresh-data', () => {
      fetchRecords();
    });

    return () => ipcRenderer.removeAllListeners('refresh-data');
  }, [user?.id]);

  // 삭제 처리
  const handleDelete = async (id) => {
    try {
      await axios.delete(`http://localhost:8000/records/${id}`);
      setRecords(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      console.error('삭제 실패:', err);
    }
  };

  // Google 캘린더에 등록
  const handleAddToCalendar = async (record) => {
    // provider_token 확인 (localStorage에서 가져오기)
    const googleToken = localStorage.getItem('google_provider_token');

    if (!googleToken) {
      alert('Google 토큰이 없습니다.\n로그아웃 후 다시 로그인해주세요.');
      return;
    }

    setAddingToCalendar(record.id);

    try {
      // 일정 시간 파싱 (간단한 예: 오늘 기준 +1일, 오후 2시~3시)
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(14, 0, 0, 0);

      const endTime = new Date(tomorrow);
      endTime.setHours(15, 0, 0, 0);

      const formatDateTime = (date) => {
        return date.toISOString().slice(0, 19);
      };

      const response = await fetch('http://localhost:8000/calendar/test-create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Google-Token': googleToken
        },
        body: JSON.stringify({
          summary: record.content,
          description: `One Gate에서 등록된 일정\n생성일: ${new Date(record.created_at).toLocaleString('ko-KR')}`,
          start_time: formatDateTime(tomorrow),
          end_time: formatDateTime(endTime)
        })
      });

      const result = await response.json();

      if (result.status === 'success') {
        alert('Google 캘린더에 등록되었습니다!');
        console.log('캘린더 링크:', result.link);
      } else {
        alert('등록 실패: ' + result.message);
      }
    } catch (err) {
      console.error('캘린더 등록 실패:', err);
      alert('캘린더 등록 중 오류가 발생했습니다.');
    } finally {
      setAddingToCalendar(null);
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* 사용자 정보 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {user?.user_metadata?.avatar_url && (
              <img
                src={user.user_metadata.avatar_url}
                alt="profile"
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%'
                }}
              />
            )}
            <span style={{ fontSize: '13px', color: '#666' }}>
              {user?.user_metadata?.name || user?.email}
            </span>
          </div>
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
          <button
            onClick={() => {
              localStorage.removeItem('google_provider_token');
              supabase.auth.signOut();
            }}
            style={{
              background: '#f0f0f0',
              color: '#666',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 12px',
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            로그아웃
          </button>
        </div>
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
                  {record.content}
                </div>

                {record.event_date && (
                  <div style={{
                    fontSize: '13px',
                    color: '#E91E63',
                    marginBottom: '6px'
                  }}>
                    ⏰ {record.event_date}
                  </div>
                )}

                {record.tags && (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        color: '#666',
                        background: '#f0f0f0',
                        padding: '2px 8px',
                        borderRadius: '4px'
                      }}
                    >
                      {record.tags.name}
                    </span>
                  </div>
                )}

                {record.created_at && (
                  <div style={{
                    fontSize: '11px',
                    color: '#aaa',
                    marginTop: '8px'
                  }}>
                    {new Date(record.created_at).toLocaleString('ko-KR')}
                  </div>
                )}

                {/* 캘린더 등록 버튼 (CALENDAR 항목만) */}
                {record.category === 'CALENDAR' && (
                  <button
                    onClick={() => handleAddToCalendar(record)}
                    disabled={addingToCalendar === record.id}
                    style={{
                      marginTop: '10px',
                      background: addingToCalendar === record.id ? '#ccc' : '#34A853',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '6px 12px',
                      fontSize: '12px',
                      cursor: addingToCalendar === record.id ? 'not-allowed' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    {addingToCalendar === record.id ? (
                      '등록 중...'
                    ) : (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11zM9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm-8 4H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z"/>
                        </svg>
                        Google 캘린더에 등록
                      </>
                    )}
                  </button>
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
