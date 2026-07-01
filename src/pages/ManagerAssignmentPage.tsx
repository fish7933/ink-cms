import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser } from '@/services/auth.service';
import { getUsers } from '@/services/user.service';
import { addAssignment, deleteAssignment } from '@/services/assignment.service';
import { supabase } from '@/lib/supabase';
import type { User } from '@/types/models';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Users, ChevronRight } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

const USER_ROLE_LABEL: Record<string, string> = { ship_owner: '선주', ship_manager: '내부담당', manning_agency: '매닝사' };
const USER_ROLE_COLOR: Record<string, string> = { ship_owner: 'bg-purple-100 text-purple-700', ship_manager: 'bg-blue-100 text-blue-700', manning_agency: 'bg-green-100 text-green-700' };

interface Company { id: string; name: string; type: string; }
interface Fleet { id: string; name: string; owner_id: string; }
interface Ship { id: string; name: string; owner_id: string; fleet_id: string | null; }
interface Assignment { id: string; assignment_type: string; entity_id: string; user_id: string; role: string; }

interface Modal { type: 'owner' | 'fleet' | 'ship'; entityId: string; entityLabel: string; }

export default function ManagerAssignmentPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [owners, setOwners] = useState<Company[]>([]);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [ships, setShips] = useState<Ship[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<Modal | null>(null);
  const [selectedUser, setSelectedUser] = useState('');

  useEffect(() => {
    const init = async () => {
      const user = await getCurrentUser();
      if (!user || !['ship_manager', 'admin'].includes(user.role ?? '')) { navigate('/dashboard'); return; }
      await loadData();
    };
    init();
  }, [navigate]);

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

  const openModal = (type: Modal['type'], entityId: string, entityLabel: string) => {
    setSelectedUser('');
    setModal({ type, entityId, entityLabel });
  };

  const handleSave = async () => {
    if (!selectedUser) { toast({ title: '사용자를 선택하세요', variant: 'destructive' }); return; }
    if (!modal) return;
    const user = users.find(u => u.id === selectedUser);
    const roleMap: Record<string, string> = { ship_owner: 'owner_manager', ship_manager: 'ship_manager', manning_agency: 'manning_manager' };
    try {
      setSaving(true);
      await addAssignment({ assignment_type: modal.type, entity_id: modal.entityId, user_id: selectedUser, role: roleMap[user?.role || ''] || 'owner_manager', assigned_by: null });
      toast({ title: '배정 완료' });
      setModal(null);
      await loadData();
    } catch (e: unknown) {
      toast({ title: '배정 실패', description: (e as {message?:string})?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 배정을 삭제하시겠습니까?')) return;
    try { await deleteAssignment(id); await loadData(); toast({ title: '삭제 완료' }); }
    catch { toast({ title: '삭제 실패', variant: 'destructive' }); }
  };

  const getUserById = (id: string) => users.find(u => u.id === id);
  const getAssignmentsFor = (type: string, entityId: string) =>
    assignments.filter(a => a.assignment_type === type && a.entity_id === entityId);

  const renderBadges = (type: string, entityId: string) => {
    const asgns = getAssignmentsFor(type, entityId);
    if (!asgns.length) return <span className="text-xs text-gray-400">미배정</span>;
    return (
      <div className="flex flex-wrap gap-1">
        {asgns.map(a => {
          const u = getUserById(a.user_id);
          if (!u) return null;
          return (
            <span key={a.id} className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${USER_ROLE_COLOR[u.role] || 'bg-gray-100 text-gray-600'}`}>
              {u.name}<span className="opacity-60">({USER_ROLE_LABEL[u.role] || u.role})</span>
              <button onClick={e => { e.stopPropagation(); handleDelete(a.id); }} className="ml-0.5 hover:opacity-70">×</button>
            </span>
          );
        })}
      </div>
    );
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;

  return (
    <>
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
        <div className="flex items-center gap-2">
          <Users className="w-6 h-6" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">담당자 배정 관리</h1>
            <p className="text-sm text-gray-500">선주사·플릿·선박별 담당 사용자를 지정합니다. 이메일 발송 시 수신처/참조처로 자동 적용됩니다.</p>
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
                    <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />{owner.name}
                  </CardTitle>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => openModal('owner', owner.id, owner.name)}>
                    <Plus className="w-3 h-3" />배정 추가
                  </Button>
                </div>
                <div className="mt-1">{renderBadges('owner', owner.id)}</div>
              </CardHeader>
              {(ownerFleets.length > 0 || ownerShips.length > 0) && (
                <CardContent className="pt-0 pb-3">
                  <div className="space-y-2 ml-4">
                    {ownerFleets.map(fleet => {
                      const fleetShips = ships.filter(s => s.fleet_id === fleet.id);
                      return (
                        <div key={fleet.id} className="border-l-2 border-gray-200 pl-3">
                          <div className="flex items-center justify-between py-1">
                            <div className="flex items-center gap-2">
                              <ChevronRight className="w-3 h-3 text-gray-400" />
                              <span className="text-xs font-medium text-gray-600">{fleet.name}</span>
                              <div className="ml-1">{renderBadges('fleet', fleet.id)}</div>
                            </div>
                            <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 px-2" onClick={() => openModal('fleet', fleet.id, `${owner.name} › ${fleet.name}`)}>
                              <Plus className="w-3 h-3" />배정
                            </Button>
                          </div>
                          {fleetShips.map(ship => (
                            <div key={ship.id} className="border-l-2 border-gray-100 pl-3 ml-3">
                              <div className="flex items-center justify-between py-0.5">
                                <div className="flex items-center gap-2">
                                  <ChevronRight className="w-3 h-3 text-gray-300" />
                                  <span className="text-xs text-gray-500">{ship.name}</span>
                                  <div className="ml-1">{renderBadges('ship', ship.id)}</div>
                                </div>
                                <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 px-2" onClick={() => openModal('ship', ship.id, `${owner.name} › ${fleet.name} › ${ship.name}`)}>
                                  <Plus className="w-3 h-3" />배정
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                    {ownerShips.map(ship => (
                      <div key={ship.id} className="border-l-2 border-gray-100 pl-3">
                        <div className="flex items-center justify-between py-0.5">
                          <div className="flex items-center gap-2">
                            <ChevronRight className="w-3 h-3 text-gray-300" />
                            <span className="text-xs text-gray-500">{ship.name}</span>
                            <div className="ml-1">{renderBadges('ship', ship.id)}</div>
                          </div>
                          <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 px-2" onClick={() => openModal('ship', ship.id, `${owner.name} › ${ship.name}`)}>
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

        {fleets.filter(f => !owners.find(o => o.id === f.owner_id)).length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">선주사 미지정 플릿</CardTitle></CardHeader>
            <CardContent className="pt-0 pb-3 space-y-1">
              {fleets.filter(f => !owners.find(o => o.id === f.owner_id)).map(fleet => (
                <div key={fleet.id} className="flex items-center justify-between py-1 px-2 rounded hover:bg-gray-50">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-600">{fleet.name}</span>
                    <div className="ml-1">{renderBadges('fleet', fleet.id)}</div>
                  </div>
                  <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 px-2" onClick={() => openModal('fleet', fleet.id, fleet.name)}>
                    <Plus className="w-3 h-3" />배정
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* 배정 모달 */}
      <Dialog open={!!modal} onOpenChange={open => !open && setModal(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">사용자 배정</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">대상</Label>
              <p className="text-sm font-medium">{modal?.entityLabel}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">배정 사용자 *</Label>
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="사용자 선택" /></SelectTrigger>
                <SelectContent>
                  {(['ship_owner', 'ship_manager', 'manning_agency'] as const).map(role => {
                    const roleUsers = users.filter(u => u.role === role);
                    if (!roleUsers.length) return null;
                    return (
                      <div key={role}>
                        <div className="px-2 py-1 text-xs font-semibold text-gray-400">── {USER_ROLE_LABEL[role]} ──</div>
                        {roleUsers.map(u => (
                          <SelectItem key={u.id} value={u.id} className="pl-4 text-sm">
                            {u.name} <span className="text-gray-400 text-xs">({u.email})</span>
                          </SelectItem>
                        ))}
                      </div>
                    );
                  })}
                </SelectContent>
              </Select>
              {selectedUser && (() => {
                const u = getUserById(selectedUser);
                if (!u) return null;
                return <p className="text-xs text-gray-400">역할: <span className={`px-1.5 py-0.5 rounded ${USER_ROLE_COLOR[u.role]}`}>{USER_ROLE_LABEL[u.role] || u.role}</span></p>;
              })()}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setModal(null)}>취소</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? '저장 중...' : '배정'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
