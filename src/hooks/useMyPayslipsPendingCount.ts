import { useState, useEffect, useCallback } from 'react';
import { getCurrentUser } from '@/lib/store';
import { EMPLOYEE_ROLES } from '@/pages/EmployeeCardManagementPage';
import { getMyPendingPayslipCount } from '@/services/employee-salary.service';

const REFRESH_EVENT = 'my-payslips-data-changed';
const POLL_INTERVAL_MS = 60000;

// "내 급여명세서" 메뉴/대시보드 배지: 담당자가 확인 요청했지만 아직 승인/이의제기하지 않은
// 급여명세서 건수. 육상 직원(EMPLOYEE_ROLES)이 아니면 항상 0.
export function useMyPayslipsPendingCount() {
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    const user = await getCurrentUser();
    if (!user || !EMPLOYEE_ROLES.includes(user.role ?? '')) { setCount(0); return; }
    try {
      setCount(await getMyPendingPayslipCount(user.id));
    } catch (e) {
      console.error('내 급여명세서 배지 건수 조회 실패', e);
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
