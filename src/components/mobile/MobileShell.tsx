import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, LogOut, Monitor, Users, Inbox, FileText, CalendarDays, Receipt } from 'lucide-react';
import { getCurrentUser, logout as logoutUser } from '@/lib/store';
import type { User } from '@/lib/store';
import { setViewMode } from '@/lib/view-mode';

type MobileScreen = 'home' | 'crew-list' | 'crew-detail' | 'approval-inbox' | 'document-draft' | 'leave-request' | 'payslips';

interface Tile {
  screen: MobileScreen;
  label: string;
  icon: typeof Users;
}

// 홈 화면 타일 — 선원(조회만) + 그룹웨어 자가서비스(결재함/기안함/연차·질병휴가 신청/내
// 급여명세서)만. 그 외 범위(증서 만료 현황/고과·상병 관리/선원 관리 설정, 직원 휴가 현황/
// 설정/게시판 관리 등)는 데스크탑 전용으로 남긴다.
const TILES: Tile[] = [
  { screen: 'crew-list', label: '선원', icon: Users },
  { screen: 'approval-inbox', label: '결재함', icon: Inbox },
  { screen: 'document-draft', label: '기안함', icon: FileText },
  { screen: 'leave-request', label: '연차/질병휴가 신청', icon: CalendarDays },
  { screen: 'payslips', label: '내 급여명세서', icon: Receipt },
];

const SCREEN_TITLE: Record<MobileScreen, string> = {
  home: '',
  'crew-list': '선원',
  'crew-detail': '선원 상세',
  'approval-inbox': '결재함',
  'document-draft': '기안함',
  'leave-request': '연차/질병휴가 신청',
  payslips: '내 급여명세서',
};

// 데스크탑 Layout과 동일하게 자체적으로 인증을 확인한다 — 탭 기반 멀티문서 구조(TabContext)는
// 범위가 좁아(홈 + 화면 5개) 필요 없고, 화면 하나만 보여주는 단순한 상태 전환으로 충분하다.
export default function MobileShell() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState<MobileScreen>('home');

  useEffect(() => {
    let isMounted = true;
    getCurrentUser().then(user => {
      if (!isMounted) return;
      if (!user) { navigate('/login', { replace: true }); return; }
      setCurrentUser(user);
      setLoading(false);
    });
    return () => { isMounted = false; };
  }, [navigate]);

  const handleLogout = async () => {
    try { await logoutUser(); } finally { window.location.href = '/login'; }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );
  }
  if (!currentUser) return null;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="sticky top-0 z-10 bg-white border-b px-4 py-3 flex items-center gap-2">
        {screen !== 'home' ? (
          <button type="button" onClick={() => setScreen('home')} className="flex items-center gap-1 text-sm text-gray-600">
            <ChevronLeft className="h-5 w-5" />뒤로
          </button>
        ) : (
          <span className="text-sm font-semibold text-gray-800">{currentUser.name}</span>
        )}
        <span className="flex-1 text-center text-sm font-semibold text-gray-800">{SCREEN_TITLE[screen]}</span>
        <button type="button" onClick={() => setViewMode('desktop')} className="p-1.5 text-gray-500" title="PC 화면으로">
          <Monitor className="h-5 w-5" />
        </button>
        <button type="button" onClick={handleLogout} className="p-1.5 text-gray-500" title="로그아웃">
          <LogOut className="h-5 w-5" />
        </button>
      </header>

      <main className="flex-1 p-4">
        {screen === 'home' && (
          <div className="grid grid-cols-2 gap-3">
            {TILES.map(tile => (
              <button
                key={tile.screen}
                type="button"
                onClick={() => setScreen(tile.screen)}
                className="flex flex-col items-center justify-center gap-2 rounded-xl border bg-white py-6 text-sm font-medium text-gray-700 shadow-sm active:bg-gray-50"
              >
                <tile.icon className="h-6 w-6 text-blue-600" />
                {tile.label}
              </button>
            ))}
          </div>
        )}

        {screen !== 'home' && (
          <div className="flex items-center justify-center h-40 text-sm text-gray-400">준비 중입니다.</div>
        )}
      </main>
    </div>
  );
}
