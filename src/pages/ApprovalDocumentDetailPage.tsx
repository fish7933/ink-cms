import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, XCircle, FileText, Paperclip, Trash2, Printer, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { useTabContext } from '@/contexts/TabContext';
import { approvalDocumentService, getLeaveDetail, type LeaveDetail } from '@/services/approval-document.service';
import { getCompanyInfo, type CompanyInfo } from '@/services/company-info.service';
import { getShorePositions } from '@/services/shore-position.service';
import { orgChartService } from '@/services/org-chart.service';
import ReferenceReadStatus from '@/components/document/ReferenceReadStatus';
import ApprovalDocumentIssuedSheet from '@/components/document/ApprovalDocumentIssuedSheet';
import type { ApprovalDocumentWithDetails, ApprovalDocumentType } from '@/types/approval-document';
import type { ShorePosition } from '@/types/models';

const STATUS_BADGE: Record<string, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  pending: { label: '결재중', className: 'bg-yellow-50 text-yellow-700 border-yellow-200', icon: FileText },
  approved: { label: '승인', className: 'bg-green-50 text-green-700 border-green-200', icon: CheckCircle2 },
  rejected: { label: '반려', className: 'bg-red-50 text-red-700 border-red-200', icon: XCircle },
  cancelled: { label: '취소', className: 'bg-gray-50 text-gray-700 border-gray-200', icon: XCircle },
};

