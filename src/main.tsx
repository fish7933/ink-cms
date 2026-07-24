import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// 결재 알림(Web Push)용 서비스워커를 미리 등록해둔다 — 알림을 켜기 전에도 등록만 해두면
// 이후 구독 시 별도 대기 없이 바로 쓸 수 있고, 이미 이전에 구독해둔 사용자는 앱을 열지 않아도
// 푸시를 받을 수 있다. 등록 자체는 알림 권한과 무관하게 조용히 이루어진다.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => { /* 등록 실패는 알림 기능만 못 쓰는 것이라 무시 */ });
}

createRoot(document.getElementById('root')!).render(<App />);
