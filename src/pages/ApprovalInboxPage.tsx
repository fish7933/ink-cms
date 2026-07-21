import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import {
  CheckCircle2, XCircle, Clock, FileText, ArrowLeft, Inbox, Plus, Paperclip, ChevronLeft, ChevronRight, Search,
  Eye, Trash2, RotateCcw, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getCurrentUser } from '@/lib/store';
import { useTabContext } from '@/contexts/TabContext';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { approvalDocumentService, getLeaveDetail, type LeaveDetail } from '@/services/approval-document.service';
import ReferenceReadStatus from '@/components/document/ReferenceReadStatus';
import ApprovalDocumentIssuedSheet from '@/components/document/ApprovalDocumentIssuedSheet';
import { getCompanyInfo, type CompanyInfo } from '@/services/company-info.service';
import { getShorePositions } from '@/services/shore-position.service';
import { orgChartService } from '@/services/org-chart.service';
import { supabase } from '@/lib/supabase';
import type { ApprovalDocumentWithDetails, ApprovalDocumentType } from '@/types/approval-document';
import type { ShorePosition } from '@/types/models';

type DocFilter = 'all' | 'mine' | 'pending' | 'referenced' | 'approved' | 'rejected' | 'deleted';

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
  const [hiddenDocuments, setHiddenDocuments] = useState<ApprovalDocumentWithDetails[]>([]);
  const [docTypes, setDocTypes] = useState<ApprovalDocumentType[]>([]);
  const [referencedDocIds, setReferencedDocIds] = useState<Set<string>>(new Set());
  const [unreadReferenceDocIds, setUnreadReferenceDocIds] = useState<Set<string>>(new Set());
  const [docFilter, setDocFilter] = useState<DocFilter>('all');
  const [docSearch, setDocSearch] = useState('');
  const [docPage, setDocPage] = useState(1);
  const [docItemsPerPage, setDocItemsPerPage] = useState(20);
  const [docSelectedIds, setDocSelectedIds] = useState<string[]>([]);
  const [bulkDeleteProcessing, setBulkDeleteProcessing] = useState(false);
  const [docViewMode, setDocViewMode] = useState<'list' | 'action'>('list');
  const [selectedDocument, setSelectedDocument] = useState<ApprovalDocumentWithDetails | null>(null);
  const [docActionType, setDocActionType] = useState<'approved' | 'rejected' | null>(null);
  const [docForceMode, setDocForceMode] = useState(false);
  const [docComment, setDocComment] = useState('');
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [positions, setPositions] = useState<ShorePosition[]>([]);
  const [memberPositionByUserId, setMemberPositionByUserId] = useState<Map<string, string | null>>(new Map());
  const [docProcessing, setDocProcessing] = useState(false);
  const [actionLeaveDetail, setActionLeaveDetail] = useState<LeaveDetail | null>(null);
  const [actionReferenceLabels, setActionReferenceLabels] = useState<string[]>([]);

  const permissions = usePermissions('approval_inbox');

  // 메뉴 접속(canView) 권한이 명시적으로 꺼진 경우 접근을 차단한다. loading 중에는 판단하지 않는다.
  useEffect(() => {
    if (!permissions.loading && !permissions.canView) navigate('/dashboard');
  }, [permissions.loading, permissions.canView, navigate]);

  useEffect(() => { init(); }, []);

  useEffect(() => { setDocPage(1); setDocSelectedIds([]); }, [docFilter, docSearch]);

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
      setMemberPositionByUserId(new Map(members.map(m => [m.id, m.position_name])));

      approvalDocumentService.getDocumentTypes(true).then(setDocTypes).catch(console.error);
      getCompanyInfo().then(setCompany).catch(() => setCompany(null));
      getShorePositions().then(setPositions).catch(() => setPositions([]));
      await loadDocuments(currentUser.id, admin, orgUnitIds);
    } finally {
      setInitializing(false);
    }
  };

  const loadDocuments = async (userId: string, _admin: boolean, orgUnitIds: string[]) => {
    try {
      // 시스템관리자/슈퍼관리자라도 그룹웨어 결재함에서는 본인이 기안했거나, 결재선에 포함돼
      // 있거나, 참조로 지정된 문서만 보인다 — 관리자 권한으로 전체 문서를 열람하지 않는다.
      const [allDocs, refs, hiddenIds, hidden] = await Promise.all([
        approvalDocumentService.getMyRelatedDocuments(userId, orgUnitIds),
        loadMyReferenceDocIds(userId, orgUnitIds),
        approvalDocumentService.getHiddenDocumentIds(userId),
        approvalDocumentService.getMyHiddenDocuments(userId),
      ]);
      // "삭제"는 이 사용자의 결재함에서만 숨기는 것이므로, 목록에서는 제외하고 별도 삭제된
      // 문서함 탭에서만 보여준다.
      setDocuments(allDocs.filter(d => !hiddenIds.has(d.id)));
      setHiddenDocuments(hidden);

      // 내가 기안했거나 결재선에 포함된 문서는 참조로도 같이 지정돼 있더라도 참조를 무시하고
      // (그렇지 않으면 같은 문서 하나가 결재함에 "결재할 문서"와 "참조 문서" 둘로 겹쳐 보임),
      // 참조는 결재가 완료(승인)된 문서만 유효하다 — getMyRelatedDocuments가 이미 승인되지
      // 않은 참조 문서는 allDocs에서 빼버리므로, docsById에 없으면(=아직 승인 전이면) 참조로
      // 치지 않는다.
      const docsById = new Map(allDocs.map(d => [d.id, d]));
      const pureRefs = new Set(
        [...refs].filter(id => {
          const d = docsById.get(id);
          return !!d && d.status === 'approved' && d.created_by !== userId && !d.steps.some(s => s.approver_id === userId);
        })
      );
      setReferencedDocIds(pureRefs);

      if (pureRefs.size === 0) {
        setUnreadReferenceDocIds(new Set());
      } else {
        const { data: reads } = await supabase
          .from('approval_document_reference_reads')
          .select('document_id')
          .eq('user_id', userId)
          .in('document_id', [...pureRefs]);
        const readSet = new Set((reads || []).map((r: { document_id: string }) => r.document_id));
        setUnreadReferenceDocIds(new Set([...pureRefs].filter(id => !readSet.has(id))));
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

  // 관리자 계정이라도 결재선상 실제 현재 단계 담당자가 아니면 "내 차례"가 아니다 — 별도의
  // "관리자 강제 승인/반려"로만 예외 처리를 허용한다.
  const isMyDocTurn = (doc: ApprovalDocumentWithDetails) => {
    if (doc.status !== 'pending') return false;
    return doc.steps.some(s => s.step_order === doc.current_step && s.approver_id === currentUserId && s.status === 'pending');
  };
  const canAdminForceDoc = (doc: ApprovalDocumentWithDetails) => doc.status === 'pending' && isAdmin && !isMyDocTurn(doc);

  const docGoBackToList = () => {
    setDocViewMode('list'); setSelectedDocument(null); setDocActionType(null); setDocComment(''); setActionLeaveDetail(null); setActionReferenceLabels([]); setDocForceMode(false);
  };

  const openDocAction = (doc: ApprovalDocumentWithDetails, type: 'approved' | 'rejected', force = false) => {
    setSelectedDocument(doc);
    setDocActionType(type);
    setDocForceMode(force);
    setDocViewMode('action');
    setActionLeaveDetail(null);
    getLeaveDetail(doc.reference_type, doc.reference_id).then(setActionLeaveDetail).catch(console.error);
    setActionReferenceLabels([]);
    approvalDocumentService.getReferenceLabels(doc.id).then(setActionReferenceLabels).catch(console.error);
  };

  // 기안 취소는 본인이 기안한 문서만, 그리고 결재라인이 아직 하나도 진행(승인/반려)되지
  // 않은 경우에만 가능하다 — 이미 결재가 시작된 문서는 기안자 본인도 취소할 수 없다.
  const canCancelDoc = (doc: ApprovalDocumentWithDetails) =>
    doc.status === 'pending' && doc.created_by === currentUserId && doc.steps.every(s => s.status === 'pending');
  // 반려된 자유서식 문서(연차/질병휴가 등 다른 화면이 자동 생성한 문서 제외)는 기안자 본인
  // (또는 관리자)이 기안서 작성 화면에서 내용을 고쳐 다시 상신할 수 있다.
  const canResubmitDoc = (doc: ApprovalDocumentWithDetails) =>
    doc.status === 'rejected' && !doc.reference_type && (doc.created_by === currentUserId || isAdmin);
  const handleResubmitDoc = (doc: ApprovalDocumentWithDetails) =>
    openNewTab(`/documents/new?resubmit=${doc.id}`, `${doc.title} (재상신)`);
  // "삭제"는 문서를 지우는 게 아니라 내 결재함 목록에서만 숨기는 것이지만, 아직 결재가
  // 진행중이거나(내 차례가 아니어도 결과를 지켜봐야 함) 나에게 참조됐는데 아직 열람하지
  // 않은 문서는 지울 수 없다 — 확인해야 할 것을 결재함에서 숨겨버리면 안 된다.
  const canDeleteDoc = (doc: ApprovalDocumentWithDetails) => {
    if (!permissions.canDelete) return false;
    if (doc.status === 'pending') return false;
    if (referencedDocIds.has(doc.id) && unreadReferenceDocIds.has(doc.id)) return false;
    return true;
  };

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
    if (!confirm('이 문서를 내 결재함에서 삭제하시겠습니까? 다른 참여자의 결재함이나 결재 이력에는 영향이 없으며, 삭제된 문서함에서 복원할 수 있습니다.')) return;
    try {
      await approvalDocumentService.hideDocumentForUser(doc.id, currentUserId);
      toast({ title: '삭제되었습니다.' });
      setDocuments(prev => prev.filter(d => d.id !== doc.id));
      setHiddenDocuments(prev => [doc, ...prev]);
    } catch (e) {
      toast({ title: '삭제 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  const handleRestoreDoc = async (doc: ApprovalDocumentWithDetails) => {
    try {
      await approvalDocumentService.unhideDocumentForUser(doc.id, currentUserId);
      toast({ title: '복원되었습니다.' });
      setHiddenDocuments(prev => prev.filter(d => d.id !== doc.id));
      setDocuments(prev => [doc, ...prev]);
    } catch (e) {
      toast({ title: '복원 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  // 문서는 기안자/결재자/참조자가 함께 보는 하나의 보관 기록이라, 어떤 한 사람이 자기
  // 개인 폴더(삭제된 문서함)에서 "영구삭제"한다고 해서 다른 사람의 문서함/결재 이력에서까지
  // 사라지면 안 된다 — 문서 자체(approval_documents 행)는 절대 건드리지 않고, 이 사용자의
  // 삭제된 문서함에서만 다시는 안 보이게(복원도 불가능하게) 만든다. 그래서 기안자/관리자로
  // 제한할 이유가 없다 — 이미 내가 숨긴 문서라면 누구나 자기 폴더를 완전히 비울 수 있다.
  const canPermanentlyDeleteDoc = (_doc: ApprovalDocumentWithDetails) => permissions.canDelete;

  const handlePermanentDeleteDoc = async (doc: ApprovalDocumentWithDetails) => {
    if (!confirm(`"${doc.title}" 문서를 삭제된 문서함에서 완전히 제거하시겠습니까?\n\n이후에는 복원할 수 없습니다. 문서 자체는 삭제되지 않으며, 다른 참여자의 결재함이나 결재 이력에는 전혀 영향이 없습니다.`)) return;
    try {
      await approvalDocumentService.permanentlyHideDocumentForUser(doc.id, currentUserId);
      toast({ title: '영구 삭제되었습니다.' });
      setHiddenDocuments(prev => prev.filter(d => d.id !== doc.id));
    } catch (e) {
      toast({ title: '영구 삭제 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  const toggleDocSelect = (id: string) =>
    setDocSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleDocSelectAll = (checked: boolean, ids: string[]) =>
    setDocSelectedIds(checked ? ids : []);

  const handleBulkDeleteDocs = async () => {
    if (docSelectedIds.length === 0) return;
    if (!confirm(`선택한 ${docSelectedIds.length}건을 내 결재함에서 삭제하시겠습니까? 다른 참여자에게는 영향이 없으며, 삭제된 문서함에서 복원할 수 있습니다.`)) return;
    try {
      setBulkDeleteProcessing(true);
      await Promise.all(docSelectedIds.map(id => approvalDocumentService.hideDocumentForUser(id, currentUserId)));
      const moved = documents.filter(d => docSelectedIds.includes(d.id));
      setDocuments(prev => prev.filter(d => !docSelectedIds.includes(d.id)));
      setHiddenDocuments(prev => [...moved, ...prev]);
      setDocSelectedIds([]);
      toast({ title: `${moved.length}건 삭제되었습니다.` });
    } catch (e) {
      toast({ title: '삭제 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setBulkDeleteProcessing(false);
    }
  };

  const handleBulkPermanentDeleteDocs = async () => {
    if (docSelectedIds.length === 0) return;
    if (!confirm(`선택한 ${docSelectedIds.length}건을 삭제된 문서함에서 완전히 제거하시겠습니까?\n\n이후에는 복원할 수 없습니다. 문서 자체는 삭제되지 않으며, 다른 참여자의 결재함이나 결재 이력에는 전혀 영향이 없습니다.`)) return;
    try {
      setBulkDeleteProcessing(true);
      await Promise.all(docSelectedIds.map(id => approvalDocumentService.permanentlyHideDocumentForUser(id, currentUserId)));
      setHiddenDocuments(prev => prev.filter(d => !docSelectedIds.includes(d.id)));
      toast({ title: `${docSelectedIds.length}건 영구 삭제되었습니다.` });
      setDocSelectedIds([]);
    } catch (e) {
      toast({ title: '영구 삭제 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setBulkDeleteProcessing(false);
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
      if (docForceMode) {
        if (docActionType === 'rejected') await approvalDocumentService.adminForceRejectDocumentStep(selectedDocument.id, currentUserId, docComment);
        else await approvalDocumentService.adminForceApproveDocumentStep(selectedDocument.id, currentUserId, docComment || undefined);
      } else {
        if (docActionType === 'rejected') await approvalDocumentService.rejectDocumentStep(selectedDocument.id, currentUserId, docComment);
        else await approvalDocumentService.approveDocumentStep(selectedDocument.id, currentUserId, docComment || undefined);
      }
      toast({ title: '성공', description: docActionType === 'approved' ? '승인되었습니다.' : '반려되었습니다.' });
      docGoBackToList();
      await loadDocuments(currentUserId, isAdmin, myOrgUnitIds);
      window.dispatchEvent(new CustomEvent('approval-inbox-data-changed'));
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

  const renderDocTable = (list: ApprovalDocumentWithDetails[]) => {
    const selectableIds = list.filter(canDeleteDoc).map(d => d.id);
    return (
    <div className="rounded-md border overflow-hidden overflow-x-auto">
      <table className="w-full text-xs whitespace-nowrap">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="w-8 p-2">
              <Checkbox
                checked={selectableIds.length > 0 && selectableIds.every(id => docSelectedIds.includes(id))}
                onCheckedChange={checked => toggleDocSelectAll(!!checked, selectableIds)}
                disabled={selectableIds.length === 0}
              />
            </th>
            <th className="text-left p-2 text-xs font-medium text-gray-600">상태</th>
            <th className="text-left p-2 text-xs font-medium text-gray-600">제목</th>
            <th className="text-left p-2 text-xs font-medium text-gray-600">유형</th>
            <th className="text-left p-2 text-xs font-medium text-gray-600">기안자</th>
            <th className="text-left p-2 text-xs font-medium text-gray-600">결재 현황</th>
            <th className="text-left p-2 text-xs font-medium text-gray-600">기안일시</th>
            <th className="text-left p-2 text-xs font-medium text-gray-600">시행일시</th>
            <th className="text-right p-2 text-xs font-medium text-gray-600 w-40">작업</th>
          </tr>
        </thead>
        <tbody>
          {list.map(doc => {
            const myTurn = isMyDocTurn(doc);
            return (
              <tr key={doc.id} className={`border-b cursor-pointer hover:bg-gray-50 ${myTurn ? 'bg-blue-50/40' : ''}`} onClick={() => openDocDetail(doc)}>
                <td className="p-2" onClick={e => e.stopPropagation()}>
                  {canDeleteDoc(doc) && <Checkbox checked={docSelectedIds.includes(doc.id)} onCheckedChange={() => toggleDocSelect(doc.id)} />}
                </td>
                <td className="p-2">
                  <div className="flex items-center gap-1.5">
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
                <td className="p-2 text-gray-500">{doc.document_type_name}</td>
                <td className="p-2 text-gray-500">{doc.creator_name}</td>
                <td className="p-2">
                  <div className="flex items-center gap-1 text-xs whitespace-nowrap">
                    {doc.steps.map((s, i) => (
                      <span key={s.id} className="flex items-center gap-1">
                        {i > 0 && <span className="text-gray-300">→</span>}
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
                <td className="p-2 text-gray-500">{format(new Date(doc.created_at), 'yyyy-MM-dd HH:mm', { locale: ko })}</td>
                <td className="p-2 text-gray-500">{doc.completed_at ? format(new Date(doc.completed_at), 'yyyy-MM-dd HH:mm', { locale: ko }) : '-'}</td>
                <td className="p-2 text-right" onClick={e => e.stopPropagation()}>
                  <div className="flex justify-end gap-1">
                    {myTurn && (
                      <>
                        <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-green-600 border-green-300" title="승인" onClick={() => openDocAction(doc, 'approved')}><CheckCircle2 className="w-3.5 h-3.5" /></Button>
                        <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-red-600 border-red-300" title="반려" onClick={() => openDocAction(doc, 'rejected')}><XCircle className="w-3.5 h-3.5" /></Button>
                      </>
                    )}
                    {canAdminForceDoc(doc) && (
                      <>
                        <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-amber-600 border-amber-300" title="강제승인" onClick={() => openDocAction(doc, 'approved', true)}><CheckCircle2 className="w-3.5 h-3.5" /></Button>
                        <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-amber-600 border-amber-300" title="강제반려" onClick={() => openDocAction(doc, 'rejected', true)}><XCircle className="w-3.5 h-3.5" /></Button>
                      </>
                    )}
                    {canCancelDoc(doc) && <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" title="기안 취소" onClick={() => handleCancelDoc(doc)}><X className="w-3.5 h-3.5" /></Button>}
                    {canResubmitDoc(doc) && <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-blue-600 border-blue-300" title="다시 상신" onClick={() => handleResubmitDoc(doc)}><RotateCcw className="w-3.5 h-3.5" /></Button>}
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="보기" onClick={() => openDocDetail(doc)}><Eye className="w-3.5 h-3.5" /></Button>
                    {canDeleteDoc(doc) && <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-red-600" title="삭제" onClick={() => handleDeleteDoc(doc)}><Trash2 className="w-3.5 h-3.5" /></Button>}
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

  // 삭제된 문서함 — 문서 자체는 살아있고, 이 사용자의 결재함에서만 숨겨진 상태. 복원 가능.
  const renderDeletedDocTable = (list: ApprovalDocumentWithDetails[]) => {
    const selectableIds = list.filter(canPermanentlyDeleteDoc).map(d => d.id);
    return (
    <div className="rounded-md border overflow-hidden overflow-x-auto">
      <table className="w-full text-xs whitespace-nowrap">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="w-8 p-2">
              <Checkbox
                checked={selectableIds.length > 0 && selectableIds.every(id => docSelectedIds.includes(id))}
                onCheckedChange={checked => toggleDocSelectAll(!!checked, selectableIds)}
                disabled={selectableIds.length === 0}
              />
            </th>
            <th className="text-left p-2 text-xs font-medium text-gray-600">상태</th>
            <th className="text-left p-2 text-xs font-medium text-gray-600">제목</th>
            <th className="text-left p-2 text-xs font-medium text-gray-600">유형</th>
            <th className="text-left p-2 text-xs font-medium text-gray-600">기안자</th>
            <th className="text-left p-2 text-xs font-medium text-gray-600">기안일시</th>
            <th className="text-left p-2 text-xs font-medium text-gray-600">시행일시</th>
            <th className="text-right p-2 text-xs font-medium text-gray-600 w-32">작업</th>
          </tr>
        </thead>
        <tbody>
          {list.map(doc => (
            <tr key={doc.id} className="border-b hover:bg-gray-50 text-gray-400">
              <td className="p-2" onClick={e => e.stopPropagation()}>
                {canPermanentlyDeleteDoc(doc) && <Checkbox checked={docSelectedIds.includes(doc.id)} onCheckedChange={() => toggleDocSelect(doc.id)} />}
              </td>
              <td className="p-2">{getStatusBadge(doc.status)}</td>
              <td className="p-2 font-medium">{doc.title}</td>
              <td className="p-2">{doc.document_type_name}</td>
              <td className="p-2">{doc.creator_name}</td>
              <td className="p-2">{format(new Date(doc.created_at), 'yyyy-MM-dd HH:mm', { locale: ko })}</td>
              <td className="p-2">{doc.completed_at ? format(new Date(doc.completed_at), 'yyyy-MM-dd HH:mm', { locale: ko }) : '-'}</td>
              <td className="p-2 text-right">
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => handleRestoreDoc(doc)}>복원</Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openDocDetail(doc)}>보기</Button>
                  {canPermanentlyDeleteDoc(doc) && (
                    <Button size="sm" variant="destructive" className="h-7 px-2 text-xs" onClick={() => handlePermanentDeleteDoc(doc)}>영구삭제</Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    );
  };

  // 참조로만 관계있는 문서(기안자도 아니고 결재선에도 없는)는 승인/반려 탭에서는 보이지
  // 않아야 한다 — 참조자는 참조함 탭에서만 그 문서를 본다.
  const isReferenceOnly = (doc: ApprovalDocumentWithDetails) =>
    doc.created_by !== currentUserId && !doc.steps.some(s => s.approver_id === currentUserId);

  const docMyRequested = documents.filter(d => d.created_by === currentUserId);
  const docPending = documents.filter(d => d.status === 'pending');
  const docReferenced = documents.filter(d => referencedDocIds.has(d.id));
  const docApproved = documents.filter(d => d.status === 'approved' && !isReferenceOnly(d));
  const docRejected = documents.filter(d => d.status === 'rejected' && !isReferenceOnly(d));
  const docFilteredByTab = docFilter === 'mine' ? docMyRequested
    : docFilter === 'pending' ? docPending
    : docFilter === 'referenced' ? docReferenced
    : docFilter === 'approved' ? docApproved
    : docFilter === 'rejected' ? docRejected
    : docFilter === 'deleted' ? hiddenDocuments
    : documents;
  const docSearchQuery = docSearch.trim().toLowerCase();
  const docFiltered = docSearchQuery
    ? docFilteredByTab.filter(d =>
        d.title.toLowerCase().includes(docSearchQuery) ||
        d.creator_name.toLowerCase().includes(docSearchQuery) ||
        d.document_type_name.toLowerCase().includes(docSearchQuery) ||
        (d.org_unit_name || '').toLowerCase().includes(docSearchQuery)
      )
    : docFilteredByTab;
  const docTotalPages = Math.max(1, Math.ceil(docFiltered.length / docItemsPerPage));
  const docPaginated = docFiltered.slice((docPage - 1) * docItemsPerPage, docPage * docItemsPerPage);

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

        {/* 결재함에서 열람할 때도 시행문(공식 문서 출력본)과 동일한 형태로 보여준다 */}
        <div className="border rounded-md bg-white p-6">
          <ApprovalDocumentIssuedSheet
            doc={selectedDocument}
            documentType={actionDocType || null}
            company={company}
            positions={positions}
            creatorPositionName={memberPositionByUserId.get(selectedDocument.created_by) || null}
            leaveDetail={actionLeaveDetail}
            referenceLabels={actionReferenceLabels}
          />
        </div>

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

        <div className="border rounded-md bg-white p-4 space-y-3">
          {docForceMode && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-md p-2.5">
              관리자 권한으로 결재라인의 정상 순서를 건너뛰고 이 문서를 즉시 {docActionType === 'approved' ? '승인' : '반려'} 처리합니다. 남은 결재 단계는 진행되지 않습니다.
            </div>
          )}
          <Label>{docActionType === 'approved' ? '의견 (선택사항)' : '반려 사유 (필수)'}</Label>
          <Textarea value={docComment} onChange={e => setDocComment(e.target.value)} rows={4} disabled={docProcessing} />
          <div className="flex gap-2">
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
        </div>
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
    { value: 'deleted', label: '삭제된 문서함' },
  ];
  // 결재중 = 지금 내가 결재해야 하는 건수, 참조됨 = 아직 열람하지 않은 참조 문서 건수. 처리/열람하면 사라진다.
  const filterBadgeCount = (value: DocFilter): number => {
    if (value === 'pending') return documents.filter(isMyDocTurn).length;
    if (value === 'referenced') return unreadReferenceDocIds.size;
    return 0;
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Inbox className="w-6 h-6" />결재함</h1>
          <p className="text-gray-600 mt-1 text-sm">
            기안자, 결재자, 참조자로 나와 관계있는 문서를 조회하고, 내 차례인 결재를 처리합니다.
          </p>
        </div>
        {DRAFT_ROLES.includes(currentUserRole) && permissions.canCreate && (
          <Button size="sm" className="gap-1.5" onClick={() => openNewTab('/documents/new', '기안서 작성')}><Plus className="w-4 h-4" />기안서 작성</Button>
        )}
      </div>

      {docViewMode === 'action' ? renderDocAction() : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {FILTER_LABELS.map(f => {
              const badgeCount = filterBadgeCount(f.value);
              return (
                <button
                  key={f.value} type="button" onClick={() => setDocFilter(f.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border transition-colors ${docFilter === f.value ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                >
                  {f.label}
                  {badgeCount > 0 && (
                    <span className={`min-w-[1.1rem] h-[1.1rem] px-1 rounded-full text-[10px] leading-[1.1rem] text-center font-semibold ${docFilter === f.value ? 'bg-white text-blue-600' : 'bg-red-500 text-white'}`}>
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <Input
              value={docSearch} onChange={e => setDocSearch(e.target.value)}
              placeholder="제목, 기안자, 문서유형, 부서로 검색"
              className="h-8 text-sm pl-8"
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <div>
              {docSelectedIds.length > 0 && docFilter === 'deleted' && (
                <Button size="sm" variant="destructive" className="h-8 text-xs" onClick={handleBulkPermanentDeleteDocs} disabled={bulkDeleteProcessing}>
                  {bulkDeleteProcessing ? '삭제 중...' : `선택 영구삭제 (${docSelectedIds.length})`}
                </Button>
              )}
              {docSelectedIds.length > 0 && docFilter !== 'deleted' && (
                <Button size="sm" variant="outline" className="h-8 text-xs text-red-600 border-red-300" onClick={handleBulkDeleteDocs} disabled={bulkDeleteProcessing}>
                  {bulkDeleteProcessing ? '삭제 중...' : `선택 삭제 (${docSelectedIds.length})`}
                </Button>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400">페이지당</span>
              <Select value={docItemsPerPage.toString()} onValueChange={v => { setDocItemsPerPage(+v); setDocPage(1); }}>
                <SelectTrigger className="h-7 w-16 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{[10, 20, 50, 100].map(n => <SelectItem key={n} value={String(n)} className="text-sm">{n}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {docFiltered.length === 0 ? (
            <Card><CardContent className="py-12 text-center"><FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" /><p className="text-gray-600">해당하는 문서가 없습니다</p></CardContent></Card>
          ) : docFilter === 'deleted' ? renderDeletedDocTable(docPaginated) : renderDocTable(docPaginated)}

          {docTotalPages > 1 && (
            <div className="flex justify-center items-center gap-2 py-2">
              <Button variant="outline" size="sm" onClick={() => setDocPage(p => Math.max(1, p - 1))} disabled={docPage === 1} className="h-8">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              {Array.from({ length: Math.min(5, docTotalPages) }, (_, i) => {
                const p = docTotalPages <= 5 ? i + 1
                  : docPage <= 3 ? i + 1
                  : docPage >= docTotalPages - 2 ? docTotalPages - 4 + i
                  : docPage - 2 + i;
                return (
                  <Button key={p} variant={docPage === p ? 'default' : 'outline'} size="sm"
                    onClick={() => setDocPage(p)} className="h-8 w-8 p-0">{p}</Button>
                );
              })}
              <Button variant="outline" size="sm" onClick={() => setDocPage(p => Math.min(docTotalPages, p + 1))} disabled={docPage === docTotalPages} className="h-8">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
