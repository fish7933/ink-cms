import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser, getUsers } from '@/lib/store';
import { getPermissionsByUserId, updateUserPermissions } from '@/services/permission.service';
import type { User } from '@/types/models';
import type { Permission, PermissionUpdate } from '@/types/permissions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Save, CheckCircle2, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import PermissionTreeView from '@/components/permissions/PermissionTreeView';
import { RESOURCES } from '@/types/permissions';
import { useToast } from '@/hooks/use-toast';

export default function PermissionsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      const user = await getCurrentUser();
      if (!user || user.role !== 'ship_manager') {
      navigate('/dashboard');
      return;
    }
    setCurrentUser(user);
    loadData();
    };
    
    loadUser();
  }, [navigate]);

  const loadData = async () => {
    try {
      const usersData = await getUsers();
      const shipManagers = usersData.filter(u => u.role === 'ship_manager');
      setUsers(shipManagers);

      if (shipManagers.length > 0) {
        setSelectedUser(shipManagers[0]);
        const perms = await getPermissionsByUserId(shipManagers[0].id);
        setPermissions(perms);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: '오류',
        description: '데이터를 불러오는 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUserSelect = async (user: User) => {
    setSelectedUser(user);
    const perms = await getPermissionsByUserId(user.id);
    setPermissions(perms);
  };

  const handlePermissionChange = (resource: string, field: keyof Permission, value: boolean) => {
    setPermissions(prev => {
      const existing = prev.find(p => p.resource === resource);
      if (existing) {
        return prev.map(p =>
          p.resource === resource ? { ...p, [field]: value } : p
        );
      } else {
        const newPermission: Permission = {
          id: `${selectedUser?.id}-${resource}`,
          user_id: selectedUser?.id || '',
          resource,
          can_view: true, // Always grant view permission
          can_create: field === 'can_create' ? value : false,
          can_edit: field === 'can_edit' ? value : false,
          can_delete: field === 'can_delete' ? value : false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        return [...prev, newPermission];
      }
    });
  };

  const handleSave = async () => {
    if (!selectedUser) return;

    setSaving(true);
    try {
      const updates: PermissionUpdate[] = RESOURCES.map(resource => {
        const permission = permissions.find(p => p.resource === resource.id);
        return {
          resource: resource.id,
          can_view: true, // Always grant view permission
          can_create: permission?.can_create ?? false,
          can_edit: permission?.can_edit ?? false,
          can_delete: permission?.can_delete ?? false,
        };
      });

      await updateUserPermissions(selectedUser.id, updates);
      
      toast({
        title: '저장 완료',
        description: `${selectedUser.username}님의 권한이 업데이트되었습니다.`,
      });
    } catch (error) {
      console.error('Error saving permissions:', error);
      toast({
        title: '저장 실패',
        description: '권한 저장 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const getPermissionSummary = (userId: string) => {
    const userPerms = permissions.filter(p => p.user_id === userId);
    const totalActions = RESOURCES.length * 3; // 3 actions per resource (create, edit, delete)
    const grantedActions = userPerms.reduce((sum, p) => {
      return sum + (p.can_create ? 1 : 0) + (p.can_edit ? 1 : 0) + (p.can_delete ? 1 : 0);
    }, 0);
    return { granted: grantedActions, total: totalActions };
  };

  if (!currentUser || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">데이터를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-500 rounded-lg flex items-center justify-center">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900">권한 관리</h2>
          </div>
          <p className="text-gray-600">관리자별로 시스템 기능에 대한 접근 권한을 설정하세요.</p>
        </div>

        <Alert className="mb-6">
          <Info className="h-4 w-4" />
          <AlertDescription>
            모든 관리자는 기본적으로 <strong>조회 권한</strong>을 가지고 있습니다. 추가/수정/삭제 권한만 개별적으로 설정할 수 있습니다.
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* User List */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Shield className="w-5 h-5" />
                  관리자 목록
                </CardTitle>
                <CardDescription>권한을 설정할 관리자를 선택하세요</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {users.map((user) => {
                    const isSelected = selectedUser?.id === user.id;
                    const summary = isSelected ? getPermissionSummary(user.id) : null;
                    
                    return (
                      <button
                        key={user.id}
                        onClick={() => handleUserSelect(user)}
                        className={`w-full text-left p-4 rounded-lg transition-all ${
                          isSelected
                            ? 'bg-blue-100 border-2 border-blue-500 shadow-sm'
                            : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                        }`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="font-medium text-gray-900">{user.username}</div>
                          {isSelected && (
                            <CheckCircle2 className="w-5 h-5 text-blue-600 flex-shrink-0" />
                          )}
                        </div>
                        <div className="text-sm text-gray-600 mb-2">{user.email}</div>
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="text-xs">
                            선박 관리자
                          </Badge>
                          {summary && (
                            <span className="text-xs text-gray-500">
                              {summary.granted}/{summary.total} 권한
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                  {users.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <p className="text-sm">등록된 관리자가 없습니다</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Permission Tree */}
          <div className="lg:col-span-3">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1">
                    <CardTitle>권한 설정</CardTitle>
                    <CardDescription>
                      {selectedUser
                        ? `${selectedUser.username}님의 메뉴별 페이지 권한을 설정하세요`
                        : '관리자를 선택하여 권한을 설정하세요'}
                    </CardDescription>
                  </div>
                  {selectedUser && (
                    <Button
                      onClick={handleSave}
                      disabled={saving}
                      className="gap-2 flex-shrink-0"
                    >
                      <Save className="w-4 h-4" />
                      {saving ? '저장 중...' : '저장'}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {selectedUser ? (
                  <PermissionTreeView
                    permissions={permissions}
                    onPermissionChange={handlePermissionChange}
                  />
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <Shield className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p>왼쪽에서 관리자를 선택하여 권한을 설정하세요</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </>
  );
}