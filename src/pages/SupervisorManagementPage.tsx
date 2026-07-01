import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supervisorService } from '@/services/supervisor.service';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, UserCheck, ChevronRight, Save } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTabContext } from '@/contexts/TabContext';
import { useToast } from '@/hooks/use-toast';

interface Supervisor { id: string; name: string; email: string; }
interface Owner { id: string; name: string; }
interface Fleet { id: string; name: string; owner_id: string; }
interface Ship { id: string; name: string; owner_id: string; fleet_id: string | null; }
interface SupervisorAssignment { id: string; supervisor_id: string; owner_id?: string; fleet_id?: string; ship_id?: string; }

export default function SupervisorManagementPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { openNewTab, closeTab, activeTabId } = useTabContext();
  const { toast } = useToast();

  const editType = searchParams.get('type') as 'owner' | 'fleet' | 'ship' | null;
  const isFormMode = !!editType;

  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [ships, setShips] = useState<Ship[]>([]);
  const [assignments, setAssignments] = useState<SupervisorAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentUserId, setCurrentUserId] = useState('');

  const [form, setForm] = useState({ entity_id: '', supervisor_id: '' });

  useEffect(() => {
    const init = async () => {
      const user = await getCurrentUser();
      if (!user) { navigate('/login'); return; }
      setCurrentUserId(user.id);
      await loadData();
    };
    init();
  }, [navigate]);

  useEffect(() => {
    if (isFormMode) setForm({ entity_id: '', supervisor_id: '' });
  }, [editType, isFormMode]);

  useEffect(() => {
    if (isFormMode) return;
    const handler = () => loadData();
    window.addEventListener('supervisor-data-changed', handler);
    return () => window.removeEventListener('supervisor-data-changed', handler);
  }, [isFormMode]);

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
      setAssignments((assignRes.data || []) as SupervisorAssignment[]);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    if (!form.entity_id) { toast({ title: '대상을 선택하세요', variant: 'destructive' }); return; }
    if (!form.supervisor_id) { toast({ title: '담당자를 선택하세요', variant: 'destructive' }); return; }
    try {
      setSaving(true);
      await supervisorService.createAssignment(form.supervisor_id, editType!, form.entity_id, currentUserId);
      toast({ title: '배정 완료' });
      window.dispatchEvent(new CustomEvent('supervisor-data-changed'));
      closeTab(activeTabId!);
    } catch (e: unknown) {
      const msg = (e as { message?: string; code?: string })?.code === '23505'
        ? '이미 동일한 배정이 존재합니다'
        : (e as { message?: string })?.message || '배정 실패';
      toast({ title: '오류', description: msg, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 배정을 해제하시겠습니까?')) return;
    try {
      await supervisorService.deleteAssignment(id);
      await loadData();
      toast({ title: '해제 완료' });
    } catch { toast({ title: '해제 실패', variant: 'destructive' }); }
  };

  const getSupervisorById = (id: string) => supervisors.find(s => s.id === id);

  const getAssignmentsFor = (type: 'owner' | 'fleet' | 'ship', entityId: string) => {
    if (type === 'owner') return assignments.filter(a => a.owner_id === entityId);
    if (type === 'fleet') return assignments.filter(a => a.fleet_id === entityId);
    return assignments.filter(a => a.ship_id === entityId);
  };

  const entityOptions = () => {
    if (editType === 'owner') return owners.map(o => ({ id: o.id, label: o.name }));
    if (editType === 'fleet') return fleets.map(f => {
      const owner = owners.find(o => o.id === f.owner_id);
      return { id: f.id, label: `${owner ? owner.name + ' › ' : ''}${f.name}` };
    });
    return ships.map(s => {
      const owner = owners.find(o => o.id === s.owner_id);
      const fleet = fleets.find(f => f.id === s.fleet_id);
      return { id: s.id, label: `${owner ? owner.name + ' › ' : ''}${fleet ? fleet.name + ' › ' : ''}${s.name}` };
    });
  };

  const renderBadges = (type: 'owner' | 'fleet' | 'ship', entityId: string) => {
    const asgns = getAssignmentsFor(type, entityId);
    if (!asgns.length) return <span className="text-xs text-gray-400">미배정</span>;
    return (
      <div className="flex flex-wrap gap-1">
        {asgns.map(a => {
          const s = getSupervisorById(a.supervisor_id);
          if (!s) return null;
          return (
            <span key={a.id} className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 flex items-center gap-1">
              {s.name}
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
                <UserCheck className="w-5 h-5" />
                <CardTitle className="text-base">{typeLabel} 감독 배정</CardTitle>
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
              <Label className="text-xs">담당 감독 (선박관리사) *</Label>
              <Select value={form.supervisor_id} onValueChange={v => setForm(f => ({ ...f, supervisor_id: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="담당자 선택" /></SelectTrigger>
                <SelectContent>
                  {supervisors.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name} ({s.email})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-400">우리 회사(INK) 선박관리사 중에서 선택합니다</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── 목록 모드: 선주사 > 플릿 > 선박 계층 ───
  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
      <div className="flex items-center gap-2">
        <UserCheck className="w-6 h-6" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">담당 감독 관리</h1>
          <p className="text-sm text-gray-500">선주사·플릿·선박별 내부 담당 감독(선박관리사)을 배정합니다</p>
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
                  <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                  {owner.name}
                </CardTitle>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                  onClick={() => openNewTab(`/supervisor-management?type=owner&entityId=${owner.id}`, `${owner.name} 감독 배정`, true)}>
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
                          <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 px-2"
                            onClick={() => openNewTab(`/supervisor-management?type=fleet&entityId=${fleet.id}`, `${fleet.name} 감독 배정`, true)}>
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
                              <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 px-2"
                                onClick={() => openNewTab(`/supervisor-management?type=ship&entityId=${ship.id}`, `${ship.name} 감독 배정`, true)}>
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
                        <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 px-2"
                          onClick={() => openNewTab(`/supervisor-management?type=ship&entityId=${ship.id}`, `${ship.name} 감독 배정`, true)}>
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
    </div>
  );
}
