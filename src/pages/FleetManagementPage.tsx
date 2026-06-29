import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Ship, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import Layout from '@/components/Layout';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import type { Company } from '@/types/models';

interface Fleet {
  id: string;
  owner_id: string;
  name: string;
  description?: string;
  created_at: string;
}

interface FleetWithOwner extends Fleet {
  owner_name: string;
  ship_count: number;
}

export default function FleetManagementPage() {
  const { toast } = useToast();
  const [owners, setOwners] = useState<Company[]>([]);
  const [fleets, setFleets] = useState<FleetWithOwner[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOwner, setSelectedOwner] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFleet, setEditingFleet] = useState<FleetWithOwner | undefined>();

  const [formData, setFormData] = useState({
    owner_id: '',
    name: '',
    description: '',
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [ownersRes, fleetsRes, shipsRes] = await Promise.all([
        supabase.from('companies').select('*').eq('type', 'owner').order('name'),
        supabase.from('fleets').select('*, companies:owner_id(name)').order('name'),
        supabase.from('ships').select('id, fleet_id').not('fleet_id', 'is', null),
      ]);
      if (ownersRes.data) setOwners(ownersRes.data);

      const shipCounts: Record<string, number> = {};
      (shipsRes.data || []).forEach((s: { fleet_id?: string }) => {
        if (s.fleet_id) shipCounts[s.fleet_id] = (shipCounts[s.fleet_id] || 0) + 1;
      });

      const fleetsData = (fleetsRes.data || []).map((f: Record<string, unknown>) => {
        const company = f.companies as Record<string, unknown> | null;
        return {
          ...f,
          owner_name: (company?.name as string) || '',
          ship_count: shipCounts[f.id as string] || 0,
        } as FleetWithOwner;
      });
      setFleets(fleetsData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const filtered = fleets.filter(f => selectedOwner === 'all' || f.owner_id === selectedOwner);

  const openEdit = (fleet?: FleetWithOwner) => {
    setEditingFleet(fleet);
    if (fleet) {
      setFormData({ owner_id: fleet.owner_id, name: fleet.name, description: fleet.description || '' });
    } else {
      setFormData({ owner_id: selectedOwner !== 'all' ? selectedOwner : '', name: '', description: '' });
    }
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.owner_id || !formData.name) {
      toast({ title: '선주사와 플릿명은 필수입니다.', variant: 'destructive' });
      return;
    }
    try {
      const data = { owner_id: formData.owner_id, name: formData.name, description: formData.description || null };
      if (editingFleet) {
        const { error } = await supabase.from('fleets').update(data).eq('id', editingFleet.id);
        if (error) throw error;
        toast({ title: '수정 완료' });
      } else {
        const { error } = await supabase.from('fleets').insert(data);
        if (error) throw error;
        toast({ title: '등록 완료' });
      }
      setDialogOpen(false);
      loadData();
    } catch (e) {
      console.error(e);
      toast({ title: '저장 실패', variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 플릿을 삭제하시겠습니까?')) return;
    try {
      const { error } = await supabase.from('fleets').delete().eq('id', id);
      if (error) throw error;
      toast({ title: '삭제 완료' });
      loadData();
    } catch {
      toast({ title: '삭제 실패', variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-base">플릿 관리</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">선주사별 플릿(선대)을 관리합니다</p>
              </div>
              <Button size="sm" className="gap-1.5 h-8" onClick={() => openEdit()}>
                <Plus className="w-4 h-4" />플릿 추가
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <Select value={selectedOwner} onValueChange={setSelectedOwner}>
              <SelectTrigger className="h-9 w-60 text-sm">
                <SelectValue placeholder="선주사 필터" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 선주사</SelectItem>
                {owners.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left p-2">선주사</th>
                    <th className="text-left p-2">플릿명</th>
                    <th className="text-left p-2">설명</th>
                    <th className="text-center p-2">선박 수</th>
                    <th className="text-center p-2">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-8 text-gray-400">등록된 플릿이 없습니다</td></tr>
                  ) : filtered.map(fleet => (
                    <tr key={fleet.id} className="border-b hover:bg-gray-50">
                      <td className="p-2">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-gray-400" />
                          <span>{fleet.owner_name}</span>
                        </div>
                      </td>
                      <td className="p-2 font-medium">{fleet.name}</td>
                      <td className="p-2 text-gray-500 max-w-[200px] truncate">{fleet.description || '-'}</td>
                      <td className="p-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Ship className="w-3.5 h-3.5 text-gray-400" />
                          <span>{fleet.ship_count}</span>
                        </div>
                      </td>
                      <td className="p-2 text-center">
                        <div className="flex justify-center gap-1">
                          <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => openEdit(fleet)}>
                            <Pencil className="w-3 h-3 mr-1" />수정
                          </Button>
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-red-500" onClick={() => handleDelete(fleet.id)}>
                            <Trash2 className="w-3 h-3 mr-1" />삭제
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400 text-right">총 {filtered.length}건</p>
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="text-base">{editingFleet ? '플릿 수정' : '플릿 추가'}</DialogTitle>
            <DialogDescription className="text-xs">선주사를 선택하고 플릿 정보를 입력하세요</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-3 py-3">
              <div className="space-y-1.5">
                <Label className="text-xs">선주사 *</Label>
                <Select value={formData.owner_id} onValueChange={v => setFormData({ ...formData, owner_id: v })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="선주사 선택" /></SelectTrigger>
                  <SelectContent>{owners.map(o => <SelectItem key={o.id} value={o.id} className="text-sm">{o.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">플릿명 *</Label>
                <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="예: Pacific Fleet" required className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">설명</Label>
                <Textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="플릿 설명" rows={3} className="text-sm resize-none" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" size="sm" variant="outline" onClick={() => setDialogOpen(false)} className="h-8">취소</Button>
              <Button type="submit" size="sm" className="h-8">{editingFleet ? '수정' : '추가'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
