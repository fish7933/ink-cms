import { useState, useEffect, Suspense } from 'react';
import { useNavigate, useLocation, Routes, Route } from 'react-router-dom';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import TabBar from '@/components/TabBar';
import { defaultMenuStructure } from '@/lib/default-menu';
import { getCurrentUser } from '@/lib/store';
import type { User } from '@/lib/store';
import type { MenuCategory } from '@/types/menu';
import { useTabContext } from '@/contexts/TabContext';
import { routeConfig } from '@/lib/route-config';

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuStructure] = useState<MenuCategory[]>(defaultMenuStructure);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const { tabs, activeTabId, refreshNonces } = useTabContext();

  useEffect(() => {
    let isMounted = true;
    const loadUser = async () => {
      try {
        const user = await getCurrentUser();
        if (!isMounted) return;
        if (!user) { navigate('/login', { replace: true }); return; }
        setCurrentUser(user);
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
        return location.pathname === itemPath ||
          (base.length > 1 && location.pathname.startsWith(base));
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
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          menuStructure={menuStructure}
          currentRole={currentUser?.role || 'crew'}
          selectedCategoryId={selectedCategoryId}
        />
        <div className="flex-1 flex flex-col overflow-hidden">
          <TabBar />
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
