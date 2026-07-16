import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Trash2, ArrowLeft, Save, Coins, RefreshCw, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { getContracts, addContract, updateContract, deleteContract } from '@/services/contract.service';
import { allowanceService } from '@/services/allowance.service';
import { approvalService } from '@/services/approval.service';
import { contractApprovalService } from '@/services/contract-approval.service';
import { getReferenceOrgUnitNames } from '@/services/approval-authority.service';
import type { ApprovalRequestWithDetails } from '@/services/approval-engine';
import { ApprovalChainCell } from '@/components/approval/ApprovalChainCell';
import { getCurrentUser } from '@/lib/store';
import type { CrewContractWithDetails } from '@/types/contract';
import type { AllowanceType, AllowancePaymentBasis, AllowancePaymentMethod, CrewContractAllowanceWithDetails } from '@/types/allowance';
import type { ApprovalLineWithSteps } from '@/types/approval';
import { buildContractChains, getEffectiveStatus, EFFECTIVE_STATUS_CONFIG, DISEMBARK_NEEDED_THRESHOLD_MONTHS, type ContractChain, type EffectiveStatus } from '@/utils/contract-chain';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';

// 갱신/연장은 시스템상 동일하게 동작해 혼란을 주므로 '연장'으로 통일한다.
// 기존 데이터에 renewal로 저장된 값도 그대로 '연장'으로 표시하고, extension은 신규 선택지에서 제외한다.
const TYPE_LABELS: Record<string, string> = { initial: '최초', renewal: '연장', transfer: '이적' };
const CURRENCIES = ['USD', 'KRW', 'EUR', 'JPY', 'SGD'];
const BASIS_LABELS: Record<AllowancePaymentBasis, string> = { monthly: '매월 지급', lump_sum: '일시불' };
const METHOD_LABELS: Record<AllowancePaymentMethod, string> = { ship_direct: '본선 직접지급', owner_billed: '선주 청구' };
interface CrewOption { id: string; name: string; rank: string; rank_id: string; }
interface ShipOption { id: string; name: string; }

