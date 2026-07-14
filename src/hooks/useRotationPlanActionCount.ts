import { useState, useEffect, useCallback } from 'react';
import { getCurrentUser } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { supervisorService } from '@/services/supervisor.service';

const REFRESH_EVENT = 'rotation-plan-data-changed';
const POLL_INTERVAL_MS = 60000;

// 선원 교대 계획/발령 메뉴 배지: 결재 상신이 필요한 임시저장(draft) + 발령 실행이 필요한
// 승인(approved) 계획 건수를 더해서 보여준다. 관리자가 아니면 본인 담당 선박만 집계한다.
export function useRotationPlanActionCount() {
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    const user = await getCurrentUser();
    if (!user) { setCount(0); return; }
    const isAdmin = user.role === 'admin' || user.role === 'system_admin';

    try {
      let query = supabase
        .from('crew_rotation_plans')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
        .in('status', ['draft', 'approved']);

      if (!isAdmin) {
        const shipIds = await supervisorService.getSupervisedShips(user.id);
        if (shipIds.length === 0) { setCount(0); return; }
        query = query.in('ship_id', shipIds);
      }

      const { count: total, error } = await query;
      if (error) throw error;
      setCount(total || 0);
    } catch (e) {
      console.error('교대계획 배지 건수 조회 실패', e);
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
