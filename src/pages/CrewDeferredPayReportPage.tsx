import { useState, useEffect, useCallback, useMemo } from 'react';
import { PiggyBank } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { getCurrentUser, getShips } from '@/lib/store';
import { supervisorService } from '@/services/supervisor.service';
import { crewPayrollService } from '@/services/crew-payroll.service';
import type { Ship } from '@/lib/store';
import type { CrewDeferredPayRow } from '@/types/crew-payroll';

const fmt = (n: number) => n.toLocaleString('ko-KR');
const currentYearMonth = () => new Date().toISOString().slice(0, 7);

// 후불성(휴가비 등) 급여 항목의 회사 내부 현황 — 그 달에 각 선원별로 얼마나 적립됐는지,
// 승선일부터 지금까지 얼마나 쌓여있는지(=우리가 나중에 지급해야 할 부채성 잔액), 하선 등으로
// 그 달에 실제 얼마나 지급됐는지를 한눈에 본다. 선주/매닝사와 공유하지 않는 내부 전용 화면.
export default function CrewDeferredPayReportPage() {
  const { toast } = useToast();
  const [ships, setShips] = useState<Ship[]>([]);
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [rows, setRows] = useState<CrewDeferredPayRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const user = await getCurrentUser();
      const isAdmin = user?.role === 'admin' || user?.role === 'system_admin';
      const allShips = await getShips();
      if (isAdmin) {
        setShips(allShips);
      } else if (user) {
        const supervisedIds = new Set(await supervisorService.getSupervisedShips(user.id));
        setShips(allShips.filter(s => supervisedIds.has(s.id)));
      }
    })();
  }, []);

  const loadRows = useCallback(async (ym: string, shipList: Ship[]) => {
    if (shipList.length === 0) { setRows([]); setLoading(false); return; }
    setLoading(true);
    try {
      const data = await crewPayrollService.getDeferredPayReport(ym, shipList.map(s => ({ id: s.id, name: s.name })));
      setRows(data);
    } catch (e) {
      toast({ title: '조회 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadRows(yearMonth, ships); }, [yearMonth, ships, loadRows]);

  const totals = useMemo(() => ({
    accrual: rows.reduce((s, r) => s + r.monthly_accrual, 0),
    balance: rows.reduce((s, r) => s + (r.payout_this_month > 0 ? 0 : r.accrued_to_date), 0),
    payout: rows.reduce((s, r) => s + r.payout_this_month, 0),
  }), [rows]);

  return (
    <div className="max-w-[1400px] mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><PiggyBank className="w-5 h-5 text-muted-foreground" />선원 후불성 급여 현황</h1>
        <p className="text-xs text-muted-foreground mt-1">
          휴가비 등 후불성 급여 항목이 선원별로 매달 얼마나 적립되고, 현재 잔액이 얼마이며, 하선 등으로 그 달에 실제 얼마나 지급됐는지 보여줍니다.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">기준 월</Label>
          <Input type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)} className="h-9 text-sm w-40" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">이번 달 적립액 합계</p>
          <p className="text-lg font-bold mt-1">{fmt(totals.accrual)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">현재 누적 잔액(미지급) 합계</p>
          <p className="text-lg font-bold mt-1 text-amber-700">{fmt(totals.balance)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">이번 달 일괄 지급액 합계</p>
          <p className="text-lg font-bold mt-1 text-green-700">{fmt(totals.payout)}</p>
        </CardContent></Card>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-400">이 달에 후불성 급여 항목이 있는 명세서가 없습니다.</div>
      ) : (
        <div className="rounded-md border overflow-hidden overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs whitespace-nowrap">선박</TableHead>
                <TableHead className="text-xs whitespace-nowrap">직급</TableHead>
                <TableHead className="text-xs whitespace-nowrap">선원</TableHead>
                <TableHead className="text-xs whitespace-nowrap">항목</TableHead>
                <TableHead className="text-xs text-right whitespace-nowrap">이번 달 적립액</TableHead>
                <TableHead className="text-xs text-right whitespace-nowrap">누적 잔액</TableHead>
                <TableHead className="text-xs text-right whitespace-nowrap">이번 달 지급액</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, idx) => (
                <TableRow key={`${r.crew_member_id}-${r.item_name}-${idx}`}>
                  <TableCell className="text-xs text-muted-foreground">{r.ship_name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.rank_code}</TableCell>
                  <TableCell className="text-xs font-medium">{r.crew_name}</TableCell>
                  <TableCell className="text-xs">{r.item_name}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{fmt(r.monthly_accrual)}</TableCell>
                  <TableCell className="text-xs text-right font-mono text-amber-700">
                    {r.payout_this_month > 0 ? '0 (지급완료)' : fmt(r.accrued_to_date)}
                  </TableCell>
                  <TableCell className="text-xs text-right font-mono text-green-700">{r.payout_this_month > 0 ? fmt(r.payout_this_month) : '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