export default function ContractManagementPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const permissions = usePermissions('contract_management');
  const [contracts, setContracts] = useState<CrewContractWithDetails[]>([]);
  const [contractApprovalMap, setContractApprovalMap] = useState<Map<string, ApprovalRequestWithDetails>>(new Map());
  const [contractCcMap, setContractCcMap] = useState<Map<string, string[]>>(new Map());
  const [crewOptions, setCrewOptions] = useState<CrewOption[]>([]);
  const [shipOptions, setShipOptions] = useState<ShipOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [formView, setFormView] = useState<{ record?: CrewContractWithDetails } | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ crew_member_id: '', ship_id: '', contract_number: '', contract_type: 'initial', rank: '', start_date: '', end_date: '', duration_months: '', salary_amount: '', salary_currency: 'USD', overtime_rate: '', leave_pay: '', terms_and_conditions: '', notes: '' });

  const [allowanceTypes, setAllowanceTypes] = useState<AllowanceType[]>([]);
  const [contractAllowances, setContractAllowances] = useState<CrewContractAllowanceWithDetails[]>([]);
  const [newAllowance, setNewAllowance] = useState({ allowance_type_id: '', amount: '', currency: 'USD', payment_basis: 'monthly' as AllowancePaymentBasis, payment_method: 'owner_billed' as AllowancePaymentMethod, notes: '' });

  // 갱신 진행 중이면 저장 시 root_contract_id를 넣고, 저장 성공 후 이전 계약을 renewed로 표시
  const [renewContext, setRenewContext] = useState<{ rootId: string; previousId: string } | null>(null);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // 계약 결재 상신 다이얼로그 — 채용 결재와 동일하게 결재선을 직접 선택. 단건/일괄 공용으로 배열을 쓴다.
  const [approvalLines, setApprovalLines] = useState<ApprovalLineWithSteps[]>([]);
  const [submitDialogContracts, setSubmitDialogContracts] = useState<CrewContractWithDetails[]>([]);
  const [submitLineId, setSubmitLineId] = useState('');
  const [submitComment, setSubmitComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([supabase.from('crew_members').select('id, name, rank, rank_id'), supabase.from('ships').select('id, name')]).then(([crew, ships]) => {
      if (crew.data) setCrewOptions(crew.data.map(c => ({ id: c.id, name: c.name || '', rank: c.rank || '', rank_id: c.rank_id || '' })));
      if (ships.data) setShipOptions(ships.data);
    });
    allowanceService.getTypes().then(setAllowanceTypes);
    getCurrentUser().then(u => { if (u) approvalService.getApprovalLines(u.company_id ?? null).then(setApprovalLines); });
    loadData();
  }, []);

  const openSubmitDialog = (c: CrewContractWithDetails) => { setSubmitDialogContracts([c]); setSubmitLineId(''); setSubmitComment(''); };

  const openBulkSubmitDialog = () => {
    const targets = filteredChains
      .filter(chain => selectedIds.includes(chain.latest.id) && chainStatus(chain) === 'draft')
      .map(chain => chain.latest);
    if (targets.length === 0) return;
    setSubmitDialogContracts(targets);
    setSubmitLineId('');
    setSubmitComment('');
  };

  const handleSubmitApproval = async () => {
    if (submitDialogContracts.length === 0 || !submitLineId) return;
    const currentUser = await getCurrentUser();
    if (!currentUser) return;
    try {
      setSubmitting(true);
      const results = await Promise.allSettled(
        submitDialogContracts.map(c => contractApprovalService.createApproval(c.id, submitLineId, currentUser.id, submitComment || undefined))
      );
      const failCount = results.filter(r => r.status === 'rejected').length;
      if (submitDialogContracts.length === 1) {
        if (failCount > 0) { toast({ title: '결재 상신 실패', variant: 'destructive' }); return; }
        toast({ title: '결재 상신 완료', description: '발령 결재함(계약)에서 진행 상황을 확인할 수 있습니다.' });
      } else {
        const successCount = submitDialogContracts.length - failCount;
        toast({
          title: failCount === 0 ? '일괄 결재 상신 완료' : '일부만 처리됨',
          description: `${successCount}/${submitDialogContracts.length}건 상신되었습니다.`,
          variant: failCount === 0 ? undefined : 'destructive',
        });
      }
      setSubmitDialogContracts([]);
      setSelectedIds([]);
      loadData();
      window.dispatchEvent(new CustomEvent('contract-data-changed'));
    } finally {
      setSubmitting(false);
    }
  };

  const loadContractAllowances = async (contractId: string) => {
    setContractAllowances(await allowanceService.getContractAllowances(contractId));
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setContracts(await getContracts());
      // 결재 현황(요청자/결재선) 표시용 — 대상별 최신 결재 1건만 남긴다(최신순 정렬되어 있음)
      try {
        const approvals = await contractApprovalService.getAllApprovals();
        const amap = new Map<string, ApprovalRequestWithDetails>();
        for (const a of approvals) {
          const contractId = a.crew_contract_id as string;
          if (!amap.has(contractId)) amap.set(contractId, a);
        }
        setContractApprovalMap(amap);
        const ccByRequestId = await getReferenceOrgUnitNames('crew_contract', [...amap.values()].map(a => a.id));
        const ccmap = new Map<string, string[]>();
        for (const [contractId, a] of amap) {
          const labels = ccByRequestId.get(a.id);
          if (labels) ccmap.set(contractId, labels);
        }
        setContractCcMap(ccmap);
      } catch (e) { console.error(e); }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  // 메뉴 접속(canView) 권한이 명시적으로 꺼진 경우에도 접근 차단 — 로딩 중(loading)에는
  // 아직 기본값이라 판단하지 않고 기다린다(정상 권한 사용자가 잠깐 튕겨나가는 걸 방지).
  useEffect(() => {
    if (!permissions.loading && !permissions.canView) navigate('/dashboard');
  }, [permissions.loading, permissions.canView, navigate]);

  const openForm = (c?: CrewContractWithDetails) => {
    if (c) setForm({ crew_member_id: c.crew_member_id, ship_id: c.ship_id || '', contract_number: c.contract_number || '', contract_type: c.contract_type, rank: c.rank, start_date: c.start_date, end_date: c.end_date, duration_months: c.duration_months?.toString() || '', salary_amount: c.salary_amount?.toString() || '', salary_currency: c.salary_currency || 'USD', overtime_rate: c.overtime_rate?.toString() || '', leave_pay: c.leave_pay?.toString() || '', terms_and_conditions: c.terms_and_conditions || '', notes: c.notes || '' });
    else setForm({ crew_member_id: '', ship_id: '', contract_number: '', contract_type: 'initial', rank: '', start_date: '', end_date: '', duration_months: '', salary_amount: '', salary_currency: 'USD', overtime_rate: '', leave_pay: '', terms_and_conditions: '', notes: '' });
    setContractAllowances([]);
    setRenewContext(null);
    if (c) loadContractAllowances(c.id);
    setFormView({ record: c });
  };

  // 만료된(또는 만료 예정인) 계약을 갱신 — 이전 계약 정보를 이어받아 새 계약 기간만 다시 입력받는다.
  const openRenewForm = (chain: ContractChain) => {
    const prev = chain.latest;
    const nextStart = new Date(prev.end_date);
    nextStart.setDate(nextStart.getDate() + 1);
    setForm({
      crew_member_id: prev.crew_member_id,
      ship_id: prev.ship_id || '',
      contract_number: '',
      contract_type: 'renewal',
      rank: prev.rank,
      start_date: nextStart.toISOString().slice(0, 10),
      end_date: '',
      duration_months: '',
      salary_amount: prev.salary_amount?.toString() || '',
      salary_currency: prev.salary_currency || 'USD',
      overtime_rate: prev.overtime_rate?.toString() || '',
      leave_pay: prev.leave_pay?.toString() || '',
      terms_and_conditions: prev.terms_and_conditions || '',
      notes: '',
    });
    setContractAllowances([]);
    setRenewContext({ rootId: chain.rootId, previousId: prev.id });
    setFormView({ record: undefined });
  };

  const closeForm = () => { setFormView(null); setRenewContext(null); loadData(); };

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
      const data = { crew_member_id: form.crew_member_id, ship_id: form.ship_id || undefined, contract_number: form.contract_number || undefined, contract_type: form.contract_type as CrewContractWithDetails['contract_type'], root_contract_id: renewContext?.rootId, rank: form.rank, start_date: form.start_date, end_date: form.end_date, duration_months: form.duration_months ? parseInt(form.duration_months) : undefined, salary_amount: form.salary_amount ? parseFloat(form.salary_amount) : undefined, salary_currency: form.salary_currency, overtime_rate: form.overtime_rate ? parseFloat(form.overtime_rate) : undefined, leave_pay: form.leave_pay ? parseFloat(form.leave_pay) : undefined, terms_and_conditions: form.terms_and_conditions || undefined, status: (formView?.record?.status || 'active') as CrewContractWithDetails['status'], notes: form.notes || undefined };
      if (formView?.record) {
        await updateContract(formView.record.id, data);
        toast({ title: '수정 완료' });
        closeForm();
      } else {
        const created = await addContract(data);
        if (created && renewContext) {
          await updateContract(renewContext.previousId, { status: 'renewed' });
        }
        toast({ title: renewContext ? '연장 완료' : '등록 완료', description: created ? '이어서 수당을 추가할 수 있습니다.' : undefined });
        if (created) {
          const list = await getContracts();
          setContracts(list);
          const withDetails = list.find(c => c.id === created.id);
          if (withDetails) { setFormView({ record: withDetails }); setContractAllowances([]); setRenewContext(null); return; }
        }
        closeForm();
      }
    } catch { toast({ title: '저장 실패', variant: 'destructive' }); } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => { if (!confirm('삭제하시겠습니까?')) return; try { await deleteContract(id); toast({ title: '삭제 완료' }); loadData(); } catch { toast({ title: '실패', variant: 'destructive' }); } };

  const confirmBulkDelete = async () => {
    try {
      await Promise.all(selectedIds.map(id => deleteContract(id)));
      toast({ title: `${selectedIds.length}건 삭제 완료` });
      setSelectedIds([]);
      setShowDeleteDialog(false);
      loadData();
    } catch { toast({ title: '삭제 실패', variant: 'destructive' }); }
  };

  const toggleSelect = (id: string) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleSelectAll = (checked: boolean, rows: ContractChain[]) => setSelectedIds(checked ? rows.map(c => c.latest.id) : []);

  const handleAllowanceTypeSelect = async (typeId: string) => {
    const crew = crewOptions.find(c => c.id === form.crew_member_id);
    const rate = crew?.rank_id ? await allowanceService.getRankRateFor(typeId, crew.rank_id) : null;
    const type = allowanceTypes.find(t => t.id === typeId);
    setNewAllowance({
      allowance_type_id: typeId,
      amount: rate ? String(rate.amount) : '',
      currency: rate?.currency || 'USD',
      payment_basis: type?.payment_basis || 'monthly',
      payment_method: type?.payment_method || 'owner_billed',
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
  const chains = useMemo(() => buildContractChains(contracts), [contracts]);
  const chainStatus = (chain: ContractChain): EffectiveStatus => getEffectiveStatus(chain.latest);
  const getCount = (s: string) => s === 'all' ? chains.length : chains.filter(c => chainStatus(c) === s).length;
  const draftSelectedCount = useMemo(
    () => chains.filter(chain => selectedIds.includes(chain.latest.id) && chainStatus(chain) === 'draft').length,
    [chains, selectedIds] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // 검색: 선원명/선박명/선주사/플릿/직급 대상
  const filteredChains = useMemo(() => {
    let list = chains.filter(c => {
      if (activeTab !== 'all' && chainStatus(c) !== activeTab) return false;
      if (searchTerm) {
        const t = searchTerm.toLowerCase();
        const c2 = c.latest;
        return c2.crew_name.toLowerCase().includes(t) ||
          (c2.ship_name || '').toLowerCase().includes(t) ||
          (c2.owner_name || '').toLowerCase().includes(t) ||
          (c2.fleet_name || '').toLowerCase().includes(t) ||
          (c2.rank_code || '').toLowerCase().includes(t) ||
          (c2.rank_name || '').toLowerCase().includes(t) ||
          c2.rank.toLowerCase().includes(t);
      }
      return true;
    });
    // 정렬: 선주사 > 플릿 > 선박 > 직급 > 이름
    list = [...list].sort((a, b) =>
      (a.latest.owner_name || '').localeCompare(b.latest.owner_name || '', 'ko') ||
      (a.latest.fleet_name || '').localeCompare(b.latest.fleet_name || '', 'ko') ||
      (a.latest.ship_name || '').localeCompare(b.latest.ship_name || '', 'ko') ||
      a.latest.rank.localeCompare(b.latest.rank, 'ko') ||
      a.latest.crew_name.localeCompare(b.latest.crew_name, 'ko')
    );
    return list;
  }, [chains, activeTab, searchTerm]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>;

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              {formView !== null && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={closeForm}><ArrowLeft className="w-4 h-4" /></Button>}
              <div><CardTitle className="text-base">{formView !== null ? (renewContext ? '계약 연장' : formView.record ? '계약 수정' : '계약 등록') : '계약 관리'}</CardTitle><p className="text-xs text-muted-foreground mt-1">{formView !== null ? '선원 고용 계약 정보를 입력합니다' : '선원 고용 계약을 관리합니다'}</p></div>
            </div>
            {formView !== null ? <Button size="sm" className="gap-1.5 h-8" onClick={handleSave} disabled={saving}><Save className="w-4 h-4" />{saving ? '저장 중...' : '저장'}</Button> : permissions.canCreate && <Button size="sm" className="gap-1.5 h-8" onClick={() => openForm()}><Plus className="w-4 h-4" />계약 등록</Button>}
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
                <div className="space-y-1.5"><Label className="text-xs">계약번호</Label><Input value={form.contract_number} placeholder="저장 시 자동 생성됩니다" className="h-9 text-sm bg-gray-50" disabled /></div>
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
              <div className="flex items-center gap-2">
                <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" /><Input placeholder="선원명, 선주사, 플릿, 선박, 직급으로 검색..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 h-9 text-sm" /></div>
                {draftSelectedCount > 0 && permissions.canEdit && (
                  <Button size="sm" variant="outline" className="gap-1.5 h-9 text-blue-600 border-blue-300 hover:bg-blue-50" onClick={openBulkSubmitDialog}>일괄 결재 상신 ({draftSelectedCount})</Button>
                )}
                {selectedIds.length > 0 && permissions.canDelete && (
                  <Button size="sm" variant="destructive" className="gap-1.5 h-9" onClick={() => setShowDeleteDialog(true)}><Trash2 className="w-4 h-4" />선택 삭제 ({selectedIds.length})</Button>
                )}
              </div>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="h-8">
                  <TabsTrigger value="all" className="text-xs h-7">전체 ({getCount('all')})</TabsTrigger>
                  <TabsTrigger value="draft" className="text-xs h-7">결재대기 ({getCount('draft')})</TabsTrigger>
                  <TabsTrigger value="valid" className="text-xs h-7">유효 ({getCount('valid')})</TabsTrigger>
                  <TabsTrigger value="expired" className="text-xs h-7">만료 ({getCount('expired')})</TabsTrigger>
                  <TabsTrigger value="completed" className="text-xs h-7">완료 ({getCount('completed')})</TabsTrigger>
                  <TabsTrigger value="terminated" className="text-xs h-7">해지 ({getCount('terminated')})</TabsTrigger>
                </TabsList>
                {['all','draft','valid','expired','completed','terminated'].map(tab => (
                  <TabsContent key={tab} value={tab} className="mt-2">
                    <div className="overflow-x-auto">
                    <table className="w-full text-xs whitespace-nowrap"><thead><tr className="border-b bg-gray-50">
                      <th className="w-8 p-2"><Checkbox checked={filteredChains.length > 0 && filteredChains.every(c => selectedIds.includes(c.latest.id))} onCheckedChange={checked => toggleSelectAll(!!checked, filteredChains)} /></th>
                      <th className="text-left p-2">선주사</th><th className="text-left p-2">플릿</th><th className="text-left p-2">선박</th><th className="text-left p-2">직급</th><th className="text-left p-2">선원명</th><th className="text-left p-2">국적</th><th className="text-left p-2">최초 계약일</th><th className="text-left p-2">만료일</th><th className="text-left p-2">연장일</th><th className="text-right p-2">급여</th><th className="text-center p-2">상태</th><th className="text-left p-2">결재 현황</th><th className="text-center p-2">작업</th></tr></thead>
                      <tbody>{filteredChains.length === 0 ? <tr><td colSpan={14} className="text-center py-8 text-gray-400">데이터가 없습니다.</td></tr> : filteredChains.map(chain => {
                        const c = chain.latest;
                        const status = chainStatus(chain);
                        const needsDisembark = chain.totalMonths >= DISEMBARK_NEEDED_THRESHOLD_MONTHS && (status === 'valid' || status === 'expired');
                        return (
                        <tr key={chain.rootId} className={`border-b hover:bg-gray-50 ${permissions.canEdit ? 'cursor-pointer' : ''}`} onClick={() => permissions.canEdit && openForm(c)}>
                          <td className="p-2" onClick={e => e.stopPropagation()}><Checkbox checked={selectedIds.includes(c.id)} onCheckedChange={() => toggleSelect(c.id)} /></td>
                          <td className="p-2 text-gray-600">{c.owner_name || '-'}</td>
                          <td className="p-2 text-gray-500">{c.fleet_name || '-'}</td>
                          <td className="p-2">{c.ship_name || '-'}</td>
                          <td className="p-2">{(c.rank_code || c.rank)}{c.rank_grade ? `(${c.rank_grade})` : ''}</td>
                          <td className="p-2 font-medium">
                            {c.crew_name}
                            {needsDisembark && (
                              <Badge className="ml-1.5 text-[10px] bg-orange-100 text-orange-700 gap-0.5 align-middle">
                                <AlertTriangle className="w-2.5 h-2.5" />하선 필요
                              </Badge>
                            )}
                          </td>
                          <td className="p-2 text-muted-foreground">{c.nationality || '-'}</td>
                          <td className="p-2">{chain.root.start_date}</td>
                          <td className="p-2">{c.end_date}</td>
                          <td className="p-2 text-muted-foreground">{c.contract_type === 'renewal' ? c.created_at.slice(0, 10) : '-'}</td>
                          <td className="p-2 text-right font-mono">{c.salary_amount ? `${c.salary_amount.toLocaleString()} ${c.salary_currency}` : '-'}</td>
                          <td className="p-2 text-center"><Badge className={`text-xs ${EFFECTIVE_STATUS_CONFIG[status].color}`}>{EFFECTIVE_STATUS_CONFIG[status].label}</Badge></td>
                          <td className="p-2"><ApprovalChainCell approval={contractApprovalMap.get(c.id)} ccLabels={contractCcMap.get(c.id)} /></td>
                          <td className="p-2 text-center" onClick={e => e.stopPropagation()}>
                            <div className="flex justify-center gap-1">
                              {status === 'draft' && permissions.canEdit && (
                                <Button variant="outline" size="sm" className="h-6 px-2 text-[11px] text-blue-600 border-blue-300 hover:bg-blue-50" onClick={() => openSubmitDialog(c)}>결재 상신</Button>
                              )}
                              {status === 'expired' && permissions.canCreate && (
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-blue-600" title="연장" onClick={() => openRenewForm(chain)}><RefreshCw className="h-3 w-3" /></Button>
                              )}
                              {permissions.canDelete && (
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={() => handleDelete(c.id)}><Trash2 className="h-3 w-3" /></Button>
                              )}
                            </div>
                          </td>
                        </tr>
                        );
                      })}</tbody></table>
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>계약 삭제 확인</AlertDialogTitle>
            <AlertDialogDescription>선택한 {selectedIds.length}건의 계약을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBulkDelete} className="bg-red-600 hover:bg-red-700">삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={submitDialogContracts.length > 0} onOpenChange={o => !submitting && !o && setSubmitDialogContracts([])}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{submitDialogContracts.length > 1 ? `계약 결재 상신 (${submitDialogContracts.length}건 일괄)` : '계약 결재 상신'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {submitDialogContracts.length === 1 ? (
              <div className="p-3 bg-gray-50 rounded-md text-sm space-y-1">
                <div><span className="font-medium">선원:</span> {submitDialogContracts[0].crew_name}</div>
                <div><span className="font-medium">직급:</span> {submitDialogContracts[0].rank_code || submitDialogContracts[0].rank}</div>
                <div><span className="font-medium">선박:</span> {submitDialogContracts[0].ship_name || '-'}</div>
              </div>
            ) : submitDialogContracts.length > 1 && (
              <div className="p-3 bg-gray-50 rounded-md text-sm">
                <div className="font-medium mb-1">대상 {submitDialogContracts.length}건</div>
                <div className="text-xs text-gray-600 max-h-24 overflow-y-auto space-y-0.5">
                  {submitDialogContracts.map(c => (
                    <div key={c.id}>{c.crew_name} ({c.rank_code || c.rank}) · {c.ship_name || '-'}</div>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="text-sm font-medium mb-2 block">결재 라인 선택 *</label>
              <Select value={submitLineId} onValueChange={setSubmitLineId}>
                <SelectTrigger><SelectValue placeholder="결재 라인을 선택하세요" /></SelectTrigger>
                <SelectContent>
                  {approvalLines.length === 0
                    ? <SelectItem value="none" disabled>등록된 결재 라인이 없습니다</SelectItem>
                    : approvalLines.map(l => <SelectItem key={l.id} value={String(l.id)}>{l.name} ({l.steps.length}단계)</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">요청 사유 (선택)</label>
              <Textarea value={submitComment} onChange={e => setSubmitComment(e.target.value)} placeholder="요청 사유를 입력하세요..." className="min-h-[80px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitDialogContracts([])} disabled={submitting}>취소</Button>
            <Button onClick={handleSubmitApproval} disabled={submitting || !submitLineId} className="bg-blue-600 hover:bg-blue-700">
              {submitting ? '처리 중...' : submitDialogContracts.length > 1 ? `${submitDialogContracts.length}건 결재 상신` : '결재 상신'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
