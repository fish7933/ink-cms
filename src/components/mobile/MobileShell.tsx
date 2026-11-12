import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, LogOut, Monitor, Users, Inbox, FileText, CalendarDays, Receipt } from 'lucide-react';
import { getCurrentUser, logout as logoutUser } from '@/lib/store';
import type { User } from '@/lib/store';
import { setViewMode } from '@/lib/view-mode';
import MobileCrewListPage from '@/pages/mobile/MobileCrewListPage';
import MobileCrewDetailPage from '@/pages/mobile/MobileCrewDetailPage';
import MobileApprovalInboxPage from '@/pages/mobile/MobileApprovalInboxPage';
import MobileDocumentDraftPage from '@/pages/mobile/MobileDocumentDraftPage';
import MobileLeaveRequestPage from '@/pages/mobile/MobileLeaveRequestPage';
import MobileMyPayslipsPage from '@/pages/mobile/MobileMyPayslipsPage';
import type { CrewWithDetails } from '@/services/crew.service';

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
  const [selectedCrew, setSelectedCrew] = useState<CrewWithDetails | null>(null);
  // 화면을 한 번 방문하면 계속 마운트 상태로 두고(display만 토글) 떠났다 돌아와도 검색어/탭
  // 선택 등 화면 내부 상태가 그대로 유지되게 한다 — 매번 새로 마운트되면서 초기화되던 문제.
  const [visited, setVisited] = useState<Set<MobileScreen>>(new Set(['home']));
  const goTo = (s: MobileScreen) => { setScreen(s); setVisited(prev => new Set(prev).add(s)); };

  const goBack = () => goTo(screen === 'crew-detail' ? 'crew-list' : 'home');

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
          <button type="button" onClick={goBack} className="flex items-center gap-1 text-sm text-gray-600">
            <ChevronLeft className="h-5 w-5" />뒤로
          </button>
        ) : (
          <span className="text-sm font-semibold text-gray-800">{currentUser.name}</span>
        )}
        <span className="flex-1 text-center text-sm font-semibold text-gray-800">
          {screen === 'crew-detail' ? (selectedCrew?.name || SCREEN_TITLE[screen]) : SCREEN_TITLE[screen]}
        </span>
        <button type="button" onClick={() => setViewMode('desktop')} className="p-1.5 text-gray-500" title="PC 화면으로">
          <Monitor className="h-5 w-5" />
        </button>
        <button type="button" onClick={handleLogout} className="p-1.5 text-gray-500" title="로그아웃">
          <LogOut className="h-5 w-5" />
        </button>
      </header>

      <main className="flex-1 p-4">
        <div style={{ display: screen === 'home' ? 'block' : 'none' }}>
          <div className="grid grid-cols-2 gap-3">
            {TILES.map(tile => (
              <button
                key={tile.screen}
                type="button"
                onClick={() => goTo(tile.screen)}
                className="flex flex-col items-center justify-center gap-2 rounded-xl border bg-white py-6 text-sm font-medium text-gray-700 shadow-sm active:bg-gray-50"
              >
                <tile.icon className="h-6 w-6 text-blue-600" />
                {tile.label}
              </button>
            ))}
          </div>
        </div>

        {visited.has('crew-list') && (
          <div style={{ display: screen === 'crew-list' ? 'block' : 'none' }}>
            <MobileCrewListPage onSelect={crew => { setSelectedCrew(crew); goTo('crew-detail'); }} />
          </div>
        )}
        {visited.has('crew-detail') && selectedCrew && (
          <div style={{ display: screen === 'crew-detail' ? 'block' : 'none' }}>
            <MobileCrewDetailPage crew={selectedCrew} />
          </div>
        )}
        {visited.has('approval-inbox') && (
          <div style={{ display: screen === 'approval-inbox' ? 'block' : 'none' }}>
            <MobileApprovalInboxPage currentUser={currentUser} />
          </div>
        )}
        {visited.has('document-draft') && (
          <div style={{ display: screen === 'document-draft' ? 'block' : 'none' }}>
            <MobileDocumentDraftPage currentUser={currentUser} />
          </div>
        )}
        {visited.has('leave-request') && (
          <div style={{ display: screen === 'leave-request' ? 'block' : 'none' }}>
            <MobileLeaveRequestPage currentUser={currentUser} />
          </div>
        )}
        {visited.has('payslips') && (
          <div style={{ display: screen === 'payslips' ? 'block' : 'none' }}>
            <MobileMyPayslipsPage currentUser={currentUser} />
          </div>
        )}
      </main>
    </div>
  );
}
