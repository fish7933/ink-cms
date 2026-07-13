import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { CheckCircle2, XCircle, Clock, User, ArrowLeft, Trash2, FileText, Ship as ShipIcon, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { getCurrentUser } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { useNavigate } from 'react-router-dom';
import { approvalService } from '@/services/approval.service';
import { rotationApprovalService } from '@/services/rotation-approval.service';
import { contractApprovalService } from '@/services/contract-approval.service';
import { dispatchOrderApprovalService } from '@/services/dispatch-order-approval.service';
import { supabase } from '@/lib/supabase';
import type { CrewRecommendationApprovalWithDetails, ApprovalLineStep, ApprovalAction } from '@/types/approval';
import type { CrewRecommendation } from '@/types/crew-recommendation';
import type { ApprovalRequestWithDetails } from '@/services/approval-engine';

type ApprovalWithRecommendation = CrewRecommendationApprovalWithDetails & { recommendation?: CrewRecommendation & { crew_name?: string; ship_name?: string } };
type RotationApprovalWithPlan = ApprovalRequestWithDetails & { plan_name?: string; ship_name?: string };
type ContractApprovalWithContract = ApprovalRequestWithDetails & { crew_name?: string; rank_code?: string; ship_name?: string };
type DispatchApprovalWithOrder = ApprovalRequestWithDetails & {
  crew_name?: string; dispatch_type?: 'promotion' | 'demotion';
  previous_rank_code?: string; previous_grade?: string | null;
  new_rank_code?: string; new_grade?: string | null; ship_name?: string;
};

// isMyTurn/filterList/renderTable에서 채용(CrewRecommendationApprovalWithDetails)과
// 배승/계약(ApprovalRequestWithDetails, 인덱스 시그니처 포함)을 함께 다루기 위한 최소 구조 타입.
interface ApprovalLike {
  id: string;
  status: string;
  requester_id: string;
  requester_name: string;
  requester_role?: string;
  created_at: string;
  current_step: number;
  approval_line: { name: string; steps: ApprovalLineStep[] };
  actions: ApprovalAction[];
  current_approver?: ApprovalLineStep;
}

type Filter = 'all' | 'mine' | 'pending' | 'approved' | 'rejected';
type Domain = 'crew' | 'rotation' | 'contract' | 'dispatch';
const PAGE_SIZE = 20;

// approvalService / rotationApprovalService / contractApprovalService가 공통으로 갖는 결재 액션 메서드
interface ApprovalActionService {
  approveStep(id: string, approverId: string, comment?: string): Promise<void>;
  rejectStep(id: string, approverId: string, comment: string): Promise<void>;
  adminForceApprove(id: string, adminId: string, comment?: string): Promise<void>;
  adminForceReject(id: string, adminId: string, comment: string): Promise<void>;
}

const FILTER_LABELS: { value: Filter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'mine', label: '내가 요청한' },
  { value: 'pending', label: '결재중' },
  { value: 'approved', label: '승인' },
  { value: 'rejected', label: '반려' },
];

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'pending': return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200"><Clock className="w-3 h-3 mr-1" />결재중</Badge>;
    case 'approved': return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200"><CheckCircle2 className="w-3 h-3 mr-1" />승인</Badge>;
    case 'rejected': return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200"><XCircle className="w-3 h-3 mr-1" />반려</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
};

