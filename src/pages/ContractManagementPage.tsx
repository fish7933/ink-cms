import { useState, useEffect } from 'react';
import { Plus, Search, Edit2, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Layout from '@/components/Layout';
import { getContracts, addContract, updateContract, deleteContract } from '@/services/contract.service';
import type { CrewContractWithDetails } from '@/types/contract';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

const TYPE_LABELS: Record<string, string> = { initial: '최초', renewal: '갱신', extension: '연장', transfer: '이적' };
const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft: { label: '임시', color: 'bg-gray-100 text-gray-600' },
  active: { label: '활성', color: 'bg-green-100 text-green-700' },
  completed: { label: '완료', color: 'bg-blue-100 text-blue-700' },
  terminated: { label: '해지', color: 'bg-red-100 text-red-700' },
  renewed: { label: '갱신됨', color: 'bg-purple-100 text-purple-700' },
};
const CURRENCIES = ['USD', 'KRW', 'EUR', 'JPY', 'SGD'];

interface CrewOption { id: string; name: string; rank: string; }
interface ShipOption { id: string; name: string; }

export default function ContractManagementPage() {
  const { toast } = useToast();
  const [contracts, setContracts] = useState<CrewContractWithDetails[]>([]);
  const [crewOptions, setCrewOptions] = useState<CrewOption[]>([]);
  const [shipOptions, setShipOptions] = useState<ShipOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CrewContractWithDetails | undefined>();

  const [form, setForm] = useState({
    crew_member_id: '', ship_id: '', contract_number: '', contract_type: 'initial',
    rank: '', start_date: '', end_date: '', duration_months: '',
    salary_amount: '', salary_currency: 'USD', overtime_rate: '', leave_pay: '',
    signing_port: '', repatriation_port: '', terms_and_conditions: '', notes: '',
  });

  useEffect(() => {
    Promise.all([
      supabase.from('crew_members').select('id, name, rank'),
      supabase.from('ships').select('id, name'),
    ]).then(([crew, ships]) => {
      if (crew.data) setCrewOptions(crew.data.map(c => ({ id: c.id, name: c.name || '', rank: c.rank || '' })));
      if (ships.data) setShipOptions(ships.data);
    });
    loadData();
  }, []);

  const loadData = async () => {
    try { setLoading(true); setContracts(await getContracts()); } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const getCount = (s: string) => s === 'all' ? contracts.length : contracts.filter(c => c.status === s).length;
  const filtered = contracts.filter(c => {
    if (activeTab !== 'all' && c.status !== activeTab) return false;
    if (searchTerm) { const t = searchTerm.toLowerCase(); return c.crew_name.toLowerCase().includes(t) || (c.ship_name || '').toLowerCase().includes(t) || (c.contract_number || '').toLowerCase().includes(t); }
    return true;
  });

  const openEdit = (c?: CrewContractWithDetails) => {
    setEditing(c);
    if (c) {
      setForm({
        crew_member_id: c.crew_member_id, ship_id: c.ship_id || '', contract_number: c.contract_number || '',
        contract_type: c.contract_type, rank: c.rank, start_date: c.start_date, end_date: c.end_date,
        duration_months: c.duration_months?.toString() || '', salary_amount: c.salary_amount?.toString() || '',
        salary_currency: c.salary_currency || 'USD', overtime_rate: c.overtime_rate?.toString() || '',
        leave_pay: c.leave_pay?.toString() || '', signing_port: c.signing_port || '', repatriation_port: c.repatriation_port || '',
        terms_and_conditions: c.terms_and_conditions || '', notes: c.notes || '',
      });
    } else {
      setForm({ crew_member_id: '', ship_id: '', contract_number: '', contract_type: 'initial', rank: '', start_date: '', end_date: '', duration_months: '', salary_amount: '', salary_currency: 'USD', overtime_rate: '', leave_pay: '', signing_port: '', repatriation_port: '', terms_and_conditions: '', notes: '' });
    }
    setDialogOpen(true);
  };

  useEffect(() => {
    if (form.start_date && form.end_date) {
      const start = new Date(form.start_date);
      const end = new Date(form.end_date);
      const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
      if (months > 0) setForm(prev => ({ ...prev, duration_months: months.toString() }));
    }
  }, [form.start_date, form.end_date]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = {
        crew_member_id: form.crew_member_id, ship_id: form.ship_id || undefined,
        contract_number: form.contract_number || undefined, contract_type: form.contract_type as CrewContractWithDetails['contract_type'],
        rank: form.rank, start_date: form.start_date, end_date: form.end_date,
        duration_months: form.duration_months ? parseInt(form.duration_months) : undefined,
        salary_amount: form.salary_amount ? parseFloat(form.salary_amount) : undefined,
        salary_currency: form.salary_currency, overtime_rate: form.overtime_rate ? parseFloat(form.overtime_rate) : undefined,
        leave_pay: form.leave_pay ? parseFloat(form.leave_pay) : undefined,
        signing_port: form.signing_port || undefined, repatriation_port: form.repatriation_port || undefined,
        terms_and_conditions: form.terms_and_conditions || undefined,
        status: (editing?.status || 'active') as CrewContractWithDetails['status'],
        notes: form.notes || undefined,
      };
      if (editing) { await updateContract(editing.id, data); toast({ title: '수정 완료' }); }
      else { await addContract(data); toast({ title: '등록 완료' }); }
      setDialogOpen(false); loadData();
    } catch { toast({ title: '저장 실패', variant: 'destructive' }); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 계약을 삭제하시겠습니까?')) return;
    try { await deleteContract(id); toast({ title: '삭제 완료' }); loadData(); } catch { toast({ title: '삭제 실패', variant: 'destructive' }); }
  };

  if (loading) return <Layout><div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div></Layout>;

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex justify-between items-center">
              <div><CardTitle className="text-base">계약 관리</CardTitle><p className="text-xs text-muted-foreground mt-1">선원 고용 계약을 관리합니다</p></div>
              <Button size="sm" className="gap-1.5 h-8" onClick={() => openEdit()}><Plus className="w-4 h-4" />계약 등록</Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input placeholder="선원명, 선박명, 계약번호로 검색..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 h-9 text-sm" />
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="h-8">
                <TabsTrigger value="all" className="text-xs h-7">전체 ({getCount('all')})</TabsTrigger>
                <TabsTrigger value="active" className="text-xs h-7">활성 ({getCount('active')})</TabsTrigger>
                <TabsTrigger value="completed" className="text-xs h-7">완료 ({getCount('completed')})</TabsTrigger>
                <TabsTrigger value="terminated" className="text-xs h-7">해지 ({getCount('terminated')})</TabsTrigger>
              </TabsList>
              {['all', 'active', 'completed', 'terminated'].map(tab => (
                <TabsContent key={tab} value={tab} className="mt-2">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="border-b bg-gray-50">
                        <th className="text-left p-2">선원명</th><th className="text-left p-2">직급</th><th className="text-left p-2">선박</th>
                        <th className="text-left p-2">유형</th><th className="text-left p-2">기간</th><th className="text-right p-2">급여</th>
                        <th className="text-center p-2">상태</th><th className="text-center p-2">작업</th>
                      </tr></thead>
                      <tbody>
                        {filtered.length === 0 ? <tr><td colSpan={8} className="text-center py-8 text-gray-400">데이터가 없습니다.</td></tr> : filtered.map(c => (
                          <tr key={c.id} className="border-b hover:bg-gray-50">
                            <td className="p-2 font-medium">{c.crew_name}</td>
                            <td className="p-2">{c.rank}</td>
                            <td className="p-2">{c.ship_name || '-'}</td>
                            <td className="p-2">{TYPE_LABELS[c.contract_type]}</td>
                            <td className="p-2">{c.start_date} ~ {c.end_date}{c.duration_months ? ` (${c.duration_months}개월)` : ''}</td>
                            <td className="p-2 text-right font-mono">{c.salary_amount ? `${c.salary_amount.toLocaleString()} ${c.salary_currency}` : '-'}</td>
                            <td className="p-2 text-center"><Badge className={`text-xs ${STATUS_CONFIG[c.status]?.color || ''}`}>{STATUS_CONFIG[c.status]?.label}</Badge></td>
                            <td className="p-2 text-center">
                              <div className="flex justify-center gap-1">
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => openEdit(c)}><Edit2 className="h-3 w-3" /></Button>
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={() => handleDelete(c.id)}><Trash2 className="h-3 w-3" /></Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-base">{editing ? '계약 수정' : '계약 등록'}</DialogTitle><DialogDescription className="text-xs">선원 고용 계약 정보를 입력합니다</DialogDescription></DialogHeader>
          <form onSubmit={handleSave}>
            <div className="grid gap-3 py-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="text-xs">선원 *</Label><Select value={form.crew_member_id} onValueChange={v => setForm({ ...form, crew_member_id: v })}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="선원 선택" /></SelectTrigger><SelectContent>{crewOptions.map(c => <SelectItem key={c.id} value={c.id} className="text-sm">{c.name} ({c.rank})</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1.5"><Label className="text-xs">선박</Label><Select value={form.ship_id} onValueChange={v => setForm({ ...form, ship_id: v })}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="선박 선택" /></SelectTrigger><SelectContent>{shipOptions.map(s => <SelectItem key={s.id} value={s.id} className="text-sm">{s.name}</SelectItem>)}</SelectContent></Select></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5"><Label className="text-xs">계약번호</Label><Input value={form.contract_number} onChange={e => setForm({ ...form, contract_number: e.target.value })} className="h-9 text-sm" /></div>
                <div className="space-y-1.5"><Label className="text-xs">계약 유형 *</Label><Select value={form.contract_type} onValueChange={v => setForm({ ...form, contract_type: v })}><SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k} className="text-sm">{v}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1.5"><Label className="text-xs">직급 *</Label><Input value={form.rank} onChange={e => setForm({ ...form, rank: e.target.value })} required className="h-9 text-sm" /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5"><Label className="text-xs">시작일 *</Label><Input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} required className="h-9 text-sm" /></div>
                <div className="space-y-1.5"><Label className="text-xs">종료일 *</Label><Input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} required className="h-9 text-sm" /></div>
                <div className="space-y-1.5"><Label className="text-xs">기간 (개월)</Label><Input type="number" value={form.duration_months} onChange={e => setForm({ ...form, duration_months: e.target.value })} className="h-9 text-sm" readOnly /></div>
              </div>
              <div className="border-t pt-3"><p className="text-xs font-semibold text-gray-600 mb-2">급여 정보</p>
                <div className="grid grid-cols-4 gap-3">
                  <div className="space-y-1.5"><Label className="text-xs">기본급</Label><Input type="number" step="0.01" value={form.salary_amount} onChange={e => setForm({ ...form, salary_amount: e.target.value })} className="h-9 text-sm" /></div>
                  <div className="space-y-1.5"><Label className="text-xs">통화</Label><Select value={form.salary_currency} onValueChange={v => setForm({ ...form, salary_currency: v })}><SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger><SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-1.5"><Label className="text-xs">초과근무율</Label><Input type="number" step="0.01" value={form.overtime_rate} onChange={e => setForm({ ...form, overtime_rate: e.target.value })} className="h-9 text-sm" /></div>
                  <div className="space-y-1.5"><Label className="text-xs">휴가급</Label><Input type="number" step="0.01" value={form.leave_pay} onChange={e => setForm({ ...form, leave_pay: e.target.value })} className="h-9 text-sm" /></div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="text-xs">계약 체결 항구</Label><Input value={form.signing_port} onChange={e => setForm({ ...form, signing_port: e.target.value })} className="h-9 text-sm" /></div>
                <div className="space-y-1.5"><Label className="text-xs">송환 항구</Label><Input value={form.repatriation_port} onChange={e => setForm({ ...form, repatriation_port: e.target.value })} className="h-9 text-sm" /></div>
              </div>
              <div className="space-y-1.5"><Label className="text-xs">계약 조건</Label><Textarea value={form.terms_and_conditions} onChange={e => setForm({ ...form, terms_and_conditions: e.target.value })} rows={2} className="text-sm resize-none" /></div>
              <div className="space-y-1.5"><Label className="text-xs">비고</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="text-sm resize-none" /></div>
            </div>
            <DialogFooter><Button type="button" size="sm" variant="outline" onClick={() => setDialogOpen(false)} className="h-8">취소</Button><Button type="submit" size="sm" className="h-8">{editing ? '수정' : '등록'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
