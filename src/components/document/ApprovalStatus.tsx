import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { CheckCircle2, XCircle, Clock, ClipboardCheck } from 'lucide-react';
import type { ApprovalDocumentWithDetails } from '@/types/approval-document';

interface Props {
  doc: ApprovalDocumentWithDetails;
  creatorPositionName?: string | null;
}

// 결재함 상세/승인화면에서 "결재선상 누가 언제 승인/반려했고, 지금 누구 차례인지"를
// 참조자 열람 현황과 같은 형태로 한눈에 보여준다 — 시행문 안의 결재란 표는 인쇄용 서식이라
// 화면에서 빠르게 훑어보기엔 정보가 작고 빽빽하므로 별도로 둔다.
export default function ApprovalStatus({ doc, creatorPositionName }: Props) {
  const positionOf = (label?: string | null) => label?.split(' · ').pop()?.trim() || '';
  const approvedCount = doc.steps.filter(s => s.status === 'approved').length;
  const total = doc.steps.length;

  return (
    <div className="bg-gray-50 p-3 rounded">
      <p className="text-sm font-semibold mb-1.5 flex items-center gap-1">
        <ClipboardCheck className="w-3.5 h-3.5" />결재 현황 <span className="text-gray-400 font-normal">({approvedCount}/{total}단계 완료)</span>
      </p>
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span className="font-medium">{creatorPositionName ? `${creatorPositionName} ` : ''}{doc.creator_name}</span>
          <span className="text-xs text-gray-400">기안</span>
          <span className="text-xs ml-auto shrink-0 text-gray-500">{format(new Date(doc.created_at), 'MM-dd HH:mm', { locale: ko })}</span>
        </div>
        {doc.steps.map((s, i) => {
          const isCurrent = doc.status === 'pending' && s.step_order === doc.current_step;
          return (
            <div key={s.id} className="flex items-center gap-2 text-sm">
              {s.status === 'approved' ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" />
              ) : s.status === 'rejected' ? (
                <XCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
              ) : (
                <Clock className={`w-3.5 h-3.5 shrink-0 ${isCurrent ? 'text-blue-600' : 'text-gray-300'}`} />
              )}
              <span className="font-medium">{positionOf(s.approver_label)} {s.approver_name}</span>
              <span className="text-xs text-gray-400">{i + 1}차 결재{isCurrent ? ' · 현재 차례' : ''}</span>
              <span className="text-xs ml-auto shrink-0">
                {s.status === 'approved' ? (
                  <span className="text-green-600">{s.acted_at ? `${format(new Date(s.acted_at), 'MM-dd HH:mm', { locale: ko })} ` : ''}승인</span>
                ) : s.status === 'rejected' ? (
                  <span className="text-red-600">{s.acted_at ? `${format(new Date(s.acted_at), 'MM-dd HH:mm', { locale: ko })} ` : ''}반려</span>
                ) : (
                  <span className="text-gray-400">대기</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
