import { useState, useEffect, Fragment } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { CheckCircle2, XCircle, Clock, User, ArrowLeft, Trash2, FileText, Ship as ShipIcon, Send, Archive, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { getCurrentUser } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { useNavigate } from 'react-router-dom';
import { approvalService } from '@/services/approval.service';
import { rotationApprovalService } from '@/services/rotation-approval.service';
import { rotationService } from '@/services/rotation.service';
import { getRanks } from '@/services/rank.service';
import { getPorts } from '@/services/port.service';
import { contractApprovalService } from '@/services/contract-approval.service';
import { dispatchOrderApprovalService } from '@/services/dispatch-order-approval.service';
import { dispatchApprovalLogService } from '@/services/dispatch-approval-log.service';
import { supabase } from '@/lib/supabase';
import type { CrewRecommendationApprovalWithDetails, ApprovalLineStep, ApprovalAction } from '@/types/approval';
import type { CrewRecommendation } from '@/types/crew-recommendation';
import type { ApprovalRequestWithDetails } from '@/services/approval-engine';
import type { CrewRotationAssignmentWithDetails } from '@/types/rotation';
import type { Rank } from '@/types/models';

type ApprovalWithRecommendation = CrewRecommendationApprovalWithDetails & {
  recommendation?: CrewRecommendation & {
    crew_name?: string;
    ranks?: { rank_code?: string } | null;
    ships?: { name?: string } | null;
    owner?: { name?: string } | null;
    fleet?: { name?: string } | null;
  };
};
type RotationApprovalWithPlan = ApprovalRequestWithDetails & {
  plan_name?: string; ship_name?: string;
  rotation_date?: string; port_label?: string; notes?: string | null;
};
type ContractApprovalWithContract = ApprovalRequestWithDetails & {
  crew_name?: string; rank_code?: string; rank_grade?: string | null; ship_name?: string;
  owner_name?: string; fleet_name?: string;
};
type DispatchApprovalWithOrder = ApprovalRequestWithDetails & {
  crew_name?: string; dispatch_type?: 'promotion' | 'demotion';
  previous_rank_code?: string; previous_grade?: string | null;
  new_rank_code?: string; new_grade?: string | null; ship_name?: string;
  owner_name?: string; fleet_name?: string;
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

const DOMAIN_LABEL: Record<Domain, string> = { crew: '채용', rotation: '배승', contract: '계약', dispatch: '승진/강등' };

// 삭제 이력함: 채용(crew_recommendation_approval_log)과 배승/계약/승진강등(공용
// dispatch_approval_deletion_log)의 구조가 달라 화면에 보여줄 최소 공통 형태로 합친다.
interface UnifiedDeletionLog {
  id: string;
  domain: Domain;
  subjectLabel: string;
  requester_name: string;
  approval_line_name?: string;
  final_status: string;
  actions: { step_order: number; approver_name?: string; action: string; comment?: string; created_at: string }[];
  completed_at?: string;
  deleted_by_name: string;
  deleted_at: string;
}

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

// 선주 > 플릿 > 선박 계층을 하나의 문자열로 압축 표시
const hierarchyLabel = (owner?: string, fleet?: string, ship?: string) =>
  [owner, fleet, ship].filter(Boolean).join(' > ') || '-';

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
  const [crewForce, setCrewForce] = useState(false);
  const [crewComment, setCrewComment] = useState('');
  const [crewProcessing, setCrewProcessing] = useState(false);

  // 배승
  const [rotationApprovals, setRotationApprovals] = useState<RotationApprovalWithPlan[]>([]);
  const [rotationFilter, setRotationFilter] = useState<Filter>('all');
  const [rotationPage, setRotationPage] = useState(1);
  const [rotationViewMode, setRotationViewMode] = useState<'list' | 'action'>('list');
  const [selectedRotation, setSelectedRotation] = useState<RotationApprovalWithPlan | null>(null);
  const [rotationAction, setRotationAction] = useState<'approve' | 'reject' | null>(null);
  const [rotationForce, setRotationForce] = useState(false);
  const [rotationComment, setRotationComment] = useState('');
  const [rotationProcessing, setRotationProcessing] = useState(false);
  // 결재 대상 확인/승인·반려 화면에서 최소한 그 계획의 교대 배정 요약은 보여야 하므로,
  // 선택된 배승 결재 건의 실제 배정(승/하선 쌍)을 여기서 별도로 불러온다.
  const [rotationAssignments, setRotationAssignments] = useState<CrewRotationAssignmentWithDetails[]>([]);
  const [rotationAssignmentsLoading, setRotationAssignmentsLoading] = useState(false);
  const [ranks, setRanks] = useState<Rank[]>([]);

  // 계약
  const [contractApprovals, setContractApprovals] = useState<ContractApprovalWithContract[]>([]);
  const [contractFilter, setContractFilter] = useState<Filter>('all');
  const [contractPage, setContractPage] = useState(1);
  const [contractViewMode, setContractViewMode] = useState<'list' | 'action'>('list');
  const [selectedContract, setSelectedContract] = useState<ContractApprovalWithContract | null>(null);
  const [contractAction, setContractAction] = useState<'approve' | 'reject' | null>(null);
  const [contractForce, setContractForce] = useState(false);
  const [contractComment, setContractComment] = useState('');
  const [contractProcessing, setContractProcessing] = useState(false);

  // 승진/강등 발령
  const [dispatchApprovals, setDispatchApprovals] = useState<DispatchApprovalWithOrder[]>([]);
  const [dispatchFilter, setDispatchFilter] = useState<Filter>('all');
  const [dispatchPage, setDispatchPage] = useState(1);
  const [dispatchViewMode, setDispatchViewMode] = useState<'list' | 'action'>('list');
  const [selectedDispatch, setSelectedDispatch] = useState<DispatchApprovalWithOrder | null>(null);
  const [dispatchAction, setDispatchAction] = useState<'approve' | 'reject' | null>(null);
  const [dispatchForce, setDispatchForce] = useState(false);
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

  // 삭제 이력함
  const [deletionLogs, setDeletionLogs] = useState<UnifiedDeletionLog[]>([]);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

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
        loadDeletionLogs(),
        getRanks().then(setRanks),
      ]);
    } finally {
      setInitializing(false);
    }
  };

  // 배승 결재 대상을 확인/처리할 때 최소한 교대 배정 요약은 보여야 하므로,
  // 선택된 건이 바뀔 때마다 그 계획의 실제 배정 목록을 불러온다.
  useEffect(() => {
    const planId = selectedRotation?.crew_rotation_plan_id as string | undefined;
    if (!planId) { setRotationAssignments([]); return; }
    setRotationAssignmentsLoading(true);
    rotationService.getRotationAssignments(planId)
      .then(setRotationAssignments)
      .catch(e => { console.error(e); setRotationAssignments([]); })
      .finally(() => setRotationAssignmentsLoading(false));
  }, [selectedRotation]);

  // --- 삭제 이력함 ---

  const loadDeletionLogs = async () => {
    try {
      const [crewLogs, sharedLogs] = await Promise.all([
        approvalService.getApprovalDeletionLogs(),
        dispatchApprovalLogService.getDeletionLogs(),
      ]);
      const merged: UnifiedDeletionLog[] = [
        ...crewLogs.map(l => ({
          id: l.id, domain: 'crew' as const, subjectLabel: l.crew_name,
          requester_name: l.requester_name, approval_line_name: l.approval_line_name,
          final_status: l.final_status, actions: l.actions, completed_at: l.completed_at,
          deleted_by_name: l.deleted_by_name, deleted_at: l.deleted_at,
        })),
        ...sharedLogs.map(l => ({
          id: l.id, domain: l.domain, subjectLabel: l.subject_label,
          requester_name: l.requester_name, approval_line_name: l.approval_line_name,
          final_status: l.final_status, actions: l.actions, completed_at: l.completed_at,
          deleted_by_name: l.deleted_by_name, deleted_at: l.deleted_at,
        })),
      ].sort((a, b) => new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime());
      setDeletionLogs(merged);
    } catch (e) {
      console.error(e);
      toast({ title: '오류', description: '삭제 이력을 불러오는 중 오류가 발생했습니다.', variant: 'destructive' });
    }
  };

  const handlePurgeLog = async (log: UnifiedDeletionLog) => {
    if (!confirm(`"${log.subjectLabel}" 이력을 완전히 삭제하시겠습니까? 되돌릴 수 없습니다.`)) return;
    try {
      if (log.domain === 'crew') await approvalService.deleteApprovalDeletionLog(log.id);
      else await dispatchApprovalLogService.deleteDeletionLog(log.id);
      toast({ title: '삭제되었습니다.' });
      await loadDeletionLogs();
    } catch (e) {
      toast({ title: '삭제 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  const [logSelectedIds, setLogSelectedIds] = useState<string[]>([]);
  const [bulkPurging, setBulkPurging] = useState(false);
  const toggleLogSelect = (id: string) =>
    setLogSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleLogSelectAll = (checked: boolean) =>
    setLogSelectedIds(checked ? deletionLogs.map(l => l.id) : []);

  const handleBulkPurgeLogs = async () => {
    if (logSelectedIds.length === 0) return;
    if (!confirm(`선택한 ${logSelectedIds.length}건의 삭제 이력을 완전히 삭제하시겠습니까? 되돌릴 수 없습니다.`)) return;
    setBulkPurging(true);
    try {
      const targets = deletionLogs.filter(l => logSelectedIds.includes(l.id));
      await Promise.all(targets.map(log =>
        log.domain === 'crew' ? approvalService.deleteApprovalDeletionLog(log.id) : dispatchApprovalLogService.deleteDeletionLog(log.id)
      ));
      toast({ title: '삭제되었습니다.' });
      setLogSelectedIds([]);
      await loadDeletionLogs();
    } catch (e) {
      toast({ title: '삭제 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setBulkPurging(false);
    }
  };

  // --- 채용: 데이터 로딩 ---

  const loadCrewApprovals = async (userId: string, admin: boolean) => {
    try {
      const approvals = admin ? await approvalService.getAllApprovals() : await approvalService.getMyRelatedApprovals(userId);
      if (approvals.length === 0) { setCrewApprovals([]); return; }
      const crewRecIds = [...new Set(approvals.map(a => a.crew_recommendation_id))];
      // crew_recommendations는 company_id/fleet_id/ship_id에 FK 제약이 없어 PostgREST 임베드
      // 구문(owner:companies!company_id(...))으로는 조인이 안 됨 — 별도 조회 후 직접 맵으로 합친다.
      const { data: crewRecs, error } = await supabase
        .from('crew_recommendations')
        .select('*, ranks:rank_id(rank_code)')
        .in('id', crewRecIds);
      if (error) throw error;

      const shipIds = [...new Set((crewRecs || []).map((cr: Record<string, unknown>) => cr.ship_id as string).filter(Boolean))];
      const ownerIds = [...new Set((crewRecs || []).map((cr: Record<string, unknown>) => cr.company_id as string).filter(Boolean))];
      const fleetIds = [...new Set((crewRecs || []).map((cr: Record<string, unknown>) => cr.fleet_id as string).filter(Boolean))];
      const [shipsRes, ownersRes, fleetsRes] = await Promise.all([
        shipIds.length > 0 ? supabase.from('ships').select('id, name').in('id', shipIds) : Promise.resolve({ data: [] }),
        ownerIds.length > 0 ? supabase.from('companies').select('id, name').in('id', ownerIds) : Promise.resolve({ data: [] }),
        fleetIds.length > 0 ? supabase.from('fleets').select('id, name').in('id', fleetIds) : Promise.resolve({ data: [] }),
      ]);
      const shipMap = new Map((shipsRes.data || []).map((s: { id: string; name: string }) => [s.id, s.name]));
      const ownerMap = new Map((ownersRes.data || []).map((o: { id: string; name: string }) => [o.id, o.name]));
      const fleetMap = new Map((fleetsRes.data || []).map((f: { id: string; name: string }) => [f.id, f.name]));

      const crewRecsMap = new Map((crewRecs || []).map((cr: Record<string, unknown>) => [cr.id as string, {
        ...cr,
        ships: { name: shipMap.get(cr.ship_id as string) },
        owner: { name: ownerMap.get(cr.company_id as string) },
        fleet: { name: fleetMap.get(cr.fleet_id as string) },
      }]));
      const merged = approvals
        .map(a => ({ ...a, recommendation: crewRecsMap.get(a.crew_recommendation_id) }))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setCrewApprovals(merged as unknown as ApprovalWithRecommendation[]);
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
      const [{ data: plans, error }, ports] = await Promise.all([
        supabase.from('crew_rotation_plans').select('id, plan_name, ship_id, rotation_date, port_id, notes, ships:ship_id(name)').in('id', planIds),
        getPorts(),
      ]);
      if (error) throw error;
      const portMap = new Map(ports.map(p => [p.id, `${p.country_name} ${p.city_name}`]));
      const planMap = new Map((plans || []).map((p: Record<string, unknown>) => [p.id as string, p]));
      const merged = approvals
        .map(a => {
          const plan = planMap.get(a.crew_rotation_plan_id as string) as Record<string, unknown> | undefined;
          const ship = plan?.ships as Record<string, unknown> | null;
          const portId = plan?.port_id as string | null;
          return {
            ...a,
            plan_name: (plan?.plan_name as string) || '교대계획', ship_name: (ship?.name as string) || '-',
            rotation_date: (plan?.rotation_date as string) || '', port_label: portId ? portMap.get(portId) || '-' : '-',
            notes: (plan?.notes as string) || null,
          };
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
        .select(`
          id, rank,
          crew_members:crew_member_id(name, current_grade, ranks:rank_id(rank_code)),
          ships:ship_id(name),
          owner:companies!owner_id(name),
          fleet:fleets!fleet_id(name)
        `)
        .in('id', contractIds);
      if (error) throw error;
      const contractMap = new Map((contracts || []).map((c: Record<string, unknown>) => [c.id as string, c]));
      const merged = approvals
        .map(a => {
          const c = contractMap.get(a.crew_contract_id as string) as Record<string, unknown> | undefined;
          const crew = c?.crew_members as Record<string, unknown> | null;
          const ranks = crew?.ranks as Record<string, unknown> | null;
          const ship = c?.ships as Record<string, unknown> | null;
          const owner = c?.owner as Record<string, unknown> | null;
          const fleet = c?.fleet as Record<string, unknown> | null;
          return {
            ...a,
            crew_name: (crew?.name as string) || '-',
            rank_code: (ranks?.rank_code as string) || (c?.rank as string) || '-',
            rank_grade: (crew?.current_grade as string) || null,
            ship_name: (ship?.name as string) || '-',
            owner_name: (owner?.name as string) || '',
            fleet_name: (fleet?.name as string) || '',
          };
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
      // ships.fleet_id에는 FK 제약이 없어 PostgREST 임베드(fleet:fleets!fleet_id(...))로는 조인이 안 됨
      // — 선박은 owner만 임베드하고 플릿은 별도 조회 후 직접 맵으로 합친다.
      const { data: orders, error } = await supabase
        .from('crew_dispatch_orders')
        .select(`
          id, dispatch_type, previous_grade, new_grade,
          crew_members:crew_member_id(name),
          ships:ship_id(name, fleet_id, owner:companies!owner_id(name)),
          previous_rank:ranks!crew_dispatch_orders_previous_rank_id_fkey(rank_code),
          new_rank:ranks!crew_dispatch_orders_new_rank_id_fkey(rank_code)
        `)
        .in('id', orderIds);
      if (error) throw error;

      const fleetIds = [...new Set((orders || []).map((o: Record<string, unknown>) => (o.ships as Record<string, unknown> | null)?.fleet_id as string).filter(Boolean))];
      const { data: fleetsData } = fleetIds.length > 0
        ? await supabase.from('fleets').select('id, name').in('id', fleetIds)
        : { data: [] as { id: string; name: string }[] };
      const fleetMap = new Map((fleetsData || []).map((f: { id: string; name: string }) => [f.id, f.name]));

      const orderMap = new Map((orders || []).map((o: Record<string, unknown>) => [o.id as string, o]));
      const merged = approvals
        .map(a => {
          const o = orderMap.get(a.crew_dispatch_order_id as string) as Record<string, unknown> | undefined;
          const crew = o?.crew_members as Record<string, unknown> | null;
          const ship = o?.ships as Record<string, unknown> | null;
          const owner = ship?.owner as Record<string, unknown> | null;
          const fleetName = ship?.fleet_id ? fleetMap.get(ship.fleet_id as string) : undefined;
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
            owner_name: (owner?.name as string) || '',
            fleet_name: fleetName || '',
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

  // 관리자 계정이라도 결재선상 실제 현재 단계 담당자가 아니면 "내 차례"가 아니다 — admin/system_admin
  // 이라는 계정 권한과 결재라인상의 전결/최종결재자는 별개다. 관리자가 실제로 그 단계의 담당자로
  // 지정돼 있으면 일반 결재자와 동일하게 한 단계씩만 진행된다. 그 외의 경우 관리자는 별도의
  // "관리자 강제 승인/반려"로만 결재라인을 건너뛸 수 있다.
  const isMyTurn = (approval: ApprovalLike) => {
    if (approval.status !== 'pending') return false;
    return approval.current_approver?.approver_id === currentUserId;
  };
  const canForce = (approval: ApprovalLike) => approval.status === 'pending' && isAdmin && !isMyTurn(approval);

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
      if (crewForce) {
        if (crewAction === 'reject') await approvalService.adminForceReject(selectedCrew.id, currentUserId, crewComment);
        else await approvalService.adminForceApprove(selectedCrew.id, currentUserId, crewComment || undefined);
      } else {
        if (crewAction === 'reject') await approvalService.rejectStep(selectedCrew.id, currentUserId, crewComment);
        else await approvalService.approveStep(selectedCrew.id, currentUserId, crewComment || undefined);
      }
      toast({ title: '성공', description: crewAction === 'approve' ? '승인되었습니다.' : '반려되었습니다.' });
      setCrewViewMode('list'); setSelectedCrew(null); setCrewAction(null); setCrewComment(''); setCrewForce(false);
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
      await approvalService.deleteApproval(approval, `${approval.recommendation?.crew_name || '알 수 없음'}${approval.recommendation?.ranks?.rank_code ? ` (${approval.recommendation.ranks.rank_code})` : ''}`, currentUserId, currentUserName);
      toast({ title: '삭제되었습니다.' });
      setSelectedCrew(null);
      await loadCrewApprovals(currentUserId, isAdmin);
      await loadDeletionLogs();
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
      if (rotationForce) {
        if (rotationAction === 'reject') await rotationApprovalService.adminForceReject(selectedRotation.id, currentUserId, rotationComment);
        else await rotationApprovalService.adminForceApprove(selectedRotation.id, currentUserId, rotationComment || undefined);
      } else {
        if (rotationAction === 'reject') await rotationApprovalService.rejectStep(selectedRotation.id, currentUserId, rotationComment);
        else await rotationApprovalService.approveStep(selectedRotation.id, currentUserId, rotationComment || undefined);
      }
      toast({ title: '성공', description: rotationAction === 'approve' ? '승인되었습니다.' : '반려되었습니다.' });
      setRotationViewMode('list'); setSelectedRotation(null); setRotationAction(null); setRotationComment(''); setRotationForce(false);
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
      if (contractForce) {
        if (contractAction === 'reject') await contractApprovalService.adminForceReject(selectedContract.id, currentUserId, contractComment);
        else await contractApprovalService.adminForceApprove(selectedContract.id, currentUserId, contractComment || undefined);
      } else {
        if (contractAction === 'reject') await contractApprovalService.rejectStep(selectedContract.id, currentUserId, contractComment);
        else await contractApprovalService.approveStep(selectedContract.id, currentUserId, contractComment || undefined);
      }
      toast({ title: '성공', description: contractAction === 'approve' ? '승인되었습니다.' : '반려되었습니다.' });
      setContractViewMode('list'); setSelectedContract(null); setContractAction(null); setContractComment(''); setContractForce(false);
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
      if (dispatchForce) {
        if (dispatchAction === 'reject') await dispatchOrderApprovalService.adminForceReject(selectedDispatch.id, currentUserId, dispatchComment);
        else await dispatchOrderApprovalService.adminForceApprove(selectedDispatch.id, currentUserId, dispatchComment || undefined);
      } else {
        if (dispatchAction === 'reject') await dispatchOrderApprovalService.rejectStep(selectedDispatch.id, currentUserId, dispatchComment);
        else await dispatchOrderApprovalService.approveStep(selectedDispatch.id, currentUserId, dispatchComment || undefined);
      }
      toast({ title: '성공', description: dispatchAction === 'approve' ? '승인되었습니다. 승인 즉시 계약/승선경력에 반영됩니다.' : '반려되었습니다.' });
      setDispatchViewMode('list'); setSelectedDispatch(null); setDispatchAction(null); setDispatchComment(''); setDispatchForce(false);
      await loadDispatchApprovals(currentUserId, isAdmin);
      window.dispatchEvent(new CustomEvent('dispatch-approval-inbox-data-changed'));
    } catch (e) {
      console.error(e);
      toast({ title: '오류', description: '결재 처리 중 오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setDispatchProcessing(false);
    }
  };

  // --- 결재 이력 삭제 (승인/반려로 종결된 건만) ---

  const handleDeleteRotation = async (approval: RotationApprovalWithPlan) => {
    if (!confirm('이 배승 결재 이력을 삭제하시겠습니까? 이미 반영된 교대계획/승선기록 등은 유지되며, 결재 이력만 삭제되어 되돌릴 수 없습니다.')) return;
    try {
      await rotationApprovalService.deleteApproval(approval, `${approval.plan_name || '교대계획'} (${approval.ship_name || '-'})`, currentUserId, currentUserName);
      toast({ title: '삭제되었습니다.' });
      setSelectedRotation(null);
      await loadRotationApprovals(currentUserId, isAdmin);
      await loadDeletionLogs();
    } catch (e) {
      toast({ title: '삭제 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  const handleDeleteContract = async (approval: ContractApprovalWithContract) => {
    if (!confirm('이 계약 결재 이력을 삭제하시겠습니까? 이미 반영된 계약 정보는 유지되며, 결재 이력만 삭제되어 되돌릴 수 없습니다.')) return;
    try {
      await contractApprovalService.deleteApproval(approval, `${approval.crew_name || '-'} (${approval.rank_code || '-'})`, currentUserId, currentUserName);
      toast({ title: '삭제되었습니다.' });
      setSelectedContract(null);
      await loadContractApprovals(currentUserId, isAdmin);
      await loadDeletionLogs();
    } catch (e) {
      toast({ title: '삭제 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  const handleDeleteDispatch = async (approval: DispatchApprovalWithOrder) => {
    if (!confirm('이 승진/강등 발령 결재 이력을 삭제하시겠습니까? 이미 반영된 계약/승선경력 등은 유지되며, 결재 이력만 삭제되어 되돌릴 수 없습니다.')) return;
    try {
      await dispatchOrderApprovalService.deleteApproval(
        approval,
        `${approval.crew_name || '-'} (${approval.dispatch_type === 'promotion' ? '승진' : '강등'})`,
        currentUserId, currentUserName
      );
      toast({ title: '삭제되었습니다.' });
      setSelectedDispatch(null);
      await loadDispatchApprovals(currentUserId, isAdmin);
      await loadDeletionLogs();
    } catch (e) {
      toast({ title: '삭제 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  // --- 다중 선택 일괄 승인/반려 ---

  // 결재 이력 삭제 가능 여부 — 대기중이 아니고(승인/반려/취소로 종결), 본인이 요청했거나 관리자이며, 삭제 권한이 있어야 함
  const isDeletable = (a: ApprovalLike) => a.status !== 'pending' && (a.requester_id === currentUserId || isAdmin) && permissions.canDelete;

  const domainConfig = (domain: Domain): {
    service: ApprovalActionService;
    approvals: ApprovalLike[];
    selectedIds: string[];
    setSelectedIds: (ids: string[]) => void;
    load: () => Promise<void>;
    deleteOne: (a: ApprovalLike) => Promise<void>;
  } => {
    if (domain === 'crew') return {
      service: approvalService, approvals: crewApprovals, selectedIds: crewSelectedIds, setSelectedIds: setCrewSelectedIds,
      load: () => loadCrewApprovals(currentUserId, isAdmin),
      deleteOne: (a) => {
        const rec = a as ApprovalWithRecommendation;
        return approvalService.deleteApproval(rec, `${rec.recommendation?.crew_name || '알 수 없음'}${rec.recommendation?.ranks?.rank_code ? ` (${rec.recommendation.ranks.rank_code})` : ''}`, currentUserId, currentUserName);
      },
    };
    if (domain === 'rotation') return {
      service: rotationApprovalService, approvals: rotationApprovals, selectedIds: rotationSelectedIds, setSelectedIds: setRotationSelectedIds,
      load: () => loadRotationApprovals(currentUserId, isAdmin),
      deleteOne: (a) => {
        const r = a as RotationApprovalWithPlan;
        return rotationApprovalService.deleteApproval(r, `${r.plan_name || '교대계획'} (${r.ship_name || '-'})`, currentUserId, currentUserName);
      },
    };
    if (domain === 'contract') return {
      service: contractApprovalService, approvals: contractApprovals, selectedIds: contractSelectedIds, setSelectedIds: setContractSelectedIds,
      load: () => loadContractApprovals(currentUserId, isAdmin),
      deleteOne: (a) => {
        const c = a as ContractApprovalWithContract;
        return contractApprovalService.deleteApproval(c, `${c.crew_name || '-'} (${c.rank_code || '-'})`, currentUserId, currentUserName);
      },
    };
    return {
      service: dispatchOrderApprovalService, approvals: dispatchApprovals, selectedIds: dispatchSelectedIds, setSelectedIds: setDispatchSelectedIds,
      load: () => loadDispatchApprovals(currentUserId, isAdmin),
      deleteOne: (a) => {
        const d = a as DispatchApprovalWithOrder;
        return dispatchOrderApprovalService.deleteApproval(d, `${d.crew_name || '-'} (${d.dispatch_type === 'promotion' ? '승진' : '강등'})`, currentUserId, currentUserName);
      },
    };
  };

  const [bulkDeleteProcessing, setBulkDeleteProcessing] = useState(false);

  const submitBulkDelete = async (domain: Domain) => {
    const cfg = domainConfig(domain);
    const targets = cfg.approvals.filter(a => cfg.selectedIds.includes(a.id) && isDeletable(a));
    if (targets.length === 0) return;
    if (!confirm(`선택한 결재 이력 ${targets.length}건을 삭제하시겠습니까? 실제 반영된 데이터는 유지되며, 결재 이력만 삭제 이력함으로 이관되어 되돌릴 수 없습니다.`)) return;
    setBulkDeleteProcessing(true);
    try {
      await Promise.all(targets.map(a => cfg.deleteOne(a)));
      toast({ title: '삭제되었습니다.', description: `${targets.length}건이 삭제 이력함으로 이관되었습니다.` });
      cfg.setSelectedIds([]);
      await cfg.load();
      await loadDeletionLogs();
    } catch (e) {
      toast({ title: '삭제 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setBulkDeleteProcessing(false);
    }
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
      // 일괄 승인/반려 대상은 이미 isMyTurn(현재 단계의 실제 담당자)인 건만 선택 가능하므로,
      // 관리자 강제 처리(결재라인 전체 건너뛰기)는 여기서 쓰지 않는다 — 항상 정상 단계 진행.
      await Promise.all(targets.map(a =>
        action === 'approve'
          ? cfg.service.approveStep(a.id, currentUserId, bulkComment || undefined)
          : cfg.service.rejectStep(a.id, currentUserId, bulkComment)
      ));
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

  // 목록에서 결재 현황을 한눈에 보여주는 압축된 체인: 요청자 → 중간결재자(들) → 최종결재자.
  // 결재중인 단계는 파란색으로 강조하고, 이미 승인/반려된 단계는 각각 초록/빨강으로 표시한다.
  const renderChainCompact = (approval: ApprovalLike) => (
    <div className="flex items-center gap-1 flex-wrap text-xs">
      <span className="text-gray-500">{approval.requester_name}<span className="text-[10px] text-gray-400 ml-0.5">(요청)</span></span>
      {approval.approval_line.steps.map((step, i) => {
        const action = approval.actions.find(a => a.step_order === step.step_order);
        const isCurrent = approval.status === 'pending' && approval.current_step === step.step_order;
        const isFinal = i === approval.approval_line.steps.length - 1;
        return (
          <span key={step.id} className="flex items-center gap-1">
            <span className="text-gray-300">→</span>
            <span className={
              action?.action === 'approved' ? 'text-green-600'
              : action?.action === 'rejected' ? 'text-red-600 font-medium'
              : isCurrent ? 'text-blue-600 font-semibold'
              : 'text-gray-400'
            }>
              {step.approver_name}
              <span className="text-[10px] ml-0.5">({isFinal ? '최종' : '중간'}{isCurrent ? '·결재중' : ''})</span>
            </span>
          </span>
        );
      })}
    </div>
  );

  // "보기" 상세를 목록을 가리는 전체화면 대신 모달로 띄운다.
  const renderViewDialog = (
    approval: ApprovalLike | null,
    onClose: () => void,
    icon: React.ReactNode,
    title: React.ReactNode,
    description: React.ReactNode,
    canDeleteThis: boolean,
    onDelete: () => void,
    extraContent?: React.ReactNode,
  ) => {
    if (!approval) return null;
    return (
      <Dialog open onOpenChange={o => !o && onClose()}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between gap-2">
              <div>
                <DialogTitle className="flex items-center gap-2">{icon}{title}</DialogTitle>
                <p className="text-sm text-muted-foreground mt-1">{description}</p>
              </div>
              {canDeleteThis && (
                <Button size="sm" variant="outline" className="text-red-600 border-red-300 gap-1 shrink-0" onClick={onDelete}>
                  <Trash2 className="w-3.5 h-3.5" />삭제
                </Button>
              )}
            </div>
          </DialogHeader>
          <div className="pt-2">
            {extraContent}
            {renderProgress(approval)}
          </div>
        </DialogContent>
      </Dialog>
    );
  };

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

  // 배승 결재 대상 확인/처리 화면에 최소한 보여야 하는 교대 배정 요약 (직급순 정렬).
  const renderRotationAssignmentSummary = () => {
    if (!selectedRotation) return null;
    if (rotationAssignmentsLoading) {
      return <div className="text-xs text-gray-400 py-2">배정 정보를 불러오는 중...</div>;
    }
    if (rotationAssignments.length === 0) return null;
    const rankIndexById = new Map(ranks.map((r, i) => [r.id, i]));
    const rankSortIndex = (rankId: string | null) => (rankId ? rankIndexById.get(rankId) ?? 999 : 999);
    const rows = rotationAssignments
      .slice()
      .sort((a, b) => rankSortIndex(a.on_rank_id || a.off_rank_id) - rankSortIndex(b.on_rank_id || b.off_rank_id));
    return (
      <div className="mb-4">
        <h4 className="text-sm font-semibold mb-2">교대 배정 요약</h4>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 mb-2">
          <span><span className="text-gray-400">교대일</span> {selectedRotation.rotation_date || '-'}</span>
          <span><span className="text-gray-400">교대지</span> {selectedRotation.port_label || '-'}</span>
          {selectedRotation.notes && <span><span className="text-gray-400">비고</span> {selectedRotation.notes}</span>}
        </div>
        <div className="rounded-md border overflow-hidden overflow-x-auto">
          <table className="w-full text-xs whitespace-nowrap">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-2 font-medium text-gray-600">On-Signer</th>
                <th className="text-left p-2 font-medium text-gray-600">승선일</th>
                <th className="text-left p-2 font-medium text-gray-600">Off-Signer</th>
                <th className="text-left p-2 font-medium text-gray-600">하선일</th>
                <th className="text-left p-2 font-medium text-gray-600">하선사유</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(a => (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="p-2">
                    {a.on_crew_id ? (
                      <span>{a.on_rank_code && <span className="text-blue-700 font-medium mr-1">{a.on_rank_code}{a.on_rank_grade ? `(${a.on_rank_grade})` : ''}</span>}{a.on_crew_name || ''}</span>
                    ) : <span className="text-gray-300">-</span>}
                  </td>
                  <td className="p-2 text-gray-600">{a.embark_date || '-'}</td>
                  <td className="p-2">
                    {a.off_crew_id ? (
                      <span>{a.off_rank_code && <span className="text-amber-700 font-medium mr-1">{a.off_rank_code}{a.off_rank_grade ? `(${a.off_rank_grade})` : ''}</span>}{a.off_crew_name || ''}</span>
                    ) : <span className="text-gray-300">-</span>}
                  </td>
                  <td className="p-2 text-gray-600">{a.off_disembark_date || '-'}</td>
                  <td className="p-2 text-gray-600">{a.off_sign_off_reason_name || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderTable = <T extends ApprovalLike>(
    list: T[],
    subjectLabel: (a: T) => string,
    subLabel: (a: T) => string,
    onView: (a: T) => void,
    onApprove: (a: T) => void,
    onReject: (a: T) => void,
    selectedIds: string[],
    setSelectedIds: (ids: string[]) => void,
    onForceApprove: (a: T) => void,
    onForceReject: (a: T) => void,
  ) => {
    const selectableIds = list.filter(a => isMyTurn(a) || isDeletable(a)).map(a => a.id);
    const toggleOne = (id: string) => setSelectedIds(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]);
    const toggleAll = (checked: boolean) => setSelectedIds(checked ? selectableIds : []);
    return (
    <div className="rounded-md border overflow-hidden overflow-x-auto">
      <table className="w-full text-sm whitespace-nowrap">
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
            <th className="text-left p-2 text-xs font-medium text-gray-600">결재 현황</th>
            <th className="text-left p-2 text-xs font-medium text-gray-600">요청일</th>
            <th className="text-right p-2 text-xs font-medium text-gray-600 w-24">작업</th>
          </tr>
        </thead>
        <tbody>
          {list.map(approval => {
            const myTurn = isMyTurn(approval);
            const deletable = isDeletable(approval);
            const forceable = canForce(approval);
            return (
              <tr key={approval.id} className={`border-b cursor-pointer hover:bg-gray-50 ${myTurn ? 'bg-blue-50/40' : ''}`} onClick={() => onView(approval)}>
                <td className="p-2" onClick={e => e.stopPropagation()}>
                  {(myTurn || deletable) && <Checkbox checked={selectedIds.includes(approval.id)} onCheckedChange={() => toggleOne(approval.id)} />}
                </td>
                <td className="p-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {getStatusBadge(approval.status)}
                    {myTurn && <Badge className="bg-blue-500 text-xs">내 차례</Badge>}
                  </div>
                </td>
                <td className="p-2 font-medium">{subjectLabel(approval)}<div className="text-xs text-gray-400 font-normal">{subLabel(approval)}</div></td>
                <td className="p-2">{renderChainCompact(approval)}</td>
                <td className="p-2 text-gray-500">{format(new Date(approval.created_at), 'yyyy-MM-dd', { locale: ko })}</td>
                <td className="p-2 text-right" onClick={e => e.stopPropagation()}>
                  {myTurn && (
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-green-600 border-green-300" onClick={() => onApprove(approval)}>승인</Button>
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-red-600 border-red-300" onClick={() => onReject(approval)}>반려</Button>
                    </div>
                  )}
                  {forceable && (
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-amber-600 border-amber-300" onClick={() => onForceApprove(approval)}>강제승인</Button>
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-amber-600 border-amber-300" onClick={() => onForceReject(approval)}>강제반려</Button>
                    </div>
                  )}
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
    if (selectedIds.length === 0) return null;
    const cfg = domainConfig(domain);
    const approvableCount = permissions.canEdit ? cfg.approvals.filter(a => selectedIds.includes(a.id) && isMyTurn(a)).length : 0;
    const deletableCount = cfg.approvals.filter(a => selectedIds.includes(a.id) && isDeletable(a)).length;
    if (approvableCount === 0 && deletableCount === 0) return null;
    return (
      <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
        <span className="text-xs text-blue-800">{selectedIds.length}건 선택됨</span>
        <div className="flex items-center gap-2">
          {approvableCount > 0 && <Button size="sm" variant="outline" className="h-7 text-xs text-green-600 border-green-300 hover:bg-green-50" onClick={() => openBulkDialog(domain, 'approve')}>일괄 승인 ({approvableCount})</Button>}
          {approvableCount > 0 && <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-300 hover:bg-red-50" onClick={() => openBulkDialog(domain, 'reject')}>일괄 반려 ({approvableCount})</Button>}
          {deletableCount > 0 && (
            <Button size="sm" variant="outline" className="h-7 text-xs text-gray-600 border-gray-300 hover:bg-gray-50" onClick={() => submitBulkDelete(domain)} disabled={bulkDeleteProcessing}>
              <Trash2 className="w-3.5 h-3.5 mr-1" />{bulkDeleteProcessing ? '삭제 중...' : `선택 삭제 (${deletableCount})`}
            </Button>
          )}
        </div>
      </div>
    );
  };

  const renderActionPanel = (
    title: string, subject: string,
    comment: string, setComment: (v: string) => void,
    action: 'approve' | 'reject' | null, processing: boolean,
    onBack: () => void, onSubmit: () => void,
    forceMode = false,
    extraContent?: React.ReactNode,
  ) => (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="w-5 h-5" /></Button>
        <h2 className="text-lg font-bold">{action === 'approve' ? '결재 승인' : '결재 반려'}</h2>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">{title}</CardTitle><CardDescription>{subject}</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          {extraContent}
          {forceMode && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-md p-2.5">
              관리자 권한으로 결재라인의 정상 순서를 건너뛰고 이 건을 즉시 {action === 'approve' ? '승인' : '반려'} 처리합니다. 남은 결재 단계는 진행되지 않습니다.
            </div>
          )}
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
          <TabsTrigger value="deletion-log" className="gap-1.5"><Archive className="w-3.5 h-3.5" />삭제 이력 ({deletionLogs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="crew" className="mt-4">
          {crewViewMode === 'action' && selectedCrew ? renderActionPanel(
            selectedCrew.recommendation?.crew_name || '선원 추천', `결재선: ${selectedCrew.approval_line.name}`,
            crewComment, setCrewComment, crewAction, crewProcessing,
            () => { setCrewViewMode('list'); setSelectedCrew(null); setCrewAction(null); setCrewForce(false); }, handleCrewAction, crewForce,
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
                    a => `${a.recommendation?.ranks?.rank_code ? `${a.recommendation.ranks.rank_code} ` : ''}${a.recommendation?.crew_name || '선원 추천'}`,
                    a => hierarchyLabel(a.recommendation?.owner?.name, a.recommendation?.fleet?.name, a.recommendation?.ships?.name),
                    a => { setSelectedCrew(a); setCrewViewMode('list'); },
                    a => { setSelectedCrew(a); setCrewAction('approve'); setCrewForce(false); setCrewViewMode('action'); setCrewComment(''); },
                    a => { setSelectedCrew(a); setCrewAction('reject'); setCrewForce(false); setCrewViewMode('action'); setCrewComment(''); },
                    crewSelectedIds, setCrewSelectedIds,
                    a => { setSelectedCrew(a); setCrewAction('approve'); setCrewForce(true); setCrewViewMode('action'); setCrewComment(''); },
                    a => { setSelectedCrew(a); setCrewAction('reject'); setCrewForce(true); setCrewViewMode('action'); setCrewComment(''); },
                  )}
                  {renderPagination(crewFiltered.length, crewPage, setCrewPage)}
                </>
              )}
            </div>
          )}
          {crewViewMode === 'list' && renderViewDialog(
            selectedCrew, () => setSelectedCrew(null),
            <User className="w-4 h-4" />, `${selectedCrew?.recommendation?.ranks?.rank_code ? `${selectedCrew.recommendation.ranks.rank_code} ` : ''}${selectedCrew?.recommendation?.crew_name || '선원 추천'}`,
            `${hierarchyLabel(selectedCrew?.recommendation?.owner?.name, selectedCrew?.recommendation?.fleet?.name, selectedCrew?.recommendation?.ships?.name)} · 요청자: ${selectedCrew?.requester_name || ''}`,
            !!selectedCrew && selectedCrew.status !== 'pending' && (selectedCrew.requester_id === currentUserId || isAdmin) && permissions.canDelete,
            () => selectedCrew && handleDeleteCrew(selectedCrew),
          )}
        </TabsContent>

        <TabsContent value="rotation" className="mt-4">
          {rotationViewMode === 'action' && selectedRotation ? renderActionPanel(
            selectedRotation.plan_name || '교대계획', `결재선: ${selectedRotation.approval_line.name} · ${selectedRotation.ship_name}`,
            rotationComment, setRotationComment, rotationAction, rotationProcessing,
            () => { setRotationViewMode('list'); setSelectedRotation(null); setRotationAction(null); setRotationForce(false); }, handleRotationAction, rotationForce,
            renderRotationAssignmentSummary(),
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
                    a => { setSelectedRotation(a); setRotationAction('approve'); setRotationForce(false); setRotationViewMode('action'); setRotationComment(''); },
                    a => { setSelectedRotation(a); setRotationAction('reject'); setRotationForce(false); setRotationViewMode('action'); setRotationComment(''); },
                    rotationSelectedIds, setRotationSelectedIds,
                    a => { setSelectedRotation(a); setRotationAction('approve'); setRotationForce(true); setRotationViewMode('action'); setRotationComment(''); },
                    a => { setSelectedRotation(a); setRotationAction('reject'); setRotationForce(true); setRotationViewMode('action'); setRotationComment(''); },
                  )}
                  {renderPagination(rotationFiltered.length, rotationPage, setRotationPage)}
                </>
              )}
            </div>
          )}
          {rotationViewMode === 'list' && renderViewDialog(
            selectedRotation, () => setSelectedRotation(null),
            <ShipIcon className="w-4 h-4" />, selectedRotation?.plan_name || '교대계획',
            `${selectedRotation?.ship_name || ''} · 요청자: ${selectedRotation?.requester_name || ''}`,
            !!selectedRotation && selectedRotation.status !== 'pending' && (selectedRotation.requester_id === currentUserId || isAdmin) && permissions.canDelete,
            () => selectedRotation && handleDeleteRotation(selectedRotation),
            renderRotationAssignmentSummary(),
          )}
        </TabsContent>

        <TabsContent value="contract" className="mt-4">
          {contractViewMode === 'action' && selectedContract ? renderActionPanel(
            `${selectedContract.rank_code || ''}${selectedContract.rank_grade ? `(${selectedContract.rank_grade})` : ''} ${selectedContract.crew_name || '-'}`,
            `결재선: ${selectedContract.approval_line.name} · ${hierarchyLabel(selectedContract.owner_name, selectedContract.fleet_name, selectedContract.ship_name)}`,
            contractComment, setContractComment, contractAction, contractProcessing,
            () => { setContractViewMode('list'); setSelectedContract(null); setContractAction(null); setContractForce(false); }, handleContractAction, contractForce,
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
                    a => `${a.rank_code || ''}${a.rank_grade ? `(${a.rank_grade})` : ''} ${a.crew_name || '-'}`,
                    a => hierarchyLabel(a.owner_name, a.fleet_name, a.ship_name),
                    a => { setSelectedContract(a); setContractViewMode('list'); },
                    a => { setSelectedContract(a); setContractAction('approve'); setContractForce(false); setContractViewMode('action'); setContractComment(''); },
                    a => { setSelectedContract(a); setContractAction('reject'); setContractForce(false); setContractViewMode('action'); setContractComment(''); },
                    contractSelectedIds, setContractSelectedIds,
                    a => { setSelectedContract(a); setContractAction('approve'); setContractForce(true); setContractViewMode('action'); setContractComment(''); },
                    a => { setSelectedContract(a); setContractAction('reject'); setContractForce(true); setContractViewMode('action'); setContractComment(''); },
                  )}
                  {renderPagination(contractFiltered.length, contractPage, setContractPage)}
                </>
              )}
            </div>
          )}
          {contractViewMode === 'list' && renderViewDialog(
            selectedContract, () => setSelectedContract(null),
            <User className="w-4 h-4" />, `${selectedContract?.rank_code || ''}${selectedContract?.rank_grade ? `(${selectedContract.rank_grade})` : ''} ${selectedContract?.crew_name || '-'}`,
            `${hierarchyLabel(selectedContract?.owner_name, selectedContract?.fleet_name, selectedContract?.ship_name)} · 요청자: ${selectedContract?.requester_name || ''}`,
            !!selectedContract && selectedContract.status !== 'pending' && (selectedContract.requester_id === currentUserId || isAdmin) && permissions.canDelete,
            () => selectedContract && handleDeleteContract(selectedContract),
          )}
        </TabsContent>

        <TabsContent value="dispatch" className="mt-4">
          {dispatchViewMode === 'action' && selectedDispatch ? renderActionPanel(
            `${selectedDispatch.new_rank_code || ''}${selectedDispatch.new_grade ? `(${selectedDispatch.new_grade})` : ''} ${selectedDispatch.crew_name} — ${selectedDispatch.dispatch_type === 'promotion' ? '승진' : '강등'}`,
            `결재선: ${selectedDispatch.approval_line.name} · ${hierarchyLabel(selectedDispatch.owner_name, selectedDispatch.fleet_name, selectedDispatch.ship_name)}`,
            dispatchComment, setDispatchComment, dispatchAction, dispatchProcessing,
            () => { setDispatchViewMode('list'); setSelectedDispatch(null); setDispatchAction(null); setDispatchForce(false); }, handleDispatchAction, dispatchForce,
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
                    a => `${a.new_rank_code || ''}${a.new_grade ? `(${a.new_grade})` : ''} ${a.crew_name || '-'} (${a.dispatch_type === 'promotion' ? '승진' : '강등'})`,
                    a => `${hierarchyLabel(a.owner_name, a.fleet_name, a.ship_name)} · ${a.previous_rank_code}${a.previous_grade ? `(${a.previous_grade})` : ''} → ${a.new_rank_code}${a.new_grade ? `(${a.new_grade})` : ''}`,
                    a => { setSelectedDispatch(a); setDispatchViewMode('list'); },
                    a => { setSelectedDispatch(a); setDispatchAction('approve'); setDispatchForce(false); setDispatchViewMode('action'); setDispatchComment(''); },
                    a => { setSelectedDispatch(a); setDispatchAction('reject'); setDispatchForce(false); setDispatchViewMode('action'); setDispatchComment(''); },
                    dispatchSelectedIds, setDispatchSelectedIds,
                    a => { setSelectedDispatch(a); setDispatchAction('approve'); setDispatchForce(true); setDispatchViewMode('action'); setDispatchComment(''); },
                    a => { setSelectedDispatch(a); setDispatchAction('reject'); setDispatchForce(true); setDispatchViewMode('action'); setDispatchComment(''); },
                  )}
                  {renderPagination(dispatchFiltered.length, dispatchPage, setDispatchPage)}
                </>
              )}
            </div>
          )}
          {dispatchViewMode === 'list' && renderViewDialog(
            selectedDispatch, () => setSelectedDispatch(null),
            <User className="w-4 h-4" />,
            `${selectedDispatch?.new_rank_code || ''}${selectedDispatch?.new_grade ? `(${selectedDispatch.new_grade})` : ''} ${selectedDispatch?.crew_name || ''} — ${selectedDispatch?.previous_rank_code || ''}${selectedDispatch?.previous_grade ? `(${selectedDispatch.previous_grade})` : ''} → ${selectedDispatch?.new_rank_code || ''}${selectedDispatch?.new_grade ? `(${selectedDispatch.new_grade})` : ''}`,
            `${hierarchyLabel(selectedDispatch?.owner_name, selectedDispatch?.fleet_name, selectedDispatch?.ship_name)} · 요청자: ${selectedDispatch?.requester_name || ''}`,
            !!selectedDispatch && selectedDispatch.status !== 'pending' && (selectedDispatch.requester_id === currentUserId || isAdmin) && permissions.canDelete,
            () => selectedDispatch && handleDeleteDispatch(selectedDispatch),
          )}
        </TabsContent>

        <TabsContent value="salary" className="mt-4">
          <Card><CardContent className="py-12 text-center text-gray-500">급여지급 결재는 준비중입니다.</CardContent></Card>
        </TabsContent>

        <TabsContent value="deletion-log" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">삭제 이력함</CardTitle>
              <CardDescription className="text-xs mt-1">
                채용/배승/계약/승진강등 결재함에서 삭제된 건의 요청자/결재선/결재자별 승인·반려 이력을 영구 보관합니다.
                실제 반영된 데이터와는 별개이며, 이 목록 자체는 시스템관리자 이상만 완전히 삭제할 수 있습니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {deletionLogs.length === 0 ? (
                <div className="text-center py-8 text-sm text-gray-400">삭제된 이력이 없습니다.</div>
              ) : (
                <>
                {isAdmin && logSelectedIds.length > 0 && (
                  <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-2">
                    <span className="text-xs text-red-800">{logSelectedIds.length}건 선택됨</span>
                    <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-300 hover:bg-red-100" onClick={handleBulkPurgeLogs} disabled={bulkPurging}>
                      <Trash2 className="h-3.5 w-3.5 mr-1" />{bulkPurging ? '삭제 중...' : `선택 영구 삭제 (${logSelectedIds.length})`}
                    </Button>
                  </div>
                )}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs w-6" />
                      {isAdmin && (
                        <TableHead className="w-8">
                          <Checkbox
                            checked={deletionLogs.length > 0 && deletionLogs.every(l => logSelectedIds.includes(l.id))}
                            onCheckedChange={checked => toggleLogSelectAll(!!checked)}
                          />
                        </TableHead>
                      )}
                      <TableHead className="text-xs">구분</TableHead>
                      <TableHead className="text-xs">대상</TableHead>
                      <TableHead className="text-xs">요청자</TableHead>
                      <TableHead className="text-xs">결재선</TableHead>
                      <TableHead className="text-xs">최종 상태</TableHead>
                      <TableHead className="text-xs">완료일</TableHead>
                      <TableHead className="text-xs">삭제한 사람</TableHead>
                      <TableHead className="text-xs">삭제일</TableHead>
                      {isAdmin && <TableHead className="text-right text-xs w-16">작업</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deletionLogs.map(log => {
                      const status = getStatusBadge(log.final_status);
                      const expanded = expandedLogId === log.id;
                      return (
                        <Fragment key={log.id}>
                          <TableRow className="cursor-pointer hover:bg-gray-50" onClick={() => setExpandedLogId(expanded ? null : log.id)}>
                            <TableCell>{expanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}</TableCell>
                            {isAdmin && (
                              <TableCell onClick={e => e.stopPropagation()}>
                                <Checkbox checked={logSelectedIds.includes(log.id)} onCheckedChange={() => toggleLogSelect(log.id)} />
                              </TableCell>
                            )}
                            <TableCell><Badge variant="outline" className="text-xs">{DOMAIN_LABEL[log.domain]}</Badge></TableCell>
                            <TableCell className="font-medium text-sm">{log.subjectLabel}</TableCell>
                            <TableCell className="text-sm">{log.requester_name}</TableCell>
                            <TableCell className="text-sm">{log.approval_line_name || '-'}</TableCell>
                            <TableCell>{status}</TableCell>
                            <TableCell className="text-sm">{log.completed_at ? format(new Date(log.completed_at), 'yyyy-MM-dd HH:mm', { locale: ko }) : '-'}</TableCell>
                            <TableCell className="text-sm">{log.deleted_by_name}</TableCell>
                            <TableCell className="text-sm">{format(new Date(log.deleted_at), 'yyyy-MM-dd HH:mm', { locale: ko })}</TableCell>
                            {isAdmin && (
                              <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-600" onClick={() => handlePurgeLog(log)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TableCell>
                            )}
                          </TableRow>
                          {expanded && (
                            <TableRow className="bg-gray-50/60">
                              <TableCell colSpan={isAdmin ? 11 : 9} className="text-xs">
                                {log.actions.length === 0 ? (
                                  <div className="text-gray-400 py-2">결재 진행 이력이 없습니다.</div>
                                ) : (
                                  <div className="py-2 space-y-1.5">
                                    {[...log.actions].sort((a, b) => a.step_order - b.step_order).map((a, i) => (
                                      <div key={i} className="flex items-center gap-2">
                                        <span className="text-gray-400 w-10">{a.step_order}단계</span>
                                        <span className="font-medium">{a.approver_name || '알 수 없음'}</span>
                                        <Badge variant="outline" className={a.action === 'approved' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}>
                                          {a.action === 'approved' ? '승인' : '반려'}
                                        </Badge>
                                        {a.comment && <span className="text-gray-500">"{a.comment}"</span>}
                                        <span className="text-gray-400 ml-auto">{format(new Date(a.created_at), 'yyyy-MM-dd HH:mm', { locale: ko })}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
                </>
              )}
            </CardContent>
          </Card>
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
