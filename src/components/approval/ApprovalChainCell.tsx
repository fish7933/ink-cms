import type { ApprovalLineStep, ApprovalAction } from '@/types/approval';

export interface ApprovalChainLike {
  status: string;
  current_step: number;
  requester_name: string;
  approval_line: { name: string; steps: ApprovalLineStep[] };
  actions: ApprovalAction[];
}

// 목록에서 결재 현황을 한 줄로 보여준다: 요청자 → 중간결재자(들) → 최종결재자.
// 결재중인 단계는 파란색으로 강조하고, 이미 승인/반려된 단계는 각각 초록/빨강으로 표시한다.
// 공간이 부족할 때만(테이블 자체 스크롤) 잘리도록, 여기서는 폭을 임의로 제한하지 않는다.
export function ApprovalChainCell({ approval }: { approval?: ApprovalChainLike | null }) {
  if (!approval) return <span className="text-xs text-gray-300">-</span>;
  const plainText = [approval.requester_name, ...approval.approval_line.steps.map(s => s.approver_name)].join(' → ');
  return (
    <div className="text-xs whitespace-nowrap" title={plainText}>
      <span className="text-gray-500">{approval.requester_name}</span>
      {approval.approval_line.steps.map(step => {
        const action = approval.actions.find(a => a.step_order === step.step_order);
        const isCurrent = approval.status === 'pending' && approval.current_step === step.step_order;
        return (
          <span key={step.id}>
            <span className="text-gray-300"> → </span>
            <span className={
              action?.action === 'approved' ? 'text-green-600'
              : action?.action === 'rejected' ? 'text-red-600 font-medium'
              : isCurrent ? 'text-blue-600 font-semibold'
              : 'text-gray-400'
            }>
              {step.approver_name}{isCurrent ? '(결재중)' : ''}
            </span>
          </span>
        );
      })}
    </div>
  );
}
