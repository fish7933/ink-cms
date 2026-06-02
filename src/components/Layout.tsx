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

  useEffect(() => {
    let isMounted = true;

    const loadUser = async () => {
      try {
        const user = await getCurrentUser();
        
        if (!isMounted) return;
        
        if (!user) {
          console.log('❌ No user found, redirecting to login from:', location.pathname);
          navigate('/login', { replace: true });
          return;
        }
        
        console.log('✅ User loaded in Layout:', user.username);
        setCurrentUser(user);
      } catch (error) {
        console.error('Error loading user in Layout:', error);
        if (isMounted) {
          navigate('/login', { replace: true });
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };
    
    loadUser();

    return () => {
      isMounted = false;
    };
  }, [navigate, location.pathname]);

  // Show loading state while checking authentication
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

  // Don't render anything if no user (will redirect)
  if (!currentUser) {
    return null;
  }

  // Render the full layout with user data
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />
      <TabBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar menuStructure={menuStructure} currentRole={currentUser?.role || 'crew'} />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}