import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { getMyPayslips, acknowledgePayslip } from '@/services/employee-salary.service';
import { groupPayslipItems, isDeductionGroup } from '@/lib/employee-payslip-groups';
import { useToast } from '@/hooks/use-toast';
import type { EmployeePayslipWithDetails } from '@/types/employee-salary';
import type { User } from '@/lib/store';

interface Props {
  currentUser: User;
}

const fmt = (n: number) => n.toLocaleString('ko-KR');

// 내 급여명세서 — EmployeePayslipDetailView(4열 그리드, A4 인쇄 전제)는 좁은 화면에 그대로 못
// 쓰므로, 같은 그룹핑 유틸(groupPayslipItems)로 1열 리스트를 새로 구성한다.
export default function MobileMyPayslipsPage({ currentUser }: Props) {
  const { toast } = useToast();
  const [payslips, setPayslips] = useState<EmployeePayslipWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<EmployeePayslipWithDetails | null>(null);
  const [disputing, setDisputing] = useState(false);
  const [disputeComment, setDisputeComment] = useState('');
  const [processing, setProcessing] = useState(false);

  const load = async () => {
    const data = await getMyPayslips(currentUser.id);
    setPayslips(data);
    setLoading(false);
    if (selected) setSelected(data.find(p => p.id === selected.id) || null);
  };

  useEffect(() => { load(); }, [currentUser.id]);

  const sorted = useMemo(() => [...payslips].sort((a, b) => (b.period_year_month || '').localeCompare(a.period_year_month || '')), [payslips]);

  const handleApprove = async () => {
    if (!selected) return;
    setProcessing(true);
    try {
      await acknowledgePayslip(selected.id, 'approved');
      toast({ title: '승인되었습니다' });
      await load();
    } finally {
      setProcessing(false);
    }
  };

  const handleSubmitDispute = async () => {
    if (!selected) return;
    if (!disputeComment.trim()) { toast({ title: '이의제기 사유를 입력해주세요.', variant: 'destructive' }); return; }
    setProcessing(true);
    try {
      await acknowledgePayslip(selected.id, 'disputed', disputeComment.trim());
      toast({ title: '이의제기가 접수되었습니다.', description: '담당자가 확인 후 조치합니다.' });
      setDisputing(false);
      setDisputeComment('');
      await load();
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;
  }

  if (selected) {
    const groups = groupPayslipItems(selected.items);
    return (
      <div className="space-y-3">
        <button type="button" onClick={() => { setSelected(null); setDisputing(false); }} className="flex items-center gap-1 text-sm text-gray-500">
          <ChevronLeft className="w-4 h-4" />목록으로
        </button>

        <div className="rounded-xl border bg-white p-4 shadow-sm space-y-1">
          <div className="text-base font-bold text-gray-900">{selected.period_year_month} 급여명세서</div>
          <div className="text-xs text-gray-500">지급일: {selected.payment_date || '-'}</div>
          <div className="text-xl font-bold text-blue-700 mt-1">{fmt(selected.net_amount)}원</div>
        </div>

        {groups.map(group => (
          <div key={group.key} className="rounded-xl border bg-white p-4 shadow-sm">
            <div className={`text-xs font-semibold mb-2 ${isDeductionGroup(group) ? 'text-red-600' : 'text-gray-500'}`}>{group.label}</div>
            <div className="space-y-1.5">
              {group.items.map(item => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span className="text-gray-600">{item.name}</span>
                  <span className={isDeductionGroup(group) ? 'text-red-600' : 'text-gray-800'}>{fmt(item.amount)}원</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="rounded-xl border bg-white p-4 shadow-sm space-y-1.5">
          <div className="flex justify-between text-sm"><span className="text-gray-500">지급 총액</span><span>{fmt(selected.base_amount + selected.total_allowance)}원</span></div>
          <div className="flex justify-between text-sm"><span className="text-gray-500">공제 총액</span><span className="text-red-600">{fmt(selected.total_deduction)}원</span></div>
          <div className="flex justify-between text-sm font-bold border-t pt-1.5"><span>실지급액</span><span>{fmt(selected.net_amount)}원</span></div>
        </div>

        {selected.ack_status === 'pending' && !disputing && (
          <div className="flex gap-2">
            <button type="button" onClick={() => setDisputing(true)} disabled={processing} className="flex-1 h-10 rounded-lg border border-gray-300 text-sm font-medium disabled:opacity-50">
              이의제기
            </button>
            <button type="button" onClick={handleApprove} disabled={processing} className="flex-1 h-10 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-50">
              {processing ? '처리 중...' : '승인'}
            </button>
          </div>
        )}
        {selected.ack_status === 'pending' && disputing && (
          <div className="rounded-xl border bg-white p-4 shadow-sm space-y-2">
            <textarea value={disputeComment} onChange={e => setDisputeComment(e.target.value)} placeholder="이의제기 사유" className="w-full min-h-20 rounded-lg border border-gray-200 p-2.5 text-sm" />
            <p className="text-xs text-gray-400">이의제기해도 담당자의 처리는 계속 진행되며, 담당자에게 사유가 표시됩니다.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setDisputing(false)} className="flex-1 h-10 rounded-lg border border-gray-300 text-sm font-medium">취소</button>
              <button type="button" onClick={handleSubmitDispute} disabled={processing} className="flex-1 h-10 rounded-lg bg-red-600 text-white text-sm font-medium disabled:opacity-50">
                {processing ? '처리 중...' : '이의제기 접수'}
              </button>
            </div>
          </div>
        )}
        {selected.ack_status === 'approved' && (
          <div className="flex items-center gap-1.5 text-sm text-green-700"><CheckCircle2 className="w-4 h-4" />승인함</div>
        )}
        {selected.ack_status === 'disputed' && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center gap-1.5 text-sm text-amber-700 font-medium"><AlertTriangle className="w-4 h-4" />이의제기함</div>
            {selected.ack_comment && <p className="text-xs text-amber-700 mt-1.5">사유: {selected.ack_comment}</p>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sorted.map(p => (
        <button
          key={p.id}
          type="button"
          onClick={() => setSelected(p)}
          className="w-full flex items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3 text-left shadow-sm active:bg-gray-50"
        >
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-800">{p.period_year_month}</div>
            <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
              {p.ack_status === 'approved' && <><CheckCircle2 className="w-3 h-3 text-green-600" />승인함</>}
              {p.ack_status === 'disputed' && <><AlertTriangle className="w-3 h-3 text-amber-600" />이의제기함</>}
              {p.ack_status === 'pending' && <><Clock className="w-3 h-3 text-gray-400" />확인 필요</>}
            </div>
          </div>
          <span className="shrink-0 font-mono font-bold text-sm text-gray-800">{fmt(p.net_amount)}원</span>
          <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
        </button>
      ))}
      {sorted.length === 0 && <div className="text-center text-sm text-gray-400 py-10">급여명세서가 없습니다.</div>}
    </div>
  );
}
