import { useState, useEffect, useCallback } from 'react';
import { getCurrentUser } from '@/lib/store';
import { approvalService } from '@/services/approval.service';
import { rotationApprovalService } from '@/services/rotation-approval.service';
import { contractApprovalService } from '@/services/contract-approval.service';
import { dispatchOrderApprovalService } from '@/services/dispatch-order-approval.service';

interface ApprovalLike {
  status: string;
  current_approver?: { approver_id: string };
}

const REFRESH_EVENT = 'dispatch-approval-inbox-data-changed';
const POLL_INTERVAL_MS = 60000;

// 발령 결재함(채용/배승/계약/승진강등) 4개 도메인을 통틀어, 현재 로그인한 사용자가
// 지금 결재 차례인 건수를 사이드바 배지에 표시하기 위한 훅.
export function useDispatchApprovalPendingCount() {
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    const user = await getCurrentUser();
    if (!user) { setCount(0); return; }
    const isAdmin = user.role === 'admin' || user.role === 'system_admin';
    const isMyTurn = (a: ApprovalLike) => a.status === 'pending' && (isAdmin || a.current_approver?.approver_id === user.id);

    try {
      const [crew, rotation, contract, dispatch] = await Promise.all([
        isAdmin ? approvalService.getAllApprovals() : approvalService.getMyRelatedApprovals(user.id),
        isAdmin ? rotationApprovalService.getAllApprovals() : rotationApprovalService.getMyRelatedApprovals(user.id),
        isAdmin ? contractApprovalService.getAllApprovals() : contractApprovalService.getMyRelatedApprovals(user.id),
        isAdmin ? dispatchOrderApprovalService.getAllApprovals() : dispatchOrderApprovalService.getMyRelatedApprovals(user.id),
      ]);
      const total =
        crew.filter(isMyTurn).length +
        rotation.filter(isMyTurn).length +
        contract.filter(isMyTurn).length +
        dispatch.filter(isMyTurn).length;
      setCount(total);
    } catch (e) {
      console.error('발령 결재함 대기 건수 조회 실패', e);
    }
  }, []);

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener(REFRESH_EVENT, handler);
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      window.removeEventListener(REFRESH_EVENT, handler);
      clearInterval(interval);
    };
  }, [load]);

  return count;
}
