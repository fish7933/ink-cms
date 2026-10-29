import type { ApprovalDocumentWithDetails } from '@/types/approval-document';

interface Props {
  doc: ApprovalDocumentWithDetails;
}

// 반려 사유는 결재 진행 중에 남겨진 메타 정보일 뿐 기안문(시행문) 본문이 아니므로, 공식 문서
// 틀(ApprovalDocumentIssuedSheet) 안에 넣지 않고 그 아래에 별도 박스로 보여준다.
export default function ApprovalRejectionReasonBox({ doc }: Props) {
  if (doc.status !== 'rejected' || !doc.final_comment) return null;

  const rejectedStep = doc.steps.find(s => s.status === 'rejected');
  const positionOf = (label?: string | null) => label?.split(' · ').pop()?.trim() || '';

  return (
    <div style={{ maxWidth: 800, margin: '16px auto 0', padding: '8px 10px', border: '1px solid #fca5a5', background: '#fef2f2', borderRadius: 4 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#b91c1c', paddingBottom: 6, marginBottom: 10, borderBottom: '1px solid #fca5a5' }}>
        반려 사유
        {rejectedStep && (
          <span style={{ fontWeight: 400, color: '#991b1b', marginLeft: 6 }}>
            ({positionOf(rejectedStep.approver_label) ? `${positionOf(rejectedStep.approver_label)} ` : ''}{rejectedStep.approver_name}
            {rejectedStep.acted_at ? ` · ${new Date(rejectedStep.acted_at).toLocaleString('ko-KR')}` : ''})
          </span>
        )}
      </div>
      <div style={{ fontSize: 12, color: '#333' }}>
        {doc.final_comment.split('\n').map((line, i) => <div key={i}>{line || ' '}</div>)}
      </div>
    </div>
  );
}
