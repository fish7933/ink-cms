import { useState, useEffect, useMemo } from 'react';
import { Plus, Ship, Users, Calendar, FileText, CheckCircle, AlertTriangle, X, Trash2, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/store';
import { rotationService } from '@/services/rotation.service';
import type { ContractExpiryInfo } from '@/services/rotation.service';
import { getPorts } from '@/services/port.service';
import { exportRotationPlansLedgerToExcel } from '@/utils/rotation-plan-export';
import type { CrewRotationPlanWithDetails } from '@/types/rotation';
import type { Company, Fleet, Ship as ShipType, User } from '@/types/models';
import { approvalService } from '@/services/approval.service';
import { rotationApprovalService } from '@/services/rotation-approval.service';
import type { ApprovalRequestWithDetails } from '@/services/approval-engine';
import type { ApprovalLineWithSteps } from '@/types/approval';
import { ApprovalChainCell } from '@/components/approval/ApprovalChainCell';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { useTabContext } from '@/contexts/TabContext';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';

type StatusTab = 'all' | 'draft' | 'pending_approval' | 'approved' | 'executed';

const STATUS_CONFIG: Record<StatusTab, { label: string; color: string }> = {
  all:              { label: '전체',    color: '' },
  draft:            { label: '임시저장', color: 'bg-gray-100 text-gray-700' },
  pending_approval: { label: '결재대기', color: 'bg-yellow-100 text-yellow-700' },
  approved:         { label: '승인됨',  color: 'bg-green-100 text-green-700' },
  executed:         { label: '발령완료', color: 'bg-blue-100 text-blue-700' },
};

export function CrewRotationPage() {
  const { openNewTab, activeTabId, tabs } = useTabContext();
  const { toast } = useToast();
  const navigate = useNavigate();
  const permissions = usePermissions('crew_rotation');

  const [plans, setPlans] = useState<CrewRotationPlanWithDetails[]>([]);
  const [planApprovalMap, setPlanApprovalMap] = useState<Map<string, ApprovalRequestWithDetails>>(new Map());
  const [portLabelById, setPortLabelById] = useState<Map<string, string>>(new Map());
  const [monthExporting, setMonthExporting] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'system_admin';

  // 필터
  const [owners, setOwners] = useState<Company[]>([]);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [ships, setShips] = useState<ShipType[]>([]);
  const [filterOwner, setFilterOwner] = useState('');
  const [filterFleet, setFilterFleet] = useState('');
  const [filterShip, setFilterShip] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [deletedCurrentPage, setDeletedCurrentPage] = useState(1);
  const [deletedItemsPerPage, setDeletedItemsPerPage] = useState(20);

  // 계약만료 자동생성 다이얼로그
  const [autoGenOpen, setAutoGenOpen] = useState(false);
  const [expiryThreshold, setExpiryThreshold] = useState(30);
  const [expiryInfo, setExpiryInfo] = useState<ContractExpiryInfo[]>([]);
  const [expiryLoading, setExpiryLoading] = useState(false);
  const [autoGenLoading, setAutoGenLoading] = useState(false);

  // 결재 상신 다이얼로그 (배승 결재 — 채용 결재와 동일하게 결재선을 직접 선택)
  const [approvalLines, setApprovalLines] = useState<ApprovalLineWithSteps[]>([]);
  const [submitDialogPlanIds, setSubmitDialogPlanIds] = useState<string[]>([]);
  const [submitLineId, setSubmitLineId] = useState('');
  const [submitComment, setSubmitComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [defaultLineId, setDefaultLineId] = useState('');
  const [saveLineDefault, setSaveLineDefault] = useState(false);

  useEffect(() => {
    loadPlans(); loadOwners();
    getPorts().then(ports => setPortLabelById(new Map(ports.map(p => [p.id, `${p.country_name} ${p.city_name}`]))));
    getCurrentUser().then(async u => {
      setCurrentUser(u);
      if (!u) return;
      approvalService.getApprovalLines(u.company_id ?? null).then(setApprovalLines);
      const { data: pref } = await supabase.from('users').select('default_approval_line_id').eq('id', u.id).single();
      if (pref?.default_approval_line_id) setDefaultLineId(pref.default_approval_line_id);
    });
  }, []);

  // 메뉴 접속(canView) 권한이 명시적으로 꺼진 경우에도 접근 차단 — 로딩 중(loading)에는
  // 아직 기본값이라 판단하지 않고 기다린다(정상 권한 사용자가 잠깐 튕겨나가는 걸 방지).
  useEffect(() => {
    if (!permissions.loading && !permissions.canView) navigate('/dashboard');
  }, [permissions.loading, permissions.canView, navigate]);

  useEffect(() => {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab?.path === '/crew-rotation') loadPlans();
  }, [activeTabId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!filterOwner) { setFleets([]); setFilterFleet(''); return; }
    supabase.from('fleets').select('*').eq('owner_id', filterOwner).order('name')
      .then(({ data }) => setFleets(data || []));
  }, [filterOwner]);

  useEffect(() => {
    if (!filterOwner) { setShips([]); setFilterShip(''); return; }
    let q = supabase.from('ships').select('*').eq('owner_id', filterOwner);
    if (filterFleet) q = q.eq('fleet_id', filterFleet);
    q.order('name').then(({ data }) => setShips(data || []));
  }, [filterOwner, filterFleet]);

  const loadPlans = async () => {
    setLoading(true);
    setPlans(await rotationService.getRotationPlans());
    // 결재 현황(요청자/결재선) 표시용 — 대상별 최신 결재 1건만 남긴다(최신순 정렬되어 있음)
    try {
      const approvals = await rotationApprovalService.getAllApprovals();
      const amap = new Map<string, ApprovalRequestWithDetails>();
      for (const a of approvals) {
        const planId = a.crew_rotation_plan_id as string;
        if (!amap.has(planId)) amap.set(planId, a);
      }
      setPlanApprovalMap(amap);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
    window.dispatchEvent(new CustomEvent('rotation-plan-data-changed'));
  };

  const loadOwners = async () => {
    const { data } = await supabase.from('companies').select('*').eq('type', 'owner').order('name');
    setOwners(data || []);
  };

  const filteredPlans = useMemo(() => {
    let list = plans;
    if (statusTab !== 'all') list = list.filter(p => p.status === statusTab);
    if (filterOwner) list = list.filter(p => p.owner_id === filterOwner);
    if (filterFleet) list = list.filter(p => p.fleet_id === filterFleet);
    if (filterShip) list = list.filter(p => p.ship_id === filterShip);
    // 목록/페이지네이션이 교대일(월) 기준 최신순으로 이어지도록 정렬 — 그래야 페이지가 바뀌어도
    // 월 그룹이 뒤섞이지 않고 최근월 → 과거월 순으로 차례대로 나온다.
    return [...list].sort((a, b) => b.rotation_date.localeCompare(a.rotation_date));
  }, [plans, statusTab, filterOwner, filterFleet, filterShip]);

  useEffect(() => { setCurrentPage(1); }, [statusTab, filterOwner, filterFleet, filterShip]);
  const totalPages = Math.max(1, Math.ceil(filteredPlans.length / itemsPerPage));
  const paginatedPlans = useMemo(() => filteredPlans.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage), [filteredPlans, currentPage, itemsPerPage]);
  const goToPage = (p: number) => setCurrentPage(Math.max(1, Math.min(p, totalPages)));

  const countByStatus = (s: StatusTab) => s === 'all' ? plans.length : plans.filter(p => p.status === s).length;

  // 배승 계획 목록 엑셀/PDF — ① 상단에서 원하는 달을 여러 개 골라 그 달들에 교대일이 속한 모든 선박의
  // 계획을 내보내거나, ② 목록에서 체크박스로 직접 고른 계획만 내보낸다. 둘 다 선주/선박/번호/승선자/
  // 하선자/교대일/교대국가·도시/비고 형태의 한 표로 나가며, 같은 선박끼리는 셀이 병합된다.
  const [monthPicker, setMonthPicker] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [pickedMonths, setPickedMonths] = useState<string[]>([]);

  const addPickedMonth = () => {
    if (!monthPicker || pickedMonths.includes(monthPicker)) return;
    setPickedMonths(prev => [...prev, monthPicker].sort());
  };
  const removePickedMonth = (m: string) => setPickedMonths(prev => prev.filter(x => x !== m));

  // 선박/선주/플릿 필터와 무관하게 "모든 선박"을 대상으로 하므로 filteredPlans가 아닌 전체 plans 기준
  const plansForMonths = (months: string[]) => {
    const monthSet = new Set(months);
    return plans.filter(p => monthSet.has(p.rotation_date.slice(0, 7)));
  };

  const portLabelMapFor = (targetPlans: CrewRotationPlanWithDetails[]) =>
    new Map(targetPlans.map(p => [p.id, p.port_id ? portLabelById.get(p.port_id) || '-' : '-']));

  const handleExportMonthsExcel = async () => {
    if (pickedMonths.length === 0) { toast({ title: '달을 하나 이상 골라주세요', variant: 'destructive' }); return; }
    const monthPlans = plansForMonths(pickedMonths);
    if (monthPlans.length === 0) { toast({ title: '선택한 달에 교대계획이 없습니다', variant: 'destructive' }); return; }
    setMonthExporting('months');
    try {
      await exportRotationPlansLedgerToExcel(monthPlans, portLabelMapFor(monthPlans), pickedMonths.join('_'));
    } finally {
      setMonthExporting(null);
    }
  };

  const handlePrintMonths = () => {
    if (pickedMonths.length === 0) { toast({ title: '달을 하나 이상 골라주세요', variant: 'destructive' }); return; }
    const monthPlans = plansForMonths(pickedMonths);
    if (monthPlans.length === 0) { toast({ title: '선택한 달에 교대계획이 없습니다', variant: 'destructive' }); return; }
    window.open(`/print/rotation-plans-ledger?months=${pickedMonths.join(',')}`, '_blank');
  };

  const handleExportSelectedExcel = async () => {
    const targetPlans = plans.filter(p => selectedIds.includes(p.id));
    if (targetPlans.length === 0) return;
    setMonthExporting('selected');
    try {
      await exportRotationPlansLedgerToExcel(targetPlans, portLabelMapFor(targetPlans), '선택계획');
    } finally {
      setMonthExporting(null);
    }
  };

  const handlePrintSelected = () => {
    if (selectedIds.length === 0) return;
    window.open(`/print/rotation-plans-ledger?ids=${selectedIds.join(',')}`, '_blank');
  };

  // 삭제(발령 완료 포함 전 상태)는 시스템관리자 이상만 가능. 삭제해도 실제 선원 상태/계약/
  // 승선경력 등은 되돌리지 않고, 목록에서만 빠지며 삭제자/삭제일시가 기록된다.
  const deletableIds = useMemo(() => isAdmin ? filteredPlans.map(p => p.id) : [], [filteredPlans, isAdmin]);
  const allSelectableIds = useMemo(() => filteredPlans.map(p => p.id), [filteredPlans]);
  const approvedSelectedIds = useMemo(
    () => selectedIds.filter(id => plans.find(p => p.id === id)?.status === 'approved'),
    [selectedIds, plans]
  );
  const draftSelectedIds = useMemo(
    () => selectedIds.filter(id => plans.find(p => p.id === id)?.status === 'draft'),
    [selectedIds, plans]
  );

  const toggleSelect = (id: string) =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleSelectAll = (checked: boolean) =>
    setSelectedIds(checked ? allSelectableIds : []);

  const handleDelete = async (planId: string) => {
    if (!currentUser) return;
    if (!confirm('이 교대 계획서를 삭제하시겠습니까? 삭제 이력이 기록됩니다.')) return;
    if (await rotationService.deleteRotationPlan(planId, currentUser.id)) loadPlans();
  };

  const handleBulkDelete = async () => {
    if (!currentUser || selectedIds.length === 0) return;
    if (!confirm(`선택한 ${selectedIds.length}개의 교대 계획서를 삭제하시겠습니까? 삭제 이력이 기록됩니다.`)) return;
    await Promise.all(selectedIds.map(id => rotationService.deleteRotationPlan(id, currentUser.id)));
    setSelectedIds([]);
    loadPlans();
    if (viewingDeleted) loadDeletedPlans();
  };

  // 삭제된 교대 발령함 — 관리자 전용, 영구 삭제 가능
  const [viewingDeleted, setViewingDeleted] = useState(false);
  const [deletedPlans, setDeletedPlans] = useState<(CrewRotationPlanWithDetails & { deleter_name?: string })[]>([]);
  const [deletedLoading, setDeletedLoading] = useState(false);
  const [deletedSelectedIds, setDeletedSelectedIds] = useState<string[]>([]);
  const [bulkPermanentDeleting, setBulkPermanentDeleting] = useState(false);

  const loadDeletedPlans = async () => {
    setDeletedLoading(true);
    setDeletedPlans(await rotationService.getDeletedRotationPlans());
    setDeletedSelectedIds([]);
    setDeletedCurrentPage(1);
    setDeletedLoading(false);
  };

  const openDeletedView = () => { setViewingDeleted(true); loadDeletedPlans(); };

  const deletedTotalPages = Math.max(1, Math.ceil(deletedPlans.length / deletedItemsPerPage));
  const paginatedDeletedPlans = useMemo(
    () => deletedPlans.slice((deletedCurrentPage - 1) * deletedItemsPerPage, deletedCurrentPage * deletedItemsPerPage),
    [deletedPlans, deletedCurrentPage, deletedItemsPerPage]
  );
  const goToDeletedPage = (p: number) => setDeletedCurrentPage(Math.max(1, Math.min(p, deletedTotalPages)));

  const toggleDeletedSelect = (id: string) =>
    setDeletedSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleDeletedSelectAll = (checked: boolean) =>
    setDeletedSelectedIds(checked ? deletedPlans.map(p => p.id) : []);

  const handlePermanentDelete = async (planId: string) => {
    if (!confirm('이 교대 계획서를 영구 삭제하시겠습니까? 되돌릴 수 없습니다.')) return;
    if (await rotationService.permanentlyDeleteRotationPlan(planId)) loadDeletedPlans();
  };

  const handleBulkPermanentDelete = async () => {
    if (deletedSelectedIds.length === 0) return;
    if (!confirm(`선택한 ${deletedSelectedIds.length}개의 교대 계획서를 영구 삭제하시겠습니까? 되돌릴 수 없습니다.`)) return;
    setBulkPermanentDeleting(true);
    try {
      await Promise.all(deletedSelectedIds.map(id => rotationService.permanentlyDeleteRotationPlan(id)));
      await loadDeletedPlans();
    } finally {
      setBulkPermanentDeleting(false);
    }
  };

  const openSubmitDialog = (planId: string) => {
    setSubmitDialogPlanIds([planId]);
    setSubmitLineId(defaultLineId || '');
    setSubmitComment('');
    setSaveLineDefault(false);
  };

  const openBulkSubmitDialog = () => {
    if (draftSelectedIds.length === 0) return;
    setSubmitDialogPlanIds(draftSelectedIds);
    setSubmitLineId(defaultLineId || '');
    setSubmitComment('');
    setSaveLineDefault(false);
  };

  const handleSubmitApproval = async () => {
    if (submitDialogPlanIds.length === 0 || !submitLineId || !currentUser) return;
    try {
      setSubmitting(true);
      if (saveLineDefault) {
        await supabase.from('users').update({ default_approval_line_id: submitLineId }).eq('id', currentUser.id);
        setDefaultLineId(submitLineId);
      }
      const results = await Promise.all(
        submitDialogPlanIds.map(id => rotationService.submitRotationPlanForApproval(id, submitLineId, submitComment || undefined))
      );
      const failCount = results.filter(r => !r.ok).length;
      if (submitDialogPlanIds.length === 1) {
        if (failCount > 0) { toast({ title: '결재 상신 실패', description: results[0].message, variant: 'destructive' }); return; }
        toast({ title: '결재 상신 완료', description: '발령 결재함(배승)에서 진행 상황을 확인할 수 있습니다.' });
      } else {
        const successCount = submitDialogPlanIds.length - failCount;
        toast({
          title: failCount === 0 ? '일괄 결재 상신 완료' : '일부만 처리됨',
          description: `${successCount}/${submitDialogPlanIds.length}건 상신되었습니다.`,
          variant: failCount === 0 ? undefined : 'destructive',
        });
      }
      setSubmitDialogPlanIds([]);
      setSelectedIds([]);
      loadPlans();
    } finally {
      setSubmitting(false);
    }
  };

  const handleExecute = async (planId: string) => {
    if (!confirm('발령을 실행하시겠습니까? 실행하면 선원 상태가 즉시 변경됩니다.')) return;
    if (await rotationService.executeRotationPlan(planId)) {
      alert('발령이 실행되었습니다. 선원 상태가 업데이트되었습니다.');
      loadPlans();
      // 선원 목록 탭 열기 (미개방 시 신규, 개방 시 활성화 - 재마운트되며 최신 데이터 로딩)
      openNewTab('/crew', '선원 목록');
    } else alert('실행 중 오류가 발생했습니다.');
  };

  const [bulkExecuting, setBulkExecuting] = useState(false);

  const handleBulkExecute = async () => {
    if (approvedSelectedIds.length === 0) return;
    if (!confirm(`선택한 승인된 계획 ${approvedSelectedIds.length}건에 대해 일괄 발령 실행하시겠습니까? 실행하면 선원 상태가 즉시 변경됩니다.`)) return;
    setBulkExecuting(true);
    try {
      const results = await Promise.all(approvedSelectedIds.map(id => rotationService.executeRotationPlan(id)));
      const successCount = results.filter(Boolean).length;
      toast({
        title: successCount === approvedSelectedIds.length ? '일괄 발령 실행 완료' : '일부만 처리됨',
        description: `${successCount}/${approvedSelectedIds.length}건 발령이 실행되었습니다.`,
        variant: successCount === approvedSelectedIds.length ? undefined : 'destructive',
      });
      setSelectedIds([]);
      loadPlans();
      openNewTab('/crew', '선원 목록');
    } finally {
      setBulkExecuting(false);
    }
  };

  // 계약만료 하선계획 자동생성
  const openAutoGen = async () => {
    setAutoGenOpen(true);
    setExpiryLoading(true);
    const info = await rotationService.getOnboardContractExpiry();
    setExpiryInfo(info);
    setExpiryLoading(false);
  };

  const expiryFiltered = useMemo(
    () => expiryInfo.filter(e => e.days_until_expiry <= expiryThreshold),
    [expiryInfo, expiryThreshold]
  );

  // 하선예정일(기준) 하루 전/뒤로 출국일/귀국일을 계산 — RotationPlanFormPage의 cascadeDatesFromBase와 동일한 규칙
  const addDays = (iso: string, n: number) => {
    const [y, m, d] = iso.split('-').map(Number);
    const date = new Date(y, m - 1, d + n);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  const handleAutoGenerate = async () => {
    if (expiryFiltered.length === 0) return;
    setAutoGenLoading(true);
    try {
      // 선박별 그룹
      const byShip = new Map<string, ContractExpiryInfo[]>();
      for (const e of expiryFiltered) {
        if (!byShip.has(e.ship_id)) byShip.set(e.ship_id, []);
        byShip.get(e.ship_id)!.push(e);
      }

      let created = 0;
      for (const [shipId, crew] of byShip) {
        const first = crew[0];
        const today = new Date();
        const planName = `${first.ship_name} 계약만료 하선계획 ${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`;
        const plan = await rotationService.createRotationPlan({
          ship_id: shipId,
          owner_id: first.owner_id,
          fleet_id: first.fleet_id || null,
          plan_name: planName,
          rotation_date: crew.map(c => c.expiry_date).sort()[0],
          notes: `계약만료 ${expiryThreshold}일 이내 자동 생성`,
          // 기준 교대일을 비워두지 않고 가장 빠른 만료일로 채워, 나중에 계획을 열었을 때 "기준 교대일"
          // 입력란이 비어있지 않게 한다. 각 행의 개별 승선/하선일은 그대로 선원별 실제 만료일을 유지하며,
          // 이 값은 최초 로드 시에는 재계산을 건너뛰므로(RotationPlanFormPage) 덮어쓰지 않는다 —
          // 관리자가 기준일을 직접 수정할 때만 전체 행에 일괄 반영된다.
          base_departure_date: crew.map(c => c.expiry_date).sort()[0],
          port_id: null,
          assignments: crew.map(c => ({
            off_crew_id: c.crew_id,
            off_rank_id: c.rank_id || null,
            off_rank_grade: null,
            off_disembark_date: c.expiry_date,
            off_return_date: addDays(c.expiry_date, 1),
            on_crew_id: null,
            on_rank_id: null,
            on_rank_grade: null,
            on_departure_date: addDays(c.expiry_date, -1),
            contract_months: null,
            salary_template_id: null,
            salary_amount: null,
            salary_currency: 'USD',
            embark_date: c.expiry_date,
            notes: `계약만료일: ${c.expiry_date} (${c.embark_date} + ${c.contract_months}개월)`,
          })),
        });
        if (plan) created++;
      }

      toast({ title: `${created}개 선박 하선계획 초안 생성 완료`, description: '교대계획 목록에서 확인하세요.' });
      setAutoGenOpen(false);
      loadPlans();
    } catch (e) {
      toast({ title: '생성 실패', description: String(e), variant: 'destructive' });
    } finally {
      setAutoGenLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const cfg = STATUS_CONFIG[status as StatusTab];
    if (!cfg || status === 'all') return <Badge variant="secondary">{status}</Badge>;
    return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>{cfg.label}</span>;
  };

  const expiryColor = (days: number) =>
    days < 0 ? 'text-red-600 font-bold' : days <= 7 ? 'text-red-500' : days <= 30 ? 'text-orange-500' : 'text-gray-600';

  return (
    <div className="container mx-auto py-6 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-muted-foreground" />선원 교대 발령
          </h1>
          <p className="text-xs text-muted-foreground mt-1">선원 승선/하선 교대 계획을 작성하고 결재를 진행합니다</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={viewingDeleted ? () => setViewingDeleted(false) : openDeletedView} className="h-8 text-xs gap-1.5 text-red-600 border-red-300 hover:bg-red-50">
              <Trash2 className="h-3.5 w-3.5" />{viewingDeleted ? '목록으로' : '삭제된 교대 발령'}
            </Button>
          )}
          {permissions.canCreate && (
            <>
              <Button variant="outline" size="sm" onClick={openAutoGen} className="h-8 text-xs gap-1.5 border-orange-300 text-orange-700 hover:bg-orange-50">
                <AlertTriangle className="h-3.5 w-3.5" />계약만료 하선계획 자동생성
              </Button>
              <Button onClick={() => openNewTab('/crew-rotation/new', '교대계획 작성', true)} size="sm" className="h-8">
                <Plus className="mr-2 h-4 w-4" />새 교대 계획 작성
              </Button>
            </>
          )}
        </div>
      </div>

      {viewingDeleted ? (
        <Card>
          <CardHeader className="py-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-sm">삭제된 교대 발령 ({deletedPlans.length}건)</CardTitle>
                <CardDescription className="text-xs">삭제된 교대 계획서 목록입니다. 영구 삭제하면 되돌릴 수 없습니다.</CardDescription>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-400">페이지당</span>
                <Select value={deletedItemsPerPage.toString()} onValueChange={v => { setDeletedItemsPerPage(+v); setDeletedCurrentPage(1); }}>
                  <SelectTrigger className="h-7 w-16 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{[10, 20, 50, 100].map(n => <SelectItem key={n} value={String(n)} className="text-sm">{n}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {deletedLoading ? (
              <div className="text-center py-8 text-muted-foreground text-sm">로딩 중...</div>
            ) : deletedPlans.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">삭제된 교대 계획이 없습니다</div>
            ) : (
              <>
              {deletedSelectedIds.length > 0 && (
                <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-md px-3 py-2 mx-4 mt-3 mb-1">
                  <span className="text-xs text-red-800">{deletedSelectedIds.length}건 선택됨</span>
                  <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-300 hover:bg-red-100" onClick={handleBulkPermanentDelete} disabled={bulkPermanentDeleting}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" />{bulkPermanentDeleting ? '삭제 중...' : `선택 영구 삭제 (${deletedSelectedIds.length})`}
                  </Button>
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">
                      <Checkbox
                        checked={deletedPlans.length > 0 && deletedPlans.every(p => deletedSelectedIds.includes(p.id))}
                        onCheckedChange={checked => toggleDeletedSelectAll(!!checked)}
                      />
                    </TableHead>
                    <TableHead className="text-xs">계획명</TableHead>
                    <TableHead className="text-xs">선주사</TableHead>
                    <TableHead className="text-xs">선박</TableHead>
                    <TableHead className="text-xs">교대일</TableHead>
                    <TableHead className="text-xs">삭제자</TableHead>
                    <TableHead className="text-xs">삭제일시</TableHead>
                    <TableHead className="text-right text-xs">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedDeletedPlans.map(plan => (
                    <TableRow key={plan.id}>
                      <TableCell><Checkbox checked={deletedSelectedIds.includes(plan.id)} onCheckedChange={() => toggleDeletedSelect(plan.id)} /></TableCell>
                      <TableCell className="font-medium text-xs">{plan.plan_name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{plan.owner_name}</TableCell>
                      <TableCell className="text-xs">{plan.ship_name}{plan.fleet_name ? ` (${plan.fleet_name})` : ''}</TableCell>
                      <TableCell className="text-xs">{format(new Date(plan.rotation_date), 'yyyy-MM-dd', { locale: ko })}</TableCell>
                      <TableCell className="text-xs">{plan.deleter_name || '-'}</TableCell>
                      <TableCell className="text-xs">{plan.deleted_at ? format(new Date(plan.deleted_at), 'yyyy-MM-dd HH:mm', { locale: ko }) : '-'}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" className="h-7 text-xs text-red-600 border-red-300 hover:bg-red-50" onClick={() => handlePermanentDelete(plan.id)}>
                          영구 삭제
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {deletedTotalPages > 1 && (
                <div className="flex justify-center items-center gap-2 py-3">
                  <Button variant="outline" size="sm" onClick={() => goToDeletedPage(deletedCurrentPage - 1)} disabled={deletedCurrentPage === 1} className="h-8">
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  {Array.from({ length: Math.min(5, deletedTotalPages) }, (_, i) => {
                    const p = deletedTotalPages <= 5 ? i + 1
                      : deletedCurrentPage <= 3 ? i + 1
                      : deletedCurrentPage >= deletedTotalPages - 2 ? deletedTotalPages - 4 + i
                      : deletedCurrentPage - 2 + i;
                    return (
                      <Button key={p} variant={deletedCurrentPage === p ? 'default' : 'outline'} size="sm"
                        onClick={() => goToDeletedPage(p)} className="h-8 w-8 p-0">{p}</Button>
                    );
                  })}
                  <Button variant="outline" size="sm" onClick={() => goToDeletedPage(deletedCurrentPage + 1)} disabled={deletedCurrentPage === deletedTotalPages} className="h-8">
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              )}
              </>
            )}
          </CardContent>
        </Card>
      ) : (
      <>
      {/* 원래 목록 화면 시작 */}

      {/* 배승 계획 목록 엑셀/PDF — 여러 달을 골라서(선주/선박 필터 무관 전체 선박) 내보낸다 */}
      <div className="flex items-center gap-2 rounded-md border bg-gray-50 px-3 py-2 flex-wrap">
        <span className="text-xs font-medium text-gray-600">배승 계획 목록</span>
        <input
          type="month"
          value={monthPicker}
          onChange={e => setMonthPicker(e.target.value)}
          className="h-8 rounded-md border border-input bg-white px-2 text-xs"
        />
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={addPickedMonth}>+ 달 추가</Button>
        {pickedMonths.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {pickedMonths.map(m => (
              <span key={m} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-md text-xs bg-blue-50 text-blue-700 border border-blue-200">
                {m}
                <button type="button" onClick={() => removePickedMonth(m)} className="hover:text-blue-900"><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
        )}
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={handleExportMonthsExcel} disabled={monthExporting === 'months'}>
          {monthExporting === 'months' ? '내보내는 중...' : '엑셀 다운로드'}
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={handlePrintMonths}>
          PDF 출력
        </Button>
      </div>

      {/* 요약 카드 */}
      <div className="grid gap-3 md:grid-cols-5">
        {(['all','draft','pending_approval','approved','executed'] as StatusTab[]).map(s => (
          <Card key={s} className={`cursor-pointer transition-colors ${statusTab === s ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'}`}
            onClick={() => setStatusTab(s)}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground">{STATUS_CONFIG[s].label}</CardTitle>
              {s === 'all' ? <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                : s === 'draft' ? <FileText className="h-3.5 w-3.5 text-gray-400" />
                : s === 'pending_approval' ? <Calendar className="h-3.5 w-3.5 text-yellow-500" />
                : s === 'approved' ? <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                : <Ship className="h-3.5 w-3.5 text-blue-500" />}
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div className="text-2xl font-bold">{countByStatus(s)}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={filterOwner || '_all'} onValueChange={v => { setFilterOwner(v === '_all' ? '' : v); setFilterFleet(''); setFilterShip(''); }}>
          <SelectTrigger className="h-8 text-xs w-32"><SelectValue placeholder="전체 선주사" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">전체 선주사</SelectItem>
            {owners.map(o => <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterFleet || '_all'} onValueChange={v => { setFilterFleet(v === '_all' ? '' : v); setFilterShip(''); }} disabled={!filterOwner}>
          <SelectTrigger className="h-8 text-xs w-28"><SelectValue placeholder="전체 플릿" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">전체 플릿</SelectItem>
            {fleets.map(f => <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterShip || '_all'} onValueChange={v => setFilterShip(v === '_all' ? '' : v)} disabled={!filterOwner}>
          <SelectTrigger className="h-8 text-xs w-28"><SelectValue placeholder="전체 선박" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">전체 선박</SelectItem>
            {ships.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {(filterOwner || filterFleet || filterShip) && (
          <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={() => { setFilterOwner(''); setFilterFleet(''); setFilterShip(''); }}>
            <X className="w-3 h-3" />초기화
          </Button>
        )}
        <span className="text-xs text-muted-foreground ml-auto">{filteredPlans.length}건</span>
      </div>

      {/* 상태 탭 */}
      <Tabs value={statusTab} onValueChange={v => setStatusTab(v as StatusTab)}>
        <TabsList className="h-8 gap-0.5">
          {(['all','draft','pending_approval','approved','executed'] as StatusTab[]).map(s => (
            <TabsTrigger key={s} value={s} className="text-xs h-7 px-3">
              {STATUS_CONFIG[s].label} <span className="ml-1 text-[10px] opacity-70">({countByStatus(s)})</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* 계획 목록 */}
      <Card>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm">교대 계획 목록</CardTitle>
              <CardDescription className="text-xs">작성된 선원 교대 계획서 목록입니다</CardDescription>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400">페이지당</span>
              <Select value={itemsPerPage.toString()} onValueChange={v => { setItemsPerPage(+v); setCurrentPage(1); }}>
                <SelectTrigger className="h-7 w-16 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{[10, 20, 50, 100].map(n => <SelectItem key={n} value={String(n)} className="text-sm">{n}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        {selectedIds.length > 0 && (
          <div className="flex items-center justify-between gap-2 flex-wrap bg-blue-50 border-y border-blue-200 px-4 py-2">
            <span className="text-xs font-medium text-blue-800">{selectedIds.length}건 선택됨</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {draftSelectedIds.length > 0 && (
                <Button variant="outline" size="sm" className="h-7 text-xs text-blue-600 border-blue-300 bg-white hover:bg-blue-50" onClick={openBulkSubmitDialog}>
                  일괄 결재 상신 ({draftSelectedIds.length})
                </Button>
              )}
              {approvedSelectedIds.length > 0 && (
                <Button size="sm" className="h-7 text-xs gap-1" onClick={handleBulkExecute} disabled={bulkExecuting}>
                  <CheckCircle className="h-3.5 w-3.5" />{bulkExecuting ? '실행 중...' : `일괄 발령실행 (${approvedSelectedIds.length})`}
                </Button>
              )}
              <Button variant="outline" size="sm" className="h-7 text-xs bg-white gap-1" onClick={handleExportSelectedExcel} disabled={monthExporting === 'selected'}>
                {monthExporting === 'selected' ? '내보내는 중...' : `선택 엑셀 (${selectedIds.length})`}
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs bg-white gap-1" onClick={handlePrintSelected}>
                선택 PDF ({selectedIds.length})
              </Button>
              {isAdmin && (
                <Button variant="outline" size="sm" className="h-7 text-xs bg-white text-red-600 border-red-300 hover:bg-red-50" onClick={handleBulkDelete}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" />선택 삭제 ({selectedIds.length})
                </Button>
              )}
            </div>
          </div>
        )}
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">로딩 중...</div>
          ) : filteredPlans.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">교대 계획이 없습니다</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <Checkbox
                      checked={allSelectableIds.length > 0 && allSelectableIds.every(id => selectedIds.includes(id))}
                      onCheckedChange={checked => toggleSelectAll(!!checked)}
                      disabled={allSelectableIds.length === 0}
                    />
                  </TableHead>
                  <TableHead className="text-xs whitespace-nowrap">년월</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">계획명</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">선주사</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">선박</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">교대일</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">교대인원</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">상태</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">결재 현황</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">작성일</TableHead>
                  <TableHead className="text-right text-xs whitespace-nowrap">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedPlans.map(plan => (
                      <TableRow
                        key={plan.id} className="cursor-pointer whitespace-nowrap"
                        onClick={() => openNewTab(
                          plan.status === 'draft' ? `/crew-rotation/${plan.id}/edit` : `/crew-rotation/${plan.id}`,
                          plan.plan_name || '교대계획'
                        )}
                      >
                        <TableCell onClick={e => e.stopPropagation()}>
                          <Checkbox checked={selectedIds.includes(plan.id)} onCheckedChange={() => toggleSelect(plan.id)} />
                        </TableCell>
                        <TableCell className="text-xs text-gray-500">{format(new Date(plan.rotation_date), 'yyyy-MM', { locale: ko })}</TableCell>
                        <TableCell className="font-medium text-xs">{plan.plan_name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{plan.owner_name}</TableCell>
                        <TableCell className="text-xs">
                          <div className="flex items-center gap-1.5">
                            <Ship className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            {plan.ship_name}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">{format(new Date(plan.rotation_date), 'yyyy-MM-dd', { locale: ko })}</TableCell>
                        <TableCell className="text-xs">
                          <div className="flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            {plan.assignments.length}명
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(plan.status)}</TableCell>
                        <TableCell><ApprovalChainCell approval={planApprovalMap.get(plan.id)} /></TableCell>
                        <TableCell className="text-xs">{format(new Date(plan.created_at), 'yyyy-MM-dd HH:mm', { locale: ko })}</TableCell>
                        <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            {plan.status === 'draft' && (
                              <Button variant="outline" size="sm" className="h-7 text-xs text-blue-600 border-blue-300 hover:bg-blue-50" onClick={() => openSubmitDialog(plan.id)}>결재 상신</Button>
                            )}
                            {isAdmin && (
                              <Button variant="outline" size="sm" className="h-7 text-xs text-red-600 border-red-300 hover:bg-red-50" onClick={() => handleDelete(plan.id)}>삭제</Button>
                            )}
                            {plan.status === 'approved' && (
                              <Button variant="default" size="sm" className="h-7 text-xs" onClick={() => handleExecute(plan.id)}>발령 실행</Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 py-3">
              <Button variant="outline" size="sm" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1} className="h-8">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = totalPages <= 5 ? i + 1
                  : currentPage <= 3 ? i + 1
                  : currentPage >= totalPages - 2 ? totalPages - 4 + i
                  : currentPage - 2 + i;
                return (
                  <Button key={p} variant={currentPage === p ? 'default' : 'outline'} size="sm"
                    onClick={() => goToPage(p)} className="h-8 w-8 p-0">{p}</Button>
                );
              })}
              <Button variant="outline" size="sm" onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages} className="h-8">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      </>
      )}

      {/* 계약만료 하선계획 자동생성 다이얼로그 */}
      <Dialog open={autoGenOpen} onOpenChange={setAutoGenOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              계약만료 하선계획 자동생성
            </DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-3 py-2 border-b">
            <span className="text-sm text-gray-600">만료 기준:</span>
            <Select value={String(expiryThreshold)} onValueChange={v => setExpiryThreshold(+v)}>
              <SelectTrigger className="h-8 text-xs w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[7, 14, 30, 60, 90].map(d => <SelectItem key={d} value={String(d)}>{d}일 이내</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">
              {expiryLoading ? '조회 중...' : `해당 선원 ${expiryFiltered.length}명`}
            </span>
          </div>

          <div className="overflow-y-auto flex-1">
            {expiryLoading ? (
              <div className="text-center py-8 text-sm text-muted-foreground">조회 중...</div>
            ) : expiryFiltered.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                {expiryThreshold}일 이내 계약 만료 선원이 없습니다
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">선박</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">선원</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">승선일</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">계약개월</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">계약만료일</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">잔여일</th>
                  </tr>
                </thead>
                <tbody>
                  {expiryFiltered.map(e => (
                    <tr key={e.crew_id} className="border-b hover:bg-gray-50">
                      <td className="px-3 py-1.5 font-medium">{e.ship_name}</td>
                      <td className="px-3 py-1.5">{e.crew_name}</td>
                      <td className="px-3 py-1.5">{e.embark_date}</td>
                      <td className="px-3 py-1.5 text-center">{e.contract_months}개월</td>
                      <td className="px-3 py-1.5">{e.expiry_date}</td>
                      <td className={`px-3 py-1.5 font-medium ${expiryColor(e.days_until_expiry)}`}>
                        {e.days_until_expiry < 0 ? `${Math.abs(e.days_until_expiry)}일 초과` : `${e.days_until_expiry}일`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <DialogFooter className="border-t pt-3">
            <Button variant="outline" onClick={() => setAutoGenOpen(false)}>취소</Button>
            <Button
              onClick={handleAutoGenerate}
              disabled={expiryFiltered.length === 0 || autoGenLoading}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {autoGenLoading ? '생성 중...' : `${new Set(expiryFiltered.map(e => e.ship_id)).size}개 선박 하선계획 초안 생성`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 배승 결재 상신 다이얼로그 */}
      <Dialog open={submitDialogPlanIds.length > 0} onOpenChange={o => !submitting && !o && setSubmitDialogPlanIds([])}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{submitDialogPlanIds.length > 1 ? `배승 결재 상신 (${submitDialogPlanIds.length}건 일괄)` : '배승 결재 상신'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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
              {submitLineId && (
                <div className="flex items-center space-x-2 mt-2">
                  <Checkbox id="save-line-default-rotation" checked={saveLineDefault} onCheckedChange={c => setSaveLineDefault(c as boolean)} />
                  <label htmlFor="save-line-default-rotation" className="text-sm text-gray-700 cursor-pointer">앞으로도 해당 결재 라인 이용</label>
                </div>
              )}
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">요청 사유 (선택)</label>
              <Textarea value={submitComment} onChange={e => setSubmitComment(e.target.value)} placeholder="요청 사유를 입력하세요..." className="min-h-[80px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitDialogPlanIds([])} disabled={submitting}>취소</Button>
            <Button onClick={handleSubmitApproval} disabled={submitting || !submitLineId} className="bg-blue-600 hover:bg-blue-700">
              {submitting ? '처리 중...' : submitDialogPlanIds.length > 1 ? `${submitDialogPlanIds.length}건 결재 상신` : '결재 상신'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
