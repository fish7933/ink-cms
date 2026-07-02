import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser, getUsers } from '@/lib/store';
import { getPermissionsByUserId, updateUserPermissions } from '@/services/permission.service';
import type { User } from '@/types/models';
import type { Permission, PermissionUpdate } from '@/types/permissions';
import { MENU_STRUCTURE } from '@/types/permissions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Save, ChevronDown, ChevronRight, Folder, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';

type PermField = 'can_create' | 'can_edit' | 'can_delete';

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

  const getPermission = (resource: string) => permissions.find(p => p.resource === resource);

  const setResourceField = (resource: string, field: PermField, value: boolean) => {
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

  // 대메뉴 체크박스 클릭 → 하위 전체에 일괄 적용
  const handleMenuChange = (menuId: string, field: PermField, value: boolean) => {
    const menu = MENU_STRUCTURE.find(m => m.id === menuId);
    if (!menu?.children) return;
    menu.children.forEach(page => setResourceField(page.resource, field, value));
  };

  // 대메뉴의 특정 필드 상태 계산: true=전체on / false=전체off / 'indeterminate'=혼합
  const getMenuFieldState = (menuId: string, field: PermField): boolean | 'indeterminate' => {
    const menu = MENU_STRUCTURE.find(m => m.id === menuId);
    if (!menu?.children?.length) return false;
    const values = menu.children.map(page => getPermission(page.resource)?.[field] ?? false);
    if (values.every(v => v)) return true;
    if (values.every(v => !v)) return false;
    return 'indeterminate';
  };

  const grantedCount = () =>
    permissions.reduce((s, p) => s + (p.can_create ? 1 : 0) + (p.can_edit ? 1 : 0) + (p.can_delete ? 1 : 0), 0);

  const handleSave = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      const updates: PermissionUpdate[] = MENU_STRUCTURE.flatMap(m => m.children ?? []).map(page => {
        const p = getPermission(page.resource);
        return { resource: page.resource, can_view: true, can_create: p?.can_create ?? false, can_edit: p?.can_edit ?? false, can_delete: p?.can_delete ?? false };
      });
      await updateUserPermissions(selectedUser.id, updates);
      toast({ title: '저장 완료', description: `${selectedUser.name}님 권한이 업데이트되었습니다.` });
    } catch {
      toast({ title: '저장 실패', variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const toggleMenu = (id: string) =>
    setExpandedMenus(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

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
          <p className="text-xs text-gray-500">대메뉴 체크박스로 하위 전체 일괄 설정. 개별 페이지도 따로 조정 가능합니다. 조회는 모든 관리자에게 기본 부여됩니다.</p>
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
                      {isSelected && (
                        <Badge variant="secondary" className="text-xs shrink-0">{grantedCount()}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 truncate mt-0.5">{user.email}</p>
                  </button>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* 권한 설정 */}
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
                  {/* 헤더 */}
                  <div className="grid grid-cols-[1fr_56px_56px_56px] px-3 py-1.5 text-xs font-medium text-gray-400 text-center border-b mb-1">
                    <div className="text-left">메뉴 / 페이지</div>
                    <div>추가</div>
                    <div>수정</div>
                    <div>삭제</div>
                  </div>

                  {MENU_STRUCTURE.map(menu => {
                    const isExpanded = expandedMenus.has(menu.id);
                    return (
                      <div key={menu.id} className="border rounded-md overflow-hidden">

                        {/* 대메뉴 행 — 체크박스로 하위 일괄 제어 */}
                        <div className="grid grid-cols-[1fr_56px_56px_56px] items-center bg-gray-50 hover:bg-gray-100 transition-colors">
                          <button
                            onClick={() => toggleMenu(menu.id)}
                            className="flex items-center gap-2 px-3 py-2.5 text-left"
                          >
                            {isExpanded
                              ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              : <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
                            <Folder className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <span className="text-xs font-semibold text-gray-700">{menu.name}</span>
                          </button>
                          {(['can_create', 'can_edit', 'can_delete'] as PermField[]).map(field => {
                            const state = getMenuFieldState(menu.id, field);
                            return (
                              <div key={field} className="flex justify-center">
                                <Checkbox
                                  checked={state}
                                  onCheckedChange={v => handleMenuChange(menu.id, field, !!v)}
                                  className="data-[state=indeterminate]:bg-blue-100 data-[state=indeterminate]:border-blue-400"
                                />
                              </div>
                            );
                          })}
                        </div>

                        {/* 하위 페이지 목록 */}
                        {isExpanded && menu.children && (
                          <div className="border-t">
                            {menu.children.map(page => {
                              const perm = getPermission(page.resource);
                              return (
                                <div
                                  key={page.id}
                                  className="grid grid-cols-[1fr_56px_56px_56px] px-3 py-2 border-b last:border-b-0 hover:bg-blue-50/30 transition-colors items-center"
                                >
                                  <div className="flex items-center gap-1.5 pl-7">
                                    <FileText className="w-3 h-3 text-gray-300 shrink-0" />
                                    <span className="text-xs text-gray-600">{page.name}</span>
                                  </div>
                                  {(['can_create', 'can_edit', 'can_delete'] as PermField[]).map(field => (
                                    <div key={field} className="flex justify-center">
                                      <Checkbox
                                        checked={perm?.[field] ?? false}
                                        onCheckedChange={v => setResourceField(page.resource, field, !!v)}
                                      />
                                    </div>
                                  ))}
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
