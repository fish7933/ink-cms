import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { CheckCircle2, AlertTriangle, Clock, Users } from 'lucide-react';
import { getAcknowledgmentStatus } from '@/services/employee-salary.service';
import type { PayslipAcknowledgmentEntry } from '@/types/employee-salary';

interface Props {
  periodId: string;
  refreshKey?: number;
}

// ReferenceReadStatus.tsx와 같은 형태로 "직원 확인 현황"을 보여준다 — 승인/이의제기 모두
// "확인 완료"로 집계한다(이의제기도 진행을 막지 않으므로).
export default function PayslipAcknowledgmentStatus({ periodId, refreshKey }: Props) {
  const [entries, setEntries] = useState<PayslipAcknowledgmentEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAcknowledgmentStatus(periodId).then(r => { if (!cancelled) setEntries(r); }).catch(console.error);
    return () => { cancelled = true; };
  }, [periodId, refreshKey]);

  if (!entries || entries.length === 0) return null;
  const doneCount = entries.filter(e => e.ack_status !== 'pending').length;

  return (
    <div className="bg-gray-50 p-3 rounded">
      <p className="text-sm font-semibold mb-1.5 flex items-center gap-1">
        <Users className="w-3.5 h-3.5" />직원 확인 현황 <span className="text-gray-400 font-normal">({doneCount}/{entries.length}명 확인)</span>
      </p>
      <div className="space-y-1">
        {entries.map(e => (
          <div key={e.payslip_id} className="flex items-center gap-2 text-sm">
            {e.ack_status === 'approved' ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" />
            ) : e.ack_status === 'disputed' ? (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            ) : (
              <Clock className="w-3.5 h-3.5 text-gray-300 shrink-0" />
            )}
            <span className="font-medium">{e.employee_name}</span>
            {e.employee_position_name && <span className="text-xs text-gray-400">{e.employee_position_name}</span>}
            {e.ack_status === 'disputed' && e.ack_comment && (
              <span className="text-xs text-amber-700 truncate max-w-xs">이의제기: {e.ack_comment}</span>
            )}
            <span className="text-xs ml-auto shrink-0">
              {e.ack_status === 'approved' ? (
                <span className="text-green-600">{e.ack_at && `${format(new Date(e.ack_at), 'MM-dd HH:mm', { locale: ko })} `}승인</span>
              ) : e.ack_status === 'disputed' ? (
                <span className="text-amber-600">{e.ack_at && `${format(new Date(e.ack_at), 'MM-dd HH:mm', { locale: ko })} `}이의제기</span>
              ) : (
                <span className="text-gray-400">대기</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
