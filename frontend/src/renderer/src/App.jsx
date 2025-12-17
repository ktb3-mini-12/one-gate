// frontend/src/renderer/src/App.jsx

import React from 'react';
import MiniInput from './MiniInput';
import MainApp from './MainApp';

function App() {
  // URL 파라미터로 모드 구분
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode') || 'main';

  // 모드에 따라 다른 컴포넌트 렌더링
  if (mode === 'mini') {
    return <MiniInput />;
  }

  return <MainApp />;
}

export default App;
