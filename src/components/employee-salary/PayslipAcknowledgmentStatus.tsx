import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { CheckCircle2, AlertTriangle, Clock, Users, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { getAcknowledgmentStatus, acknowledgePayslip } from '@/services/employee-salary.service';
import type { PayslipAckStatus, PayslipAcknowledgmentEntry } from '@/types/employee-salary';

const FORCE_APPROVE_NOTE = '관리자(슈퍼관리자) 강제 승인';
const STATUS_TEXT: Record<PayslipAckStatus, string> = { approved: '승인', disputed: '이의제기', pending: '대기' };
const STATUS_BADGE: Record<PayslipAckStatus, string> = {
  approved: 'bg-green-50 text-green-700 border-green-200',
  disputed: 'bg-amber-50 text-amber-700 border-amber-300',
  pending: 'bg-gray-50 text-gray-400 border-gray-200',
};

interface Props {
  periodId: string;
  refreshKey?: number;
  canForceApprove?: boolean;
  onChanged?: () => void;
}

// ReferenceReadStatus.tsx와 같은 형태로 "직원 확인 현황"을 보여준다 — 승인/이의제기 모두
// "확인 완료"로 집계한다(이의제기도 진행을 막지 않으므로). 슈퍼관리자(admin) 계정에는 연락이
// 안 되는 직원을 대신해 승인 처리할 수 있는 "강제 승인" 버튼을 제공한다.
export default function PayslipAcknowledgmentStatus({ periodId, refreshKey, canForceApprove, onChanged }: Props) {
  const { toast } = useToast();
  const [entries, setEntries] = useState<PayslipAcknowledgmentEntry[] | null>(null);
  const [forcingId, setForcingId] = useState<string | null>(null);

  const load = () => getAcknowledgmentStatus(periodId).then(setEntries).catch(console.error);

  useEffect(() => {
    let cancelled = false;
    getAcknowledgmentStatus(periodId).then(r => { if (!cancelled) setEntries(r); }).catch(console.error);
    return () => { cancelled = true; };
  }, [periodId, refreshKey]);

  const handleForceApprove = async (entry: PayslipAcknowledgmentEntry) => {
    if (!confirm(`"${entry.employee_name}"의 확인을 관리자 권한으로 강제 승인하시겠습니까?\n본인이 직접 확인한 것이 아니므로 신중히 사용해주세요.`)) return;
    try {
      setForcingId(entry.payslip_id);
      await acknowledgePayslip(entry.payslip_id, 'approved', FORCE_APPROVE_NOTE);
      toast({ title: '강제 승인되었습니다.' });
      await load();
      onChanged?.();
    } catch (e) {
      toast({ title: '처리 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setForcingId(null);
    }
  };

  if (!entries || entries.length === 0) return null;
  const doneCount = entries.filter(e => e.ack_status !== 'pending').length;

  return (
    <div className="bg-gray-50 p-2.5 rounded">
      <p className="text-xs font-semibold mb-1 flex items-center gap-1">
        <Users className="w-3 h-3" />직원 확인 현황 <span className="text-gray-400 font-normal">({doneCount}/{entries.length}명 확인)</span>
      </p>
      <div className="space-y-0.5">
        {entries.map(e => (
          <div key={e.payslip_id} className="text-xs">
            <div className="grid grid-cols-[12px_104px_54px_auto] items-center gap-x-1.5">
              {e.ack_status === 'approved' ? (
                <CheckCircle2 className="w-3 h-3 text-green-600" />
              ) : e.ack_status === 'disputed' ? (
                <AlertTriangle className="w-3 h-3 text-amber-500" />
              ) : (
                <Clock className="w-3 h-3 text-gray-300" />
              )}
              <span className="font-medium truncate">
                {e.employee_position_name && <span className="text-gray-500 font-normal">{e.employee_position_name} </span>}
                {e.employee_name}
              </span>
              <Badge variant="outline" className={`h-4 px-1.5 text-[10px] font-medium rounded-full justify-center ${STATUS_BADGE[e.ack_status]}`}>
                {STATUS_TEXT[e.ack_status]}
              </Badge>
              <span className="flex items-center gap-1">
                {e.ack_status === 'approved' ? (
                  <>
                    {e.ack_at && <span className="text-[10.5px] text-gray-400">{format(new Date(e.ack_at), 'MM-dd HH:mm', { locale: ko })}</span>}
                    {e.ack_comment === FORCE_APPROVE_NOTE && (
                      <span className="text-[10.5px] text-purple-700 flex items-center gap-0.5"><ShieldCheck className="w-2.5 h-2.5 shrink-0" />{FORCE_APPROVE_NOTE}</span>
                    )}
                  </>
                ) : canForceApprove ? (
                  <Button
                    size="sm" variant="outline" className="h-5 px-1.5 text-[10px] gap-1 text-purple-700 border-purple-300 hover:bg-purple-50"
                    onClick={() => handleForceApprove(e)} disabled={forcingId === e.payslip_id}
                  >
                    <ShieldCheck className="w-2.5 h-2.5" />{forcingId === e.payslip_id ? '처리 중...' : '강제 승인'}
                  </Button>
                ) : null}
              </span>
            </div>
            {e.ack_status === 'disputed' && e.ack_comment && (
              <div className="pl-[18px] text-[11px] text-amber-700 truncate">이의제기: {e.ack_comment}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
