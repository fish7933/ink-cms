import { useState, useEffect } from 'react';
import { Plus, Search, Trash2, ArrowLeft, Save, Coins } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getContracts, addContract, updateContract, deleteContract } from '@/services/contract.service';
import { allowanceService } from '@/services/allowance.service';
import type { CrewContractWithDetails } from '@/types/contract';
import type { AllowanceType, AllowancePaymentBasis, AllowancePaymentMethod, CrewContractAllowanceWithDetails } from '@/types/allowance';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

const TYPE_LABELS: Record<string, string> = { initial: '최초', renewal: '갱신', extension: '연장', transfer: '이적' };
const STATUS_CONFIG: Record<string, { label: string; color: string }> = { draft: { label: '임시', color: 'bg-gray-100 text-gray-600' }, active: { label: '활성', color: 'bg-green-100 text-green-700' }, completed: { label: '완료', color: 'bg-blue-100 text-blue-700' }, terminated: { label: '해지', color: 'bg-red-100 text-red-700' }, renewed: { label: '갱신됨', color: 'bg-purple-100 text-purple-700' } };
const CURRENCIES = ['USD', 'KRW', 'EUR', 'JPY', 'SGD'];
const BASIS_LABELS: Record<AllowancePaymentBasis, string> = { monthly: '매월 지급', lump_sum: '일시불' };
const METHOD_LABELS: Record<AllowancePaymentMethod, string> = { ship_direct: '본선 직접지급', owner_billed: '선주 청구' };
interface CrewOption { id: string; name: string; rank: string; rank_id: string; }
interface ShipOption { id: string; name: string; }

