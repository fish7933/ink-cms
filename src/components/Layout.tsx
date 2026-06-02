import { ReactNode, useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import TabBar from '@/components/TabBar';
import { defaultMenuStructure } from '@/lib/default-menu';
import { getCurrentUser } from '@/lib/store';
import type { User } from '@/lib/store';
import type { MenuCategory } from '@/types/menu';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuStructure] = useState<MenuCategory[]>(defaultMenuStructure);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

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
  }, [navigate, location.pathname]);

  // URL 변경 시 카테고리 자동 동기화
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
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
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
