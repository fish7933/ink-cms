import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import {
  CheckCircle2, XCircle, Clock, FileText, ArrowLeft, Inbox, Plus, Paperclip,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { getCurrentUser } from '@/lib/store';
import { useTabContext } from '@/contexts/TabContext';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { approvalDocumentService, getLeaveDetail, type LeaveDetail } from '@/services/approval-document.service';
import ReferenceReadStatus from '@/components/document/ReferenceReadStatus';
import { orgChartService } from '@/services/org-chart.service';
import { supabase } from '@/lib/supabase';
import type { ApprovalDocumentWithDetails, ApprovalDocumentType } from '@/types/approval-document';

type DocFilter = 'all' | 'mine' | 'pending' | 'referenced' | 'approved' | 'rejected';

const DRAFT_ROLES = ['ship_manager', 'admin', 'system_admin'];

export default function ApprovalInboxPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { openNewTab } = useTabContext();

  const [initializing, setInitializing] = useState(true);
  const [currentUserId, setCurrentUserId] = useState('');
  const [currentUserRole, setCurrentUserRole] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [myOrgUnitIds, setMyOrgUnitIds] = useState<string[]>([]);

  const [documents, setDocuments] = useState<ApprovalDocumentWithDetails[]>([]);
  const [docTypes, setDocTypes] = useState<ApprovalDocumentType[]>([]);
  const [referencedDocIds, setReferencedDocIds] = useState<Set<string>>(new Set());
  const [unreadReferenceDocIds, setUnreadReferenceDocIds] = useState<Set<string>>(new Set());
  const [docFilter, setDocFilter] = useState<DocFilter>('all');
  const [docViewMode, setDocViewMode] = useState<'list' | 'action'>('list');
  const [selectedDocument, setSelectedDocument] = useState<ApprovalDocumentWithDetails | null>(null);
  const [docActionType, setDocActionType] = useState<'approved' | 'rejected' | null>(null);
  const [docComment, setDocComment] = useState('');
  const [docProcessing, setDocProcessing] = useState(false);
  const [actionLeaveDetail, setActionLeaveDetail] = useState<LeaveDetail | null>(null);

  const permissions = usePermissions('approval_inbox');

  // 메뉴 접속(canView) 권한이 명시적으로 꺼진 경우 접근을 차단한다. loading 중에는 판단하지 않는다.
  useEffect(() => {
    if (!permissions.loading && !permissions.canView) navigate('/dashboard');
  }, [permissions.loading, permissions.canView, navigate]);

  useEffect(() => { init(); }, []);

  // 문서 상세를 별도 탭에서 열어서 처리(승인/반려/취소/삭제)했을 때, 결재함 목록도 동기화되도록 새로고침한다.
  useEffect(() => {
    const handler = () => loadDocuments(currentUserId, isAdmin, myOrgUnitIds);
    window.addEventListener('approval-inbox-data-changed', handler);
    return () => window.removeEventListener('approval-inbox-data-changed', handler);
  }, [currentUserId, isAdmin, myOrgUnitIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const init = async () => {
    try {
      setInitializing(true);
      const currentUser = await getCurrentUser();
      if (!currentUser) { navigate('/login'); return; }

      const admin = currentUser.role === 'admin' || currentUser.role === 'system_admin';
      setCurrentUserId(currentUser.id);
      setCurrentUserRole(currentUser.role ?? '');
      setIsAdmin(admin);

      const members = await orgChartService.getOrgMembers();
      const orgUnitIds = members.find(m => m.id === currentUser.id)?.org_unit_ids || [];
      setMyOrgUnitIds(orgUnitIds);

      approvalDocumentService.getDocumentTypes(true).then(setDocTypes).catch(console.error);
      await loadDocuments(currentUser.id, admin, orgUnitIds);
    } finally {
      setInitializing(false);
    }
  };

  const loadDocuments = async (userId: string, admin: boolean, orgUnitIds: string[]) => {
    try {
      const [docs, refs] = await Promise.all([
        admin ? approvalDocumentService.getAllDocuments() : approvalDocumentService.getMyRelatedDocuments(userId, orgUnitIds),
        loadMyReferenceDocIds(userId, orgUnitIds),
      ]);
      setDocuments(docs);
      setReferencedDocIds(refs);

      if (refs.size === 0) {
        setUnreadReferenceDocIds(new Set());
      } else {
        const { data: reads } = await supabase
          .from('approval_document_reference_reads')
          .select('document_id')
          .eq('user_id', userId)
          .in('document_id', [...refs]);
        const readSet = new Set((reads || []).map((r: { document_id: string }) => r.document_id));
        setUnreadReferenceDocIds(new Set([...refs].filter(id => !readSet.has(id))));
      }
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

  const isMyDocTurn = (doc: ApprovalDocumentWithDetails) => {
    if (doc.status !== 'pending') return false;
    if (isAdmin) return true;
    return doc.steps.some(s => s.step_order === doc.current_step && s.approver_id === currentUserId);
  };

  const docGoBackToList = () => {
    setDocViewMode('list'); setSelectedDocument(null); setDocActionType(null); setDocComment(''); setActionLeaveDetail(null);
  };

  const openDocAction = (doc: ApprovalDocumentWithDetails, type: 'approved' | 'rejected') => {
    setSelectedDocument(doc);
    setDocActionType(type);
    setDocViewMode('action');
    setActionLeaveDetail(null);
    getLeaveDetail(doc.reference_type, doc.reference_id).then(setActionLeaveDetail).catch(console.error);
  };

  const canCancelDoc = (doc: ApprovalDocumentWithDetails) => doc.status === 'pending' && (doc.created_by === currentUserId || isAdmin);
  const canDeleteDoc = (doc: ApprovalDocumentWithDetails) => doc.status !== 'pending' && (doc.created_by === currentUserId || isAdmin) && permissions.canDelete;

  const handleCancelDoc = async (doc: ApprovalDocumentWithDetails) => {
    if (!confirm('이 기안서를 취소하시겠습니까?')) return;
    try {
      await approvalDocumentService.cancelDocument(doc.id);
      toast({ title: '취소되었습니다.' });
      window.dispatchEvent(new CustomEvent('approval-inbox-data-changed'));
    } catch (e) {
      toast({ title: '취소 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  const handleDeleteDoc = async (doc: ApprovalDocumentWithDetails) => {
    if (!confirm('이 기안서를 완전히 삭제하시겠습니까? 되돌릴 수 없습니다.')) return;
    try {
      await approvalDocumentService.deleteDocument(doc.id);
      toast({ title: '삭제되었습니다.' });
      window.dispatchEvent(new CustomEvent('approval-inbox-data-changed'));
    } catch (e) {
      toast({ title: '삭제 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200"><Clock className="w-3 h-3 mr-1" />결재중</Badge>;
      case 'approved': return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200"><CheckCircle2 className="w-3 h-3 mr-1" />승인</Badge>;
      case 'rejected': return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200"><XCircle className="w-3 h-3 mr-1" />반려</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const openDocDetail = (doc: ApprovalDocumentWithDetails) => openNewTab(`/documents/${doc.id}`, doc.title);

  const renderDocTable = (list: ApprovalDocumentWithDetails[]) => (
    <div className="rounded-md border overflow-hidden overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="text-left p-2 text-xs font-medium text-gray-600">상태</th>
            <th className="text-left p-2 text-xs font-medium text-gray-600">제목</th>
            <th className="text-left p-2 text-xs font-medium text-gray-600">유형/부서</th>
            <th className="text-left p-2 text-xs font-medium text-gray-600">기안자</th>
            <th className="text-left p-2 text-xs font-medium text-gray-600">결재 현황</th>
            <th className="text-left p-2 text-xs font-medium text-gray-600">기안일</th>
            <th className="text-right p-2 text-xs font-medium text-gray-600 w-60">작업</th>
          </tr>
        </thead>
        <tbody>
          {list.map(doc => {
            const myTurn = isMyDocTurn(doc);
            return (
              <tr key={doc.id} className={`border-b cursor-pointer hover:bg-gray-50 ${myTurn ? 'bg-blue-50/40' : ''}`} onClick={() => openDocDetail(doc)}>
                <td className="p-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {getStatusBadge(doc.status)}
                    {myTurn && <Badge className="bg-blue-500 text-xs">내 차례</Badge>}
                    {referencedDocIds.has(doc.id) && (
                      <Badge variant="outline" className={`text-xs ${unreadReferenceDocIds.has(doc.id) ? 'text-amber-700 border-amber-300' : 'text-gray-400'}`}>
                        참조{unreadReferenceDocIds.has(doc.id) ? ' · 미열람' : ' · 열람함'}
                      </Badge>
                    )}
                  </div>
                </td>
                <td className="p-2 font-medium">{doc.title}</td>
                <td className="p-2 text-gray-500">{doc.document_type_name}{doc.org_unit_name ? ` · ${doc.org_unit_name}` : ''}</td>
                <td className="p-2 text-gray-500">{doc.creator_name}</td>
                <td className="p-2">
                  <div className="flex items-center gap-1 flex-wrap text-xs whitespace-nowrap">
                    <span className="text-gray-400">기안</span>
                    {doc.steps.map(s => (
                      <span key={s.id} className="flex items-center gap-1">
                        <span className="text-gray-300">→</span>
                        <span className={
                          s.status === 'approved' ? 'text-green-600'
                          : s.status === 'rejected' ? 'text-red-600 font-medium'
                          : s.step_order === doc.current_step && doc.status === 'pending' ? 'text-blue-600 font-semibold'
                          : 'text-gray-400'
                        }>
                          {s.approver_name}
                        </span>
                      </span>
                    ))}
                  </div>
                </td>
                <td className="p-2 text-gray-500">{format(new Date(doc.created_at), 'yyyy-MM-dd', { locale: ko })}</td>
                <td className="p-2 text-right" onClick={e => e.stopPropagation()}>
                  <div className="flex justify-end gap-1">
                    {myTurn && (
                      <>
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-green-600 border-green-300" onClick={() => openDocAction(doc, 'approved')}>승인</Button>
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-red-600 border-red-300" onClick={() => openDocAction(doc, 'rejected')}>반려</Button>
                      </>
                    )}
                    {canCancelDoc(doc) && <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-500" onClick={() => handleCancelDoc(doc)}>기안 취소</Button>}
                    {canDeleteDoc(doc) && <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-gray-400 hover:text-red-600" onClick={() => handleDeleteDoc(doc)}>삭제</Button>}
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openDocDetail(doc)}>보기</Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

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

  const openAttachment = (path: string) => {
    const { data } = supabase.storage.from('documents').getPublicUrl(path);
    if (data?.publicUrl) window.open(data.publicUrl, '_blank');
  };

  const renderDocAction = () => {
    if (!selectedDocument || !docActionType) return null;
    const actionDocType = docTypes.find(t => t.id === selectedDocument.document_type_id);
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={docGoBackToList}><ArrowLeft className="w-5 h-5" /></Button>
          <h2 className="text-lg font-bold">{docActionType === 'approved' ? '결재 승인' : '결재 반려'}</h2>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{selectedDocument.title}</CardTitle>
            <CardDescription>{selectedDocument.document_type_name}{selectedDocument.org_unit_name ? ` · ${selectedDocument.org_unit_name}` : ''} · 기안자: {selectedDocument.creator_name}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {actionLeaveDetail ? (
              <div className="bg-gray-50 p-3 rounded text-sm space-y-1.5">
                <div className="flex gap-2"><span className="text-gray-500 shrink-0 w-24">휴가 종류</span><span>{actionLeaveDetail.typeLabel}</span></div>
                <div className="flex gap-2"><span className="text-gray-500 shrink-0 w-24">신청 기간</span><span>{actionLeaveDetail.period}</span></div>
                <div className="flex gap-2"><span className="text-gray-500 shrink-0 w-24">신청 시간</span><span>{actionLeaveDetail.hoursLabel}</span></div>
                <div className="flex gap-2"><span className="text-gray-500 shrink-0 w-24">사유</span><span className="whitespace-pre-wrap">{actionLeaveDetail.reason}</span></div>
              </div>
            ) : selectedDocument.form_data && Object.keys(selectedDocument.form_data).length > 0 ? (
              <div className="bg-gray-50 p-3 rounded text-sm space-y-1.5">
                {(actionDocType?.field_schema || []).map(field => (
                  <div key={field.key} className="flex gap-2">
                    <span className="text-gray-500 shrink-0 w-24">{field.label}</span>
                    <span className="whitespace-pre-wrap">{selectedDocument.form_data?.[field.key] ?? '-'}</span>
                  </div>
                ))}
              </div>
            ) : (
              selectedDocument.content && <div className="bg-gray-50 p-3 rounded text-sm whitespace-pre-wrap">{selectedDocument.content}</div>
            )}

            {selectedDocument.attachments.length > 0 && (
              <div className="bg-gray-50 p-3 rounded">
                <p className="text-sm font-semibold mb-1.5 flex items-center gap-1"><Paperclip className="w-3.5 h-3.5" />첨부 문서</p>
                <div className="space-y-1">
                  {selectedDocument.attachments.map((f, idx) => (
                    <button key={idx} type="button" onClick={() => openAttachment(f.path)} className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                      <FileText className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{f.name}</span>
                      <span className="text-xs text-gray-400 shrink-0">({(f.size / 1024).toFixed(1)} KB)</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selectedDocument.requester_comment && (
              <div className="bg-gray-50 p-3 rounded"><p className="text-sm font-semibold mb-1">요청 사유:</p><p className="text-sm text-gray-700">{selectedDocument.requester_comment}</p></div>
            )}

            <ReferenceReadStatus documentId={selectedDocument.id} />

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

  if (initializing) return <div className="container mx-auto px-4 py-8 text-center">로딩 중...</div>;

  const FILTER_LABELS: { value: DocFilter; label: string }[] = [
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

      {docViewMode === 'action' ? renderDocAction() : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {FILTER_LABELS.map(f => (
              <button
                key={f.value} type="button" onClick={() => setDocFilter(f.value)}
                className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${docFilter === f.value ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {docFiltered.length === 0 ? (
            <Card><CardContent className="py-12 text-center"><FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" /><p className="text-gray-600">해당하는 문서가 없습니다</p></CardContent></Card>
          ) : renderDocTable(docFiltered)}
        </div>
      )}
    </div>
  );
}
