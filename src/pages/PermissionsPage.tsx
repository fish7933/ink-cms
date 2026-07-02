import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser, getUsers } from '@/lib/store';
import { getPermissionsByUserId, updateUserPermissions } from '@/services/permission.service';
import type { User } from '@/types/models';
import type { Permission, PermissionUpdate } from '@/types/permissions';
import { MENU_STRUCTURE, RESOURCES } from '@/types/permissions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Save, ChevronDown, ChevronRight, Folder, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';

export default function PermissionsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set(MENU_STRUCTURE.map(m => m.id)));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const init = async () => {
      const user = await getCurrentUser();
      if (!user || !['ship_manager', 'admin'].includes(user.role ?? '')) { navigate('/dashboard'); return; }
      const all = await getUsers();
      const targets = all.filter(u => u.role === 'ship_manager');
      setUsers(targets);
      if (targets.length > 0) {
        setSelectedUser(targets[0]);
        setPermissions(await getPermissionsByUserId(targets[0].id));
      }
      setLoading(false);
    };
    init();
  }, [navigate]);

  const selectUser = async (user: User) => {
    setSelectedUser(user);
    setPermissions(await getPermissionsByUserId(user.id));
  };

  const handlePermissionChange = (resource: string, field: keyof Permission, value: boolean) => {
    setPermissions(prev => {
      const existing = prev.find(p => p.resource === resource);
      if (existing) return prev.map(p => p.resource === resource ? { ...p, [field]: value } : p);
      return [...prev, {
        id: `${selectedUser?.id}-${resource}`,
        user_id: selectedUser?.id || '',
        resource,
        can_view: true,
        can_create: field === 'can_create' ? value : false,
        can_edit: field === 'can_edit' ? value : false,
        can_delete: field === 'can_delete' ? value : false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }];
    });
  };

  const handleSave = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      const updates: PermissionUpdate[] = RESOURCES.map(r => {
        const p = permissions.find(x => x.resource === r.id);
        return { resource: r.id, can_view: true, can_create: p?.can_create ?? false, can_edit: p?.can_edit ?? false, can_delete: p?.can_delete ?? false };
      });
      await updateUserPermissions(selectedUser.id, updates);
      toast({ title: '저장 완료', description: `${selectedUser.name}님 권한이 업데이트되었습니다.` });
    } catch {
      toast({ title: '저장 실패', variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const toggleMenu = (id: string) =>
    setExpandedMenus(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const getPermission = (resource: string) => permissions.find(p => p.resource === resource);

  const grantedCount = (userId: string) => {
    if (selectedUser?.id !== userId) return null;
    return permissions.reduce((s, p) => s + (p.can_create ? 1 : 0) + (p.can_edit ? 1 : 0) + (p.can_delete ? 1 : 0), 0);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
      <div className="flex items-center gap-2 mb-4">
        <Shield className="w-5 h-5 text-blue-600" />
        <div>
          <h1 className="text-base font-bold text-gray-900">권한 설정</h1>
          <p className="text-xs text-gray-500">관리자별 메뉴 접근 권한(추가·수정·삭제)을 설정합니다. 조회는 모든 관리자에게 기본 부여됩니다.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">

        {/* 사용자 목록 */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">관리자 목록</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-1">
              {users.length === 0 ? (
                <p className="text-xs text-gray-400 py-4 text-center">등록된 관리자가 없습니다</p>
              ) : users.map(user => {
                const isSelected = selectedUser?.id === user.id;
                const count = grantedCount(user.id);
                return (
                  <button
                    key={user.id}
                    onClick={() => selectUser(user)}
                    className={`w-full text-left px-3 py-2.5 rounded-md transition-colors ${
                      isSelected ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-sm font-medium truncate ${isSelected ? 'text-blue-700' : 'text-gray-800'}`}>
                        {user.name}
                      </span>
                      {count !== null && (
                        <Badge variant="secondary" className="text-xs shrink-0">{count}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 truncate mt-0.5">{user.email}</p>
                  </button>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* 권한 트리 */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm">
                    {selectedUser ? `${selectedUser.name} — 권한 설정` : '관리자를 선택하세요'}
                  </CardTitle>
                  {selectedUser && (
                    <p className="text-xs text-gray-400 mt-0.5">{selectedUser.email}</p>
                  )}
                </div>
                {selectedUser && (
                  <Button size="sm" className="h-8 gap-1.5" onClick={handleSave} disabled={saving}>
                    <Save className="w-3.5 h-3.5" />{saving ? '저장 중...' : '저장'}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {!selectedUser ? (
                <div className="text-center py-12 text-gray-400">
                  <Shield className="w-10 h-10 mx-auto mb-2 text-gray-200" />
                  <p className="text-sm">왼쪽에서 관리자를 선택하세요</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {MENU_STRUCTURE.map(menu => {
                    const isExpanded = expandedMenus.has(menu.id);
                    return (
                      <div key={menu.id} className="border rounded-md overflow-hidden">
                        <button
                          onClick={() => toggleMenu(menu.id)}
                          className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                        >
                          {isExpanded
                            ? <ChevronDown className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                            : <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0" />}
                          <Folder className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <span className="text-xs font-semibold text-gray-700">{menu.name}</span>
                        </button>

                        {isExpanded && menu.children && (
                          <div>
                            <div className="grid grid-cols-[1fr_56px_56px_56px] px-3 py-1.5 bg-gray-50 border-t border-b text-xs font-medium text-gray-500 text-center">
                              <div className="text-left pl-5">페이지</div>
                              <div>추가</div>
                              <div>수정</div>
                              <div>삭제</div>
                            </div>
                            {menu.children.map(page => {
                              const perm = getPermission(page.resource);
                              return (
                                <div
                                  key={page.id}
                                  className="grid grid-cols-[1fr_56px_56px_56px] px-3 py-2 border-b last:border-b-0 hover:bg-blue-50/40 transition-colors items-center"
                                >
                                  <div className="flex items-center gap-1.5 pl-5">
                                    <FileText className="w-3 h-3 text-gray-300 shrink-0" />
                                    <span className="text-xs text-gray-700">{page.name}</span>
                                  </div>
                                  <div className="flex justify-center">
                                    <Checkbox
                                      checked={perm?.can_create ?? false}
                                      onCheckedChange={v => handlePermissionChange(page.resource, 'can_create', !!v)}
                                    />
                                  </div>
                                  <div className="flex justify-center">
                                    <Checkbox
                                      checked={perm?.can_edit ?? false}
                                      onCheckedChange={v => handlePermissionChange(page.resource, 'can_edit', !!v)}
                                    />
                                  </div>
                                  <div className="flex justify-center">
                                    <Checkbox
                                      checked={perm?.can_delete ?? false}
                                      onCheckedChange={v => handlePermissionChange(page.resource, 'can_delete', !!v)}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