export default function ContractManagementPage() {
  const { toast } = useToast();
  const [contracts, setContracts] = useState<CrewContractWithDetails[]>([]);
  const [crewOptions, setCrewOptions] = useState<CrewOption[]>([]);
  const [shipOptions, setShipOptions] = useState<ShipOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [formView, setFormView] = useState<{ record?: CrewContractWithDetails } | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ crew_member_id: '', ship_id: '', contract_number: '', contract_type: 'initial', rank: '', start_date: '', end_date: '', duration_months: '', salary_amount: '', salary_currency: 'USD', overtime_rate: '', leave_pay: '', signing_port: '', repatriation_port: '', terms_and_conditions: '', notes: '' });

  const [allowanceTypes, setAllowanceTypes] = useState<AllowanceType[]>([]);
  const [contractAllowances, setContractAllowances] = useState<CrewContractAllowanceWithDetails[]>([]);
  const [newAllowance, setNewAllowance] = useState({ allowance_type_id: '', amount: '', currency: 'USD', payment_basis: 'monthly' as AllowancePaymentBasis, payment_method: 'owner_billed' as AllowancePaymentMethod, notes: '' });

  useEffect(() => {
    Promise.all([supabase.from('crew_members').select('id, name, rank, rank_id'), supabase.from('ships').select('id, name')]).then(([crew, ships]) => {
      if (crew.data) setCrewOptions(crew.data.map(c => ({ id: c.id, name: c.name || '', rank: c.rank || '', rank_id: c.rank_id || '' })));
      if (ships.data) setShipOptions(ships.data);
    });
    allowanceService.getTypes().then(setAllowanceTypes);
    loadData();
  }, []);

  const loadContractAllowances = async (contractId: string) => {
    setContractAllowances(await allowanceService.getContractAllowances(contractId));
  };

  const loadData = async () => { try { setLoading(true); setContracts(await getContracts()); } catch (e) { console.error(e); } finally { setLoading(false); } };

  const openForm = (c?: CrewContractWithDetails) => {
    if (c) setForm({ crew_member_id: c.crew_member_id, ship_id: c.ship_id || '', contract_number: c.contract_number || '', contract_type: c.contract_type, rank: c.rank, start_date: c.start_date, end_date: c.end_date, duration_months: c.duration_months?.toString() || '', salary_amount: c.salary_amount?.toString() || '', salary_currency: c.salary_currency || 'USD', overtime_rate: c.overtime_rate?.toString() || '', leave_pay: c.leave_pay?.toString() || '', signing_port: c.signing_port || '', repatriation_port: c.repatriation_port || '', terms_and_conditions: c.terms_and_conditions || '', notes: c.notes || '' });
    else setForm({ crew_member_id: '', ship_id: '', contract_number: '', contract_type: 'initial', rank: '', start_date: '', end_date: '', duration_months: '', salary_amount: '', salary_currency: 'USD', overtime_rate: '', leave_pay: '', signing_port: '', repatriation_port: '', terms_and_conditions: '', notes: '' });
    setContractAllowances([]);
    if (c) loadContractAllowances(c.id);
    setFormView({ record: c });
  };
  const closeForm = () => { setFormView(null); loadData(); };

  useEffect(() => {
    if (form.start_date && form.end_date) {
      const months = (new Date(form.end_date).getFullYear() - new Date(form.start_date).getFullYear()) * 12 + (new Date(form.end_date).getMonth() - new Date(form.start_date).getMonth());
      if (months > 0) setForm(prev => ({ ...prev, duration_months: months.toString() }));
    }
  }, [form.start_date, form.end_date]);

  const handleSave = async () => {
    if (!form.crew_member_id || !form.rank || !form.start_date || !form.end_date) { toast({ title: '필수 항목을 입력하세요', variant: 'destructive' }); return; }
    try {
      setSaving(true);
      const data = { crew_member_id: form.crew_member_id, ship_id: form.ship_id || undefined, contract_number: form.contract_number || undefined, contract_type: form.contract_type as CrewContractWithDetails['contract_type'], rank: form.rank, start_date: form.start_date, end_date: form.end_date, duration_months: form.duration_months ? parseInt(form.duration_months) : undefined, salary_amount: form.salary_amount ? parseFloat(form.salary_amount) : undefined, salary_currency: form.salary_currency, overtime_rate: form.overtime_rate ? parseFloat(form.overtime_rate) : undefined, leave_pay: form.leave_pay ? parseFloat(form.leave_pay) : undefined, signing_port: form.signing_port || undefined, repatriation_port: form.repatriation_port || undefined, terms_and_conditions: form.terms_and_conditions || undefined, status: (formView?.record?.status || 'active') as CrewContractWithDetails['status'], notes: form.notes || undefined };
      if (formView?.record) {
        await updateContract(formView.record.id, data);
        toast({ title: '수정 완료' });
        closeForm();
      } else {
        const created = await addContract(data);
        toast({ title: '등록 완료', description: created ? '이어서 수당을 추가할 수 있습니다.' : undefined });
        if (created) {
          const list = await getContracts();
          setContracts(list);
          const withDetails = list.find(c => c.id === created.id);
          if (withDetails) { setFormView({ record: withDetails }); setContractAllowances([]); return; }
        }
        closeForm();
      }
    } catch { toast({ title: '저장 실패', variant: 'destructive' }); } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => { if (!confirm('삭제하시겠습니까?')) return; try { await deleteContract(id); toast({ title: '삭제 완료' }); loadData(); } catch { toast({ title: '실패', variant: 'destructive' }); } };

  const handleAllowanceTypeSelect = async (typeId: string) => {
    const crew = crewOptions.find(c => c.id === form.crew_member_id);
    const rate = crew?.rank_id ? await allowanceService.getRankRateFor(typeId, crew.rank_id) : null;
    setNewAllowance({
      allowance_type_id: typeId,
      amount: rate ? String(rate.amount) : '',
      currency: rate?.currency || 'USD',
      payment_basis: rate?.default_payment_basis || 'monthly',
      payment_method: rate?.default_payment_method || 'owner_billed',
      notes: '',
    });
  };

  const handleAddAllowance = async () => {
    if (!formView?.record) return;
    if (!newAllowance.allowance_type_id || !newAllowance.amount) { toast({ title: '수당 유형과 금액을 입력하세요', variant: 'destructive' }); return; }
    const created = await allowanceService.addContractAllowance({
      contract_id: formView.record.id,
      allowance_type_id: newAllowance.allowance_type_id,
      amount: parseFloat(newAllowance.amount),
      currency: newAllowance.currency,
      payment_basis: newAllowance.payment_basis,
      payment_method: newAllowance.payment_method,
      notes: newAllowance.notes || undefined,
    });
    if (!created) { toast({ title: '수당 추가 실패', variant: 'destructive' }); return; }
    toast({ title: '수당이 추가되었습니다' });
    setNewAllowance({ allowance_type_id: '', amount: '', currency: 'USD', payment_basis: 'monthly', payment_method: 'owner_billed', notes: '' });
    await loadContractAllowances(formView.record.id);
  };

  const handleDeleteAllowance = async (id: string) => {
    if (!formView?.record) return;
    await allowanceService.deleteContractAllowance(id);
    await loadContractAllowances(formView.record.id);
  };
  const getCount = (s: string) => s === 'all' ? contracts.length : contracts.filter(c => c.status === s).length;
  const filtered = contracts.filter(c => { if (activeTab !== 'all' && c.status !== activeTab) return false; if (searchTerm) { const t = searchTerm.toLowerCase(); return c.crew_name.toLowerCase().includes(t) || (c.ship_name || '').toLowerCase().includes(t); } return true; });

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>;

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              {formView !== null && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={closeForm}><ArrowLeft className="w-4 h-4" /></Button>}
              <div><CardTitle className="text-base">{formView !== null ? (formView.record ? '계약 수정' : '계약 등록') : '계약 관리'}</CardTitle><p className="text-xs text-muted-foreground mt-1">{formView !== null ? '선원 고용 계약 정보를 입력합니다' : '선원 고용 계약을 관리합니다'}</p></div>
            </div>
            {formView !== null ? <Button size="sm" className="gap-1.5 h-8" onClick={handleSave} disabled={saving}><Save className="w-4 h-4" />{saving ? '저장 중...' : '저장'}</Button> : <Button size="sm" className="gap-1.5 h-8" onClick={() => openForm()}><Plus className="w-4 h-4" />계약 등록</Button>}
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {formView !== null ? (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label className="text-xs">선원 *</Label><Select value={form.crew_member_id} onValueChange={v => setForm({ ...form, crew_member_id: v })}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="선원 선택" /></SelectTrigger><SelectContent>{crewOptions.map(c => <SelectItem key={c.id} value={c.id}>{c.name} ({c.rank})</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1.5"><Label className="text-xs">선박</Label><Select value={form.ship_id} onValueChange={v => setForm({ ...form, ship_id: v })}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="선박 선택" /></SelectTrigger><SelectContent>{shipOptions.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5"><Label className="text-xs">계약번호</Label><Input value={form.contract_number} onChange={e => setForm({ ...form, contract_number: e.target.value })} className="h-9 text-sm" /></div>
                <div className="space-y-1.5"><Label className="text-xs">계약 유형 *</Label><Select value={form.contract_type} onValueChange={v => setForm({ ...form, contract_type: v })}><SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1.5"><Label className="text-xs">직급 *</Label><Input value={form.rank} onChange={e => setForm({ ...form, rank: e.target.value })} className="h-9 text-sm" /></div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5"><Label className="text-xs">시작일 *</Label><Input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className="h-9 text-sm" /></div>
                <div className="space-y-1.5"><Label className="text-xs">종료일 *</Label><Input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} className="h-9 text-sm" /></div>
                <div className="space-y-1.5"><Label className="text-xs">기간 (개월)</Label><Input type="number" value={form.duration_months} className="h-9 text-sm" readOnly /></div>
              </div>
              <div className="border-t pt-3"><p className="text-xs font-semibold text-gray-600 mb-2">급여 정보</p>
                <div className="grid grid-cols-4 gap-3">
                  <div className="space-y-1.5"><Label className="text-xs">기본급</Label><Input type="number" step="0.01" value={form.salary_amount} onChange={e => setForm({ ...form, salary_amount: e.target.value })} className="h-9 text-sm" /></div>
                  <div className="space-y-1.5"><Label className="text-xs">통화</Label><Select value={form.salary_currency} onValueChange={v => setForm({ ...form, salary_currency: v })}><SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger><SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-1.5"><Label className="text-xs">초과근무율</Label><Input type="number" step="0.01" value={form.overtime_rate} onChange={e => setForm({ ...form, overtime_rate: e.target.value })} className="h-9 text-sm" /></div>
                  <div className="space-y-1.5"><Label className="text-xs">휴가급</Label><Input type="number" step="0.01" value={form.leave_pay} onChange={e => setForm({ ...form, leave_pay: e.target.value })} className="h-9 text-sm" /></div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label className="text-xs">계약 체결 항구</Label><Input value={form.signing_port} onChange={e => setForm({ ...form, signing_port: e.target.value })} className="h-9 text-sm" /></div>
                <div className="space-y-1.5"><Label className="text-xs">송환 항구</Label><Input value={form.repatriation_port} onChange={e => setForm({ ...form, repatriation_port: e.target.value })} className="h-9 text-sm" /></div>
              </div>
              <div className="space-y-1.5"><Label className="text-xs">계약 조건</Label><Textarea value={form.terms_and_conditions} onChange={e => setForm({ ...form, terms_and_conditions: e.target.value })} rows={2} className="text-sm resize-none" /></div>
              <div className="space-y-1.5"><Label className="text-xs">비고</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="text-sm resize-none" /></div>

              {formView?.record && (
                <div className="border-t pt-3">
                  <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1.5">
                    <Coins className="w-3.5 h-3.5" />수당 (급여 구성항목과 별개로 급여명세표 지급항목에 별도로 붙습니다)
                  </p>
                  {contractAllowances.length > 0 && (
                    <table className="w-full text-xs mb-3">
                      <thead><tr className="border-b bg-gray-50">
                        <th className="text-left p-1.5">수당명</th><th className="text-right p-1.5">금액</th><th className="text-left p-1.5">지급방식</th><th className="text-left p-1.5">지급주체</th><th className="text-left p-1.5">비고</th><th className="p-1.5 w-8"></th>
                      </tr></thead>
                      <tbody>
                        {contractAllowances.map(a => (
                          <tr key={a.id} className="border-b">
                            <td className="p-1.5 font-medium">{a.allowance_type_name}</td>
                            <td className="p-1.5 text-right font-mono">{a.amount.toLocaleString()} {a.currency}</td>
                            <td className="p-1.5">{BASIS_LABELS[a.payment_basis]}</td>
                            <td className="p-1.5">{METHOD_LABELS[a.payment_method]}</td>
                            <td className="p-1.5 text-muted-foreground">{a.notes || '-'}</td>
                            <td className="p-1.5 text-center"><Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={() => handleDeleteAllowance(a.id)}><Trash2 className="h-3 w-3" /></Button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <div className="grid grid-cols-6 gap-2 items-end">
                    <div className="space-y-1.5 col-span-2">
                      <Label className="text-xs">수당 유형</Label>
                      <Select value={newAllowance.allowance_type_id} onValueChange={handleAllowanceTypeSelect}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="선택" /></SelectTrigger>
                        <SelectContent>{allowanceTypes.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5"><Label className="text-xs">금액</Label><Input type="number" value={newAllowance.amount} onChange={e => setNewAllowance(p => ({ ...p, amount: e.target.value }))} className="h-9 text-sm" /></div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">지급방식</Label>
                      <Select value={newAllowance.payment_basis} onValueChange={v => setNewAllowance(p => ({ ...p, payment_basis: v as AllowancePaymentBasis }))}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>{Object.entries(BASIS_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">지급주체</Label>
                      <Select value={newAllowance.payment_method} onValueChange={v => setNewAllowance(p => ({ ...p, payment_method: v as AllowancePaymentMethod }))}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>{Object.entries(METHOD_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <Button size="sm" variant="outline" className="h-9 text-xs" onClick={handleAddAllowance}>추가</Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" /><Input placeholder="선원명, 선박명으로 검색..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 h-9 text-sm" /></div>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="h-8"><TabsTrigger value="all" className="text-xs h-7">전체 ({getCount('all')})</TabsTrigger><TabsTrigger value="active" className="text-xs h-7">활성 ({getCount('active')})</TabsTrigger><TabsTrigger value="completed" className="text-xs h-7">완료 ({getCount('completed')})</TabsTrigger><TabsTrigger value="terminated" className="text-xs h-7">해지 ({getCount('terminated')})</TabsTrigger></TabsList>
                {['all','active','completed','terminated'].map(tab => (
                  <TabsContent key={tab} value={tab} className="mt-2">
                    <table className="w-full text-xs"><thead><tr className="border-b bg-gray-50"><th className="text-left p-2">선원명</th><th className="text-left p-2">국적</th><th className="text-left p-2">직급</th><th className="text-left p-2">선주사/플릿/선박</th><th className="text-left p-2">유형</th><th className="text-left p-2">기간</th><th className="text-right p-2">급여</th><th className="text-center p-2">상태</th><th className="text-center p-2">작업</th></tr></thead>
                      <tbody>{filtered.length === 0 ? <tr><td colSpan={9} className="text-center py-8 text-gray-400">데이터가 없습니다.</td></tr> : filtered.map(c => (
                        <tr key={c.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => openForm(c)}>
                          <td className="p-2 font-medium">{c.crew_name}</td>
                          <td className="p-2 text-muted-foreground">{c.nationality || '-'}</td>
                          <td className="p-2">{c.rank}</td>
                          <td className="p-2">
                            <div>{c.ship_name || '-'}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {c.owner_name}{c.fleet_name ? ` · ${c.fleet_name}` : ''}
                            </div>
                          </td>
                          <td className="p-2">{TYPE_LABELS[c.contract_type]}</td>
                          <td className="p-2">{c.start_date} ~ {c.end_date}{c.duration_months ? ` (${c.duration_months}개월)` : ''}</td><td className="p-2 text-right font-mono">{c.salary_amount ? `${c.salary_amount.toLocaleString()} ${c.salary_currency}` : '-'}</td>
                          <td className="p-2 text-center"><Badge className={`text-xs ${STATUS_CONFIG[c.status]?.color}`}>{STATUS_CONFIG[c.status]?.label}</Badge></td>
                          <td className="p-2 text-center" onClick={e => e.stopPropagation()}><Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={() => handleDelete(c.id)}><Trash2 className="h-3 w-3" /></Button></td>
                        </tr>))}</tbody></table>
                  </TabsContent>
                ))}
              </Tabs>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
