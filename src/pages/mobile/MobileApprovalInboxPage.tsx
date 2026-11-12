import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { approvalDocumentService } from '@/services/approval-document.service';
import { orgChartService } from '@/services/org-chart.service';
import { renderRichTextReadOnlyHtml, looksLikeHtml } from '@/utils/rich-text-field';
import { useToast } from '@/hooks/use-toast';
import AttachmentList from '@/components/mobile/AttachmentList';
import DailyCashReportMobileView from '@/components/mobile/DailyCashReportMobileView';
import type { ApprovalDocumentWithDetails } from '@/types/approval-document';
import type { User } from '@/lib/store';

interface Props {
  currentUser: User;
}

const STATUS_LABEL: Record<ApprovalDocumentWithDetails['status'], string> = {
  draft: '기안중', pending: '결재중', approved: '승인', rejected: '반려', cancelled: '취소',
};

// 결재함 — 내 차례인 문서를 맨 위로 보여주고, 탭하면 핵심 정보 + 승인/반려. 표/항목추가/
// 리치텍스트 등 구조화된 양식 문서는 모바일에서 그대로 재현하지 않고(ApprovalDocumentIssuedSheet
// 수준의 복잡도라 범위 밖) "PC에서 전체 내용 보기" 링크로 기존 인쇄 페이지를 새 탭으로 연다.
export default function MobileApprovalInboxPage({ currentUser }: Props) {
  const { toast } = useToast();
  const [documents, setDocuments] = useState<ApprovalDocumentWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ApprovalDocumentWithDetails | null>(null);
  const [comment, setComment] = useState('');
  const [processing, setProcessing] = useState(false);

  const load = async () => {
    const members = await orgChartService.getOrgMembers();
    const orgUnitIds = members.find(m => m.id === currentUser.id)?.org_unit_ids || [];
    const docs = await approvalDocumentService.getMyRelatedDocuments(currentUser.id, orgUnitIds, currentUser.hire_date ?? null);
    setDocuments(docs);
    setLoading(false);
  };

  useEffect(() => { load(); }, [currentUser.id, currentUser.hire_date]);

  const isMyTurn = (doc: ApprovalDocumentWithDetails) =>
    doc.status === 'pending' && doc.steps.some(s => s.step_order === doc.current_step && s.approver_id === currentUser.id && s.status === 'pending');

  const sorted = useMemo(
    () => [...documents].sort((a, b) => Number(isMyTurn(b)) - Number(isMyTurn(a)) || b.created_at.localeCompare(a.created_at)),
    [documents, currentUser.id]
  );

  const handleAction = async (action: 'approved' | 'rejected') => {
    if (!selected) return;
    if (action === 'rejected' && !comment.trim()) {
      toast({ title: '반려 사유를 입력해주세요', variant: 'destructive' });
      return;
    }
    setProcessing(true);
    try {
      if (action === 'approved') await approvalDocumentService.approveDocumentStep(selected.id, currentUser.id, comment || undefined);
      else await approvalDocumentService.rejectDocumentStep(selected.id, currentUser.id, comment);
      toast({ title: action === 'approved' ? '승인 완료' : '반려 완료' });
      setSelected(null);
      setComment('');
      await load();
    } catch (e) {
      toast({ title: '처리 중 오류가 발생했습니다', variant: 'destructive' });
      console.error(e);
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;
  }

  if (selected) {
    const myTurn = isMyTurn(selected);
    const hasStructuredContent = !!selected.form_data;
    return (
      <div className="space-y-3">
        <button type="button" onClick={() => { setSelected(null); setComment(''); }} className="flex items-center gap-1 text-sm text-gray-500">
          <ChevronLeft className="w-4 h-4" />목록으로
        </button>

        <div className="rounded-xl border bg-white p-4 shadow-sm space-y-1">
          <div className="text-base font-bold text-gray-900">{selected.title}</div>
          <div className="text-xs text-gray-500">{selected.document_type_name} · {selected.creator_name} · {selected.created_at.slice(0, 10)}</div>
          <span className="inline-block text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{STATUS_LABEL[selected.status]}</span>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold text-gray-500 mb-2">내용</div>
          {selected.reference_type === 'daily_cash_report' && selected.reference_id ? (
            <DailyCashReportMobileView reportId={selected.reference_id} />
          ) : hasStructuredContent ? (
            <a
              href={`/print/documents/${selected.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 underline"
            >
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

        <AttachmentList attachments={selected.attachments} />

        {selected.final_comment && (
          <div className="rounded-xl border border-red-100 bg-red-50 p-4">
            <div className="text-xs font-semibold text-red-700 mb-1">반려 사유</div>
            <div className="text-sm text-red-800 whitespace-pre-wrap">{selected.final_comment}</div>
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

        {myTurn && (
          <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="결재 의견(반려 시 필수)"
              className="w-full min-h-20 rounded-lg border border-gray-200 p-2.5 text-sm"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={processing}
                onClick={() => handleAction('rejected')}
                className="flex-1 h-10 rounded-lg border border-red-300 text-red-600 text-sm font-medium disabled:opacity-50"
              >
                반려
              </button>
              <button
                type="button"
                disabled={processing}
                onClick={() => handleAction('approved')}
                className="flex-1 h-10 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-50"
              >
                승인
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sorted.map(doc => {
        const myTurn = isMyTurn(doc);
        return (
          <button
            key={doc.id}
            type="button"
            onClick={() => setSelected(doc)}
            className="w-full flex items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3 text-left shadow-sm active:bg-gray-50"
          >
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-800 truncate">{doc.title}</div>
              <div className="text-xs text-gray-500 truncate">{doc.document_type_name} · {doc.creator_name}</div>
            </div>
            {myTurn ? (
              <span className="shrink-0 text-[11px] px-2 py-0.5 rounded-full bg-blue-500 text-white">내 차례</span>
            ) : (
              <span className="shrink-0 text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{STATUS_LABEL[doc.status]}</span>
            )}
            <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
          </button>
        );
      })}
      {sorted.length === 0 && <div className="text-center text-sm text-gray-400 py-10">결재함에 문서가 없습니다.</div>}
    </div>
  );
}