export default function DispatchApprovalInboxPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [initializing, setInitializing] = useState(true);
  const [currentUserId, setCurrentUserId] = useState('');
  const [currentUserName, setCurrentUserName] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  const permissions = usePermissions('dispatch_approval_inbox');

  useEffect(() => {
    if (!permissions.loading && !permissions.canView) navigate('/dashboard');
  }, [permissions.loading, permissions.canView, navigate]);

  // 채용
  const [crewApprovals, setCrewApprovals] = useState<ApprovalWithRecommendation[]>([]);
  const [crewFilter, setCrewFilter] = useState<Filter>('all');
  const [crewPage, setCrewPage] = useState(1);
  const [crewViewMode, setCrewViewMode] = useState<'list' | 'action'>('list');
  const [selectedCrew, setSelectedCrew] = useState<ApprovalWithRecommendation | null>(null);
  const [crewAction, setCrewAction] = useState<'approve' | 'reject' | null>(null);
  const [crewComment, setCrewComment] = useState('');
  const [crewProcessing, setCrewProcessing] = useState(false);

  // 배승
  const [rotationApprovals, setRotationApprovals] = useState<RotationApprovalWithPlan[]>([]);
  const [rotationFilter, setRotationFilter] = useState<Filter>('all');
  const [rotationPage, setRotationPage] = useState(1);
  const [rotationViewMode, setRotationViewMode] = useState<'list' | 'action'>('list');
  const [selectedRotation, setSelectedRotation] = useState<RotationApprovalWithPlan | null>(null);
  const [rotationAction, setRotationAction] = useState<'approve' | 'reject' | null>(null);
  const [rotationComment, setRotationComment] = useState('');
  const [rotationProcessing, setRotationProcessing] = useState(false);

  // 계약
  const [contractApprovals, setContractApprovals] = useState<ContractApprovalWithContract[]>([]);
  const [contractFilter, setContractFilter] = useState<Filter>('all');
  const [contractPage, setContractPage] = useState(1);
  const [contractViewMode, setContractViewMode] = useState<'list' | 'action'>('list');
  const [selectedContract, setSelectedContract] = useState<ContractApprovalWithContract | null>(null);
  const [contractAction, setContractAction] = useState<'approve' | 'reject' | null>(null);
  const [contractComment, setContractComment] = useState('');
  const [contractProcessing, setContractProcessing] = useState(false);

  // 승진/강등 발령
  const [dispatchApprovals, setDispatchApprovals] = useState<DispatchApprovalWithOrder[]>([]);
  const [dispatchFilter, setDispatchFilter] = useState<Filter>('all');
  const [dispatchPage, setDispatchPage] = useState(1);
  const [dispatchViewMode, setDispatchViewMode] = useState<'list' | 'action'>('list');
  const [selectedDispatch, setSelectedDispatch] = useState<DispatchApprovalWithOrder | null>(null);
  const [dispatchAction, setDispatchAction] = useState<'approve' | 'reject' | null>(null);
  const [dispatchComment, setDispatchComment] = useState('');
  const [dispatchProcessing, setDispatchProcessing] = useState(false);

  // 다중 선택 일괄 승인/반려
  const [crewSelectedIds, setCrewSelectedIds] = useState<string[]>([]);
  const [rotationSelectedIds, setRotationSelectedIds] = useState<string[]>([]);
  const [contractSelectedIds, setContractSelectedIds] = useState<string[]>([]);
  const [dispatchSelectedIds, setDispatchSelectedIds] = useState<string[]>([]);
  const [bulkDialog, setBulkDialog] = useState<{ domain: Domain; action: 'approve' | 'reject' } | null>(null);
  const [bulkComment, setBulkComment] = useState('');
  const [bulkProcessing, setBulkProcessing] = useState(false);

  useEffect(() => { setCrewPage(1); setCrewSelectedIds([]); }, [crewFilter]);
  useEffect(() => { setRotationPage(1); setRotationSelectedIds([]); }, [rotationFilter]);
  useEffect(() => { setContractPage(1); setContractSelectedIds([]); }, [contractFilter]);
  useEffect(() => { setDispatchPage(1); setDispatchSelectedIds([]); }, [dispatchFilter]);

  useEffect(() => { init(); }, []);

  const init = async () => {
    try {
      setInitializing(true);
      const currentUser = await getCurrentUser();
      if (!currentUser) { navigate('/login'); return; }
      const admin = currentUser.role === 'admin' || currentUser.role === 'system_admin';
      setCurrentUserId(currentUser.id);
      setCurrentUserName(currentUser.name ?? '');
      setIsAdmin(admin);

      await Promise.all([
        loadCrewApprovals(currentUser.id, admin),
        loadRotationApprovals(currentUser.id, admin),
        loadContractApprovals(currentUser.id, admin),
        loadDispatchApprovals(currentUser.id, admin),
      ]);
    } finally {
      setInitializing(false);
    }
  };

  // --- 채용: 데이터 로딩 ---

  const loadCrewApprovals = async (userId: string, admin: boolean) => {
    try {
      const approvals = admin ? await approvalService.getAllApprovals() : await approvalService.getMyRelatedApprovals(userId);
      if (approvals.length === 0) { setCrewApprovals([]); return; }
      const crewRecIds = [...new Set(approvals.map(a => a.crew_recommendation_id))];
      const { data: crewRecs, error } = await supabase.from('crew_recommendations').select('*').in('id', crewRecIds);
      if (error) throw error;
      const crewRecsMap = new Map((crewRecs || []).map((cr: { id: string }) => [cr.id, cr]));
      const merged = approvals
        .map(a => ({ ...a, recommendation: crewRecsMap.get(a.crew_recommendation_id) }))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setCrewApprovals(merged as ApprovalWithRecommendation[]);
    } catch (e) {
      console.error(e);
      toast({ title: '오류', description: '채용 결재를 불러오는 중 오류가 발생했습니다.', variant: 'destructive' });
    }
  };

  // --- 배승: 데이터 로딩 ---

  const loadRotationApprovals = async (userId: string, admin: boolean) => {
    try {
      const approvals = admin ? await rotationApprovalService.getAllApprovals() : await rotationApprovalService.getMyRelatedApprovals(userId);
      if (approvals.length === 0) { setRotationApprovals([]); return; }
      const planIds = [...new Set(approvals.map(a => a.crew_rotation_plan_id as string))];
      const { data: plans, error } = await supabase.from('crew_rotation_plans').select('id, plan_name, ship_id, ships:ship_id(name)').in('id', planIds);
      if (error) throw error;
      const planMap = new Map((plans || []).map((p: Record<string, unknown>) => [p.id as string, p]));
      const merged = approvals
        .map(a => {
          const plan = planMap.get(a.crew_rotation_plan_id as string) as Record<string, unknown> | undefined;
          const ship = plan?.ships as Record<string, unknown> | null;
          return { ...a, plan_name: (plan?.plan_name as string) || '교대계획', ship_name: (ship?.name as string) || '-' };
        })
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setRotationApprovals(merged);
    } catch (e) {
      console.error(e);
      toast({ title: '오류', description: '배승 결재를 불러오는 중 오류가 발생했습니다.', variant: 'destructive' });
    }
  };

  // --- 계약: 데이터 로딩 ---

  const loadContractApprovals = async (userId: string, admin: boolean) => {
    try {
      const approvals = admin ? await contractApprovalService.getAllApprovals() : await contractApprovalService.getMyRelatedApprovals(userId);
      if (approvals.length === 0) { setContractApprovals([]); return; }
      const contractIds = [...new Set(approvals.map(a => a.crew_contract_id as string))];
      const { data: contracts, error } = await supabase
        .from('crew_contracts')
        .select('id, rank, crew_members:crew_member_id(name), ships:ship_id(name)')
        .in('id', contractIds);
      if (error) throw error;
      const contractMap = new Map((contracts || []).map((c: Record<string, unknown>) => [c.id as string, c]));
      const merged = approvals
        .map(a => {
          const c = contractMap.get(a.crew_contract_id as string) as Record<string, unknown> | undefined;
          const crew = c?.crew_members as Record<string, unknown> | null;
          const ship = c?.ships as Record<string, unknown> | null;
          return { ...a, crew_name: (crew?.name as string) || '-', rank_code: (c?.rank as string) || '-', ship_name: (ship?.name as string) || '-' };
        })
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setContractApprovals(merged);
    } catch (e) {
      console.error(e);
      toast({ title: '오류', description: '계약 결재를 불러오는 중 오류가 발생했습니다.', variant: 'destructive' });
    }
  };

  // --- 승진/강등 발령: 데이터 로딩 ---

  const loadDispatchApprovals = async (userId: string, admin: boolean) => {
    try {
      const approvals = admin ? await dispatchOrderApprovalService.getAllApprovals() : await dispatchOrderApprovalService.getMyRelatedApprovals(userId);
      if (approvals.length === 0) { setDispatchApprovals([]); return; }
      const orderIds = [...new Set(approvals.map(a => a.crew_dispatch_order_id as string))];
      const { data: orders, error } = await supabase
        .from('crew_dispatch_orders')
        .select(`
          id, dispatch_type, previous_grade, new_grade,
          crew_members:crew_member_id(name), ships:ship_id(name),
          previous_rank:ranks!crew_dispatch_orders_previous_rank_id_fkey(rank_code),
          new_rank:ranks!crew_dispatch_orders_new_rank_id_fkey(rank_code)
        `)
        .in('id', orderIds);
      if (error) throw error;
      const orderMap = new Map((orders || []).map((o: Record<string, unknown>) => [o.id as string, o]));
      const merged = approvals
        .map(a => {
          const o = orderMap.get(a.crew_dispatch_order_id as string) as Record<string, unknown> | undefined;
          const crew = o?.crew_members as Record<string, unknown> | null;
          const ship = o?.ships as Record<string, unknown> | null;
          const prevRank = o?.previous_rank as Record<string, unknown> | null;
          const newRank = o?.new_rank as Record<string, unknown> | null;
          return {
            ...a,
            crew_name: (crew?.name as string) || '-',
            dispatch_type: o?.dispatch_type as 'promotion' | 'demotion' | undefined,
            previous_rank_code: (prevRank?.rank_code as string) || '-',
            previous_grade: (o?.previous_grade as string) || null,
            new_rank_code: (newRank?.rank_code as string) || '-',
            new_grade: (o?.new_grade as string) || null,
            ship_name: (ship?.name as string) || '-',
          };
        })
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setDispatchApprovals(merged);
    } catch (e) {
      console.error(e);
      toast({ title: '오류', description: '승진/강등 발령 결재를 불러오는 중 오류가 발생했습니다.', variant: 'destructive' });
    }
  };

  // --- 공통 헬퍼 ---

  const isMyTurn = (approval: ApprovalLike) => {
    if (approval.status !== 'pending') return false;
    if (isAdmin) return true;
    return approval.current_approver?.approver_id === currentUserId;
  };

  const myTurnBadge = (count: number) => count === 0 ? null : (
    <span className="inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold">
      {count}
    </span>
  );

  const filterList = <T extends ApprovalLike>(list: T[], filter: Filter): T[] => {
    if (filter === 'mine') return list.filter(a => a.requester_id === currentUserId);
    if (filter === 'pending') return list.filter(a => a.status === 'pending');
    if (filter === 'approved') return list.filter(a => a.status === 'approved');
    if (filter === 'rejected') return list.filter(a => a.status === 'rejected');
    return list;
  };

  // --- 채용: 액션 ---

  const handleCrewAction = async () => {
    if (!selectedCrew || !crewAction) return;
    if (crewAction === 'reject' && !crewComment.trim()) { toast({ title: '오류', description: '반려 사유를 입력해주세요.', variant: 'destructive' }); return; }
    try {
      setCrewProcessing(true);
      if (isAdmin) {
        if (crewAction === 'reject') await approvalService.adminForceReject(selectedCrew.id, currentUserId, crewComment);
        else await approvalService.adminForceApprove(selectedCrew.id, currentUserId, crewComment || undefined);
      } else {
        if (crewAction === 'reject') await approvalService.rejectStep(selectedCrew.id, currentUserId, crewComment);
        else await approvalService.approveStep(selectedCrew.id, currentUserId, crewComment || undefined);
      }
      toast({ title: '성공', description: crewAction === 'approve' ? '승인되었습니다.' : '반려되었습니다.' });
      setCrewViewMode('list'); setSelectedCrew(null); setCrewAction(null); setCrewComment('');
      await loadCrewApprovals(currentUserId, isAdmin);
      window.dispatchEvent(new CustomEvent('dispatch-approval-inbox-data-changed'));
    } catch (e) {
      console.error(e);
      toast({ title: '오류', description: '결재 처리 중 오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setCrewProcessing(false);
    }
  };

  const handleDeleteCrew = async (approval: ApprovalWithRecommendation) => {
    if (!confirm('이 결재 이력을 삭제하시겠습니까? 이미 등록된 선원 정보는 유지되며, 결재 이력만 삭제되어 되돌릴 수 없습니다.')) return;
    try {
      await approvalService.deleteApproval(approval, approval.recommendation?.crew_name || '알 수 없음', currentUserId, currentUserName);
      toast({ title: '삭제되었습니다.' });
      setSelectedCrew(null);
      await loadCrewApprovals(currentUserId, isAdmin);
    } catch (e) {
      toast({ title: '삭제 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  // --- 배승: 액션 ---

  const handleRotationAction = async () => {
    if (!selectedRotation || !rotationAction) return;
    if (rotationAction === 'reject' && !rotationComment.trim()) { toast({ title: '오류', description: '반려 사유를 입력해주세요.', variant: 'destructive' }); return; }
    try {
      setRotationProcessing(true);
      if (isAdmin) {
        if (rotationAction === 'reject') await rotationApprovalService.adminForceReject(selectedRotation.id, currentUserId, rotationComment);
        else await rotationApprovalService.adminForceApprove(selectedRotation.id, currentUserId, rotationComment || undefined);
      } else {
        if (rotationAction === 'reject') await rotationApprovalService.rejectStep(selectedRotation.id, currentUserId, rotationComment);
        else await rotationApprovalService.approveStep(selectedRotation.id, currentUserId, rotationComment || undefined);
      }
      toast({ title: '성공', description: rotationAction === 'approve' ? '승인되었습니다.' : '반려되었습니다.' });
      setRotationViewMode('list'); setSelectedRotation(null); setRotationAction(null); setRotationComment('');
      await loadRotationApprovals(currentUserId, isAdmin);
      window.dispatchEvent(new CustomEvent('dispatch-approval-inbox-data-changed'));
    } catch (e) {
      console.error(e);
      toast({ title: '오류', description: '결재 처리 중 오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setRotationProcessing(false);
    }
  };

  // --- 계약: 액션 ---

  const handleContractAction = async () => {
    if (!selectedContract || !contractAction) return;
    if (contractAction === 'reject' && !contractComment.trim()) { toast({ title: '오류', description: '반려 사유를 입력해주세요.', variant: 'destructive' }); return; }
    try {
      setContractProcessing(true);
      if (isAdmin) {
        if (contractAction === 'reject') await contractApprovalService.adminForceReject(selectedContract.id, currentUserId, contractComment);
        else await contractApprovalService.adminForceApprove(selectedContract.id, currentUserId, contractComment || undefined);
      } else {
        if (contractAction === 'reject') await contractApprovalService.rejectStep(selectedContract.id, currentUserId, contractComment);
        else await contractApprovalService.approveStep(selectedContract.id, currentUserId, contractComment || undefined);
      }
      toast({ title: '성공', description: contractAction === 'approve' ? '승인되었습니다.' : '반려되었습니다.' });
      setContractViewMode('list'); setSelectedContract(null); setContractAction(null); setContractComment('');
      await loadContractApprovals(currentUserId, isAdmin);
      window.dispatchEvent(new CustomEvent('dispatch-approval-inbox-data-changed'));
    } catch (e) {
      console.error(e);
      toast({ title: '오류', description: '결재 처리 중 오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setContractProcessing(false);
    }
  };

  // --- 승진/강등 발령: 액션 ---

  const handleDispatchAction = async () => {
    if (!selectedDispatch || !dispatchAction) return;
    if (dispatchAction === 'reject' && !dispatchComment.trim()) { toast({ title: '오류', description: '반려 사유를 입력해주세요.', variant: 'destructive' }); return; }
    try {
      setDispatchProcessing(true);
      if (isAdmin) {
        if (dispatchAction === 'reject') await dispatchOrderApprovalService.adminForceReject(selectedDispatch.id, currentUserId, dispatchComment);
        else await dispatchOrderApprovalService.adminForceApprove(selectedDispatch.id, currentUserId, dispatchComment || undefined);
      } else {
        if (dispatchAction === 'reject') await dispatchOrderApprovalService.rejectStep(selectedDispatch.id, currentUserId, dispatchComment);
        else await dispatchOrderApprovalService.approveStep(selectedDispatch.id, currentUserId, dispatchComment || undefined);
      }
      toast({ title: '성공', description: dispatchAction === 'approve' ? '승인되었습니다. 승인 즉시 계약/승선경력에 반영됩니다.' : '반려되었습니다.' });
      setDispatchViewMode('list'); setSelectedDispatch(null); setDispatchAction(null); setDispatchComment('');
      await loadDispatchApprovals(currentUserId, isAdmin);
      window.dispatchEvent(new CustomEvent('dispatch-approval-inbox-data-changed'));
    } catch (e) {
      console.error(e);
      toast({ title: '오류', description: '결재 처리 중 오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setDispatchProcessing(false);
    }
  };

  // --- 다중 선택 일괄 승인/반려 ---

  const domainConfig = (domain: Domain): {
    service: ApprovalActionService;
    approvals: ApprovalLike[];
    selectedIds: string[];
    setSelectedIds: (ids: string[]) => void;
    load: () => Promise<void>;
  } => {
    if (domain === 'crew') return { service: approvalService, approvals: crewApprovals, selectedIds: crewSelectedIds, setSelectedIds: setCrewSelectedIds, load: () => loadCrewApprovals(currentUserId, isAdmin) };
    if (domain === 'rotation') return { service: rotationApprovalService, approvals: rotationApprovals, selectedIds: rotationSelectedIds, setSelectedIds: setRotationSelectedIds, load: () => loadRotationApprovals(currentUserId, isAdmin) };
    if (domain === 'contract') return { service: contractApprovalService, approvals: contractApprovals, selectedIds: contractSelectedIds, setSelectedIds: setContractSelectedIds, load: () => loadContractApprovals(currentUserId, isAdmin) };
    return { service: dispatchOrderApprovalService, approvals: dispatchApprovals, selectedIds: dispatchSelectedIds, setSelectedIds: setDispatchSelectedIds, load: () => loadDispatchApprovals(currentUserId, isAdmin) };
  };

  const openBulkDialog = (domain: Domain, action: 'approve' | 'reject') => {
    setBulkComment('');
    setBulkDialog({ domain, action });
  };

  const submitBulkAction = async () => {
    if (!bulkDialog) return;
    const { domain, action } = bulkDialog;
    if (action === 'reject' && !bulkComment.trim()) { toast({ title: '오류', description: '반려 사유를 입력해주세요.', variant: 'destructive' }); return; }
    const cfg = domainConfig(domain);
    const targets = cfg.approvals.filter(a => cfg.selectedIds.includes(a.id) && isMyTurn(a));
    if (targets.length === 0) return;
    try {
      setBulkProcessing(true);
      await Promise.all(targets.map(a => {
        if (isAdmin) {
          return action === 'approve'
            ? cfg.service.adminForceApprove(a.id, currentUserId, bulkComment || undefined)
            : cfg.service.adminForceReject(a.id, currentUserId, bulkComment);
        }
        return action === 'approve'
          ? cfg.service.approveStep(a.id, currentUserId, bulkComment || undefined)
          : cfg.service.rejectStep(a.id, currentUserId, bulkComment);
      }));
      toast({ title: '성공', description: `${targets.length}건 ${action === 'approve' ? '승인' : '반려'}되었습니다.` });
      cfg.setSelectedIds([]);
      setBulkDialog(null);
      setBulkComment('');
      await cfg.load();
      window.dispatchEvent(new CustomEvent('dispatch-approval-inbox-data-changed'));
    } catch (e) {
      console.error(e);
      toast({ title: '오류', description: '일괄 처리 중 오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setBulkProcessing(false);
    }
  };

  // --- 공통 렌더링 ---

  const renderProgress = (approval: ApprovalLike) => (
    <div>
      <h4 className="text-sm font-semibold mb-2">결재 진행</h4>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold bg-blue-100 text-blue-700">기안</div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-blue-500 font-medium">신청자</span>
              <span className="font-medium">{approval.requester_name}</span>
              <span className="text-sm text-gray-500">{approval.requester_role}</span>
              <CheckCircle2 className="w-4 h-4 text-blue-600" />
            </div>
            <p className="text-xs text-gray-400 mt-1">{format(new Date(approval.created_at), 'yyyy-MM-dd HH:mm', { locale: ko })}</p>
          </div>
        </div>
        {approval.approval_line.steps.map((step, index) => {
          const action = approval.actions.find(a => a.step_order === step.step_order);
          const isCurrent = approval.current_step === step.step_order && approval.status === 'pending';
          const isFinal = index === approval.approval_line.steps.length - 1;
          return (
            <div key={step.id} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                action?.action === 'approved' ? 'bg-green-100 text-green-700'
                : action?.action === 'rejected' ? 'bg-red-100 text-red-700'
                : isCurrent ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'
              }`}>{index + 1}</div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500 font-medium">{isFinal ? '최종결재자' : '중간결재자'}</span>
                  <span className="font-medium">{step.approver_name}</span>
                  <span className="text-sm text-gray-500">{step.approver_role}</span>
                  {action?.action === 'approved' && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                  {action?.action === 'rejected' && <XCircle className="w-4 h-4 text-red-600" />}
                  {isCurrent && <Badge variant="outline" className="text-xs">대기중</Badge>}
                </div>
                {action?.comment && <p className="text-sm text-gray-600 mt-1">{action.comment}</p>}
                {action?.created_at && <p className="text-xs text-gray-400 mt-1">{format(new Date(action.created_at), 'yyyy-MM-dd HH:mm', { locale: ko })}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderTable = <T extends ApprovalLike>(
    list: T[],
    subjectLabel: (a: T) => string,
    subLabel: (a: T) => string,
    onView: (a: T) => void,
    onApprove: (a: T) => void,
    onReject: (a: T) => void,
    selectedIds: string[],
    setSelectedIds: (ids: string[]) => void,
  ) => {
    const selectableIds = list.filter(a => isMyTurn(a)).map(a => a.id);
    const toggleOne = (id: string) => setSelectedIds(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]);
    const toggleAll = (checked: boolean) => setSelectedIds(checked ? selectableIds : []);
    return (
    <div className="rounded-md border overflow-hidden overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="w-8 p-2">
              <Checkbox
                checked={selectableIds.length > 0 && selectableIds.every(id => selectedIds.includes(id))}
                onCheckedChange={checked => toggleAll(!!checked)}
                disabled={selectableIds.length === 0}
              />
            </th>
            <th className="text-left p-2 text-xs font-medium text-gray-600">상태</th>
            <th className="text-left p-2 text-xs font-medium text-gray-600">대상</th>
            <th className="text-left p-2 text-xs font-medium text-gray-600">결재선</th>
            <th className="text-left p-2 text-xs font-medium text-gray-600">요청자</th>
            <th className="text-left p-2 text-xs font-medium text-gray-600">요청일</th>
            <th className="text-right p-2 text-xs font-medium text-gray-600 w-44">작업</th>
          </tr>
        </thead>
        <tbody>
          {list.map(approval => {
            const myTurn = isMyTurn(approval);
            return (
              <tr key={approval.id} className={`border-b cursor-pointer hover:bg-gray-50 ${myTurn ? 'bg-blue-50/40' : ''}`} onClick={() => onView(approval)}>
                <td className="p-2" onClick={e => e.stopPropagation()}>
                  {myTurn && <Checkbox checked={selectedIds.includes(approval.id)} onCheckedChange={() => toggleOne(approval.id)} />}
                </td>
                <td className="p-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {getStatusBadge(approval.status)}
                    {myTurn && <Badge className="bg-blue-500 text-xs">내 차례</Badge>}
                  </div>
                </td>
                <td className="p-2 font-medium">{subjectLabel(approval)}<div className="text-xs text-gray-400 font-normal">{subLabel(approval)}</div></td>
                <td className="p-2 text-gray-500">{approval.approval_line.name}</td>
                <td className="p-2 text-gray-500">{approval.requester_name}</td>
                <td className="p-2 text-gray-500">{format(new Date(approval.created_at), 'yyyy-MM-dd', { locale: ko })}</td>
                <td className="p-2 text-right" onClick={e => e.stopPropagation()}>
                  <div className="flex justify-end gap-1">
                    {myTurn && (
                      <>
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-green-600 border-green-300" onClick={() => onApprove(approval)}>승인</Button>
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-red-600 border-red-300" onClick={() => onReject(approval)}>반려</Button>
                      </>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onView(approval)}>보기</Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    );
  };

  const renderFilterBar = (filter: Filter, setFilter: (f: Filter) => void) => (
    <div className="flex flex-wrap gap-1.5">
      {FILTER_LABELS.map(f => (
        <button
          key={f.value} type="button" onClick={() => setFilter(f.value)}
          className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${filter === f.value ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );

  const renderPagination = (total: number, page: number, setPage: (p: number) => void) => {
    const totalPages = Math.ceil(total / PAGE_SIZE);
    if (totalPages <= 1) return null;
    return (
      <div className="flex justify-center">
        <Pagination>
          <PaginationContent>
            <PaginationItem><PaginationPrevious onClick={() => page > 1 && setPage(page - 1)} className={page === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'} /></PaginationItem>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => {
              if (p === 1 || p === totalPages || (p >= page - 1 && p <= page + 1)) {
                return <PaginationItem key={p}><PaginationLink onClick={() => setPage(p)} isActive={page === p} className="cursor-pointer">{p}</PaginationLink></PaginationItem>;
              } else if (p === page - 2 || p === page + 2) {
                return <PaginationItem key={p}><span className="px-4">...</span></PaginationItem>;
              }
              return null;
            })}
            <PaginationItem><PaginationNext onClick={() => page < totalPages && setPage(page + 1)} className={page === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'} /></PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    );
  };

  const renderBulkBar = (domain: Domain, selectedIds: string[]) => {
    if (selectedIds.length === 0 || !permissions.canEdit) return null;
    return (
      <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
        <span className="text-xs text-blue-800">{selectedIds.length}건 선택됨</span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-7 text-xs text-green-600 border-green-300 hover:bg-green-50" onClick={() => openBulkDialog(domain, 'approve')}>일괄 승인</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-300 hover:bg-red-50" onClick={() => openBulkDialog(domain, 'reject')}>일괄 반려</Button>
        </div>
      </div>
    );
  };

  const renderActionPanel = (
    title: string, subject: string,
    comment: string, setComment: (v: string) => void,
    action: 'approve' | 'reject' | null, processing: boolean,
    onBack: () => void, onSubmit: () => void,
  ) => (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="w-5 h-5" /></Button>
        <h2 className="text-lg font-bold">{action === 'approve' ? '결재 승인' : '결재 반려'}</h2>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">{title}</CardTitle><CardDescription>{subject}</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>{action === 'approve' ? '의견 (선택사항)' : '반려 사유 (필수)'}</Label>
            <Textarea value={comment} onChange={e => setComment(e.target.value)} rows={4} className="mt-2" disabled={processing} />
          </div>
          <div className="flex gap-2 pt-4 border-t">
            <Button variant="outline" onClick={onBack} disabled={processing} className="flex-1">취소</Button>
            <Button onClick={onSubmit} disabled={processing || (action === 'reject' && !comment.trim())} variant={action === 'approve' ? 'default' : 'destructive'} className="flex-1">
              {processing ? '처리 중...' : action === 'approve' ? '승인' : '반려'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  if (initializing) return <div className="container mx-auto px-4 py-8 text-center">로딩 중...</div>;

  const crewFiltered = filterList(crewApprovals, crewFilter);
  const rotationFiltered = filterList(rotationApprovals, rotationFilter);
  const contractFiltered = filterList(contractApprovals, contractFilter);
  const dispatchFiltered = filterList(dispatchApprovals, dispatchFilter);
  const crewPageRecs = crewFiltered.slice((crewPage - 1) * PAGE_SIZE, crewPage * PAGE_SIZE);
  const rotationPageRecs = rotationFiltered.slice((rotationPage - 1) * PAGE_SIZE, rotationPage * PAGE_SIZE);
  const contractPageRecs = contractFiltered.slice((contractPage - 1) * PAGE_SIZE, contractPage * PAGE_SIZE);
  const dispatchPageRecs = dispatchFiltered.slice((dispatchPage - 1) * PAGE_SIZE, dispatchPage * PAGE_SIZE);

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Send className="w-6 h-6" />발령 결재함</h1>
        <p className="text-gray-600 mt-1 text-sm">채용/배승/계약 등 선원 인사 관련 결재를 조회하고 처리합니다.</p>
      </div>

      <Tabs defaultValue="crew">
        <TabsList>
          <TabsTrigger value="crew" className="gap-1.5">채용 ({crewApprovals.length}){myTurnBadge(crewApprovals.filter(isMyTurn).length)}</TabsTrigger>
          <TabsTrigger value="rotation" className="gap-1.5">배승 ({rotationApprovals.length}){myTurnBadge(rotationApprovals.filter(isMyTurn).length)}</TabsTrigger>
          <TabsTrigger value="contract" className="gap-1.5">계약 ({contractApprovals.length}){myTurnBadge(contractApprovals.filter(isMyTurn).length)}</TabsTrigger>
          <TabsTrigger value="dispatch" className="gap-1.5">승진/강등 ({dispatchApprovals.length}){myTurnBadge(dispatchApprovals.filter(isMyTurn).length)}</TabsTrigger>
          <TabsTrigger value="salary" disabled>급여지급 (준비중)</TabsTrigger>
        </TabsList>

        <TabsContent value="crew" className="mt-4">
          {crewViewMode === 'action' && selectedCrew ? renderActionPanel(
            selectedCrew.recommendation?.crew_name || '선원 추천', `결재선: ${selectedCrew.approval_line.name}`,
            crewComment, setCrewComment, crewAction, crewProcessing,
            () => { setCrewViewMode('list'); setSelectedCrew(null); setCrewAction(null); }, handleCrewAction,
          ) : (
            <div className="space-y-4">
              {renderFilterBar(crewFilter, setCrewFilter)}
              {renderBulkBar('crew', crewSelectedIds)}
              {crewFiltered.length === 0 ? (
                <Card><CardContent className="py-12 text-center"><Clock className="h-12 w-12 mx-auto text-gray-400 mb-4" /><p className="text-gray-600">해당하는 결재가 없습니다</p></CardContent></Card>
              ) : (
                <>
                  {renderTable(
                    crewPageRecs,
                    a => a.recommendation?.crew_name || '선원 추천',
                    a => a.recommendation?.ship_name || '',
                    a => { setSelectedCrew(a); setCrewViewMode('list'); },
                    a => { setSelectedCrew(a); setCrewAction('approve'); setCrewViewMode('action'); setCrewComment(''); },
                    a => { setSelectedCrew(a); setCrewAction('reject'); setCrewViewMode('action'); setCrewComment(''); },
                    crewSelectedIds, setCrewSelectedIds,
                  )}
                  {renderPagination(crewFiltered.length, crewPage, setCrewPage)}
                </>
              )}
            </div>
          )}
          {crewViewMode === 'list' && selectedCrew && (
            <div className="mt-4 space-y-4">
              <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setSelectedCrew(null)}><ArrowLeft className="w-4 h-4" />목록</Button>
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2"><User className="w-4 h-4" />{selectedCrew.recommendation?.crew_name || '선원 추천'}</CardTitle>
                      <CardDescription>{selectedCrew.recommendation?.ship_name} · 요청자: {selectedCrew.requester_name}</CardDescription>
                    </div>
                    {selectedCrew.status !== 'pending' && (selectedCrew.requester_id === currentUserId || isAdmin) && permissions.canDelete && (
                      <Button size="sm" variant="outline" className="text-red-600 border-red-300 gap-1" onClick={() => handleDeleteCrew(selectedCrew)}><Trash2 className="w-3.5 h-3.5" />삭제</Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>{renderProgress(selectedCrew)}</CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="rotation" className="mt-4">
          {rotationViewMode === 'action' && selectedRotation ? renderActionPanel(
            selectedRotation.plan_name || '교대계획', `결재선: ${selectedRotation.approval_line.name} · ${selectedRotation.ship_name}`,
            rotationComment, setRotationComment, rotationAction, rotationProcessing,
            () => { setRotationViewMode('list'); setSelectedRotation(null); setRotationAction(null); }, handleRotationAction,
          ) : (
            <div className="space-y-4">
              {renderFilterBar(rotationFilter, setRotationFilter)}
              {renderBulkBar('rotation', rotationSelectedIds)}
              {rotationFiltered.length === 0 ? (
                <Card><CardContent className="py-12 text-center"><ShipIcon className="h-12 w-12 mx-auto text-gray-400 mb-4" /><p className="text-gray-600">해당하는 결재가 없습니다</p></CardContent></Card>
              ) : (
                <>
                  {renderTable(
                    rotationPageRecs,
                    a => a.plan_name || '교대계획',
                    a => a.ship_name || '',
                    a => { setSelectedRotation(a); setRotationViewMode('list'); },
                    a => { setSelectedRotation(a); setRotationAction('approve'); setRotationViewMode('action'); setRotationComment(''); },
                    a => { setSelectedRotation(a); setRotationAction('reject'); setRotationViewMode('action'); setRotationComment(''); },
                    rotationSelectedIds, setRotationSelectedIds,
                  )}
                  {renderPagination(rotationFiltered.length, rotationPage, setRotationPage)}
                </>
              )}
            </div>
          )}
          {rotationViewMode === 'list' && selectedRotation && (
            <div className="mt-4 space-y-4">
              <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setSelectedRotation(null)}><ArrowLeft className="w-4 h-4" />목록</Button>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2"><ShipIcon className="w-4 h-4" />{selectedRotation.plan_name}</CardTitle>
                  <CardDescription>{selectedRotation.ship_name} · 요청자: {selectedRotation.requester_name}</CardDescription>
                </CardHeader>
                <CardContent>{renderProgress(selectedRotation)}</CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="contract" className="mt-4">
          {contractViewMode === 'action' && selectedContract ? renderActionPanel(
            `${selectedContract.crew_name} (${selectedContract.rank_code})`, `결재선: ${selectedContract.approval_line.name} · ${selectedContract.ship_name}`,
            contractComment, setContractComment, contractAction, contractProcessing,
            () => { setContractViewMode('list'); setSelectedContract(null); setContractAction(null); }, handleContractAction,
          ) : (
            <div className="space-y-4">
              {renderFilterBar(contractFilter, setContractFilter)}
              {renderBulkBar('contract', contractSelectedIds)}
              {contractFiltered.length === 0 ? (
                <Card><CardContent className="py-12 text-center"><FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" /><p className="text-gray-600">해당하는 결재가 없습니다</p></CardContent></Card>
              ) : (
                <>
                  {renderTable(
                    contractPageRecs,
                    a => `${a.crew_name} (${a.rank_code})`,
                    a => a.ship_name || '',
                    a => { setSelectedContract(a); setContractViewMode('list'); },
                    a => { setSelectedContract(a); setContractAction('approve'); setContractViewMode('action'); setContractComment(''); },
                    a => { setSelectedContract(a); setContractAction('reject'); setContractViewMode('action'); setContractComment(''); },
                    contractSelectedIds, setContractSelectedIds,
                  )}
                  {renderPagination(contractFiltered.length, contractPage, setContractPage)}
                </>
              )}
            </div>
          )}
          {contractViewMode === 'list' && selectedContract && (
            <div className="mt-4 space-y-4">
              <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setSelectedContract(null)}><ArrowLeft className="w-4 h-4" />목록</Button>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2"><User className="w-4 h-4" />{selectedContract.crew_name} ({selectedContract.rank_code})</CardTitle>
                  <CardDescription>{selectedContract.ship_name} · 요청자: {selectedContract.requester_name}</CardDescription>
                </CardHeader>
                <CardContent>{renderProgress(selectedContract)}</CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="dispatch" className="mt-4">
          {dispatchViewMode === 'action' && selectedDispatch ? renderActionPanel(
            `${selectedDispatch.crew_name} — ${selectedDispatch.dispatch_type === 'promotion' ? '승진' : '강등'}`,
            `결재선: ${selectedDispatch.approval_line.name} · ${selectedDispatch.ship_name}`,
            dispatchComment, setDispatchComment, dispatchAction, dispatchProcessing,
            () => { setDispatchViewMode('list'); setSelectedDispatch(null); setDispatchAction(null); }, handleDispatchAction,
          ) : (
            <div className="space-y-4">
              {renderFilterBar(dispatchFilter, setDispatchFilter)}
              {renderBulkBar('dispatch', dispatchSelectedIds)}
              {dispatchFiltered.length === 0 ? (
                <Card><CardContent className="py-12 text-center"><User className="h-12 w-12 mx-auto text-gray-400 mb-4" /><p className="text-gray-600">해당하는 결재가 없습니다</p></CardContent></Card>
              ) : (
                <>
                  {renderTable(
                    dispatchPageRecs,
                    a => `${a.crew_name} (${a.dispatch_type === 'promotion' ? '승진' : '강등'})`,
                    a => `${a.previous_rank_code}${a.previous_grade ? `(${a.previous_grade})` : ''} → ${a.new_rank_code}${a.new_grade ? `(${a.new_grade})` : ''} · ${a.ship_name}`,
                    a => { setSelectedDispatch(a); setDispatchViewMode('list'); },
                    a => { setSelectedDispatch(a); setDispatchAction('approve'); setDispatchViewMode('action'); setDispatchComment(''); },
                    a => { setSelectedDispatch(a); setDispatchAction('reject'); setDispatchViewMode('action'); setDispatchComment(''); },
                    dispatchSelectedIds, setDispatchSelectedIds,
                  )}
                  {renderPagination(dispatchFiltered.length, dispatchPage, setDispatchPage)}
                </>
              )}
            </div>
          )}
          {dispatchViewMode === 'list' && selectedDispatch && (
            <div className="mt-4 space-y-4">
              <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setSelectedDispatch(null)}><ArrowLeft className="w-4 h-4" />목록</Button>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <User className="w-4 h-4" />{selectedDispatch.crew_name} — {selectedDispatch.previous_rank_code}{selectedDispatch.previous_grade ? `(${selectedDispatch.previous_grade})` : ''} → {selectedDispatch.new_rank_code}{selectedDispatch.new_grade ? `(${selectedDispatch.new_grade})` : ''}
                  </CardTitle>
                  <CardDescription>{selectedDispatch.ship_name} · 요청자: {selectedDispatch.requester_name}</CardDescription>
                </CardHeader>
                <CardContent>{renderProgress(selectedDispatch)}</CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="salary" className="mt-4">
          <Card><CardContent className="py-12 text-center text-gray-500">급여지급 결재는 준비중입니다.</CardContent></Card>
        </TabsContent>
      </Tabs>

      <Dialog open={bulkDialog !== null} onOpenChange={o => !bulkProcessing && !o && setBulkDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{bulkDialog?.action === 'approve' ? '일괄 승인' : '일괄 반려'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              {bulkDialog && domainConfig(bulkDialog.domain).selectedIds.filter(id => domainConfig(bulkDialog.domain).approvals.some(a => a.id === id && isMyTurn(a))).length}건을 {bulkDialog?.action === 'approve' ? '승인' : '반려'}합니다.
            </p>
            <div>
              <label className="text-sm font-medium mb-2 block">{bulkDialog?.action === 'approve' ? '의견 (선택사항)' : '반려 사유 (필수)'}</label>
              <Textarea value={bulkComment} onChange={e => setBulkComment(e.target.value)} rows={4} disabled={bulkProcessing} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDialog(null)} disabled={bulkProcessing}>취소</Button>
            <Button
              onClick={submitBulkAction}
              disabled={bulkProcessing || (bulkDialog?.action === 'reject' && !bulkComment.trim())}
              className={bulkDialog?.action === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
            >
              {bulkProcessing ? '처리 중...' : bulkDialog?.action === 'approve' ? '일괄 승인' : '일괄 반려'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
