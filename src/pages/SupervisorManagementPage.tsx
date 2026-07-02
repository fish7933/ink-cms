import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supervisorService } from '@/services/supervisor.service';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, UserCheck, ChevronRight } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

interface Supervisor { id: string; name: string; email: string; }
interface Owner { id: string; name: string; }
interface Fleet { id: string; name: string; owner_id: string; }
interface Ship { id: string; name: string; owner_id: string; fleet_id: string | null; }
interface Assignment { id: string; supervisor_id: string; owner_id?: string; fleet_id?: string; ship_id?: string; }
interface Modal { type: 'owner' | 'fleet' | 'ship'; entityId: string; entityLabel: string; }

interface EffectiveResult {
  assignments: Assignment[];
  inherited: boolean;
  sourceName: string;
}

export default function SupervisorManagementPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [ships, setShips] = useState<Ship[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentUserId, setCurrentUserId] = useState('');
  const [modal, setModal] = useState<Modal | null>(null);
  const [selectedSupervisor, setSelectedSupervisor] = useState('');

  useEffect(() => {
    const init = async () => {
      const user = await getCurrentUser();
      if (!user) { navigate('/login'); return; }
      setCurrentUserId(user.id);
      await loadData();
    };
    init();
  }, [navigate]);

  const loadData = async () => {
    try {
      const [supData, ownRes, fleetRes, shipRes, assignRes] = await Promise.all([
        supervisorService.getShipManagers(),
        supabase.from('companies').select('id,name').eq('type', 'owner').order('name'),
        supabase.from('fleets').select('id,name,owner_id').order('name'),
        supabase.from('ships').select('id,name,owner_id,fleet_id').order('name'),
        supabase.from('supervisor_assignments').select('id,supervisor_id,owner_id,fleet_id,ship_id'),
      ]);
      setSupervisors(supData);
      setOwners((ownRes.data || []) as Owner[]);
      setFleets((fleetRes.data || []) as Fleet[]);
      setShips((shipRes.data || []) as Ship[]);
      setAssignments((assignRes.data || []) as Assignment[]);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  // 직접 배정만 조회
  const getDirectFor = (type: 'owner' | 'fleet' | 'ship', entityId: string): Assignment[] => {
    if (type === 'owner') return assignments.filter(a => a.owner_id === entityId && !a.fleet_id && !a.ship_id);
    if (type === 'fleet') return assignments.filter(a => a.fleet_id === entityId && !a.ship_id);
    return assignments.filter(a => a.ship_id === entityId);
  };

  // 상속 포함 유효 담당자: 직접 배정 없으면 상위 탐색
  const getEffective = (type: 'owner' | 'fleet' | 'ship', entityId: string): EffectiveResult => {
    const direct = getDirectFor(type, entityId);
    if (direct.length > 0) return { assignments: direct, inherited: false, sourceName: '' };

    if (type === 'fleet') {
      const fleet = fleets.find(f => f.id === entityId);
      if (fleet?.owner_id) {
        const ownerAsgns = getDirectFor('owner', fleet.owner_id);
        if (ownerAsgns.length > 0) {
          const owner = owners.find(o => o.id === fleet.owner_id);
          return { assignments: ownerAsgns, inherited: true, sourceName: owner?.name || '상위 선주사' };
        }
      }
    }

    if (type === 'ship') {
      const ship = ships.find(s => s.id === entityId);
      if (ship?.fleet_id) {
        // 플릿 레벨 직접 배정 확인
        const fleetAsgns = getDirectFor('fleet', ship.fleet_id);
        if (fleetAsgns.length > 0) {
          const fleet = fleets.find(f => f.id === ship.fleet_id);
          return { assignments: fleetAsgns, inherited: true, sourceName: fleet?.name || '상위 플릿' };
        }
        // 플릿도 없으면 선주사 레벨
        const fleet = fleets.find(f => f.id === ship.fleet_id);
        if (fleet?.owner_id) {
          const ownerAsgns = getDirectFor('owner', fleet.owner_id);
          if (ownerAsgns.length > 0) {
            const owner = owners.find(o => o.id === fleet.owner_id);
            return { assignments: ownerAsgns, inherited: true, sourceName: owner?.name || '상위 선주사' };
          }
        }
      }
      // 플릿 없는 선박 → 선주사 레벨
      if (ship?.owner_id) {
        const ownerAsgns = getDirectFor('owner', ship.owner_id);
        if (ownerAsgns.length > 0) {
          const owner = owners.find(o => o.id === ship.owner_id);
          return { assignments: ownerAsgns, inherited: true, sourceName: owner?.name || '상위 선주사' };
        }
      }
    }

    return { assignments: [], inherited: false, sourceName: '' };
  };

  const getSupervisorById = (id: string) => supervisors.find(s => s.id === id);

  const renderBadges = (type: 'owner' | 'fleet' | 'ship', entityId: string) => {
    const { assignments: asgns, inherited, sourceName } = getEffective(type, entityId);
    if (!asgns.length) return <span className="text-xs text-gray-300">미배정</span>;
    return (
      <div className="flex flex-wrap items-center gap-1">
        {inherited && (
          <span className="text-xs text-gray-400 italic">↑ {sourceName}:</span>
        )}
        {asgns.map(a => {
          const s = getSupervisorById(a.supervisor_id);
          if (!s) return null;
          return inherited ? (
            <span key={a.id} className="text-xs px-2 py-0.5 rounded-full border border-dashed border-gray-300 text-gray-400 flex items-center gap-1">
              {s.name}
            </span>
          ) : (
            <span key={a.id} className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 flex items-center gap-1">
              {s.name}
              <button onClick={e => { e.stopPropagation(); handleDelete(a.id); }} className="ml-0.5 hover:opacity-70">×</button>
            </span>
          );
        })}
      </div>
    );
  };

  const openModal = (type: Modal['type'], entityId: string, entityLabel: string) => {
    setSelectedSupervisor('');
    setModal({ type, entityId, entityLabel });
  };

  const handleSave = async () => {
    if (!selectedSupervisor) { toast({ title: '담당자를 선택하세요', variant: 'destructive' }); return; }
    if (!modal) return;
    try {
      setSaving(true);
      await supervisorService.createAssignment(selectedSupervisor, modal.type, modal.entityId, currentUserId);
      toast({ title: '배정 완료' });
      setModal(null);
      await loadData();
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      const msg = code === '23505' ? '이미 동일한 배정이 존재합니다' : (e as { message?: string })?.message || '배정 실패';
      toast({ title: '오류', description: msg, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 배정을 해제하시겠습니까?')) return;
    try { await supervisorService.deleteAssignment(id); await loadData(); toast({ title: '해제 완료' }); }
    catch { toast({ title: '해제 실패', variant: 'destructive' }); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;

  return (
    <>
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
        <div className="flex items-center gap-2">
          <UserCheck className="w-6 h-6" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">우리회사 담당자 관리</h1>
            <p className="text-sm text-gray-500">
              선주사·플릿·선박별 내부 담당자(선박관리사)를 배정합니다.
              직접 배정이 없으면 상위 레벨 배정을 자동 상속합니다.
            </p>
          </div>
        </div>

        {/* 범례 */}
        <div className="flex items-center gap-4 text-xs text-gray-500 px-1">
          <span className="flex items-center gap-1">
            <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">이름</span> 직접 배정
          </span>
          <span className="flex items-center gap-1">
            <span className="px-2 py-0.5 rounded-full border border-dashed border-gray-300 text-gray-400">이름</span> 상위에서 상속
          </span>
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
                    <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />{owner.name}
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
                            <div className="flex items-center gap-2 flex-wrap">
                              <ChevronRight className="w-3 h-3 text-gray-400 shrink-0" />
                              <span className="text-xs font-medium text-gray-600">{fleet.name}</span>
                              <div>{renderBadges('fleet', fleet.id)}</div>
                            </div>
                            <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 px-2 shrink-0" onClick={() => openModal('fleet', fleet.id, `${owner.name} › ${fleet.name}`)}>
                              <Plus className="w-3 h-3" />배정
                            </Button>
                          </div>
                          {fleetShips.map(ship => (
                            <div key={ship.id} className="border-l-2 border-gray-100 pl-3 ml-3">
                              <div className="flex items-center justify-between py-0.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <ChevronRight className="w-3 h-3 text-gray-300 shrink-0" />
                                  <span className="text-xs text-gray-500">{ship.name}</span>
                                  <div>{renderBadges('ship', ship.id)}</div>
                                </div>
                                <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 px-2 shrink-0" onClick={() => openModal('ship', ship.id, `${owner.name} › ${fleet.name} › ${ship.name}`)}>
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
                          <div className="flex items-center gap-2 flex-wrap">
                            <ChevronRight className="w-3 h-3 text-gray-300 shrink-0" />
                            <span className="text-xs text-gray-500">{ship.name}</span>
                            <div>{renderBadges('ship', ship.id)}</div>
                          </div>
                          <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 px-2 shrink-0" onClick={() => openModal('ship', ship.id, `${owner.name} › ${ship.name}`)}>
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
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-gray-600">{fleet.name}</span>
                    <div>{renderBadges('fleet', fleet.id)}</div>
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
            <DialogTitle className="text-base">우리회사 담당자 배정</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">대상</Label>
              <p className="text-sm font-medium">{modal?.entityLabel}</p>
            </div>
            {modal && (() => {
              const { assignments: asgns, inherited: isInherited, sourceName } = getEffective(modal.type, modal.entityId);
              if (isInherited && asgns.length > 0) {
                return (
                  <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-700">
                    현재 <strong>{sourceName}</strong>에서 상속됨:&nbsp;
                    {asgns.map(a => getSupervisorById(a.supervisor_id)?.name).filter(Boolean).join(', ')}
                    <br />직접 배정하면 상속 대신 이 배정이 적용됩니다.
                  </div>
                );
              }
              return null;
            })()}
            <div className="space-y-1.5">
              <Label className="text-xs">담당 감독 (선박관리사) *</Label>
              <Select value={selectedSupervisor} onValueChange={setSelectedSupervisor}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="담당자 선택" /></SelectTrigger>
                <SelectContent>
                  {supervisors.map(s => (
                    <SelectItem key={s.id} value={s.id} className="text-sm">
                      {s.name} <span className="text-gray-400 text-xs">({s.email})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-400">우리 회사(INK) 선박관리사 중에서 선택합니다</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setModal(null)}>취소</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !selectedSupervisor}>{saving ? '저장 중...' : '배정'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
