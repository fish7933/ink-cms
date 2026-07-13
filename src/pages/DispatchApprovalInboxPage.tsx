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
import { getCurrentUser } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { useNavigate } from 'react-router-dom';
import { approvalService } from '@/services/approval.service';
import { rotationApprovalService } from '@/services/rotation-approval.service';
import { contractApprovalService } from '@/services/contract-approval.service';
import { supabase } from '@/lib/supabase';
import type { CrewRecommendationApprovalWithDetails, ApprovalLineStep, ApprovalAction } from '@/types/approval';
import type { CrewRecommendation } from '@/types/crew-recommendation';
import type { ApprovalRequestWithDetails } from '@/services/approval-engine';

type ApprovalWithRecommendation = CrewRecommendationApprovalWithDetails & { recommendation?: CrewRecommendation & { crew_name?: string; ship_name?: string } };
type RotationApprovalWithPlan = ApprovalRequestWithDetails & { plan_name?: string; ship_name?: string };
type ContractApprovalWithContract = ApprovalRequestWithDetails & { crew_name?: string; rank_code?: string; ship_name?: string };

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
const PAGE_SIZE = 20;

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

  useEffect(() => { setCrewPage(1); }, [crewFilter]);
  useEffect(() => { setRotationPage(1); }, [rotationFilter]);
  useEffect(() => { setContractPage(1); }, [contractFilter]);

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

  // --- 공통 헬퍼 ---

  const isMyTurn = (approval: ApprovalLike) => {
    if (approval.status !== 'pending') return false;
    if (isAdmin) return true;
    return approval.current_approver?.approver_id === currentUserId;
  };

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
    } catch (e) {
      console.error(e);
      toast({ title: '오류', description: '결재 처리 중 오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setContractProcessing(false);
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
  ) => (
    <div className="rounded-md border overflow-hidden overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>
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
  const crewPageRecs = crewFiltered.slice((crewPage - 1) * PAGE_SIZE, crewPage * PAGE_SIZE);
  const rotationPageRecs = rotationFiltered.slice((rotationPage - 1) * PAGE_SIZE, rotationPage * PAGE_SIZE);
  const contractPageRecs = contractFiltered.slice((contractPage - 1) * PAGE_SIZE, contractPage * PAGE_SIZE);

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Send className="w-6 h-6" />발령 결재함</h1>
        <p className="text-gray-600 mt-1 text-sm">채용/배승/계약 등 선원 인사 관련 결재를 조회하고 처리합니다.</p>
      </div>

      <Tabs defaultValue="crew">
        <TabsList>
          <TabsTrigger value="crew">채용 ({crewApprovals.length})</TabsTrigger>
          <TabsTrigger value="rotation">배승 ({rotationApprovals.length})</TabsTrigger>
          <TabsTrigger value="contract">계약 ({contractApprovals.length})</TabsTrigger>
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

        <TabsContent value="salary" className="mt-4">
          <Card><CardContent className="py-12 text-center text-gray-500">급여지급 결재는 준비중입니다.</CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
