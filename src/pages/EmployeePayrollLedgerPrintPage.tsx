import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getCurrentUser } from '@/lib/store';
import { getPayrollLedgerForPeriod } from '@/services/employee-salary.service';
import { getCompanyInfo, type CompanyInfo } from '@/services/company-info.service';
import type { PayrollLedgerData } from '@/types/employee-salary';

const fmt = (n: number) => n.toLocaleString('ko-KR');

// 회사 전체 직원의 급여대장(표 형태) 인쇄 페이지 — 사이드바/헤더 없이 순수 표만 렌더링
// (App.tsx 최상위 라우트, Layout 우회). 가로로 넓은 표라 A4 가로(landscape)로 인쇄한다.
export default function EmployeePayrollLedgerPrintPage() {
  const { periodId } = useParams<{ periodId: string }>();
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [ledger, setLedger] = useState<PayrollLedgerData | null>(null);
  const [company, setCompany] = useState<CompanyInfo | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!periodId) return;
      const user = await getCurrentUser();
      if (!user) { setUnauthorized(true); setLoading(false); return; }
      const [data, companyInfo] = await Promise.all([
        getPayrollLedgerForPeriod(periodId),
        getCompanyInfo().catch(() => null),
      ]);
      setLedger(data);
      setCompany(companyInfo);
      setLoading(false);
    };
    load();
  }, [periodId]);

  if (loading) return <div style={{ padding: 40, fontSize: 14, color: '#666' }}>불러오는 중...</div>;
  if (unauthorized) return <div style={{ padding: 40, fontSize: 14, color: '#666' }}>로그인이 필요합니다.</div>;
  if (!ledger) return <div style={{ padding: 40, fontSize: 14, color: '#666' }}>급여대장을 찾을 수 없습니다.</div>;

  const { period, allowance_columns, deduction_columns, rows } = ledger;
  const totalBase = rows.reduce((s, r) => s + r.base_amount, 0);
  const totalGross = rows.reduce((s, r) => s + r.gross_amount, 0);
  const totalDeduction = rows.reduce((s, r) => s + r.total_deduction, 0);
  const totalNet = rows.reduce((s, r) => s + r.net_amount, 0);
  const totalByAllowance = (name: string) => rows.reduce((s, r) => s + (r.allowance_by_name[name] || 0), 0);
  const totalByDeduction = (name: string) => rows.reduce((s, r) => s + (r.deduction_by_name[name] || 0), 0);

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
      `}</style>

      <div className="print-actions" style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={() => window.print()}
          style={{ padding: '7px 14px', background: '#fff', color: '#333', border: '1px solid #999', borderRadius: 4, fontSize: 12.5, cursor: 'pointer' }}
        >
          인쇄 / PDF 저장
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8, paddingBottom: 6, borderBottom: '2px solid #888' }}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{company?.name || ''}</div>
        <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: 1 }}>{period.year_month} 급여대장</div>
        <div style={{ fontSize: 10.5, color: '#777' }}>{rows.length}명</div>
      </div>

      <table className="ledger">
        <thead>
          <tr>
            <th>사번</th>
            <th>이름</th>
            <th>주민등록번호</th>
            <th>입사일</th>
            <th>기본급</th>
            {allowance_columns.map(name => <th key={name}>{name}</th>)}
            <th>합계</th>
            {deduction_columns.map(name => <th key={name}>{name}</th>)}
            <th>공제합계</th>
            <th>차인지급액</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.employee_id}>
              <td className="name">{i + 1}</td>
              <td className="name">{r.employee_name}</td>
              <td className="name">{r.resident_registration_number || '-'}</td>
              <td className="name">{r.hire_date || '-'}</td>
              <td className="amount">{fmt(r.base_amount)}</td>
              {allowance_columns.map(name => <td key={name} className="amount">{fmt(r.allowance_by_name[name] || 0)}</td>)}
              <td className="amount">{fmt(r.gross_amount)}</td>
              {deduction_columns.map(name => <td key={name} className="amount" style={{ color: '#a33' }}>{fmt(r.deduction_by_name[name] || 0)}</td>)}
              <td className="amount" style={{ color: '#a33' }}>{fmt(r.total_deduction)}</td>
              <td className="amount" style={{ fontWeight: 600 }}>{fmt(r.net_amount)}</td>
            </tr>
          ))}
          <tr className="total">
            <td colSpan={4} className="name">합계 ({rows.length}명)</td>
            <td className="amount">{fmt(totalBase)}</td>
            {allowance_columns.map(name => <td key={name} className="amount">{fmt(totalByAllowance(name))}</td>)}
            <td className="amount">{fmt(totalGross)}</td>
            {deduction_columns.map(name => <td key={name} className="amount" style={{ color: '#a33' }}>{fmt(totalByDeduction(name))}</td>)}
            <td className="amount" style={{ color: '#a33' }}>{fmt(totalDeduction)}</td>
            <td className="amount">{fmt(totalNet)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
