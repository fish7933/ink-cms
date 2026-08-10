import { useState, useEffect, useCallback } from 'react';
import { getCurrentUser } from '@/lib/store';
import { orgChartService } from '@/services/org-chart.service';
import { approvalDocumentService } from '@/services/approval-document.service';

const REFRESH_EVENT = 'approval-inbox-data-changed';
const POLL_INTERVAL_MS = 60000;

// 그룹웨어 결재함 메뉴/탭 배지: 내 차례인 결재 대기 건수 + 아직 열람하지 않은 참조 문서 건수의 합.
// 결재선상의 내 차례가 끝나거나(승인/반려) 참조 문서를 열람하면 각각 집계에서 빠진다.
export function useApprovalInboxBadgeCount() {
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    const user = await getCurrentUser();
    if (!user) { setCount(0); return; }
    const isAdmin = user.role === 'admin' || user.role === 'system_admin';

    try {
      const members = await orgChartService.getOrgMembers();
      const myOrgUnitIds = members.find(m => m.id === user.id)?.org_unit_ids || [];

      const [pendingTurn, unreadReferences] = await Promise.all([
        approvalDocumentService.getMyPendingTurnCount(user.id, isAdmin),
        approvalDocumentService.getUnreadReferenceCount(user.id, myOrgUnitIds, user.hire_date),
      ]);
      setCount(pendingTurn + unreadReferences);
    } catch (e) {
      console.error('결재함 배지 건수 조회 실패', e);
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
