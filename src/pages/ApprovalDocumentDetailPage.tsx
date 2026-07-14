import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { CheckCircle2, XCircle, FileText, User, Calendar, Paperclip, Trash2, Printer, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { useTabContext } from '@/contexts/TabContext';
import { approvalDocumentService } from '@/services/approval-document.service';
import type { ApprovalDocumentWithDetails, ApprovalDocumentType } from '@/types/approval-document';

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
  const [comment, setComment] = useState('');
  const [processing, setProcessing] = useState(false);

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

      const [docs, types] = await Promise.all([
        approvalDocumentService.getDocumentDetails([id]),
        approvalDocumentService.getDocumentTypes(true),
      ]);
      const found = docs[0] || null;
      setDoc(found);
      setDocType(found ? types.find(t => t.id === found.document_type_id) || null : null);

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

  const isMyTurn = doc && doc.status === 'pending' && (isAdmin || doc.steps.some(s => s.step_order === doc.current_step && s.approver_id === currentUserId));
  const canCancel = doc && doc.status === 'pending' && (doc.created_by === currentUserId || isAdmin);
  const canDelete = doc && doc.status !== 'pending' && (doc.created_by === currentUserId || isAdmin) && permissions.canDelete;

  const handleAction = async () => {
    if (!doc || !actionType) return;
    if (actionType === 'rejected' && !comment.trim()) {
      toast({ title: '오류', description: '반려 사유를 입력해주세요.', variant: 'destructive' });
      return;
    }
    try {
      setProcessing(true);
      if (isAdmin) {
        if (actionType === 'rejected') await approvalDocumentService.adminForceRejectDocumentStep(doc.id, currentUserId, comment);
        else await approvalDocumentService.adminForceApproveDocumentStep(doc.id, currentUserId, comment || undefined);
      } else {
        if (actionType === 'rejected') await approvalDocumentService.rejectDocumentStep(doc.id, currentUserId, comment);
        else await approvalDocumentService.approveDocumentStep(doc.id, currentUserId, comment || undefined);
      }
      toast({ title: '성공', description: actionType === 'approved' ? '승인되었습니다.' : '반려되었습니다.' });
      setActionType(null); setComment('');
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
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
      <Button variant="ghost" size="sm" onClick={goBack} className="h-8 px-2"><ArrowLeft className="w-4 h-4 mr-1" />결재함</Button>

      <Card className={isMyTurn ? 'border-blue-500 border-2' : ''}>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <CardTitle className="text-lg">{doc.title}</CardTitle>
                <Badge variant="outline" className={statusInfo.className}><StatusIcon className="w-3 h-3 mr-1" />{statusInfo.label}</Badge>
                {isMyTurn && <Badge className="bg-blue-500">내 차례</Badge>}
              </div>
              <CardDescription className="space-y-1">
                <div className="flex items-center gap-2 text-sm"><FileText className="w-4 h-4" /><span>{doc.document_type_name}{doc.org_unit_name ? ` · ${doc.org_unit_name}` : ''}</span></div>
                <div className="flex items-center gap-2 text-sm"><User className="w-4 h-4" /><span>기안자: {doc.creator_name}</span></div>
                <div className="flex items-center gap-2 text-sm"><Calendar className="w-4 h-4" /><span>{format(new Date(doc.created_at), 'PPP', { locale: ko })}</span></div>
              </CardDescription>
            </div>
            {isMyTurn && !actionType && (
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="outline" className="text-green-600 border-green-600" onClick={() => setActionType('approved')}><CheckCircle2 className="h-4 w-4 mr-1" />승인</Button>
                <Button size="sm" variant="outline" className="text-red-600 border-red-600" onClick={() => setActionType('rejected')}><XCircle className="h-4 w-4 mr-1" />반려</Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {doc.form_data && Object.keys(doc.form_data).length > 0 ? (
              <div className="bg-gray-50 p-3 rounded text-sm space-y-1.5">
                {(docType?.field_schema || []).map(field => (
                  <div key={field.key} className="flex gap-2">
                    <span className="text-gray-500 shrink-0 w-24">{field.label}</span>
                    <span className="whitespace-pre-wrap">{doc.form_data?.[field.key] ?? '-'}</span>
                  </div>
                ))}
              </div>
            ) : (
              doc.content && <div className="bg-gray-50 p-3 rounded text-sm whitespace-pre-wrap">{doc.content}</div>
            )}

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

            {actionType && (
              <div className="space-y-3 border-t pt-4">
                <Label>{actionType === 'approved' ? '의견 (선택사항)' : '반려 사유 (필수)'}</Label>
                <Textarea value={comment} onChange={e => setComment(e.target.value)} rows={3} disabled={processing} />
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => { setActionType(null); setComment(''); }} disabled={processing} className="flex-1">취소</Button>
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

            <div>
              <p className="text-sm font-semibold mb-2">결재 진행 상황:</p>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center">
                  <div className="px-3 py-2 rounded border bg-purple-50 border-purple-400">
                    <div className="text-[10px] text-purple-500 font-medium">신청자</div>
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
                      <div className="text-[10px] text-gray-500 font-medium">{index === doc.steps.length - 1 ? '최종결재자' : '중간결재자'}</div>
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

            {(doc.status === 'approved' || canCancel || canDelete) && (
              <div className="flex gap-2 pt-3 border-t">
                {doc.status === 'approved' && (
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => window.open(`/print/documents/${doc.id}`, '_blank')}><Printer className="w-3.5 h-3.5" />시행문 출력</Button>
                )}
                {canCancel && <Button size="sm" variant="outline" className="text-red-600 border-red-300" onClick={handleCancel}>기안 취소</Button>}
                {canDelete && (
                  <Button size="sm" variant="outline" className="text-red-600 border-red-300 gap-1" onClick={handleDelete}><Trash2 className="w-3.5 h-3.5" />삭제</Button>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
