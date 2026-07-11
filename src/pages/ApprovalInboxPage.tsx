import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import {
  CheckCircle2, XCircle, Clock, FileText, User, Ship, Calendar, Send, ArrowLeft,
  Paperclip, Trash2, Ban, Inbox, Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { approvalService } from '@/services/approval.service';
import { approvalDocumentService } from '@/services/approval-document.service';
import { orgChartService } from '@/services/org-chart.service';
import type { CrewRecommendationApprovalWithDetails } from '@/types/approval';
import type { CrewRecommendation } from '@/types/crew-recommendation';
import type { ApprovalDocumentWithDetails, DocumentFormField } from '@/types/approval-document';

type ApprovalWithRecommendation = CrewRecommendationApprovalWithDetails & { recommendation?: CrewRecommendation };
type CrewFilter = 'all' | 'mine' | 'pending' | 'approved' | 'rejected';
type DocFilter = 'all' | 'mine' | 'pending' | 'referenced' | 'approved' | 'rejected';

const DRAFT_ROLES = ['ship_manager', 'admin', 'system_admin'];

export default function ApprovalInboxPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [initializing, setInitializing] = useState(true);
  const [currentUserId, setCurrentUserId] = useState('');
  const [currentUserName, setCurrentUserName] = useState('');
  const [currentUserRole, setCurrentUserRole] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [myOrgUnitIds, setMyOrgUnitIds] = useState<string[]>([]);

  // 선원추천 결재
  const [crewApprovals, setCrewApprovals] = useState<ApprovalWithRecommendation[]>([]);
  const [crewFilter, setCrewFilter] = useState<CrewFilter>('all');
  const [crewViewMode, setCrewViewMode] = useState<'list' | 'action'>('list');
  const [selectedCrewApproval, setSelectedCrewApproval] = useState<ApprovalWithRecommendation | null>(null);
  const [crewActionType, setCrewActionType] = useState<'approve' | 'reject' | null>(null);
  const [crewComment, setCrewComment] = useState('');
  const [crewProcessing, setCrewProcessing] = useState(false);

  // 일반 문서(기안서) 결재
  const [documents, setDocuments] = useState<ApprovalDocumentWithDetails[]>([]);
  const [referencedDocIds, setReferencedDocIds] = useState<Set<string>>(new Set());
  const [docFilter, setDocFilter] = useState<DocFilter>('all');
  const [docViewMode, setDocViewMode] = useState<'list' | 'action'>('list');
  const [selectedDocument, setSelectedDocument] = useState<ApprovalDocumentWithDetails | null>(null);
  const [docActionType, setDocActionType] = useState<'approved' | 'rejected' | null>(null);
  const [docComment, setDocComment] = useState('');
  const [docProcessing, setDocProcessing] = useState(false);
  const [documentFieldSchemas, setDocumentFieldSchemas] = useState<Map<string, DocumentFormField[]>>(new Map());

  const permissions = usePermissions('approval_inbox');

  // 메뉴 접속(canView) 권한이 명시적으로 꺼진 경우 접근을 차단한다. loading 중에는 판단하지 않는다.
  // 참고: isAdmin은 결재 워크플로우상의 권한(전체 문서 조회 등)이고, 이 canView는 완전히 별개인
  // "이 메뉴 자체에 접근 가능한지"를 다루는 상위 레벨 권한이다.
  useEffect(() => {
    if (!permissions.loading && !permissions.canView) navigate('/dashboard');
  }, [permissions.loading, permissions.canView, navigate]);

  useEffect(() => { init(); }, []);

  const init = async () => {
    try {
      setInitializing(true);
      const currentUser = await getCurrentUser();
      if (!currentUser) { navigate('/login'); return; }

      const admin = currentUser.role === 'admin' || currentUser.role === 'system_admin';
      setCurrentUserId(currentUser.id);
      setCurrentUserName(currentUser.name ?? '');
      setCurrentUserRole(currentUser.role ?? '');
      setIsAdmin(admin);

      const members = await orgChartService.getOrgMembers();
      const orgUnitIds = members.find(m => m.id === currentUser.id)?.org_unit_ids || [];
      setMyOrgUnitIds(orgUnitIds);

      const docTypes = await approvalDocumentService.getDocumentTypes(true);
      setDocumentFieldSchemas(new Map(docTypes.map(t => [t.id, t.field_schema || []])));

      await Promise.all([
        loadCrewApprovals(currentUser.id, admin),
        loadDocuments(currentUser.id, admin, orgUnitIds),
      ]);
    } finally {
      setInitializing(false);
    }
  };

  // --- 선원추천 결재: 데이터 로딩 ---

  const loadCrewApprovals = async (userId: string, admin: boolean) => {
    try {
      const approvals = admin
        ? await approvalService.getAllApprovals()
        : await approvalService.getMyRelatedApprovals(userId);
      if (approvals.length === 0) { setCrewApprovals([]); return; }

      const crewRecIds = [...new Set(approvals.map(a => a.crew_recommendation_id))];
      const { data: crewRecs, error } = await supabase.from('crew_recommendations').select('*').in('id', crewRecIds);
      if (error) throw error;
      const crewRecsMap = new Map((crewRecs || []).map((cr: { id: string }) => [cr.id, cr]));

      const merged: ApprovalWithRecommendation[] = approvals
        .map(a => ({ ...a, recommendation: crewRecsMap.get(a.crew_recommendation_id) }))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setCrewApprovals(merged);
    } catch (e) {
      console.error(e);
      toast({ title: '오류', description: '선원추천 결재를 불러오는 중 오류가 발생했습니다.', variant: 'destructive' });
    }
  };

  // --- 일반 문서: 데이터 로딩 ---

  const loadDocuments = async (userId: string, admin: boolean, orgUnitIds: string[]) => {
    try {
      const [docs, refs] = await Promise.all([
        admin ? approvalDocumentService.getAllDocuments() : approvalDocumentService.getMyRelatedDocuments(userId, orgUnitIds),
        loadMyReferenceDocIds(userId, orgUnitIds),
      ]);
      setDocuments(docs);
      setReferencedDocIds(refs);
    } catch (e) {
      console.error(e);
      toast({ title: '오류', description: '문서 결재 요청을 불러오는 중 오류가 발생했습니다.', variant: 'destructive' });
    }
  };

  const loadMyReferenceDocIds = async (userId: string, orgUnitIds: string[]): Promise<Set<string>> => {
    const orFilter = orgUnitIds.length > 0
      ? `user_id.eq.${userId},org_unit_id.in.(${orgUnitIds.join(',')})`
      : `user_id.eq.${userId}`;
    const { data, error } = await supabase.from('approval_document_references').select('document_id').or(orFilter);
    if (error) throw error;
    return new Set((data || []).map((r: { document_id: string }) => r.document_id));
  };

  // --- 선원추천 결재: 액션 ---

  const isMyCrewTurn = (approval: ApprovalWithRecommendation) => {
    if (approval.status !== 'pending') return false;
    if (isAdmin) return true;
    return approval.current_approver?.approver_id === currentUserId;
  };

  const canDeleteCrew = (approval: ApprovalWithRecommendation) =>
    approval.status !== 'pending' && (approval.requester_id === currentUserId || isAdmin);

  const crewGoBackToList = () => {
    setCrewViewMode('list'); setSelectedCrewApproval(null); setCrewActionType(null); setCrewComment('');
  };

  const handleDeleteCrew = async (approval: ApprovalWithRecommendation) => {
    if (!confirm('이 결재 이력을 삭제하시겠습니까? 이미 등록된 선원 정보는 유지되며, 결재 이력만 삭제되어 되돌릴 수 없습니다. (추천/결재 히스토리는 별도로 영구 보관됩니다)')) return;
    try {
      await approvalService.deleteApproval(approval, approval.recommendation?.crew_name || '알 수 없음', currentUserId, currentUserName);
      toast({ title: '삭제되었습니다.' });
      await loadCrewApprovals(currentUserId, isAdmin);
    } catch (e) {
      toast({ title: '삭제 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  const handleCrewAction = async () => {
    if (!selectedCrewApproval || !crewActionType) return;
    if (crewActionType === 'reject' && !crewComment.trim()) {
      toast({ title: '오류', description: '반려 사유를 입력해주세요.', variant: 'destructive' });
      return;
    }
    try {
      setCrewProcessing(true);
      if (isAdmin) {
        if (crewActionType === 'reject') await approvalService.adminForceReject(selectedCrewApproval.id, currentUserId, crewComment);
        else await approvalService.adminForceApprove(selectedCrewApproval.id, currentUserId, crewComment || undefined);
      } else {
        if (crewActionType === 'reject') await approvalService.rejectStep(selectedCrewApproval.id, currentUserId, crewComment);
        else await approvalService.approveStep(selectedCrewApproval.id, currentUserId, crewComment || undefined);
      }
      toast({ title: '성공', description: crewActionType === 'approve' ? '승인되었습니다.' : '반려되었습니다.' });
      crewGoBackToList();
      await loadCrewApprovals(currentUserId, isAdmin);
    } catch (e) {
      console.error(e);
      toast({ title: '오류', description: '결재 처리 중 오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setCrewProcessing(false);
    }
  };

  // --- 일반 문서: 액션 ---

  const isMyDocTurn = (doc: ApprovalDocumentWithDetails) => {
    if (doc.status !== 'pending') return false;
    if (isAdmin) return true;
    return doc.steps.some(s => s.step_order === doc.current_step && s.approver_id === currentUserId);
  };

  const canCancelDoc = (doc: ApprovalDocumentWithDetails) => doc.status === 'pending' && (doc.created_by === currentUserId || isAdmin);
  const canDeleteDoc = (doc: ApprovalDocumentWithDetails) => doc.status !== 'pending' && (doc.created_by === currentUserId || isAdmin);

  const docGoBackToList = () => {
    setDocViewMode('list'); setSelectedDocument(null); setDocActionType(null); setDocComment('');
  };

  const handleDocAction = async () => {
    if (!selectedDocument || !docActionType) return;
    if (docActionType === 'rejected' && !docComment.trim()) {
      toast({ title: '오류', description: '반려 사유를 입력해주세요.', variant: 'destructive' });
      return;
    }
    try {
      setDocProcessing(true);
      if (isAdmin) {
        if (docActionType === 'rejected') await approvalDocumentService.adminForceRejectDocumentStep(selectedDocument.id, currentUserId, docComment);
        else await approvalDocumentService.adminForceApproveDocumentStep(selectedDocument.id, currentUserId, docComment || undefined);
      } else {
        if (docActionType === 'rejected') await approvalDocumentService.rejectDocumentStep(selectedDocument.id, currentUserId, docComment);
        else await approvalDocumentService.approveDocumentStep(selectedDocument.id, currentUserId, docComment || undefined);
      }
      toast({ title: '성공', description: docActionType === 'approved' ? '승인되었습니다.' : '반려되었습니다.' });
      docGoBackToList();
      await loadDocuments(currentUserId, isAdmin, myOrgUnitIds);
    } catch (e) {
      console.error(e);
      toast({ title: '오류', description: e instanceof Error ? e.message : '결재 처리 중 오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setDocProcessing(false);
    }
  };

  const handleCancelDoc = async (doc: ApprovalDocumentWithDetails) => {
    if (!confirm('이 기안서를 취소하시겠습니까?')) return;
    try {
      await approvalDocumentService.cancelDocument(doc.id);
      toast({ title: '취소되었습니다.' });
      docGoBackToList();
      await loadDocuments(currentUserId, isAdmin, myOrgUnitIds);
    } catch (e) {
      toast({ title: '취소 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  const handleDeleteDoc = async (doc: ApprovalDocumentWithDetails) => {
    if (!confirm('이 기안서를 완전히 삭제하시겠습니까? 되돌릴 수 없습니다.')) return;
    try {
      await approvalDocumentService.deleteDocument(doc.id);
      toast({ title: '삭제되었습니다.' });
      docGoBackToList();
      await loadDocuments(currentUserId, isAdmin, myOrgUnitIds);
    } catch (e) {
      toast({ title: '삭제 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  const openAttachment = (path: string) => {
    const { data } = supabase.storage.from('documents').getPublicUrl(path);
    if (data?.publicUrl) window.open(data.publicUrl, '_blank');
  };

  // --- 공통 표시 헬퍼 ---

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200"><Clock className="w-3 h-3 mr-1" />결재중</Badge>;
      case 'approved': return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200"><CheckCircle2 className="w-3 h-3 mr-1" />승인</Badge>;
      case 'rejected': return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200"><XCircle className="w-3 h-3 mr-1" />반려</Badge>;
      case 'cancelled': return <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200"><Ban className="w-3 h-3 mr-1" />취소</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  // --- 선원추천 결재: 렌더링 ---

  const renderCrewProgress = (approval: ApprovalWithRecommendation) => (
    <div>
      <h4 className="text-sm font-semibold mb-2">결재 진행</h4>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold bg-blue-100 text-blue-700">기안</div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
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
          return (
            <div key={step.id} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                action?.action === 'approved' ? 'bg-green-100 text-green-700'
                : action?.action === 'rejected' ? 'bg-red-100 text-red-700'
                : isCurrent ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'
              }`}>{index + 1}</div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
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

  const renderCrewCard = (approval: ApprovalWithRecommendation) => {
    const myTurn = isMyCrewTurn(approval);
    const rec = approval.recommendation;
    return (
      <Card key={approval.id} className={myTurn ? 'border-blue-500 border-2' : ''}>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <CardTitle className="text-lg">{rec?.crew_name || '선원 추천'}</CardTitle>
                {myTurn && <Badge className="bg-blue-500">내 차례</Badge>}
                {getStatusBadge(approval.status)}
              </div>
              <CardDescription className="space-y-1">
                <div className="flex items-center gap-2 text-sm"><FileText className="w-4 h-4" /><span>결재선: {approval.approval_line.name}</span></div>
                <div className="flex items-center gap-2 text-sm"><User className="w-4 h-4" /><span>요청자: {approval.requester_name} {approval.requester_role}</span></div>
                {rec && (
                  <>
                    <div className="flex items-center gap-2 text-sm"><Ship className="w-4 h-4" /><span>선박: {rec.ship_name}</span></div>
                    <div className="flex items-center gap-2 text-sm"><Calendar className="w-4 h-4" /><span>승선가능일: {format(new Date(rec.available_date), 'yyyy-MM-dd', { locale: ko })}</span></div>
                  </>
                )}
                <div className="flex items-center gap-2 text-sm"><Clock className="w-4 h-4" /><span>요청일: {format(new Date(approval.created_at), 'yyyy-MM-dd HH:mm', { locale: ko })}</span></div>
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {renderCrewProgress(approval)}
            {myTurn && (
              <div className="flex gap-2 pt-4 border-t">
                <Button onClick={() => { setSelectedCrewApproval(approval); setCrewActionType('approve'); setCrewViewMode('action'); }} className="flex-1">승인</Button>
                <Button onClick={() => { setSelectedCrewApproval(approval); setCrewActionType('reject'); setCrewViewMode('action'); }} variant="destructive" className="flex-1">반려</Button>
              </div>
            )}
            {canDeleteCrew(approval) && permissions.canDelete && (
              <div className="flex justify-end pt-4 border-t">
                <Button size="sm" variant="outline" className="text-red-600 border-red-300 gap-1" onClick={() => handleDeleteCrew(approval)}><Trash2 className="w-3.5 h-3.5" />삭제</Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  const crewMyRequested = crewApprovals.filter(a => a.requester_id === currentUserId);
  const crewPending = crewApprovals.filter(a => a.status === 'pending');
  const crewApproved = crewApprovals.filter(a => a.status === 'approved');
  const crewRejected = crewApprovals.filter(a => a.status === 'rejected');
  const crewFiltered = crewFilter === 'mine' ? crewMyRequested
    : crewFilter === 'pending' ? crewPending
    : crewFilter === 'approved' ? crewApproved
    : crewFilter === 'rejected' ? crewRejected
    : crewApprovals;

  const renderCrewAction = () => {
    if (!selectedCrewApproval || !crewActionType) return null;
    const rec = selectedCrewApproval.recommendation;
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={crewGoBackToList}><ArrowLeft className="w-5 h-5" /></Button>
          <h2 className="text-lg font-bold">{crewActionType === 'approve' ? '결재 승인' : '결재 반려'}</h2>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{rec?.crew_name || '선원 추천'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>{crewActionType === 'approve' ? '의견 (선택사항)' : '반려 사유 (필수)'}</Label>
              <Textarea value={crewComment} onChange={e => setCrewComment(e.target.value)} rows={4} className="mt-2" disabled={crewProcessing} />
            </div>
            <div className="flex gap-2 pt-4 border-t">
              <Button variant="outline" onClick={crewGoBackToList} disabled={crewProcessing} className="flex-1">취소</Button>
              <Button
                onClick={handleCrewAction}
                disabled={crewProcessing || (crewActionType === 'reject' && !crewComment.trim())}
                variant={crewActionType === 'approve' ? 'default' : 'destructive'}
                className="flex-1"
              >
                {crewProcessing ? '처리 중...' : crewActionType === 'approve' ? '승인' : '반려'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // --- 일반 문서: 렌더링 ---

  const renderAttachments = (doc: ApprovalDocumentWithDetails) => doc.attachments.length > 0 && (
    <div className="bg-gray-50 p-3 rounded">
      <p className="text-sm font-semibold mb-1.5 flex items-center gap-1"><Paperclip className="w-3.5 h-3.5" />첨부 문서</p>
      <div className="space-y-1">
        {doc.attachments.map((f, idx) => (
          <button key={idx} type="button" onClick={() => openAttachment(f.path)} className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
            <FileText className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{f.name}</span>
            <span className="text-xs text-gray-400 shrink-0">({(f.size / 1024).toFixed(1)} KB)</span>
          </button>
        ))}
      </div>
    </div>
  );

  const renderDocProgress = (doc: ApprovalDocumentWithDetails) => (
    <div>
      <p className="text-sm font-semibold mb-2">결재 진행 상황:</p>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center">
          <div className="px-3 py-2 rounded border bg-purple-50 border-purple-400">
            <div className="text-xs font-semibold">기안자</div>
            <div className="text-xs text-gray-600">{doc.creator_name}</div>
            <div className="text-xs mt-1 text-purple-600">✓ 기안완료</div>
          </div>
          <span className="mx-2 text-gray-400">→</span>
        </div>
        {doc.steps.map((step, index) => (
          <div key={step.id} className="flex items-center">
            <div className={`px-3 py-2 rounded border ${
              step.status === 'approved' ? 'bg-green-50 border-green-500'
              : step.status === 'rejected' ? 'bg-red-50 border-red-500'
              : step.step_order === doc.current_step ? 'bg-blue-50 border-blue-500'
              : step.step_order < doc.current_step ? 'bg-gray-100 border-gray-300'
              : 'bg-white border-gray-300'
            }`}>
              <div className="text-xs font-semibold">{step.step_order}. {step.approver_name}</div>
              <div className="text-xs text-gray-600">{step.approver_label}</div>
              {step.status !== 'pending' && (
                <div className="text-xs mt-1">
                  {step.status === 'approved' ? '✓ 승인' : '✗ 반려'}
                  {step.comment && <div className="text-xs text-gray-600 mt-1">{step.comment}</div>}
                </div>
              )}
            </div>
            {index < doc.steps.length - 1 && <span className="mx-2 text-gray-400">→</span>}
          </div>
        ))}
      </div>
    </div>
  );

  const renderDocCard = (doc: ApprovalDocumentWithDetails) => {
    const myTurn = isMyDocTurn(doc);
    return (
      <Card key={doc.id} className={myTurn ? 'border-blue-500 border-2' : ''}>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <CardTitle className="text-lg">{doc.title}</CardTitle>
                {getStatusBadge(doc.status)}
                {myTurn && <Badge className="bg-blue-500">내 차례</Badge>}
                {referencedDocIds.has(doc.id) && <Badge variant="outline" className="text-xs">참조</Badge>}
              </div>
              <CardDescription className="space-y-1">
                <div className="flex items-center gap-2 text-sm"><FileText className="w-4 h-4" /><span>{doc.document_type_name}{doc.org_unit_name ? ` · ${doc.org_unit_name}` : ''}</span></div>
                <div className="flex items-center gap-2 text-sm"><User className="w-4 h-4" /><span>기안자: {doc.creator_name}</span></div>
                <div className="flex items-center gap-2 text-sm"><Calendar className="w-4 h-4" /><span>{format(new Date(doc.created_at), 'PPP', { locale: ko })}</span></div>
              </CardDescription>
            </div>
            {myTurn && (
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="outline" className="text-green-600 border-green-600" onClick={() => { setSelectedDocument(doc); setDocActionType('approved'); setDocViewMode('action'); }}>
                  <CheckCircle2 className="h-4 w-4 mr-1" />승인
                </Button>
                <Button size="sm" variant="outline" className="text-red-600 border-red-600" onClick={() => { setSelectedDocument(doc); setDocActionType('rejected'); setDocViewMode('action'); }}>
                  <XCircle className="h-4 w-4 mr-1" />반려
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {doc.form_data && Object.keys(doc.form_data).length > 0 ? (
              <div className="bg-gray-50 p-3 rounded text-sm space-y-1.5">
                {(documentFieldSchemas.get(doc.document_type_id) || []).map(field => (
                  <div key={field.key} className="flex gap-2">
                    <span className="text-gray-500 shrink-0 w-24">{field.label}</span>
                    <span className="whitespace-pre-wrap">{doc.form_data?.[field.key] ?? '-'}</span>
                  </div>
                ))}
              </div>
            ) : (
              doc.content && <div className="bg-gray-50 p-3 rounded text-sm whitespace-pre-wrap">{doc.content}</div>
            )}
            {renderAttachments(doc)}
            {doc.requester_comment && (
              <div className="bg-gray-50 p-3 rounded"><p className="text-sm font-semibold mb-1">요청 사유:</p><p className="text-sm text-gray-700">{doc.requester_comment}</p></div>
            )}
            {doc.final_comment && (
              <div className="bg-red-50 p-3 rounded"><p className="text-sm font-semibold mb-1">반려 사유:</p><p className="text-sm text-gray-700">{doc.final_comment}</p></div>
            )}
            {renderDocProgress(doc)}
            {(canCancelDoc(doc) || canDeleteDoc(doc)) && (
              <div className="flex gap-2 pt-3 border-t">
                {canCancelDoc(doc) && <Button size="sm" variant="outline" className="text-red-600 border-red-300" onClick={() => handleCancelDoc(doc)}>기안 취소</Button>}
                {canDeleteDoc(doc) && permissions.canDelete && (
                  <Button size="sm" variant="outline" className="text-red-600 border-red-300 gap-1" onClick={() => handleDeleteDoc(doc)}><Trash2 className="w-3.5 h-3.5" />삭제</Button>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  const docMyRequested = documents.filter(d => d.created_by === currentUserId);
  const docPending = documents.filter(d => d.status === 'pending');
  const docReferenced = documents.filter(d => referencedDocIds.has(d.id));
  const docApproved = documents.filter(d => d.status === 'approved');
  const docRejected = documents.filter(d => d.status === 'rejected');
  const docFiltered = docFilter === 'mine' ? docMyRequested
    : docFilter === 'pending' ? docPending
    : docFilter === 'referenced' ? docReferenced
    : docFilter === 'approved' ? docApproved
    : docFilter === 'rejected' ? docRejected
    : documents;

  const renderDocAction = () => {
    if (!selectedDocument || !docActionType) return null;
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={docGoBackToList}><ArrowLeft className="w-5 h-5" /></Button>
          <h2 className="text-lg font-bold">{docActionType === 'approved' ? '결재 승인' : '결재 반려'}</h2>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{selectedDocument.title}</CardTitle>
            <CardDescription>{selectedDocument.document_type_name}{selectedDocument.org_unit_name ? ` · ${selectedDocument.org_unit_name}` : ''}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>{docActionType === 'approved' ? '의견 (선택사항)' : '반려 사유 (필수)'}</Label>
              <Textarea value={docComment} onChange={e => setDocComment(e.target.value)} rows={4} className="mt-2" disabled={docProcessing} />
            </div>
            <div className="flex gap-2 pt-4 border-t">
              <Button variant="outline" onClick={docGoBackToList} disabled={docProcessing} className="flex-1">취소</Button>
              <Button
                onClick={handleDocAction}
                disabled={docProcessing || (docActionType === 'rejected' && !docComment.trim())}
                variant={docActionType === 'approved' ? 'default' : 'destructive'}
                className="flex-1"
              >
                {docProcessing ? '처리 중...' : docActionType === 'approved' ? '승인' : '반려'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // --- 최상위 렌더링 ---

  if (initializing) return <div className="container mx-auto px-4 py-8 text-center">로딩 중...</div>;

  const FILTER_LABELS: { value: CrewFilter | DocFilter; label: string }[] = [
    { value: 'all', label: '전체' },
    { value: 'mine', label: '내가 요청한' },
    { value: 'pending', label: '결재중' },
    { value: 'referenced', label: '참조됨' },
    { value: 'approved', label: '승인' },
    { value: 'rejected', label: '반려' },
  ];

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Inbox className="w-6 h-6" />결재함</h1>
          <p className="text-gray-600 mt-1 text-sm">
            {isAdmin ? '모든 결재 문서를 조회하고 처리합니다.' : '기안자, 결재자, 참조자로 나와 관계있는 문서를 조회하고, 내 차례인 결재를 처리합니다.'}
          </p>
        </div>
        {DRAFT_ROLES.includes(currentUserRole) && permissions.canCreate && (
          <Button size="sm" className="gap-1.5" onClick={() => navigate('/documents/new')}><Plus className="w-4 h-4" />기안서 작성</Button>
        )}
      </div>

      <Tabs defaultValue="crew">
        <TabsList>
          <TabsTrigger value="crew">선원추천 결재 ({crewApprovals.length})</TabsTrigger>
          <TabsTrigger value="document">일반 문서 ({documents.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="crew" className="mt-4">
          {crewViewMode === 'action' ? renderCrewAction() : (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-1.5">
                {FILTER_LABELS.filter(f => f.value !== 'referenced').map(f => (
                  <button
                    key={f.value} type="button" onClick={() => setCrewFilter(f.value as CrewFilter)}
                    className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${crewFilter === f.value ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              {crewFiltered.length === 0 ? (
                <Card><CardContent className="py-12 text-center"><Clock className="h-12 w-12 mx-auto text-gray-400 mb-4" /><p className="text-gray-600">해당하는 결재 문서가 없습니다</p></CardContent></Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">{crewFiltered.map(renderCrewCard)}</div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="document" className="mt-4">
          {docViewMode === 'action' ? renderDocAction() : (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-1.5">
                {FILTER_LABELS.map(f => (
                  <button
                    key={f.value} type="button" onClick={() => setDocFilter(f.value as DocFilter)}
                    className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${docFilter === f.value ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              {docFiltered.length === 0 ? (
                <Card><CardContent className="py-12 text-center"><FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" /><p className="text-gray-600">해당하는 문서가 없습니다</p></CardContent></Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">{docFiltered.map(renderDocCard)}</div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
