import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { approvalDocumentService } from '@/services/approval-document.service';
import { renderRichTextReadOnlyHtml, looksLikeHtml } from '@/utils/rich-text-field';
import { useToast } from '@/hooks/use-toast';
import type { ApprovalDocumentWithDetails } from '@/types/approval-document';
import type { User } from '@/lib/store';

interface Props {
  currentUser: User;
}

const STATUS_LABEL: Record<ApprovalDocumentWithDetails['status'], string> = {
  draft: '임시저장', pending: '결재중', approved: '승인', rejected: '반려', cancelled: '취소',
};
const STATUS_COLOR: Record<ApprovalDocumentWithDetails['status'], string> = {
  draft: 'bg-gray-100 text-gray-500', pending: 'bg-amber-100 text-amber-700', approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700', cancelled: 'bg-gray-100 text-gray-400',
};

// 기안함 — 1차 범위는 조회 전용. 새 기안 작성(동적 양식/표/항목추가/리치텍스트까지 지원하는
// DocumentDraftPage.tsx의 작성 폼)은 그 자체로 복잡한 별도 작업이라 제외하고, 내가 올린 기안의
// 목록/상태/반려 사유 확인과(결재 전 단계에서만) 취소만 지원한다.
export default function MobileDocumentDraftPage({ currentUser }: Props) {
  const { toast } = useToast();
  const [documents, setDocuments] = useState<ApprovalDocumentWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ApprovalDocumentWithDetails | null>(null);

  const load = async () => {
    setDocuments(await approvalDocumentService.getMyDraftedDocuments(currentUser.id));
    setLoading(false);
  };

  useEffect(() => { load(); }, [currentUser.id]);

  const sorted = useMemo(() => [...documents].sort((a, b) => b.created_at.localeCompare(a.created_at)), [documents]);

  const handleCancel = async () => {
    if (!selected) return;
    if (!confirm('이 기안서를 취소하시겠습니까?')) return;
    try {
      await approvalDocumentService.cancelDocument(selected.id);
      toast({ title: '취소되었습니다' });
      setSelected(null);
      await load();
    } catch (e) {
      toast({ title: '취소 중 오류가 발생했습니다', variant: 'destructive' });
      console.error(e);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;
  }

  if (selected) {
    const hasStructuredContent = !!selected.form_data;
    return (
      <div className="space-y-3">
        <button type="button" onClick={() => setSelected(null)} className="flex items-center gap-1 text-sm text-gray-500">
          <ChevronLeft className="w-4 h-4" />목록으로
        </button>

        <div className="rounded-xl border bg-white p-4 shadow-sm space-y-1">
          <div className="text-base font-bold text-gray-900">{selected.title}</div>
          <div className="text-xs text-gray-500">{selected.document_type_name} · {selected.created_at.slice(0, 10)}</div>
          <span className={`inline-block text-[11px] px-2 py-0.5 rounded-full ${STATUS_COLOR[selected.status]}`}>{STATUS_LABEL[selected.status]}</span>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold text-gray-500 mb-2">내용</div>
          {hasStructuredContent ? (
            <a href={`/print/documents/${selected.id}`} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 underline">
              구조화된 양식 문서입니다 — PC 화면에서 전체 내용 보기
            </a>
          ) : selected.content ? (
            <div
              className="text-sm text-gray-700 [&_*]:max-w-full"
              dangerouslySetInnerHTML={{ __html: looksLikeHtml(selected.content) ? renderRichTextReadOnlyHtml(selected.content) : renderRichTextReadOnlyHtml(selected.content.replace(/\n/g, '<br/>')) }}
            />
          ) : (
            <div className="text-sm text-gray-400">내용 없음</div>
          )}
        </div>

        {selected.status === 'rejected' && selected.final_comment && (
          <div className="rounded-xl border border-red-100 bg-red-50 p-4">
            <div className="text-xs font-semibold text-red-700 mb-1">반려 사유</div>
            <div className="text-sm text-red-800 whitespace-pre-wrap">{selected.final_comment}</div>
            <div className="text-xs text-red-500 mt-2">재상신은 PC 화면의 기안함에서 가능합니다.</div>
          </div>
        )}

        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold text-gray-500 mb-2">결재선</div>
          <div className="space-y-1.5">
            {selected.steps.map(s => (
              <div key={s.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">{s.step_order}. {s.approver_label ? `${s.approver_label} ` : ''}{s.approver_name}</span>
                <span className={`text-xs ${s.status === 'approved' ? 'text-green-600' : s.status === 'rejected' ? 'text-red-600' : 'text-gray-400'}`}>
                  {s.status === 'approved' ? '승인' : s.status === 'rejected' ? '반려' : '대기'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {selected.status === 'pending' && (
          <button type="button" onClick={handleCancel} className="w-full h-10 rounded-lg border border-red-300 text-red-600 text-sm font-medium">
            기안 취소
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-gray-400 px-1">새 기안 작성은 PC 화면에서 가능합니다.</div>
      {sorted.map(doc => (
        <button
          key={doc.id}
          type="button"
          onClick={() => setSelected(doc)}
          className="w-full flex items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3 text-left shadow-sm active:bg-gray-50"
        >
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-800 truncate">{doc.title}</div>
            <div className="text-xs text-gray-500 truncate">{doc.document_type_name} · {doc.created_at.slice(0, 10)}</div>
          </div>
          <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full ${STATUS_COLOR[doc.status]}`}>{STATUS_LABEL[doc.status]}</span>
          <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
        </button>
      ))}
      {sorted.length === 0 && <div className="text-center text-sm text-gray-400 py-10">기안한 문서가 없습니다.</div>}
    </div>
  );
}