export default function ApprovalDocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { activeTabId, closeTab } = useTabContext();
  const permissions = usePermissions('approval_inbox');

  const [loading, setLoading] = useState(true);
  const [doc, setDoc] = useState<ApprovalDocumentWithDetails | null>(null);
  const [docType, setDocType] = useState<ApprovalDocumentType | null>(null);
  const [currentUserId, setCurrentUserId] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [actionType, setActionType] = useState<'approved' | 'rejected' | null>(null);
  const [forceMode, setForceMode] = useState(false);
  const [comment, setComment] = useState('');
  const [processing, setProcessing] = useState(false);
  const [leaveDetail, setLeaveDetail] = useState<LeaveDetail | null>(null);
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [positions, setPositions] = useState<ShorePosition[]>([]);
  const [creatorPositionName, setCreatorPositionName] = useState<string | null>(null);

  useEffect(() => { loadData(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const user = await getCurrentUser();
      if (!user) { navigate('/login'); return; }
      const admin = user.role === 'admin' || user.role === 'system_admin';
      setCurrentUserId(user.id);
      setIsAdmin(admin);

      const [docs, types, companyInfo, shorePositions, members] = await Promise.all([
        approvalDocumentService.getDocumentDetails([id]),
        approvalDocumentService.getDocumentTypes(true),
        getCompanyInfo().catch(() => null),
        getShorePositions().catch(() => []),
        orgChartService.getOrgMembers().catch(() => []),
      ]);
      const found = docs[0] || null;
      setDoc(found);
      setDocType(found ? types.find(t => t.id === found.document_type_id) || null : null);
      setCompany(companyInfo);
      setPositions(shorePositions);
      setCreatorPositionName(found ? members.find(m => m.id === found.created_by)?.position_name || null : null);
      setLeaveDetail(await getLeaveDetail(found?.reference_type ?? null, found?.reference_id ?? null).catch(() => null));

      // 이 문서에 내가 참조로 지정돼 있으면(개인 또는 소속 부서), 상세를 연 시점에 열람 처리해
      // 결재함 배지 집계에서 빠지도록 한다.
      if (found) {
        const { data: myUnits } = await supabase.from('org_unit_members').select('org_unit_id').eq('user_id', user.id);
        const myOrgUnitIds = (myUnits || []).map(u => u.org_unit_id);
        const orFilter = myOrgUnitIds.length > 0
          ? `user_id.eq.${user.id},org_unit_id.in.(${myOrgUnitIds.join(',')})`
          : `user_id.eq.${user.id}`;
        const { data: refs } = await supabase.from('approval_document_references').select('id').eq('document_id', id).or(orFilter);
        if (refs && refs.length > 0) {
          await approvalDocumentService.markReferenceRead(id, user.id);
          window.dispatchEvent(new CustomEvent('approval-inbox-data-changed'));
        }
      }
    } catch (e) {
      console.error(e);
      toast({ title: '오류', description: '문서를 불러오는 중 오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    if (activeTabId) closeTab(activeTabId);
    else navigate('/approval-inbox');
  };

  const notifyListRefresh = () => window.dispatchEvent(new CustomEvent('approval-inbox-data-changed'));

  // 관리자 계정이라도 결재선상 실제 현재 단계 담당자가 아니면 "내 차례"가 아니다 — admin/system_admin
  // 이라는 계정 권한과 결재라인상의 전결/최종결재자는 별개다. 관리자가 실제로 그 단계의 담당자로
  // 지정돼 있으면(직급 기준 전결 포함) 일반 결재자와 동일하게 한 단계씩만 진행된다.
  const isMyTurn = doc && doc.status === 'pending' && doc.steps.some(s => s.step_order === doc.current_step && s.approver_id === currentUserId);
  const canAdminForce = doc && doc.status === 'pending' && isAdmin && !isMyTurn;
  // 기안 취소는 본인이 기안한 문서만, 그리고 결재라인이 아직 하나도 진행(승인/반려)되지
  // 않은 경우에만 가능하다 — 관리자라도 남의 기안을 취소할 수 없고, 이미 결재가 시작된
  // 문서는 기안자 본인도 취소할 수 없다(취소하려면 결재자가 반려해야 한다).
  const canCancel = doc && doc.status === 'pending' && doc.created_by === currentUserId && doc.steps.every(s => s.status === 'pending');
  const canDelete = doc && doc.status !== 'pending' && (doc.created_by === currentUserId || isAdmin) && permissions.canDelete;

  const handleAction = async () => {
    if (!doc || !actionType) return;
    if (actionType === 'rejected' && !comment.trim()) {
      toast({ title: '오류', description: '반려 사유를 입력해주세요.', variant: 'destructive' });
      return;
    }
    try {
      setProcessing(true);
      if (forceMode) {
        if (actionType === 'rejected') await approvalDocumentService.adminForceRejectDocumentStep(doc.id, currentUserId, comment);
        else await approvalDocumentService.adminForceApproveDocumentStep(doc.id, currentUserId, comment || undefined);
      } else {
        if (actionType === 'rejected') await approvalDocumentService.rejectDocumentStep(doc.id, currentUserId, comment);
        else await approvalDocumentService.approveDocumentStep(doc.id, currentUserId, comment || undefined);
      }
      toast({ title: '성공', description: actionType === 'approved' ? '승인되었습니다.' : '반려되었습니다.' });
      setActionType(null); setComment(''); setForceMode(false);
      notifyListRefresh();
      await loadData();
    } catch (e) {
      console.error(e);
      toast({ title: '오류', description: e instanceof Error ? e.message : '결재 처리 중 오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const handleCancel = async () => {
    if (!doc || !confirm('이 기안서를 취소하시겠습니까?')) return;
    try {
      await approvalDocumentService.cancelDocument(doc.id);
      toast({ title: '취소되었습니다.' });
      notifyListRefresh();
      await loadData();
    } catch (e) {
      toast({ title: '취소 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!doc || !confirm('이 기안서를 완전히 삭제하시겠습니까? 되돌릴 수 없습니다.')) return;
    try {
      await approvalDocumentService.deleteDocument(doc.id);
      toast({ title: '삭제되었습니다.' });
      notifyListRefresh();
      goBack();
    } catch (e) {
      toast({ title: '삭제 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  const openAttachment = (path: string) => {
    const { data } = supabase.storage.from('documents').getPublicUrl(path);
    if (data?.publicUrl) window.open(data.publicUrl, '_blank');
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>;

  if (!doc) {
    return (
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
        <Button variant="ghost" size="sm" onClick={goBack} className="h-8 px-2 mb-3"><ArrowLeft className="w-4 h-4 mr-1" />결재함</Button>
        <p className="text-sm text-gray-400 text-center py-12">문서를 찾을 수 없습니다.</p>
      </div>
    );
  }

  const statusInfo = STATUS_BADGE[doc.status] || STATUS_BADGE.pending;
  const StatusIcon = statusInfo.icon;

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Button variant="ghost" size="sm" onClick={goBack} className="h-8 px-2"><ArrowLeft className="w-4 h-4 mr-1" />결재함</Button>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className={statusInfo.className}><StatusIcon className="w-3 h-3 mr-1" />{statusInfo.label}</Badge>
          {isMyTurn && <Badge className="bg-blue-500">내 차례</Badge>}
          {doc.status === 'approved' && (
            <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => window.open(`/print/documents/${doc.id}`, '_blank')}><Printer className="w-3.5 h-3.5" />시행문 출력</Button>
          )}
          {isMyTurn && !actionType && (
            <>
              <Button size="sm" variant="outline" className="h-8 text-green-600 border-green-600" onClick={() => { setForceMode(false); setActionType('approved'); }}><CheckCircle2 className="h-4 w-4 mr-1" />승인</Button>
              <Button size="sm" variant="outline" className="h-8 text-red-600 border-red-600" onClick={() => { setForceMode(false); setActionType('rejected'); }}><XCircle className="h-4 w-4 mr-1" />반려</Button>
            </>
          )}
          {canAdminForce && !actionType && (
            <>
              <Button size="sm" variant="outline" className="h-8 text-amber-600 border-amber-300" onClick={() => { setForceMode(true); setActionType('approved'); }}>관리자 강제 승인</Button>
              <Button size="sm" variant="outline" className="h-8 text-amber-600 border-amber-300" onClick={() => { setForceMode(true); setActionType('rejected'); }}>관리자 강제 반려</Button>
            </>
          )}
          {canCancel && <Button size="sm" variant="outline" className="h-8 text-red-600 border-red-300" onClick={handleCancel}>기안 취소</Button>}
          {canDelete && (
            <Button size="sm" variant="outline" className="h-8 text-red-600 border-red-300 gap-1" onClick={handleDelete}><Trash2 className="w-3.5 h-3.5" />삭제</Button>
          )}
        </div>
      </div>

      {/* 결재함에서 열람할 때도 시행문(공식 문서 출력본)과 동일한 형태로 보여준다 */}
      <div className={`border rounded-md bg-white p-6 ${isMyTurn ? 'ring-2 ring-blue-500' : ''}`}>
        <ApprovalDocumentIssuedSheet
          doc={doc}
          documentType={docType}
          company={company}
          positions={positions}
          creatorPositionName={creatorPositionName}
          leaveDetail={leaveDetail}
        />
      </div>

      {doc.attachments.length > 0 && (
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
      )}

      {doc.requester_comment && (
        <div className="bg-gray-50 p-3 rounded"><p className="text-sm font-semibold mb-1">요청 사유:</p><p className="text-sm text-gray-700">{doc.requester_comment}</p></div>
      )}
      {doc.final_comment && (
        <div className="bg-red-50 p-3 rounded"><p className="text-sm font-semibold mb-1">반려 사유:</p><p className="text-sm text-gray-700">{doc.final_comment}</p></div>
      )}

      <ReferenceReadStatus documentId={doc.id} />

      {actionType && (
        <div className="space-y-3 border rounded-md bg-white p-4">
          {forceMode && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-md p-2.5">
              관리자 권한으로 결재라인의 정상 순서를 건너뛰고 이 문서를 즉시 {actionType === 'approved' ? '승인' : '반려'} 처리합니다. 남은 결재 단계는 진행되지 않습니다.
            </div>
          )}
          <Label>{actionType === 'approved' ? '의견 (선택사항)' : '반려 사유 (필수)'}</Label>
          <Textarea value={comment} onChange={e => setComment(e.target.value)} rows={3} disabled={processing} />
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setActionType(null); setComment(''); setForceMode(false); }} disabled={processing} className="flex-1">취소</Button>
            <Button
              onClick={handleAction}
              disabled={processing || (actionType === 'rejected' && !comment.trim())}
              variant={actionType === 'approved' ? 'default' : 'destructive'}
              className="flex-1"
            >
              {processing ? '처리 중...' : actionType === 'approved' ? '승인' : '반려'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
