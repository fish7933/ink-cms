import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle, XCircle, Clock, User, Ship, Calendar, ArrowLeft, FileText, Paperclip } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { approvalService } from '@/services/approval.service';
import { approvalDocumentService } from '@/services/approval-document.service';
import type { ApprovalDocumentWithDetails } from '@/types/approval-document';

interface ApprovalStep {
  step_order: number;
  approver_name: string;
  approver_role: string;
  approver_id: string;
}

interface ApprovalRequest {
  id: string;
  crew_recommendation_id: string;
  approval_line_id: string;
  requester_id: string;
  requester_comment: string | null;
  current_step: number;
  status: string;
  created_at: string;
  crew_recommendation: {
    crew_name: string;
    rank: { name: string };
    ship: { name: string };
  };
  requester: { name: string };
  approval_line: {
    name: string;
    steps: ApprovalStep[];
  };
  actions: Array<{
    step_order: number;
    action: string;
    comment: string | null;
    approver_name: string;
    created_at: string;
  }>;
}

export default function ApprovalInboxPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [initializing, setInitializing] = useState(true);

  // 선원추천 결재
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<ApprovalRequest | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'action'>('list');
  const [actionType, setActionType] = useState<'approved' | 'rejected'>('approved');
  const [comment, setComment] = useState('');
  const [processing, setProcessing] = useState(false);

  // 일반 문서(기안서) 결재
  const [documents, setDocuments] = useState<ApprovalDocumentWithDetails[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<ApprovalDocumentWithDetails | null>(null);
  const [docViewMode, setDocViewMode] = useState<'list' | 'action'>('list');
  const [docActionType, setDocActionType] = useState<'approved' | 'rejected'>('approved');
  const [docComment, setDocComment] = useState('');
  const [docProcessing, setDocProcessing] = useState(false);

  useEffect(() => { init(); }, []);

  const init = async () => {
    try {
      setInitializing(true);
      const currentUser = await getCurrentUser();
      if (!currentUser) { navigate('/login'); return; }

      const admin = currentUser.role === 'admin' || currentUser.role === 'system_admin';
      setCurrentUserId(currentUser.id);
      setIsAdmin(admin);

      await Promise.all([
        loadApprovalRequests(currentUser.id, admin),
        loadDocumentApprovals(currentUser.id, admin),
      ]);
    } finally {
      setInitializing(false);
    }
  };

  const loadApprovalRequests = async (userId: string, admin: boolean) => {
    try {
      const pendingApprovals = admin
        ? await approvalService.getAllPendingApprovals()
        : await approvalService.getMyPendingApprovals(userId);

      if (!pendingApprovals || pendingApprovals.length === 0) {
        setRequests([]);
        return;
      }

      const crewRecommendationIds = pendingApprovals.map(a => a.crew_recommendation_id);

      // FK 없이 별도 조회
      const { data: crewRecs, error: crewRecsError } = await supabase
        .from('crew_recommendations')
        .select('id, crew_name, rank_id, ship_id')
        .in('id', crewRecommendationIds);

      if (crewRecsError) throw crewRecsError;

      const rankIds = [...new Set((crewRecs || []).map((r: { rank_id: string }) => r.rank_id).filter(Boolean))];
      const shipIds = [...new Set((crewRecs || []).map((r: { ship_id: string }) => r.ship_id).filter(Boolean))];

      const [ranksRes, shipsRes] = await Promise.all([
        rankIds.length > 0 ? supabase.from('ranks').select('id, name').in('id', rankIds) : { data: [] },
        shipIds.length > 0 ? supabase.from('ships').select('id, name').in('id', shipIds) : { data: [] },
      ]);

      const ranksMap = new Map((ranksRes.data || []).map((r: { id: string; name: string }) => [r.id, r.name]));
      const shipsMap = new Map((shipsRes.data || []).map((s: { id: string; name: string }) => [s.id, s.name]));

      const crewRecsEnriched = (crewRecs || []).map((r: { id: string; crew_name: string; rank_id: string; ship_id: string }) => ({
        ...r,
        rank: { name: ranksMap.get(r.rank_id) || 'Unknown' },
        ship: { name: shipsMap.get(r.ship_id) || 'Unknown' },
      }));

      const requesterIds = [...new Set(pendingApprovals.map(a => a.requester_id))];
      const { data: requesters, error: requestersError } = await supabase
        .from('users')
        .select('id, name')
        .in('id', requesterIds);

      if (requestersError) throw requestersError;

      const requestersMap = new Map((requesters || []).map((r: { id: string; name: string }) => [r.id, r]));

      const mergedRequests = pendingApprovals.map(approval => {
        const crewRec = crewRecsEnriched?.find(cr => cr.id === approval.crew_recommendation_id);
        const requester = requestersMap.get(approval.requester_id);

        return {
          id: approval.id,
          crew_recommendation_id: approval.crew_recommendation_id,
          approval_line_id: approval.approval_line_id,
          requester_id: approval.requester_id,
          requester_comment: approval.requester_comment,
          current_step: approval.current_step,
          status: approval.status,
          created_at: approval.created_at,
          crew_recommendation: crewRec || {
            crew_name: 'Unknown',
            rank: { name: 'Unknown' },
            ship: { name: 'Unknown' },
          },
          requester: { name: (requester as { name?: string } | undefined)?.name || approval.requester_name || 'Unknown' },
          approval_line: {
            name: approval.approval_line.name,
            steps: approval.approval_line.steps.map(step => ({
              step_order: step.step_order,
              approver_name: step.approver_name,
              approver_role: step.approver_role || '',
              approver_id: step.approver_id,
            })),
          },
          actions: approval.actions.map(action => ({
            step_order: action.step_order,
            action: action.action,
            comment: action.comment || null,
            approver_name: action.approver_name || 'Unknown',
            created_at: action.created_at,
          })),
        };
      });

      setRequests(mergedRequests);
    } catch (error) {
      console.error('Error loading approval requests:', error);
      toast({ title: '오류', description: '결재 요청을 불러오는 중 오류가 발생했습니다.', variant: 'destructive' });
    }
  };

  const loadDocumentApprovals = async (userId: string, admin: boolean) => {
    try {
      const pending = admin
        ? await approvalDocumentService.getAllPendingDocumentApprovals()
        : await approvalDocumentService.getMyPendingDocumentApprovals(userId);
      setDocuments(pending);
    } catch (error) {
      console.error('Error loading document approvals:', error);
      toast({ title: '오류', description: '문서 결재 요청을 불러오는 중 오류가 발생했습니다.', variant: 'destructive' });
    }
  };

  // --- 선원추천 결재 ---

  const openActionDialog = (request: ApprovalRequest, action: 'approved' | 'rejected') => {
    setSelectedRequest(request); setActionType(action); setComment(''); setViewMode('action');
  };

  const goBackToList = () => {
    setViewMode('list'); setSelectedRequest(null); setActionType('approved'); setComment('');
  };

  const handleAction = async () => {
    if (!selectedRequest) return;
    try {
      setProcessing(true);
      const currentUser = await getCurrentUser();
      if (!currentUser) throw new Error('User not authenticated');

      if (isAdmin) {
        // 관리자: 결재라인 무관하게 즉시 처리
        if (actionType === 'rejected') {
          if (!comment.trim()) { toast({ title: '오류', description: '반려 사유를 입력해주세요.', variant: 'destructive' }); return; }
          await approvalService.adminForceReject(selectedRequest.id, currentUser.id, comment);
        } else {
          await approvalService.adminForceApprove(selectedRequest.id, currentUser.id, comment || undefined);
        }
      } else {
        // 일반 결재자: 기존 로직
        const currentStep = selectedRequest.approval_line.steps.find(s => s.step_order === selectedRequest.current_step);
        if (!currentStep || currentStep.approver_id !== currentUser.id) {
          toast({ title: '오류', description: '현재 결재 순서가 아닙니다.', variant: 'destructive' });
          return;
        }
        if (actionType === 'rejected') {
          if (!comment.trim()) { toast({ title: '오류', description: '반려 사유를 입력해주세요.', variant: 'destructive' }); return; }
          await approvalService.rejectStep(selectedRequest.id, currentUser.id, comment);
        } else {
          await approvalService.approveStep(selectedRequest.id, currentUser.id, comment || undefined);
        }
      }

      toast({ title: '성공', description: actionType === 'approved' ? '승인되었습니다.' : '반려되었습니다.' });
      goBackToList();
      loadApprovalRequests(currentUserId, isAdmin);
    } catch (error) {
      console.error('Error processing action:', error);
      toast({ title: '오류', description: '결재 처리 중 오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <Badge variant="outline" className="bg-yellow-50"><Clock className="h-3 w-3 mr-1" />대기중</Badge>;
      case 'approved': return <Badge variant="outline" className="bg-green-50"><CheckCircle className="h-3 w-3 mr-1" />승인</Badge>;
      case 'rejected': return <Badge variant="outline" className="bg-red-50"><XCircle className="h-3 w-3 mr-1" />반려</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const isMyTurn = (request: ApprovalRequest, userId: string) => {
    if (request.status !== 'pending') return false;
    if (isAdmin) return true; // 관리자는 항상 처리 가능
    const currentStep = request.approval_line.steps.find(s => s.step_order === request.current_step);
    return currentStep?.approver_id === userId;
  };

  const renderApprovalProgress = (request: ApprovalRequest) => (
    <div>
      <p className="text-sm font-semibold mb-2">결재 진행 상황:</p>
      <div className="flex items-center gap-2 flex-wrap">
        {/* 요청자 */}
        <div className="flex items-center">
          <div className="px-3 py-2 rounded border bg-purple-50 border-purple-400">
            <div className="text-xs font-semibold">요청자</div>
            <div className="text-xs text-gray-600">{request.requester.name}</div>
            <div className="text-xs mt-1 text-purple-600">✓ 요청완료</div>
          </div>
          <span className="mx-2 text-gray-400">→</span>
        </div>
        {request.approval_line.steps.map((step, index) => {
          const action = request.actions.find(a => a.step_order === step.step_order);
          const isCurrent = step.step_order === request.current_step;
          const isPast = step.step_order < request.current_step;
          return (
            <div key={step.step_order} className="flex items-center">
              <div className={`px-3 py-2 rounded border ${
                action
                  ? action.action === 'approved' ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500'
                  : isCurrent ? 'bg-blue-50 border-blue-500'
                  : isPast ? 'bg-gray-100 border-gray-300'
                  : 'bg-white border-gray-300'
              }`}>
                <div className="text-xs font-semibold">{step.step_order}. {step.approver_name}</div>
                <div className="text-xs text-gray-600">{step.approver_role}</div>
                {action && (
                  <div className="text-xs mt-1">
                    {action.action === 'approved' ? '✓ 승인' : '✗ 반려'}
                    {action.comment && <div className="text-xs text-gray-600 mt-1">{action.comment}</div>}
                  </div>
                )}
              </div>
              {index < request.approval_line.steps.length - 1 && <span className="mx-2 text-gray-400">→</span>}
            </div>
          );
        })}
      </div>
    </div>
  );

  // --- 일반 문서(기안서) 결재 ---

  const openDocActionDialog = (doc: ApprovalDocumentWithDetails, action: 'approved' | 'rejected') => {
    setSelectedDocument(doc); setDocActionType(action); setDocComment(''); setDocViewMode('action');
  };

  const docGoBackToList = () => {
    setDocViewMode('list'); setSelectedDocument(null); setDocActionType('approved'); setDocComment('');
  };

  const handleDocAction = async () => {
    if (!selectedDocument) return;
    try {
      setDocProcessing(true);

      if (isAdmin) {
        if (docActionType === 'rejected') {
          if (!docComment.trim()) { toast({ title: '오류', description: '반려 사유를 입력해주세요.', variant: 'destructive' }); return; }
          await approvalDocumentService.adminForceRejectDocumentStep(selectedDocument.id, currentUserId, docComment);
        } else {
          await approvalDocumentService.adminForceApproveDocumentStep(selectedDocument.id, currentUserId, docComment || undefined);
        }
      } else {
        const currentStep = selectedDocument.steps.find(s => s.step_order === selectedDocument.current_step);
        if (!currentStep || currentStep.approver_id !== currentUserId) {
          toast({ title: '오류', description: '현재 결재 순서가 아닙니다.', variant: 'destructive' });
          return;
        }
        if (docActionType === 'rejected') {
          if (!docComment.trim()) { toast({ title: '오류', description: '반려 사유를 입력해주세요.', variant: 'destructive' }); return; }
          await approvalDocumentService.rejectDocumentStep(selectedDocument.id, currentUserId, docComment);
        } else {
          await approvalDocumentService.approveDocumentStep(selectedDocument.id, currentUserId, docComment || undefined);
        }
      }

      toast({ title: '성공', description: docActionType === 'approved' ? '승인되었습니다.' : '반려되었습니다.' });
      docGoBackToList();
      loadDocumentApprovals(currentUserId, isAdmin);
    } catch (error) {
      console.error('Error processing document action:', error);
      toast({ title: '오류', description: error instanceof Error ? error.message : '결재 처리 중 오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setDocProcessing(false);
    }
  };

  const openAttachment = (path: string) => {
    const { data } = supabase.storage.from('documents').getPublicUrl(path);
    if (data?.publicUrl) window.open(data.publicUrl, '_blank');
  };

  const renderAttachments = (doc: ApprovalDocumentWithDetails) => doc.attachments.length > 0 && (
    <div className="bg-gray-50 p-3 rounded">
      <p className="text-sm font-semibold mb-1.5 flex items-center gap-1"><Paperclip className="w-3.5 h-3.5" />첨부 문서</p>
      <div className="space-y-1">
        {doc.attachments.map((f, idx) => (
          <button key={idx} type="button" onClick={() => openAttachment(f.path)} className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
            <FileText className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{f.name}</span>
            <span className="text-xs text-gray-400 shrink-0">({(f.size / 1024).toFixed(1)} KB)</span>
          </button>
        ))}
      </div>
    </div>
  );

  const isMyDocTurn = (doc: ApprovalDocumentWithDetails) => {
    if (doc.status !== 'pending') return false;
    if (isAdmin) return true;
    return doc.steps.some(s => s.step_order === doc.current_step && s.approver_id === currentUserId);
  };

  const renderDocumentProgress = (doc: ApprovalDocumentWithDetails) => (
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

  if (initializing) {
    return <div className="container mx-auto px-4 py-8 text-center">로딩 중...</div>;
  }

  const adminBanner = isAdmin && (
    <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-700 font-medium">
      🔑 슈퍼관리자 모드 — 결재라인 무관하게 모든 요청을 즉시 승인/반려할 수 있습니다
    </div>
  );

  // 선원추천 결재 - 처리 화면
  if (viewMode === 'action' && selectedRequest) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="sm" onClick={goBackToList}>
            <ArrowLeft className="w-4 h-4 mr-1" />뒤로
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{actionType === 'approved' ? '결재 승인' : '결재 반려'}</h1>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="bg-gray-50 p-3 rounded">
              <p className="text-sm font-semibold">
                {selectedRequest.crew_recommendation.crew_name} - {selectedRequest.crew_recommendation.rank.name}
              </p>
              <p className="text-sm text-gray-600">{selectedRequest.crew_recommendation.ship.name}</p>
              <div className="flex items-center gap-2 mt-1 text-sm text-gray-600">
                <User className="h-4 w-4" />
                <span>요청자: {selectedRequest.requester.name}</span>
              </div>
              <div className="flex items-center gap-2 mt-1 text-sm text-gray-600">
                <Calendar className="h-4 w-4" />
                <span>{format(new Date(selectedRequest.created_at), 'PPP', { locale: ko })}</span>
              </div>
            </div>

            {selectedRequest.requester_comment && (
              <div className="bg-gray-50 p-3 rounded">
                <p className="text-sm font-semibold mb-1">요청 사유:</p>
                <p className="text-sm text-gray-700">{selectedRequest.requester_comment}</p>
              </div>
            )}

            {renderApprovalProgress(selectedRequest)}

            <div>
              <label className="text-sm font-semibold mb-2 block">의견 {actionType === 'rejected' && '(필수)'}</label>
              <Textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder={actionType === 'approved' ? '승인 의견을 입력하세요 (선택사항)' : '반려 사유를 입력하세요'}
                rows={4}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={goBackToList}>취소</Button>
              <Button
                onClick={handleAction}
                disabled={processing || (actionType === 'rejected' && !comment.trim())}
                className={actionType === 'approved' ? 'bg-green-600' : 'bg-red-600'}
              >
                {processing ? '처리 중...' : actionType === 'approved' ? '승인' : '반려'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 일반 문서 결재 - 처리 화면
  if (docViewMode === 'action' && selectedDocument) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="sm" onClick={docGoBackToList}>
            <ArrowLeft className="w-4 h-4 mr-1" />뒤로
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{docActionType === 'approved' ? '결재 승인' : '결재 반려'}</h1>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="bg-gray-50 p-3 rounded">
              <p className="text-sm font-semibold">{selectedDocument.title}</p>
              <p className="text-sm text-gray-600">{selectedDocument.document_type_name}{selectedDocument.org_unit_name ? ` · ${selectedDocument.org_unit_name}` : ''}</p>
              <div className="flex items-center gap-2 mt-1 text-sm text-gray-600">
                <User className="h-4 w-4" />
                <span>기안자: {selectedDocument.creator_name}</span>
              </div>
              <div className="flex items-center gap-2 mt-1 text-sm text-gray-600">
                <Calendar className="h-4 w-4" />
                <span>{format(new Date(selectedDocument.created_at), 'PPP', { locale: ko })}</span>
              </div>
            </div>

            {selectedDocument.content && (
              <div className="bg-gray-50 p-3 rounded text-sm whitespace-pre-wrap">{selectedDocument.content}</div>
            )}
            {renderAttachments(selectedDocument)}

            {selectedDocument.requester_comment && (
              <div className="bg-gray-50 p-3 rounded">
                <p className="text-sm font-semibold mb-1">요청 사유:</p>
                <p className="text-sm text-gray-700">{selectedDocument.requester_comment}</p>
              </div>
            )}

            {renderDocumentProgress(selectedDocument)}

            <div>
              <label className="text-sm font-semibold mb-2 block">의견 {docActionType === 'rejected' && '(필수)'}</label>
              <Textarea
                value={docComment}
                onChange={e => setDocComment(e.target.value)}
                placeholder={docActionType === 'approved' ? '승인 의견을 입력하세요 (선택사항)' : '반려 사유를 입력하세요'}
                rows={4}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={docGoBackToList}>취소</Button>
              <Button
                onClick={handleDocAction}
                disabled={docProcessing || (docActionType === 'rejected' && !docComment.trim())}
                className={docActionType === 'approved' ? 'bg-green-600' : 'bg-red-600'}
              >
                {docProcessing ? '처리 중...' : docActionType === 'approved' ? '승인' : '반려'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 목록 화면 (탭)
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">결재함</h1>
        <p className="text-gray-600 mt-1">나에게 할당된 결재 요청을 처리합니다</p>
        {adminBanner}
      </div>

      <Tabs defaultValue="crew">
        <TabsList>
          <TabsTrigger value="crew">선원추천 결재 ({requests.length})</TabsTrigger>
          <TabsTrigger value="document">일반 문서 결재 ({documents.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="crew" className="mt-4">
          {requests.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Clock className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-600">결재 대기 중인 요청이 없습니다</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {requests.map(request => {
                const myTurn = isMyTurn(request, currentUserId);
                return (
                  <Card key={request.id} className={myTurn ? 'border-blue-500 border-2' : ''}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <CardTitle className="text-lg">
                              {request.crew_recommendation.crew_name} - {request.crew_recommendation.rank.name}
                            </CardTitle>
                            {getStatusBadge(request.status)}
                            {myTurn && <Badge className="bg-blue-500">내 차례</Badge>}
                          </div>
                          <div className="space-y-1 text-sm text-gray-600">
                            <div className="flex items-center gap-2">
                              <Ship className="h-4 w-4" />
                              <span>{request.crew_recommendation.ship.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4" />
                              <span>요청자: {request.requester.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4" />
                              <span>{format(new Date(request.created_at), 'PPP', { locale: ko })}</span>
                            </div>
                          </div>
                        </div>
                        {myTurn && (
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" className="text-green-600 border-green-600" onClick={() => openActionDialog(request, 'approved')}>
                              <CheckCircle className="h-4 w-4 mr-1" />승인
                            </Button>
                            <Button size="sm" variant="outline" className="text-red-600 border-red-600" onClick={() => openActionDialog(request, 'rejected')}>
                              <XCircle className="h-4 w-4 mr-1" />반려
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {request.requester_comment && (
                          <div className="bg-gray-50 p-3 rounded">
                            <p className="text-sm font-semibold mb-1">요청 사유:</p>
                            <p className="text-sm text-gray-700">{request.requester_comment}</p>
                          </div>
                        )}
                        {renderApprovalProgress(request)}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="document" className="mt-4">
          {documents.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-600">결재 대기 중인 문서가 없습니다</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {documents.map(doc => {
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
                          </div>
                          <div className="space-y-1 text-sm text-gray-600">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4" />
                              <span>{doc.document_type_name}{doc.org_unit_name ? ` · ${doc.org_unit_name}` : ''}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4" />
                              <span>기안자: {doc.creator_name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4" />
                              <span>{format(new Date(doc.created_at), 'PPP', { locale: ko })}</span>
                            </div>
                          </div>
                        </div>
                        {myTurn && (
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" className="text-green-600 border-green-600" onClick={() => openDocActionDialog(doc, 'approved')}>
                              <CheckCircle className="h-4 w-4 mr-1" />승인
                            </Button>
                            <Button size="sm" variant="outline" className="text-red-600 border-red-600" onClick={() => openDocActionDialog(doc, 'rejected')}>
                              <XCircle className="h-4 w-4 mr-1" />반려
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {doc.content && (
                          <div className="bg-gray-50 p-3 rounded text-sm whitespace-pre-wrap">{doc.content}</div>
                        )}
                        {renderAttachments(doc)}
                        {doc.requester_comment && (
                          <div className="bg-gray-50 p-3 rounded">
                            <p className="text-sm font-semibold mb-1">요청 사유:</p>
                            <p className="text-sm text-gray-700">{doc.requester_comment}</p>
                          </div>
                        )}
                        {renderDocumentProgress(doc)}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
