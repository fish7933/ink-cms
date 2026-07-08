import { useState, useEffect } from 'react';
import { Plus, Building2, Ship, ArrowLeft, Save, Search, Edit2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { getCurrentUser } from '@/lib/store';
import { supervisorService } from '@/services/supervisor.service';
import type { Company, User } from '@/types/models';

interface Fleet { id: string; owner_id: string; name: string; description?: string; created_at: string; }
interface FleetWithOwner extends Fleet { owner_name: string; ship_count: number; }

export default function FleetManagementPage() {
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [owners, setOwners] = useState<Company[]>([]);
  const [fleets, setFleets] = useState<FleetWithOwner[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOwner, setSelectedOwner] = useState('all');
  const [formView, setFormView] = useState<{ id?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({ owner_id: '', name: '', description: '' });

  useEffect(() => {
    (async () => {
      const user = await getCurrentUser();
      setCurrentUser(user);
      await loadData(user);
    })();
  }, []);

  const loadData = async (user?: User | null) => {
    try {
      setLoading(true);
      const u = user ?? currentUser;
      const [ownersRes, fleetsRes, shipsRes] = await Promise.all([
        supabase.from('companies').select('*').eq('type', 'owner').order('name'),
        supabase.from('fleets').select('*, companies:owner_id(name)').order('name'),
        supabase.from('ships').select('id, fleet_id').not('fleet_id', 'is', null),
      ]);
      let ownersData = ownersRes.data || [];
      let fleetsData = fleetsRes.data || [];

      // 선박관리사(ship_manager)는 본인이 담당하는 선주사/플릿만 보이도록 제한 (관리자/시스템관리자는 전체 노출)
      if (u?.role === 'ship_manager') {
        const [supervisedOwnerIds, supervisedFleetIds] = await Promise.all([
          supervisorService.getSupervisedOwners(u.id),
          supervisorService.getSupervisedFleets(u.id),
        ]);
        const ownerIdSet = new Set(supervisedOwnerIds);
        const fleetIdSet = new Set(supervisedFleetIds);
        ownersData = ownersData.filter(o => ownerIdSet.has(o.id));
        fleetsData = fleetsData.filter(f => fleetIdSet.has(f.id));
      }

      setOwners(ownersData);
      const shipCounts: Record<string, number> = {};
      (shipsRes.data || []).forEach((s: { fleet_id?: string }) => { if (s.fleet_id) shipCounts[s.fleet_id] = (shipCounts[s.fleet_id] || 0) + 1; });
      setFleets(fleetsData.map((f: Record<string, unknown>) => {
        const company = f.companies as Record<string, unknown> | null;
        return { ...f, owner_name: (company?.name as string) || '', ship_count: shipCounts[f.id as string] || 0 } as FleetWithOwner;
      }));
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const openForm = (fleet?: FleetWithOwner) => {
    if (fleet) {
      setFormData({ owner_id: fleet.owner_id, name: fleet.name, description: fleet.description || '' });
      setFormView({ id: fleet.id });
    } else {
      setFormData({ owner_id: selectedOwner !== 'all' ? selectedOwner : '', name: '', description: '' });
      setFormView({});
    }
  };

  const closeForm = () => { setFormView(null); loadData(); };

  const handleSave = async () => {
    if (!formData.owner_id || !formData.name) { toast({ title: '선주사와 플릿명은 필수입니다.', variant: 'destructive' }); return; }
    try {
      setSaving(true);
      const data = { owner_id: formData.owner_id, name: formData.name, description: formData.description || null };
      if (formView?.id) {
        const { error } = await supabase.from('fleets').update(data).eq('id', formView.id);
        if (error) throw error;
        toast({ title: '수정 완료' });
      } else {
        const { error } = await supabase.from('fleets').insert(data);
        if (error) throw error;
        toast({ title: '등록 완료' });
      }
      closeForm();
    } catch (e) { console.error(e); toast({ title: '저장 실패', variant: 'destructive' }); } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 플릿을 삭제하시겠습니까?')) return;
    try { await supabase.from('fleets').delete().eq('id', id); toast({ title: '삭제 완료' }); loadData(); } catch { toast({ title: '삭제 실패', variant: 'destructive' }); }
  };

  const filtered = fleets.filter(f => selectedOwner === 'all' || f.owner_id === selectedOwner);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>;

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              {formView !== null && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={closeForm}><ArrowLeft className="w-4 h-4" /></Button>}
              <div>
                <CardTitle className="text-base">{formView !== null ? (formView.id ? '플릿 수정' : '플릿 추가') : '플릿 관리'}</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">{formView !== null ? '선주사를 선택하고 플릿 정보를 입력하세요' : '선주사별 플릿(선대)을 관리합니다'}</p>
              </div>
            </div>
            {formView !== null ? (
              <Button size="sm" className="gap-1.5 h-8" onClick={handleSave} disabled={saving}><Save className="w-4 h-4" />{saving ? '저장 중...' : '저장'}</Button>
            ) : (
              <Button size="sm" className="gap-1.5 h-8" onClick={() => openForm()}><Plus className="w-4 h-4" />플릿 추가</Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {formView !== null ? (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">선주사 *</Label>
                  <Select value={formData.owner_id} onValueChange={v => setFormData({ ...formData, owner_id: v })}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="선주사 선택" /></SelectTrigger>
                    <SelectContent>{owners.map(o => <SelectItem key={o.id} value={o.id} className="text-sm">{o.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">플릿명 *</Label>
                  <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="예: Pacific Fleet" className="h-9 text-sm" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">설명</Label>
                <Textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="플릿 설명" rows={3} className="text-sm resize-none" />
              </div>
            </div>
          ) : (
            <>
              <Select value={selectedOwner} onValueChange={setSelectedOwner}>
                <SelectTrigger className="h-9 w-60 text-sm"><SelectValue placeholder="선주사 필터" /></SelectTrigger>
                <SelectContent><SelectItem value="all">전체 선주사</SelectItem>{owners.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
              </Select>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b bg-gray-50">
                    <th className="text-left p-2">선주사</th><th className="text-left p-2">플릿명</th><th className="text-left p-2">설명</th><th className="text-center p-2">선박 수</th><th className="text-center p-2">작업</th>
                  </tr></thead>
                  <tbody>
                    {filtered.length === 0 ? <tr><td colSpan={5} className="text-center py-8 text-gray-400">등록된 플릿이 없습니다</td></tr> : filtered.map(fleet => (
                      <tr key={fleet.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => openForm(fleet)}>
                        <td className="p-2"><div className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5 text-gray-400" />{fleet.owner_name}</div></td>
                        <td className="p-2 font-medium">{fleet.name}</td>
                        <td className="p-2 text-gray-500 max-w-[200px] truncate">{fleet.description || '-'}</td>
                        <td className="p-2 text-center"><div className="flex items-center justify-center gap-1"><Ship className="w-3.5 h-3.5 text-gray-400" />{fleet.ship_count}</div></td>
                        <td className="p-2 text-center" onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-red-500" onClick={() => handleDelete(fleet.id)}><Trash2 className="w-3 h-3" /></Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-400 text-right">총 {filtered.length}건</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
