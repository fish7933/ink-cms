import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getCurrentUser } from '@/services/auth.service';
import { getUsers } from '@/services/user.service';
import { addAssignment, deleteAssignment } from '@/services/assignment.service';
import { supabase } from '@/lib/supabase';
import type { User } from '@/types/models';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, Users, ChevronRight, Save } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTabContext } from '@/contexts/TabContext';
import { useToast } from '@/hooks/use-toast';

// 사용자 역할 → 배정 레이블/색상
const USER_ROLE_LABEL: Record<string, string> = {
  ship_owner: '선주',
  ship_manager: '내부담당',
  manning_agency: '매닝사',
};
const USER_ROLE_COLOR: Record<string, string> = {
  ship_owner: 'bg-purple-100 text-purple-700',
  ship_manager: 'bg-blue-100 text-blue-700',
  manning_agency: 'bg-green-100 text-green-700',
};

interface Company { id: string; name: string; type: string; }
interface Fleet { id: string; name: string; owner_id: string; }
interface Ship { id: string; name: string; owner_id: string; fleet_id: string | null; }
interface Assignment { id: string; assignment_type: string; entity_id: string; user_id: string; role: string; created_at: string; }

export default function ManagerAssignmentPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { openNewTab, closeTab, activeTabId } = useTabContext();
  const { toast } = useToast();

  const editType = searchParams.get('type') as 'owner' | 'fleet' | 'ship' | null;
  const isFormMode = !!editType;

  const [users, setUsers] = useState<User[]>([]);
  const [owners, setOwners] = useState<Company[]>([]);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [ships, setShips] = useState<Ship[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    assignment_type: editType || 'owner',
    entity_id: '',
    user_id: '',
  });

  useEffect(() => {
    const init = async () => {
      const user = await getCurrentUser();
      if (!user || !['ship_manager', 'admin'].includes(user.role ?? '')) { navigate('/dashboard'); return; }
      await loadData();
    };
    init();
  }, [navigate]);

  useEffect(() => {
    if (isFormMode) setForm(f => ({ ...f, assignment_type: editType || 'owner', entity_id: '', user_id: '' }));
  }, [editType, isFormMode]);

  // 목록 갱신 신호 수신
  useEffect(() => {
    if (isFormMode) return;
    const handler = () => loadData();
    window.addEventListener('assignment-data-changed', handler);
    return () => window.removeEventListener('assignment-data-changed', handler);
  }, [isFormMode]);

  const loadData = async () => {
    try {
      const [usersData, ownersRes, fleetsRes, shipsRes, assignRes] = await Promise.all([
        getUsers(),
        supabase.from('companies').select('id,name,type').eq('type', 'owner').order('name'),
        supabase.from('fleets').select('id,name,owner_id').order('name'),
        supabase.from('ships').select('id,name,owner_id,fleet_id').order('name'),
        supabase.from('assignments').select('*').order('created_at', { ascending: false }),
      ]);
      setUsers(usersData.filter(u => ['ship_owner', 'ship_manager', 'manning_agency'].includes(u.role)));
      setOwners((ownersRes.data || []) as Company[]);
      setFleets((fleetsRes.data || []) as Fleet[]);
      setShips((shipsRes.data || []) as Ship[]);
      setAssignments((assignRes.data || []) as Assignment[]);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    if (!form.entity_id) { toast({ title: '대상을 선택하세요', variant: 'destructive' }); return; }
    if (!form.user_id) { toast({ title: '사용자를 선택하세요', variant: 'destructive' }); return; }
    const user = users.find(u => u.id === form.user_id);
    const roleMap: Record<string, string> = { ship_owner: 'owner_manager', ship_manager: 'ship_manager', manning_agency: 'manning_manager' };
    try {
      setSaving(true);
      await addAssignment({ assignment_type: form.assignment_type as 'owner'|'fleet'|'ship', entity_id: form.entity_id, user_id: form.user_id, role: roleMap[user?.role || ''] || 'owner_manager', assigned_by: null });
      toast({ title: '배정 완료' });
      window.dispatchEvent(new CustomEvent('assignment-data-changed'));
      closeTab(activeTabId!);
    } catch (e: unknown) {
      toast({ title: '배정 실패', description: (e as {message?:string})?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 배정을 삭제하시겠습니까?')) return;
    try {
      await deleteAssignment(id);
      await loadData();
      toast({ title: '삭제 완료' });
    } catch { toast({ title: '삭제 실패', variant: 'destructive' }); }
  };

  const getUserById = (id: string) => users.find(u => u.id === id);
  const getAssignmentsFor = (type: string, entityId: string) =>
    assignments.filter(a => a.assignment_type === type && a.entity_id === entityId);

  const entityOptions = () => {
    if (form.assignment_type === 'owner') return owners.map(o => ({ id: o.id, label: o.name }));
    if (form.assignment_type === 'fleet') return fleets.map(f => {
      const owner = owners.find(o => o.id === f.owner_id);
      return { id: f.id, label: `${owner ? owner.name + ' › ' : ''}${f.name}` };
    });
    return ships.map(s => {
      const owner = owners.find(o => o.id === s.owner_id);
      const fleet = fleets.find(f => f.id === s.fleet_id);
      return { id: s.id, label: `${owner ? owner.name + ' › ' : ''}${fleet ? fleet.name + ' › ' : ''}${s.name}` };
    });
  };

  // 사용자 역할 필터: 선주사엔 ship_owner 우선, 모두 선택 가능
  const userOptions = users;

  const renderAssignmentBadges = (type: string, entityId: string) => {
    const asgns = getAssignmentsFor(type, entityId);
    if (!asgns.length) return <span className="text-xs text-gray-400">미배정</span>;
    return (
      <div className="flex flex-wrap gap-1">
        {asgns.map(a => {
          const u = getUserById(a.user_id);
          if (!u) return null;
          return (
            <span key={a.id} className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${USER_ROLE_COLOR[u.role] || 'bg-gray-100 text-gray-600'}`}>
              {u.name}
              <span className="opacity-60">({USER_ROLE_LABEL[u.role] || u.role})</span>
              <button onClick={e => { e.stopPropagation(); handleDelete(a.id); }} className="ml-0.5 hover:opacity-70">×</button>
            </span>
          );
        })}
      </div>
    );
  };

  if (loading && !isFormMode) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;
  }

  // ─── 폼 모드 ───
  if (isFormMode) {
    const typeLabel = editType === 'owner' ? '선주사' : editType === 'fleet' ? '플릿' : '선박';
    return (
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                <CardTitle className="text-base">{typeLabel} 사용자 배정</CardTitle>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-8" onClick={() => closeTab(activeTabId!)}>취소</Button>
                <Button size="sm" className="gap-1.5 h-8" onClick={handleSave} disabled={saving}>
                  <Save className="w-4 h-4" />{saving ? '저장 중...' : '배정'}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-2 max-w-md">
            <div className="space-y-1.5">
              <Label className="text-xs">대상 {typeLabel} *</Label>
              <Select value={form.entity_id} onValueChange={v => setForm(f => ({ ...f, entity_id: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={`${typeLabel} 선택`} /></SelectTrigger>
                <SelectContent>
                  {entityOptions().map(e => <SelectItem key={e.id} value={e.id}>{e.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">배정 사용자 *</Label>
              <Select value={form.user_id} onValueChange={v => setForm(f => ({ ...f, user_id: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="사용자 선택" /></SelectTrigger>
                <SelectContent>
                  {(['ship_owner', 'ship_manager', 'manning_agency'] as const).map(role => {
                    const roleUsers = userOptions.filter(u => u.role === role);
                    if (!roleUsers.length) return null;
                    return [
                      <SelectItem key={`hd-${role}`} value={`__hd__${role}`} disabled className="text-xs font-semibold text-gray-400 py-1">
                        ── {USER_ROLE_LABEL[role]} ──
                      </SelectItem>,
                      ...roleUsers.map(u => (
                        <SelectItem key={u.id} value={u.id} className="pl-4">
                          {u.name} <span className="text-gray-400 text-xs">({u.email})</span>
                        </SelectItem>
                      ))
                    ];
                  })}
                </SelectContent>
              </Select>
              {form.user_id && (() => {
                const u = getUserById(form.user_id);
                if (!u) return null;
                return <p className="text-xs text-gray-500">역할: <span className={`px-1.5 py-0.5 rounded ${USER_ROLE_COLOR[u.role]}`}>{USER_ROLE_LABEL[u.role] || u.role}</span> → 이메일 수신처/참조처로 사용됩니다</p>;
              })()}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── 목록 모드: 선주사 > 플릿 > 선박 계층 ───
  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-6 h-6" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">담당자 배정 관리</h1>
            <p className="text-sm text-gray-500">선주사·플릿·선박별 담당 사용자를 지정합니다. 이메일 발송 시 수신처/참조처로 자동 적용됩니다.</p>
          </div>
        </div>
      </div>

      {owners.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-gray-400">등록된 선주사가 없습니다</CardContent></Card>
      ) : owners.map(owner => {
        const ownerFleets = fleets.filter(f => f.owner_id === owner.id);
        const ownerShips = ships.filter(s => s.owner_id === owner.id && !s.fleet_id);

        return (
          <Card key={owner.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold text-gray-800 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />
                  {owner.name}
                </CardTitle>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                  onClick={() => openNewTab(`/manager-assignments?type=owner&entityId=${owner.id}`, `${owner.name} 배정`, true)}>
                  <Plus className="w-3 h-3" />배정 추가
                </Button>
              </div>
              <div className="mt-1">{renderAssignmentBadges('owner', owner.id)}</div>
            </CardHeader>

            {(ownerFleets.length > 0 || ownerShips.length > 0) && (
              <CardContent className="pt-0 pb-3">
                <div className="space-y-2 ml-4">
                  {/* 플릿별 */}
                  {ownerFleets.map(fleet => {
                    const fleetShips = ships.filter(s => s.fleet_id === fleet.id);
                    return (
                      <div key={fleet.id} className="border-l-2 border-gray-200 pl-3">
                        <div className="flex items-center justify-between py-1">
                          <div className="flex items-center gap-2">
                            <ChevronRight className="w-3 h-3 text-gray-400" />
                            <span className="text-xs font-medium text-gray-600">{fleet.name}</span>
                            <div className="ml-1">{renderAssignmentBadges('fleet', fleet.id)}</div>
                          </div>
                          <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 px-2"
                            onClick={() => openNewTab(`/manager-assignments?type=fleet&entityId=${fleet.id}`, `${fleet.name} 배정`, true)}>
                            <Plus className="w-3 h-3" />배정
                          </Button>
                        </div>
                        {/* 플릿 소속 선박 */}
                        {fleetShips.map(ship => (
                          <div key={ship.id} className="border-l-2 border-gray-100 pl-3 ml-3">
                            <div className="flex items-center justify-between py-0.5">
                              <div className="flex items-center gap-2">
                                <ChevronRight className="w-3 h-3 text-gray-300" />
                                <span className="text-xs text-gray-500">{ship.name}</span>
                                <div className="ml-1">{renderAssignmentBadges('ship', ship.id)}</div>
                              </div>
                              <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 px-2"
                                onClick={() => openNewTab(`/manager-assignments?type=ship&entityId=${ship.id}`, `${ship.name} 배정`, true)}>
                                <Plus className="w-3 h-3" />배정
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                  {/* 플릿 미소속 선박 */}
                  {ownerShips.map(ship => (
                    <div key={ship.id} className="border-l-2 border-gray-100 pl-3">
                      <div className="flex items-center justify-between py-0.5">
                        <div className="flex items-center gap-2">
                          <ChevronRight className="w-3 h-3 text-gray-300" />
                          <span className="text-xs text-gray-500">{ship.name}</span>
                          <div className="ml-1">{renderAssignmentBadges('ship', ship.id)}</div>
                        </div>
                        <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 px-2"
                          onClick={() => openNewTab(`/manager-assignments?type=ship&entityId=${ship.id}`, `${ship.name} 배정`, true)}>
                          <Plus className="w-3 h-3" />배정
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* 선주사 미소속 플릿 */}
      {fleets.filter(f => !owners.find(o => o.id === f.owner_id)).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">선주사 미지정 플릿</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 pb-3 space-y-1">
            {fleets.filter(f => !owners.find(o => o.id === f.owner_id)).map(fleet => (
              <div key={fleet.id} className="flex items-center justify-between py-1 px-2 rounded hover:bg-gray-50">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-600">{fleet.name}</span>
                  <div className="ml-1">{renderAssignmentBadges('fleet', fleet.id)}</div>
                </div>
                <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 px-2"
                  onClick={() => openNewTab(`/manager-assignments?type=fleet&entityId=${fleet.id}`, `${fleet.name} 배정`, true)}>
                  <Plus className="w-3 h-3" />배정
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
