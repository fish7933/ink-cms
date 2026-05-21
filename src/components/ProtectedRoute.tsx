import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser } from '@/lib/store';
import { Shield, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface ProtectedRouteProps {
  resource?: string;
  children: React.ReactNode;
}

export default function ProtectedRoute({ resource, children }: ProtectedRouteProps) {
  const navigate = useNavigate();
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAccess = async () => {
      const user = await getCurrentUser();
      
      if (!user) {
        navigate('/login');
        return;
      }

      // ship_manager has full access to everything
      if (user.role === 'ship_manager') {
        setHasAccess(true);
        setLoading(false);
        return;
      }

      // If no specific resource is required, just check if user is logged in
      if (!resource) {
        setHasAccess(true);
        setLoading(false);
        return;
      }

      // For other roles, allow access (data filtering happens in components)
      setHasAccess(true);
      setLoading(false);
    };

    checkAccess();
  }, [resource, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">권한을 확인하는 중...</p>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                <Shield className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <CardTitle className="text-red-900">접근 권한 없음</CardTitle>
                <CardDescription>이 페이지에 접근할 권한이 없습니다</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <div className="flex gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-red-800">
                  <p className="font-medium mb-1">권한이 필요합니다</p>
                  <p>이 페이지를 보려면 관리자에게 조회 권한을 요청하세요.</p>
                </div>
              </div>
            </div>
            <Button 
              onClick={() => navigate('/dashboard')} 
              className="w-full"
            >
              대시보드로 돌아가기
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}