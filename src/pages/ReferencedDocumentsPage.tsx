import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Calendar, FileText, Inbox, Paperclip, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getCurrentUser } from '@/lib/store';
import { orgChartService } from '@/services/org-chart.service';
import { approvalDocumentService } from '@/services/approval-document.service';
import { supabase } from '@/lib/supabase';
import type { ApprovalDocumentWithDetails } from '@/types/approval-document';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: '결재중', color: 'bg-yellow-100 text-yellow-700' },
  approved: { label: '승인', color: 'bg-green-100 text-green-700' },
  rejected: { label: '반려', color: 'bg-red-100 text-red-700' },
  cancelled: { label: '취소', color: 'bg-gray-100 text-gray-500' },
};

export default function ReferencedDocumentsPage() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<ApprovalDocumentWithDetails[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { init(); }, []);

  const init = async () => {
    try {
      setLoading(true);
      const user = await getCurrentUser();
      if (!user) { navigate('/login'); return; }
      const members = await orgChartService.getOrgMembers();
      const me = members.find(m => m.id === user.id);
      const docs = await approvalDocumentService.getReferencedDocuments(user.id, me?.org_unit_ids || []);
      setDocuments(docs);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const openAttachment = (path: string) => {
    const { data } = supabase.storage.from('documents').getPublicUrl(path);
    if (data?.publicUrl) window.open(data.publicUrl, '_blank');
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center gap-2">
        <Inbox className="w-6 h-6" />
        <div>
          <h1 className="text-2xl font-bold">참조함</h1>
          <p className="text-sm text-gray-600 mt-1">결재선에는 없지만 나 또는 내 소속 부서로 참조 지정된 문서입니다.</p>
        </div>
      </div>

      {documents.length === 0 ? (
        <Card><CardContent className="py-12 text-center"><FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" /><p className="text-gray-600">참조된 문서가 없습니다</p></CardContent></Card>
      ) : (
        <div className="grid gap-4">
          {documents.map(doc => (
            <Card key={doc.id}>
              <CardHeader>
                <div className="flex items-center gap-2 mb-1">
                  <CardTitle className="text-lg">{doc.title}</CardTitle>
                  <Badge className={`text-xs ${STATUS_LABELS[doc.status]?.color}`}>{STATUS_LABELS[doc.status]?.label}</Badge>
                </div>
                <div className="space-y-1 text-sm text-gray-600">
                  <div className="flex items-center gap-2"><FileText className="h-4 w-4" /><span>{doc.document_type_name}{doc.org_unit_name ? ` · ${doc.org_unit_name}` : ''}</span></div>
                  <div className="flex items-center gap-2"><User className="h-4 w-4" /><span>기안자: {doc.creator_name}</span></div>
                  <div className="flex items-center gap-2"><Calendar className="h-4 w-4" /><span>{format(new Date(doc.created_at), 'PPP', { locale: ko })}</span></div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {doc.content && <div className="bg-gray-50 p-3 rounded text-sm whitespace-pre-wrap">{doc.content}</div>}
                {doc.attachments.length > 0 && (
                  <div className="bg-gray-50 p-3 rounded">
                    <p className="text-sm font-semibold mb-1.5 flex items-center gap-1"><Paperclip className="w-3.5 h-3.5" />첨부 문서</p>
                    <div className="space-y-1">
                      {doc.attachments.map((f, idx) => (
                        <button key={idx} type="button" onClick={() => openAttachment(f.path)} className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                          <FileText className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{f.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
