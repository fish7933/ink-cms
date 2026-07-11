import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser, getUsers } from '@/lib/store';
import { getPermissionsByUserId, updateUserPermissions } from '@/services/permission.service';
import { supabase } from '@/lib/supabase';
import type { User } from '@/types/models';
import type { Permission, PermissionUpdate } from '@/types/permissions';
import { MENU_STRUCTURE } from '@/types/permissions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Save, ChevronDown, ChevronRight, Folder, FileText, CheckSquare, Square, Lock, Crown, UserMinus, UserCog } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';

type PermField = 'can_view' | 'can_create' | 'can_edit' | 'can_delete';
const PERM_FIELDS: PermField[] = ['can_view', 'can_create', 'can_edit', 'can_delete'];
const FIELD_LABEL: Record<PermField, string> = { can_view: '접속', can_create: '추가', can_edit: '수정', can_delete: '삭제' };
type ManagedRole = 'admin' | 'system_admin' | 'ship_manager';

const ROLE_LABEL: Record<ManagedRole, string> = {
  admin: '슈퍼관리자',
  system_admin: '시스템 관리자',
  ship_manager: '일반 관리자',
};

export default function PermissionsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set(MENU_STRUCTURE.map(m => m.id)));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [delegating, setDelegating] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    const all = await getUsers();
    const targets = [
      ...all.filter(u => u.role === 'admin'),
      ...all.filter(u => u.role === 'system_admin'),
      ...all.filter(u => u.role === 'ship_manager'),
    ];
    setUsers(targets);
    return targets;
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        const user = await getCurrentUser();
        if (!user || !['admin', 'system_admin'].includes(user.role ?? '')) { navigate('/dashboard'); return; }
        setCurrentUser(user);
        const targets = await loadUsers();
        if (targets.length > 0) {
          setSelectedUser(targets[0]);
          setPermissions(await getPermissionsByUserId(targets[0].id));
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [navigate, loadUsers]);

  const selectUser = async (user: User) => {
    setSelectedUser(user);
    setPermissions(await getPermissionsByUserId(user.id));
  };

  const isAdmin = (u: User | null) => u?.role === 'admin';
  const isSystemAdmin = (u: User | null) => u?.role === 'system_admin';
  const adminCount = users.filter(u => u.role === 'admin').length;

  const changeRole = async (user: User, newRole: ManagedRole, confirmMsg: string, successMsg: string) => {
    if (!isAdmin(currentUser)) {
      toast({ title: '권한 없음', description: '슈퍼관리자만 역할을 변경할 수 있습니다.', variant: 'destructive' });
      return;
    }
    if (!confirm(confirmMsg)) return;
    setDelegating(user.id);
    try {
      const { error } = await supabase.from('users').update({ role: newRole }).eq('id', user.id);
      if (error) throw error;
      toast({ title: '완료', description: successMsg });
      const targets = await loadUsers();
      const updated = targets.find(u => u.id === user.id);
      if (updated) { setSelectedUser(updated); setPermissions(await getPermissionsByUserId(updated.id)); }
    } catch {
      toast({ title: '실패', variant: 'destructive' });
    } finally { setDelegating(null); }
  };

  // 슈퍼관리자 위임 (ship_manager/system_admin → admin)
  const handleDelegate = (user: User) =>
    changeRole(user, 'admin',
      `${user.name}님을 슈퍼관리자로 위임하시겠습니까?\n슈퍼관리자는 시스템 전체 권한을 가집니다.`,
      `${user.name}님이 슈퍼관리자가 되었습니다.`
    );

  // 슈퍼관리자 해제 (admin → ship_manager)
  const handleRevokeAdmin = (user: User) => {
    if (user.id === currentUser?.id) return toast({ title: '불가', description: '자신의 슈퍼관리자 권한은 해제할 수 없습니다.', variant: 'destructive' });
    if (adminCount <= 1) return toast({ title: '불가', description: '최소 1명의 슈퍼관리자가 필요합니다.', variant: 'destructive' });
    changeRole(user, 'ship_manager',
      `${user.name}님의 슈퍼관리자 권한을 해제하시겠습니까?`,
      `${user.name}님이 일반 관리자로 변경되었습니다.`
    );
  };

  // 시스템 관리자 지정 (ship_manager → system_admin)
  const handleSetSystemAdmin = (user: User) =>
    changeRole(user, 'system_admin',
      `${user.name}님을 시스템 관리자로 지정하시겠습니까?\nUI 구성 관리와 권한 설정에 접근할 수 있게 됩니다.`,
      `${user.name}님이 시스템 관리자로 지정되었습니다.`
    );

  // 시스템 관리자 해제 (system_admin → ship_manager)
  const handleRevokeSystemAdmin = (user: User) =>
    changeRole(user, 'ship_manager',
      `${user.name}님의 시스템 관리자 지정을 해제하시겠습니까?`,
      `${user.name}님이 일반 관리자로 변경되었습니다.`
    );

  const getPermission = (resource: string) => permissions.find(p => p.resource === resource);

  const setResourceField = (resource: string, field: PermField, value: boolean) => {
    if (isAdmin(selectedUser) || isSystemAdmin(selectedUser)) return;
    // 접속(can_view)을 끄면 추가/수정/삭제를 볼 수도 없는 화면에서 할 수는 없으니 자동으로 같이 끈다.
    // 접속을 켜면 일단 추가/수정/삭제까지 전부 허용해두고, 필요하면 개별로 다시 끄는 편이 더 편리하다.
    const changes: Partial<Record<PermField, boolean>> = field === 'can_view'
      ? { can_view: value, can_create: value, can_edit: value, can_delete: value }
      : { [field]: value };
    setPermissions(prev => {
      const existing = prev.find(p => p.resource === resource);
      if (existing) return prev.map(p => p.resource === resource ? { ...p, ...changes } : p);
      return [...prev, {
        id: `${selectedUser?.id}-${resource}`,
        user_id: selectedUser?.id || '',
        resource,
        can_view: changes.can_view ?? true,
        can_create: changes.can_create ?? false,
        can_edit: changes.can_edit ?? false,
        can_delete: changes.can_delete ?? false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }];
    });
  };

  const handleGrantAll = (value: boolean) => {
    if (isAdmin(selectedUser) || isSystemAdmin(selectedUser)) return;
    MENU_STRUCTURE.forEach(menu =>
      menu.children?.forEach(page =>
        PERM_FIELDS.forEach(field =>
          setResourceField(page.resource, field, value)
        )
      )
    );
  };

  const handleMenuChange = (menuId: string, field: PermField, value: boolean) => {
    if (isAdmin(selectedUser) || isSystemAdmin(selectedUser)) return;
    const menu = MENU_STRUCTURE.find(m => m.id === menuId);
    menu?.children?.forEach(page => setResourceField(page.resource, field, value));
  };

  const getMenuFieldState = (menuId: string, field: PermField): boolean | 'indeterminate' => {
    if (isAdmin(selectedUser) || isSystemAdmin(selectedUser)) return true;
    const menu = MENU_STRUCTURE.find(m => m.id === menuId);
    if (!menu?.children?.length) return false;
    const values = menu.children.map(page => getPermission(page.resource)?.[field] ?? (field === 'can_view' ? true : false));
    if (values.every(v => v)) return true;
    if (values.every(v => !v)) return false;
    return 'indeterminate';
  };

  const grantedCount = () =>
    permissions.reduce((s, p) => s + (p.can_create ? 1 : 0) + (p.can_edit ? 1 : 0) + (p.can_delete ? 1 : 0), 0);

  const handleSave = async () => {
    if (!selectedUser || isAdmin(selectedUser) || isSystemAdmin(selectedUser)) return;
    setSaving(true);
    try {
      const updates: PermissionUpdate[] = MENU_STRUCTURE.flatMap(m => m.children ?? []).map(page => {
        const p = getPermission(page.resource);
        return { resource: page.resource, can_view: p?.can_view ?? true, can_create: p?.can_create ?? false, can_edit: p?.can_edit ?? false, can_delete: p?.can_delete ?? false };
      });
      await updateUserPermissions(selectedUser.id, updates);
      toast({ title: '저장 완료', description: `${selectedUser.name}님 권한이 업데이트되었습니다.` });
    } catch {
      toast({ title: '저장 실패', variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const toggleMenu = (id: string) =>
    setExpandedMenus(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const roleBadge = (user: User) => {
    if (user.role === 'admin') return <Badge className="text-[10px] px-1.5 bg-purple-600 hover:bg-purple-600 text-white shrink-0">슈퍼</Badge>;
    if (user.role === 'system_admin') return <Badge className="text-[10px] px-1.5 bg-indigo-500 hover:bg-indigo-500 text-white shrink-0">시스템</Badge>;
    return null;
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
          <p className="text-xs text-gray-500">슈퍼관리자 · 시스템 관리자만 접근 가능합니다. 관리자 역할 지정 및 메뉴별 권한을 설정합니다.</p>
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
                const isSelf = user.id === currentUser?.id;
                const isProcessing = delegating === user.id;
                const canManage = isAdmin(currentUser); // 슈퍼관리자만 역할 변경 가능

                const selectedBg = user.role === 'admin'
                  ? 'bg-purple-50 border-purple-200'
                  : user.role === 'system_admin'
                    ? 'bg-indigo-50 border-indigo-200'
                    : 'bg-blue-50 border-blue-200';
                const selectedText = user.role === 'admin' ? 'text-purple-700'
                  : user.role === 'system_admin' ? 'text-indigo-700' : 'text-blue-700';

                return (
                  <div
                    key={user.id}
                    onClick={() => selectUser(user)}
                    className={`w-full text-left px-3 py-2.5 rounded-md transition-colors cursor-pointer border ${
                      isSelected ? selectedBg : 'border-transparent hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className={`text-sm font-medium truncate ${isSelected ? selectedText : 'text-gray-800'}`}>
                        {user.name}
                        {isSelf && <span className="text-xs text-gray-400 ml-1">(나)</span>}
                      </span>
                      <div className="flex items-center gap-1">
                        {roleBadge(user)}
                        {!user.role || user.role === 'ship_manager' ? (
                          isSelected && <Badge variant="secondary" className="text-[10px] px-1.5 shrink-0">{grantedCount()}</Badge>
                        ) : null}
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 truncate">{user.email}</p>

                    {/* 역할 변경 버튼 — 슈퍼관리자만, 선택된 항목만 */}
                    {isSelected && canManage && (
                      <div className="mt-2 flex flex-wrap gap-1" onClick={e => e.stopPropagation()}>
                        {user.role === 'ship_manager' && (
                          <>
                            <Button size="sm" variant="outline" disabled={isProcessing}
                              className="h-6 px-2 text-[10px] text-indigo-600 border-indigo-200 hover:bg-indigo-50 gap-1"
                              onClick={() => handleSetSystemAdmin(user)}>
                              <UserCog className="w-3 h-3" />시스템 관리자 지정
                            </Button>
                            <Button size="sm" variant="outline" disabled={isProcessing}
                              className="h-6 px-2 text-[10px] text-purple-600 border-purple-200 hover:bg-purple-50 gap-1"
                              onClick={() => handleDelegate(user)}>
                              <Crown className="w-3 h-3" />슈퍼관리자 위임
                            </Button>
                          </>
                        )}
                        {user.role === 'system_admin' && (
                          <>
                            <Button size="sm" variant="outline" disabled={isProcessing}
                              className="h-6 px-2 text-[10px] text-orange-600 border-orange-200 hover:bg-orange-50 gap-1"
                              onClick={() => handleRevokeSystemAdmin(user)}>
                              <UserMinus className="w-3 h-3" />시스템 관리자 해제
                            </Button>
                            <Button size="sm" variant="outline" disabled={isProcessing}
                              className="h-6 px-2 text-[10px] text-purple-600 border-purple-200 hover:bg-purple-50 gap-1"
                              onClick={() => handleDelegate(user)}>
                              <Crown className="w-3 h-3" />슈퍼관리자 위임
                            </Button>
                          </>
                        )}
                        {user.role === 'admin' && !isSelf && adminCount > 1 && (
                          <Button size="sm" variant="outline" disabled={isProcessing}
                            className="h-6 px-2 text-[10px] text-orange-600 border-orange-200 hover:bg-orange-50 gap-1"
                            onClick={() => handleRevokeAdmin(user)}>
                            <UserMinus className="w-3 h-3" />슈퍼관리자 해제
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* 권한 설정 패널 */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm">
                      {selectedUser ? `${selectedUser.name} — 권한 설정` : '관리자를 선택하세요'}
                    </CardTitle>
                    {selectedUser && (
                      <Badge className={`text-xs gap-1 ${
                        isAdmin(selectedUser) ? 'bg-purple-600 hover:bg-purple-600' : isSystemAdmin(selectedUser) ? 'bg-indigo-500 hover:bg-indigo-500' : 'bg-gray-400 hover:bg-gray-400'
                      } text-white`}>
                        <Shield className="w-3 h-3" />
                        {ROLE_LABEL[(selectedUser.role as ManagedRole) ?? 'ship_manager']}
                      </Badge>
                    )}
                  </div>
                  {selectedUser && <p className="text-xs text-gray-400 mt-0.5">{selectedUser.email}</p>}
                </div>
                {selectedUser && !isAdmin(selectedUser) && !isSystemAdmin(selectedUser) && (
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => handleGrantAll(true)}>
                      <CheckSquare className="w-3.5 h-3.5" />전체 허용
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => handleGrantAll(false)}>
                      <Square className="w-3.5 h-3.5" />전체 해제
                    </Button>
                    <Button size="sm" className="h-8 gap-1.5" onClick={handleSave} disabled={saving}>
                      <Save className="w-3.5 h-3.5" />{saving ? '저장 중...' : '저장'}
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {!selectedUser ? (
                <div className="text-center py-12 text-gray-400">
                  <Shield className="w-10 h-10 mx-auto mb-2 text-gray-200" />
                  <p className="text-sm">왼쪽에서 관리자를 선택하세요</p>
                </div>
              ) : isAdmin(selectedUser) ? (
                <div className="rounded-lg border border-purple-100 bg-purple-50 px-4 py-6 text-center space-y-2">
                  <Lock className="w-8 h-8 mx-auto text-purple-400" />
                  <p className="text-sm font-medium text-purple-700">슈퍼관리자는 모든 메뉴에 대한 전체 권한을 가집니다.</p>
                  <p className="text-xs text-purple-500">UI 구성 관리 · 권한 설정 · 시스템 전체 접근 가능</p>
                </div>
              ) : isSystemAdmin(selectedUser) ? (
                <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-6 text-center space-y-2">
                  <UserCog className="w-8 h-8 mx-auto text-indigo-400" />
                  <p className="text-sm font-medium text-indigo-700">시스템 관리자는 모든 메뉴에 대한 전체 권한을 가집니다.</p>
                  <p className="text-xs text-indigo-500">UI 구성 관리 · 권한 설정 접근 가능 (슈퍼관리자 지정)</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="grid grid-cols-[1fr_56px_56px_56px_56px] px-3 py-1.5 text-xs font-medium text-gray-400 text-center border-b mb-1">
                    <div className="text-left">메뉴 / 페이지</div>
                    {PERM_FIELDS.map(field => <div key={field}>{FIELD_LABEL[field]}</div>)}
                  </div>
                  {MENU_STRUCTURE.map(menu => {
                    const isExpanded = expandedMenus.has(menu.id);
                    return (
                      <div key={menu.id} className="border rounded-md overflow-hidden">
                        <div className="grid grid-cols-[1fr_56px_56px_56px_56px] items-center bg-gray-50 hover:bg-gray-100 transition-colors">
                          <button onClick={() => toggleMenu(menu.id)} className="flex items-center gap-2 px-3 py-2.5 text-left">
                            {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
                            <Folder className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <span className="text-xs font-semibold text-gray-700">{menu.name}</span>
                          </button>
                          {PERM_FIELDS.map(field => (
                            <div key={field} className="flex justify-center">
                              <Checkbox
                                checked={getMenuFieldState(menu.id, field)}
                                onCheckedChange={v => handleMenuChange(menu.id, field, !!v)}
                                className="data-[state=indeterminate]:bg-blue-100 data-[state=indeterminate]:border-blue-400"
                              />
                            </div>
                          ))}
                        </div>
                        {isExpanded && menu.children && (
                          <div className="border-t">
                            {menu.children.map(page => {
                              const perm = getPermission(page.resource);
                              return (
                                <div key={page.id} className="grid grid-cols-[1fr_56px_56px_56px_56px] px-3 py-2 border-b last:border-b-0 hover:bg-blue-50/30 transition-colors items-center">
                                  <div className="flex items-center gap-1.5 pl-7">
                                    <FileText className="w-3 h-3 text-gray-300 shrink-0" />
                                    <span className="text-xs text-gray-600">{page.name}</span>
                                  </div>
                                  {PERM_FIELDS.map(field => (
                                    <div key={field} className="flex justify-center">
                                      <Checkbox
                                        checked={field === 'can_view' ? (perm?.can_view ?? true) : (perm?.[field] ?? false)}
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
