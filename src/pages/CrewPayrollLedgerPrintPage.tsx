import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getCurrentUser } from '@/lib/store';
import { crewPayrollService } from '@/services/crew-payroll.service';
import { getCompanyInfo, type CompanyInfo } from '@/services/company-info.service';
import CrewPayslipDetailView from '@/components/crew-payroll/CrewPayslipDetailView';
import type { CrewPayrollLedgerData, CrewPayslipWithDetails } from '@/types/crew-payroll';

const fmt = (n: number) => n.toLocaleString('en-US');
const fmtMD = (d: string) => d?.slice(5).replace('-', '/') || '';

// 선박별 급여대장(표 형태) + 승선 중인 선원 각자의 급여명세서를 이어붙인 인쇄 페이지 —
// 사이드바/헤더 없이 순수 문서만 렌더링(App.tsx 최상위 라우트, Layout 우회). 첫 페이지는
// 급여대장, 이후 선원별 급여명세서가 한 명당 한 페이지씩 이어진다.
export default function CrewPayrollLedgerPrintPage() {
  const { periodId } = useParams<{ periodId: string }>();
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [ledger, setLedger] = useState<CrewPayrollLedgerData | null>(null);
  const [payslips, setPayslips] = useState<CrewPayslipWithDetails[]>([]);
  const [company, setCompany] = useState<CompanyInfo | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!periodId) return;
      const user = await getCurrentUser();
      if (!user) { setUnauthorized(true); setLoading(false); return; }
      const [data, payslipData, companyInfo] = await Promise.all([
        crewPayrollService.getPayrollLedgerForPeriod(periodId),
        crewPayrollService.getPayslipsForPeriod(periodId),
        getCompanyInfo().catch(() => null),
      ]);
      setLedger(data);
      setPayslips(payslipData);
      setCompany(companyInfo);
      setLoading(false);
    };
    load();
  }, [periodId]);

  if (loading) return <div style={{ padding: 40, fontSize: 14, color: '#666' }}>Loading...</div>;
  if (unauthorized) return <div style={{ padding: 40, fontSize: 14, color: '#666' }}>Login required.</div>;
  if (!ledger) return <div style={{ padding: 40, fontSize: 14, color: '#666' }}>Payroll ledger not found.</div>;

  const { period, ship_name, owner_name, fleet_name, template_name, allowance_columns, deduction_columns, rows } = ledger;
  const totalGross = rows.reduce((s, r) => s + r.gross_amount, 0);
  const totalDeduction = rows.reduce((s, r) => s + r.total_deduction, 0);
  const totalNet = rows.reduce((s, r) => s + r.net_amount, 0);
  const totalByAllowance = (name: string) => rows.reduce((s, r) => s + (r.allowance_by_name[name] || 0), 0);
  const totalByDeduction = (name: string) => rows.reduce((s, r) => s + (r.deduction_by_name[name] || 0), 0);
  const titleParts = [owner_name, fleet_name, ship_name].filter(Boolean).join(' > ');

  return (
    <div className="print-page-wrapper" style={{ padding: '20px 24px', fontFamily: "'Malgun Gothic', 'Segoe UI', Pretendard, sans-serif", color: '#222' }}>
      <style>{`
        @media print {
          .print-actions { display: none !important; }
          .print-page-wrapper { padding: 0 !important; }
          body { margin: 0; }
          @page { size: A4 landscape; margin: 9mm; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        table.ledger { border-collapse: collapse; width: 100%; }
        table.ledger th, table.ledger td { border: 1px solid #ccc; padding: 4px 6px; font-size: 10px; white-space: nowrap; }
        table.ledger th { background: #fafafa; font-weight: 500; color: #444; text-align: center; }
        table.ledger td.amount { text-align: right; font-variant-numeric: tabular-nums; }
        table.ledger td.name { text-align: center; }
        table.ledger tr.total td { font-weight: 600; background: #f7f7f7; border-top: 2px solid #888; }
        table.ledger th.group-earnings { background: #eaf1fb; color: #1d4ed8; font-weight: 600; }
        table.ledger th.group-deductions { background: #fdeaea; color: #b91c1c; font-weight: 600; }
        table.ledger .section-divider { border-left: 2px solid #888; }
        .payslip-page { page-break-before: always; padding-top: 16px; max-width: 760px; margin: 0 auto; }
      `}</style>

      <div className="print-actions" style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={() => window.print()}
          style={{ padding: '7px 14px', background: '#fff', color: '#333', border: '1px solid #999', borderRadius: 4, fontSize: 12.5, cursor: 'pointer' }}
        >
          Print / Save PDF
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8, paddingBottom: 6, borderBottom: '2px solid #888' }}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{company?.name || ''}</div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: 1 }}>{titleParts} {period.year_month} Payroll Ledger</div>
        </div>
        <div style={{ fontSize: 10.5, color: '#777' }}>{rows.length} crew</div>
      </div>

      <table className="ledger">
        <thead>
          <tr>
            <th colSpan={5} style={{ background: '#fff', border: 'none' }} />
            <th colSpan={allowance_columns.length + 1} className="group-earnings section-divider">Earnings</th>
            <th colSpan={deduction_columns.length + 1} className="group-deductions section-divider">Deductions</th>
            <th style={{ background: '#fff', border: 'none' }} />
          </tr>
          <tr>
            <th>Rank</th>
            <th>Grade</th>
            <th>Name</th>
            <th>Pay Period</th>
            <th>Days</th>
            {allowance_columns.map((name, i) => <th key={name} className={i === 0 ? 'section-divider' : ''}>{name}</th>)}
            <th>GROSS</th>
            {deduction_columns.map((name, i) => <th key={name} className={i === 0 ? 'section-divider' : ''}>{name}</th>)}
            <th>DEDUCT</th>
            <th className="section-divider">Net Pay</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.crew_member_id}>
              <td className="name">{r.rank_code || '-'}</td>
              <td className="name">{r.rank_grade || '-'}</td>
              <td className="name">{r.crew_name}</td>
              <td className="name">{fmtMD(r.period_start_date)}~{fmtMD(r.period_end_date)}</td>
              <td className="name">{r.days_served}/{r.days_in_month}</td>
              {allowance_columns.map((name, i) => <td key={name} className={`amount ${i === 0 ? 'section-divider' : ''}`}>{fmt(r.allowance_by_name[name] || 0)}</td>)}
              <td className="amount">{fmt(r.gross_amount)}</td>
              {deduction_columns.map((name, i) => <td key={name} className={`amount ${i === 0 ? 'section-divider' : ''}`} style={{ color: '#a33' }}>{fmt(r.deduction_by_name[name] || 0)}</td>)}
              <td className="amount" style={{ color: '#a33' }}>{fmt(r.total_deduction)}</td>
              <td className="amount section-divider" style={{ fontWeight: 600 }}>{fmt(r.net_amount)}</td>
            </tr>
          ))}
          <tr className="total">
            <td colSpan={5} className="name">Total ({rows.length} crew)</td>
            {allowance_columns.map((name, i) => <td key={name} className={`amount ${i === 0 ? 'section-divider' : ''}`}>{fmt(totalByAllowance(name))}</td>)}
            <td className="amount">{fmt(totalGross)}</td>
            {deduction_columns.map((name, i) => <td key={name} className={`amount ${i === 0 ? 'section-divider' : ''}`} style={{ color: '#a33' }}>{fmt(totalByDeduction(name))}</td>)}
            <td className="amount" style={{ color: '#a33' }}>{fmt(totalDeduction)}</td>
            <td className="amount section-divider">{fmt(totalNet)}</td>
          </tr>
        </tbody>
      </table>
      {template_name && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: '#333', marginBottom: 4 }}>Salary Template Applied: {template_name}</div>
          {ledger.template_matrix && ledger.template_matrix.rows.length > 0 && (
            <table className="ledger">
              <thead>
                <tr>
                  <th>Rank</th>
                  {ledger.template_matrix.columns.map(c => <th key={c.component_id} style={{ color: c.is_deduction ? '#a33' : undefined }}>{c.name}</th>)}
                  <th>Total (TW)</th>
                  <th>Net (AW)</th>
                </tr>
              </thead>
              <tbody>
                {ledger.template_matrix.rows.map((r, idx) => (
                  <tr key={idx}>
                    <td className="name">{r.grade ? `${r.rank_code} (${r.grade})` : r.rank_code}</td>
                    {r.amounts.map((a, i) => <td key={i} className="amount">{a === null ? '-' : fmt(a)}</td>)}
                    <td className="amount" style={{ fontWeight: 600 }}>{fmt(r.total_earning)}</td>
                    <td className="amount" style={{ fontWeight: 600 }}>{fmt(r.net_earning)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {payslips.map(p => (
        <div key={p.id} className="payslip-page">
          <CrewPayslipDetailView payslip={p} shipName={ship_name} />
        </div>
      ))}
    </div>
  );
}
