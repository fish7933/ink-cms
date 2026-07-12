import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Archive, Plus, Clock, CheckCircle2, XCircle, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getCurrentUser } from '@/lib/store';
import { useTabContext } from '@/contexts/TabContext';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { approvalDocumentService } from '@/services/approval-document.service';
import type { ApprovalDocumentWithDetails } from '@/types/approval-document';
import type { User } from '@/types/models';

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected' | 'cancelled';

const STATUS_BADGE: Record<string, { label: string; className: string; icon: typeof Clock }> = {
  pending: { label: '결재중', className: 'bg-yellow-50 text-yellow-700 border-yellow-200', icon: Clock },
  approved: { label: '승인', className: 'bg-green-50 text-green-700 border-green-200', icon: CheckCircle2 },
  rejected: { label: '반려', className: 'bg-red-50 text-red-700 border-red-200', icon: XCircle },
  cancelled: { label: '취소', className: 'bg-gray-50 text-gray-700 border-gray-200', icon: Ban },
};

const FILTER_LABELS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'pending', label: '결재중' },
  { value: 'approved', label: '승인' },
  { value: 'rejected', label: '반려' },
  { value: 'cancelled', label: '취소' },
];

// 내가 기안한 모든 문서(상태 무관)를 모아 보는 개인 문서함.
export default function MyDocumentsPage() {
  const navigate = useNavigate();
  const { openNewTab } = useTabContext();
  const { toast } = useToast();
  const permissions = usePermissions('my_documents');

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [documents, setDocuments] = useState<ApprovalDocumentWithDetails[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!permissions.loading && !permissions.canView) navigate('/dashboard');
  }, [permissions.loading, permissions.canView, navigate]);

  useEffect(() => { init(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = () => { if (currentUser) loadDocuments(currentUser.id); };
    window.addEventListener('approval-inbox-data-changed', handler);
    return () => window.removeEventListener('approval-inbox-data-changed', handler);
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  const init = async () => {
    const user = await getCurrentUser();
    if (!user) { navigate('/login'); return; }
    setCurrentUser(user);
    await loadDocuments(user.id);
  };

  const loadDocuments = async (userId: string) => {
    setLoading(true);
    try {
      setDocuments(await approvalDocumentService.getMyDraftedDocuments(userId));
    } catch (e) {
      console.error(e);
      toast({ title: '오류', description: '문서함을 불러오는 중 오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const filtered = filter === 'all' ? documents : documents.filter(d => d.status === filter);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>;

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><Archive className="w-5 h-5" />내 문서함</h1>
          <p className="text-sm text-gray-500 mt-1">내가 기안한 모든 문서를 상태와 무관하게 모아서 볼 수 있습니다.</p>
        </div>
        {permissions.canCreate && (
          <Button size="sm" className="gap-1.5" onClick={() => openNewTab('/documents/new', '기안서 작성')}><Plus className="w-4 h-4" />기안서 작성</Button>
        )}
      </div>

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

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">문서 목록 ({filtered.length})</CardTitle></CardHeader>
        <CardContent className="pt-0">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-sm text-gray-400">해당하는 문서가 없습니다.</div>
          ) : (
            <div className="rounded-md border overflow-hidden overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left p-2 text-xs font-medium text-gray-600">상태</th>
                    <th className="text-left p-2 text-xs font-medium text-gray-600">제목</th>
                    <th className="text-left p-2 text-xs font-medium text-gray-600">유형/부서</th>
                    <th className="text-left p-2 text-xs font-medium text-gray-600">기안일</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(doc => {
                    const status = STATUS_BADGE[doc.status] || STATUS_BADGE.pending;
                    const StatusIcon = status.icon;
                    return (
                      <tr
                        key={doc.id}
                        className="border-b cursor-pointer hover:bg-gray-50"
                        onClick={() => openNewTab(`/documents/${doc.id}`, doc.title)}
                      >
                        <td className="p-2"><Badge variant="outline" className={status.className}><StatusIcon className="w-3 h-3 mr-1" />{status.label}</Badge></td>
                        <td className="p-2 font-medium">{doc.title}</td>
                        <td className="p-2 text-gray-500">{doc.document_type_name}{doc.org_unit_name ? ` · ${doc.org_unit_name}` : ''}</td>
                        <td className="p-2 text-gray-500">{format(new Date(doc.created_at), 'yyyy-MM-dd', { locale: ko })}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
