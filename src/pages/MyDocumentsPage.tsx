import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { FileText, Plus, ArrowLeft, CheckCircle, XCircle, Clock, Ban, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getCurrentUser } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { approvalDocumentService } from '@/services/approval-document.service';
import { useToast } from '@/hooks/use-toast';
import type { ApprovalDocumentWithDetails } from '@/types/approval-document';
import type { User } from '@/types/models';

const STATUS_BADGE: Record<string, { label: string; className: string; icon: typeof Clock }> = {
  pending: { label: '결재중', className: 'bg-yellow-50 text-yellow-700 border-yellow-300', icon: Clock },
  approved: { label: '승인완료', className: 'bg-green-50 text-green-700 border-green-300', icon: CheckCircle },
  rejected: { label: '반려', className: 'bg-red-50 text-red-700 border-red-300', icon: XCircle },
  cancelled: { label: '취소됨', className: 'bg-gray-100 text-gray-600 border-gray-300', icon: Ban },
};

export default function MyDocumentsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [documents, setDocuments] = useState<ApprovalDocumentWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ApprovalDocumentWithDetails | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const init = async () => {
      const user = await getCurrentUser();
      if (!user || !['ship_manager', 'admin', 'system_admin'].includes(user.role ?? '')) { navigate('/dashboard'); return; }
      setCurrentUser(user);
      setIsAdmin(user.role === 'admin' || user.role === 'system_admin');
      await loadData(user.id);
    };
    init();
  }, [navigate]);

  const loadData = async (userId: string) => {
    setLoading(true);
    try {
      const docs = await approvalDocumentService.getMyDraftedDocuments(userId);
      setDocuments(docs);
    } catch (e) {
      console.error(e);
      toast({ title: '기안 문서를 불러오는 중 오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const openDetail = (doc: ApprovalDocumentWithDetails) => setSelected(doc);
  const backToList = () => setSelected(null);

  const openAttachment = (path: string) => {
    const { data } = supabase.storage.from('documents').getPublicUrl(path);
    if (data?.publicUrl) window.open(data.publicUrl, '_blank');
  };

  const canCancel = (doc: ApprovalDocumentWithDetails) =>
    doc.status === 'pending' && (doc.created_by === currentUser?.id || isAdmin);

  const handleCancel = async (doc: ApprovalDocumentWithDetails) => {
    if (!confirm('이 기안서를 취소하시겠습니까?')) return;
    try {
      await approvalDocumentService.cancelDocument(doc.id);
      toast({ title: '취소되었습니다.' });
      setSelected(null);
      if (currentUser) await loadData(currentUser.id);
    } catch (e) {
      toast({ title: '취소 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  const renderProgress = (doc: ApprovalDocumentWithDetails) => (
    <div className="flex items-center gap-2 flex-wrap">
      {doc.steps.map((step, idx) => (
        <div key={step.id} className="flex items-center gap-2">
          <div className={`px-2.5 py-1.5 rounded border text-xs ${
            step.status === 'approved' ? 'bg-green-50 border-green-400'
            : step.status === 'rejected' ? 'bg-red-50 border-red-400'
            : step.step_order === doc.current_step ? 'bg-blue-50 border-blue-400'
            : 'bg-white border-gray-300'
          }`}>
            <div className="font-medium">{step.step_order}. {step.approver_name}</div>
            <div className="text-gray-500">{step.approver_label}</div>
            {step.status !== 'pending' && (
              <div className="mt-1">
                {step.status === 'approved' ? '✓ 승인' : '✗ 반려'}
                {step.comment && <div className="text-gray-500">{step.comment}</div>}
              </div>
            )}
          </div>
          {idx < doc.steps.length - 1 && <span className="text-gray-400">→</span>}
        </div>
      ))}
    </div>
  );

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3" />
        <p className="text-sm text-gray-600">로딩 중...</p>
      </div>
    </div>
  );

  if (selected) {
    const badge = STATUS_BADGE[selected.status];
    return (
      <div className="max-w-3xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
        <div className="flex items-center gap-3 mb-3">
          <Button variant="ghost" size="sm" onClick={backToList} className="h-8 px-2"><ArrowLeft className="w-4 h-4 mr-1" />목록</Button>
        </div>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">{selected.title}</CardTitle>
                  <Badge variant="outline" className={`text-xs ${badge.className}`}>{badge.label}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {selected.document_type_name} · {selected.org_unit_name || '부서 미지정'} · {format(new Date(selected.created_at), 'PPP', { locale: ko })}
                </p>
              </div>
              {canCancel(selected) && (
                <Button size="sm" variant="outline" className="text-red-600 border-red-300" onClick={() => handleCancel(selected)}>취소</Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {selected.requester_comment && (
              <div className="bg-gray-50 p-3 rounded text-sm">
                <p className="font-semibold mb-1 text-xs">요청 사유</p>
                <p className="text-gray-700">{selected.requester_comment}</p>
              </div>
            )}
            {selected.content && (
              <div className="bg-gray-50 p-3 rounded text-sm whitespace-pre-wrap">{selected.content}</div>
            )}
            {selected.attachments.length > 0 && (
              <div>
                <p className="text-xs font-semibold mb-1.5 flex items-center gap-1"><Paperclip className="w-3.5 h-3.5" />첨부 문서</p>
                <div className="space-y-1.5">
                  {selected.attachments.map((f, idx) => (
                    <button key={idx} type="button" onClick={() => openAttachment(f.path)} className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                      <FileText className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{f.name}</span>
                      <span className="text-xs text-gray-400 shrink-0">({(f.size / 1024).toFixed(1)} KB)</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {selected.final_comment && (
              <div className="bg-red-50 p-3 rounded text-sm">
                <p className="font-semibold mb-1 text-xs">반려 사유</p>
                <p className="text-gray-700">{selected.final_comment}</p>
              </div>
            )}
            <div>
              <p className="text-sm font-semibold mb-2">결재 진행 상황</p>
              {renderProgress(selected)}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              <div>
                <CardTitle className="text-base">기안함</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">내가 작성한 기안서 목록입니다.</p>
              </div>
            </div>
            <Button size="sm" className="gap-1.5 h-8" onClick={() => navigate('/documents/new')}>
              <Plus className="w-4 h-4" />기안서 작성
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {documents.length === 0 ? (
            <div className="text-center py-12 text-sm text-gray-400">작성한 기안서가 없습니다.</div>
          ) : (
            <div className="space-y-2">
              {documents.map(doc => {
                const badge = STATUS_BADGE[doc.status];
                const Icon = badge.icon;
                return (
                  <div key={doc.id} className="flex items-center justify-between p-3 rounded-md border hover:bg-gray-50 cursor-pointer" onClick={() => openDetail(doc)}>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{doc.title}</span>
                        <Badge variant="outline" className={`text-xs ${badge.className}`}><Icon className="w-3 h-3 mr-1" />{badge.label}</Badge>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {doc.document_type_name} · {doc.org_unit_name || '부서 미지정'} · {format(new Date(doc.created_at), 'PPP', { locale: ko })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
