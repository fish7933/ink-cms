import { useState, useEffect, Suspense } from 'react';
import { useNavigate, useLocation, Routes, Route } from 'react-router-dom';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import TabBar from '@/components/TabBar';
import { defaultMenuStructure } from '@/lib/default-menu';
import { getCurrentUser } from '@/lib/store';
import type { User } from '@/lib/store';
import type { MenuCategory } from '@/types/menu';
import type { Permission } from '@/types/permissions';
import { getPermissionsByUserId } from '@/services/permission.service';
import { getEffectiveMenuStructure } from '@/services/menu-config.service';
import { useTabContext } from '@/contexts/TabContext';
import { routeConfig } from '@/lib/route-config';
import { useDispatchApprovalPendingCount } from '@/hooks/useDispatchApprovalPendingCount';
import { useRotationPlanActionCount } from '@/hooks/useRotationPlanActionCount';
import { useApprovalInboxBadgeCount } from '@/hooks/useApprovalInboxBadgeCount';
import { useMyPayslipsPendingCount } from '@/hooks/useMyPayslipsPendingCount';
import { useApprovalToastNotifications } from '@/hooks/useApprovalToastNotifications';

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuStructure, setMenuStructure] = useState<MenuCategory[]>(defaultMenuStructure);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const { tabs, activeTabId, refreshNonces } = useTabContext();
  const dispatchApprovalPendingCount = useDispatchApprovalPendingCount();
  const rotationPlanActionCount = useRotationPlanActionCount();
  const approvalInboxBadgeCount = useApprovalInboxBadgeCount();
  const myPayslipsPendingCount = useMyPayslipsPendingCount();
  useApprovalToastNotifications();

  useEffect(() => {
    let isMounted = true;
    const loadUser = async () => {
      try {
        const user = await getCurrentUser();
        if (!isMounted) return;
        if (!user) { navigate('/login', { replace: true }); return; }
        setCurrentUser(user);
        const [perms, effectiveMenu] = await Promise.all([
          getPermissionsByUserId(user.id),
          getEffectiveMenuStructure(),
        ]);
        if (!isMounted) return;
        setPermissions(perms);
        setMenuStructure(effectiveMenu);
      } catch {
        if (isMounted) navigate('/login', { replace: true });
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadUser();
    return () => { isMounted = false; };
  }, [navigate]);

  useEffect(() => {
    const found = menuStructure.find(category =>
      category.items.some(item => {
        if (!item.path) return false;
        const itemPath = item.path.split('?')[0];
        const base = '/' + itemPath.split('/').filter(Boolean)[0];
        // startsWith(base)만 쓰면 "/crew"가 "/crew-rotation"의 문자열 접두사라는 이유만으로
        // 잘못 매칭된다 — 반드시 "/crew" 또는 "/crew/..." 처럼 경로 구분자(슬래시) 경계까지 맞아야 함.
        return location.pathname === itemPath ||
          (base.length > 1 && (location.pathname === base || location.pathname.startsWith(base + '/')));
      })
    );
    if (found) setSelectedCategoryId(found.id);
  }, [location.pathname, menuStructure]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">인증 확인 중...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) return null;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header
        selectedCategoryId={selectedCategoryId}
        onCategorySelect={setSelectedCategoryId}
        menuStructure={menuStructure}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          menuStructure={menuStructure}
          currentRole={currentUser?.role || 'crew'}
          permissions={permissions}
          selectedCategoryId={selectedCategoryId}
          badgeCounts={{ 'dispatch-approval-inbox': dispatchApprovalPendingCount, 'crew-rotation': rotationPlanActionCount, 'approval-inbox': approvalInboxBadgeCount, 'my-payslips': myPayslipsPendingCount }}
        />
        <div className="flex-1 flex flex-col overflow-hidden">
          <TabBar pathBadgeCounts={{ '/approval-inbox': approvalInboxBadgeCount }} />
          <div className="flex-1 overflow-hidden relative">
            {tabs.map(tab => (
              <div
                key={`${tab.id}:${refreshNonces[tab.id] || 0}`}
                className="absolute inset-0 overflow-y-auto"
                style={{ display: tab.id === activeTabId ? 'block' : 'none' }}
              >
                <Suspense fallback={
                  <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                  </div>
                }>
                  <TabPageRenderer path={tab.path} />
                </Suspense>
              </div>
            ))}
            {tabs.length === 0 && (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                메뉴에서 페이지를 선택하세요
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TabPageRenderer({ path }: { path: string }) {
  return (
    <Routes location={path}>
      {routeConfig.map(route => {
        const Comp = route.component;
        return <Route key={route.path} path={route.path} element={<Comp />} />;
      })}
    </Routes>
  );
}
