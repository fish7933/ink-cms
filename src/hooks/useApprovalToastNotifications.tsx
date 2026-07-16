import { useEffect, useRef } from 'react';
import { getCurrentUser } from '@/lib/store';
import { approvalService } from '@/services/approval.service';
import { rotationApprovalService } from '@/services/rotation-approval.service';
import { contractApprovalService } from '@/services/contract-approval.service';
import { dispatchOrderApprovalService } from '@/services/dispatch-order-approval.service';
import { useToast } from '@/hooks/use-toast';
import { useTabContext } from '@/contexts/TabContext';
import { ToastAction } from '@/components/ui/toast';

interface ApprovalLike {
  id: string;
  status: string;
  requester_name: string;
  current_approver?: { approver_id: string };
}

const POLL_INTERVAL_MS = 60000;
const REFRESH_EVENTS = [
  'dispatch-approval-inbox-data-changed',
  'rotation-plan-data-changed',
  'recommendation-data-changed',
  'contract-data-changed',
  'dispatch-order-data-changed',
];

// 발령 결재함(채용/배승/계약/승진강등) 사이드바 배지에 새 건이 뜨는 순간, 화면 우하단에
// 토스트로 실시간 알려준다. 배지가 사라진 항목(승인/반려 처리됨)은 더 이상 추적하지 않으므로
// 자연히 다시 뜨지 않는다 — 별도의 알림 목록을 유지하지 않고 "새로 나타난 건"만 그때그때 띄운다.
export function useApprovalToastNotifications() {
  const { toast } = useToast();
  const { openNewTab } = useTabContext();
  // null=아직 첫 조회 전(첫 조회 결과는 토스트 없이 기준선만 세움 — 로그인 직후 쌓여있던
  // 건들이 한꺼번에 토스트로 쏟아지는 것을 방지)
  const seenIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const user = await getCurrentUser();
      if (!user || cancelled) return;
      const isMyTurn = (a: ApprovalLike) => a.status === 'pending' && a.current_approver?.approver_id === user.id;

      try {
        const [crew, rotation, contract, dispatch] = await Promise.all([
          approvalService.getMyRelatedApprovals(user.id),
          rotationApprovalService.getMyRelatedApprovals(user.id),
          contractApprovalService.getMyRelatedApprovals(user.id),
          dispatchOrderApprovalService.getMyRelatedApprovals(user.id),
        ]);
        if (cancelled) return;

        const items = [
          ...crew.filter(isMyTurn).map(a => ({ id: a.id, title: '선원추천 결재', requesterName: a.requester_name })),
          ...rotation.filter(isMyTurn).map(a => ({ id: a.id, title: '배승 결재', requesterName: a.requester_name })),
          ...contract.filter(isMyTurn).map(a => ({ id: a.id, title: '계약 결재', requesterName: a.requester_name })),
          ...dispatch.filter(isMyTurn).map(a => ({ id: a.id, title: '승진/강등 결재', requesterName: a.requester_name })),
        ];
        const currentIds = new Set(items.map(i => i.id));

        if (seenIds.current) {
          for (const item of items) {
            if (seenIds.current.has(item.id)) continue;
            toast({
              title: `${item.title} 대기중`,
              description: `${item.requesterName}님이 상신한 건이 결재를 기다리고 있습니다.`,
              action: (
                <ToastAction altText="발령 결재함 열기" onClick={() => openNewTab('/dispatch-approval-inbox', '발령 결재함')}>
                  열기
                </ToastAction>
              ),
            });
          }
        }
        seenIds.current = currentIds;
      } catch (e) {
        console.error('결재 알림 확인 실패', e);
      }
    };

    check();
    const handler = () => check();
    REFRESH_EVENTS.forEach(evt => window.addEventListener(evt, handler));
    const interval = setInterval(check, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      REFRESH_EVENTS.forEach(evt => window.removeEventListener(evt, handler));
      clearInterval(interval);
    };
  }, [toast, openNewTab]);
}
