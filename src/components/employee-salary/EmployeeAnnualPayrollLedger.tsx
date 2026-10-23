import { useState, useEffect, useMemo } from 'react';
import { Receipt, FileSpreadsheet } from 'lucide-react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { groupPayslipItems } from '@/lib/employee-payslip-groups';
import { cn } from '@/lib/utils';
import { getCompanyInfo } from '@/services/company-info.service';
import { exportAnnualPayrollLedgerToExcel } from '@/utils/employee-annual-ledger-export';
import type { EmployeePayslipWithDetails } from '@/types/employee-salary';

const LEDGER_GROUP_ORDER = ['fixed', 'variable', 'nontax', 'other', 'deduction'];

const fmt = (n: number) => n.toLocaleString('ko-KR');

interface Props {
  payslips: EmployeePayslipWithDetails[];
  emptyMessage?: string;
}

// 선택 연도의 급여명세서를 지급/공제 항목 그대로, 월별로 한 줄씩 나열한다 — 직원 본인 화면
// (EmployeeMyPayslipsPage)과 관리자 화면(EmployeeSalaryManagementPage) 양쪽에서 재사용한다.
// 양식(EmployeePayslipDetailView)과 같은 고정급여→수당→비과세→기타급여→공제 순서를 쓰되,
// 달마다 항목 구성이 다를 수 있어 그 해에 등장한 항목 전체의 합집합을 열로 삼고, 1년 내내
// 모든 달에서 0원(또는 미등장)인 항목은 열 자체를 생략한다.
export default function EmployeeAnnualPayrollLedger({ payslips, emptyMessage = '아직 확인할 급여명세서가 없습니다.' }: Props) {
  const { toast } = useToast();
  const [year, setYear] = useState('');
  const [exporting, setExporting] = useState(false);

  const years = useMemo(
    () => [...new Set(payslips.map(p => p.period_year_month?.slice(0, 4)).filter((y): y is string => !!y))].sort((a, b) => b.localeCompare(a)),
    [payslips]
  );
  useEffect(() => {
    if (!year && years.length > 0) setYear(years[0]);
  }, [years, year]);

  const ledger = useMemo(() => {
    const yearSlips = payslips.filter(p => p.period_year_month?.startsWith(`${year}-`));

    const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
    const rows = months.map(month => {
      const slip = yearSlips.find(p => p.period_year_month === `${year}-${month}`);
      const amounts: Record<string, number> = {};
      for (const item of slip?.items || []) amounts[item.name] = (amounts[item.name] || 0) + item.amount;
      return {
        month,
        hasPayslip: !!slip,
        amounts,
        paymentTotal: slip ? slip.base_amount + slip.total_allowance : 0,
        deductionTotal: slip ? slip.total_deduction : 0,
        netAmount: slip ? slip.net_amount : 0,
      };
    });

    const namesByGroup = new Map<string, { label: string; names: string[] }>();
    for (const slip of yearSlips) {
      for (const group of groupPayslipItems(slip.items)) {
        if (!namesByGroup.has(group.key)) namesByGroup.set(group.key, { label: group.label, names: [] });
        const entry = namesByGroup.get(group.key)!;
        for (const item of group.items) {
          if (!entry.names.includes(item.name)) entry.names.push(item.name);
        }
      }
    }
    const hasAnyNonZero = (name: string) => rows.some(r => r.amounts[name]);
    const columns = LEDGER_GROUP_ORDER.flatMap(key => {
      const entry = namesByGroup.get(key);
      if (!entry) return [];
      return entry.names.filter(hasAnyNonZero).map(name => ({ groupKey: key, groupLabel: entry.label, name }));
    });
    const groupSpans = LEDGER_GROUP_ORDER
      .map(key => ({ key, entry: namesByGroup.get(key) }))
      .filter((g): g is { key: string; entry: { label: string; names: string[] } } => !!g.entry)
      .map(g => ({ groupKey: g.key, groupLabel: g.entry.label, count: g.entry.names.filter(hasAnyNonZero).length }))
      .filter(g => g.count > 0);

    const totals = {
      byColumn: Object.fromEntries(columns.map(c => [c.name, rows.reduce((s, r) => s + (r.amounts[c.name] || 0), 0)])),
      paymentTotal: rows.reduce((s, r) => s + r.paymentTotal, 0),
      deductionTotal: rows.reduce((s, r) => s + r.deductionTotal, 0),
      netAmount: rows.reduce((s, r) => s + r.netAmount, 0),
    };

    return { columns, groupSpans, rows, totals };
  }, [payslips, year]);

  const employeeName = payslips[0]?.employee_name || '';

  const handleExportExcel = async () => {
    try {
      setExporting(true);
      const company = await getCompanyInfo().catch(() => null);
      await exportAnnualPayrollLedgerToExcel({ employeeName, year, ...ledger }, company?.name || '');
    } catch (e) {
      toast({ title: '엑셀 다운로드 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  if (years.length === 0) {
    return <div className="text-center py-12 text-sm text-gray-400">{emptyMessage}</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-1.5">
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map(y => <SelectItem key={y} value={y} className="text-sm">{y}년</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={handleExportExcel} disabled={exporting}>
          <FileSpreadsheet className="w-3.5 h-3.5" />{exporting ? '다운로드 중...' : '엑셀 다운로드'}
        </Button>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-gray-400">
        <Receipt className="w-3.5 h-3.5" />
        <span>급여명세서의 지급/공제 항목을 그대로 월별로 나열한 참고용 내역입니다.</span>
      </div>
      <div className="overflow-x-auto no-scrollbar">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead rowSpan={2} className="text-xs align-bottom whitespace-nowrap">월</TableHead>
              {ledger.groupSpans.map(g => (
                <TableHead key={g.groupLabel} colSpan={g.count} className={cn('text-xs text-center border-l whitespace-nowrap', g.groupKey === 'deduction' ? 'text-red-600' : 'text-blue-700')}>
                  {g.groupLabel}
                </TableHead>
              ))}
              <TableHead rowSpan={2} className="text-right text-xs align-bottom border-l whitespace-nowrap text-blue-700">지급총액</TableHead>
              <TableHead rowSpan={2} className="text-right text-xs align-bottom whitespace-nowrap text-red-600">공제총액</TableHead>
              <TableHead rowSpan={2} className="text-right text-xs align-bottom font-semibold whitespace-nowrap">실지급액</TableHead>
            </TableRow>
            <TableRow>
              {ledger.columns.map(c => (
                <TableHead key={c.name} className={cn('text-right text-xs whitespace-nowrap', c.groupKey === 'deduction' ? 'text-red-600' : 'text-blue-700')}>
                  {c.name}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {ledger.rows.map(r => (
              <TableRow key={r.month} className={!r.hasPayslip ? 'text-gray-300' : undefined}>
                <TableCell className="text-sm whitespace-nowrap">{Number(r.month)}월</TableCell>
                {ledger.columns.map(c => (
                  <TableCell
                    key={c.name}
                    className={cn('text-right text-xs font-mono whitespace-nowrap', r.hasPayslip && (c.groupKey === 'deduction' ? 'text-red-600' : 'text-blue-700'))}
                  >
                    {r.hasPayslip ? (r.amounts[c.name] ? fmt(r.amounts[c.name]) : '-') : '-'}
                  </TableCell>
                ))}
                <TableCell className={cn('text-right text-sm font-mono whitespace-nowrap', r.hasPayslip && 'text-blue-700')}>{r.hasPayslip ? fmt(r.paymentTotal) : '-'}</TableCell>
                <TableCell className={cn('text-right text-sm font-mono whitespace-nowrap', r.hasPayslip && 'text-red-600')}>{r.hasPayslip ? fmt(r.deductionTotal) : '-'}</TableCell>
                <TableCell className="text-right text-sm font-mono font-semibold whitespace-nowrap">{r.hasPayslip ? fmt(r.netAmount) : '-'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="text-sm font-semibold whitespace-nowrap">{year}년 합계</TableCell>
              {ledger.columns.map(c => (
                <TableCell key={c.name} className={cn('text-right text-xs font-mono font-semibold whitespace-nowrap', c.groupKey === 'deduction' ? 'text-red-600' : 'text-blue-700')}>
                  {fmt(ledger.totals.byColumn[c.name] || 0)}
                </TableCell>
              ))}
              <TableCell className="text-right text-sm font-mono font-semibold whitespace-nowrap text-blue-700">{fmt(ledger.totals.paymentTotal)}</TableCell>
              <TableCell className="text-right text-sm font-mono font-semibold whitespace-nowrap text-red-600">{fmt(ledger.totals.deductionTotal)}</TableCell>
              <TableCell className="text-right text-sm font-mono font-bold whitespace-nowrap">{fmt(ledger.totals.netAmount)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  );
}
