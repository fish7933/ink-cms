import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getCurrentUser } from '@/lib/store';
import { getPayslipDetail } from '@/services/employee-salary.service';
import { getCompanyInfo, type CompanyInfo } from '@/services/company-info.service';
import type { EmployeePayslipWithDetails, EmployeeSalaryItemCategory } from '@/types/employee-salary';

const CATEGORY_LABELS: Record<EmployeeSalaryItemCategory, string> = { base: '기본급', allowance: '수당', deduction: '공제' };
const fmt = (n: number) => n.toLocaleString('ko-KR');

// 사이드바/헤더/탭바 없이 순수 명세서만 렌더링되는 독립 인쇄 페이지 (App.tsx 최상위 라우트, Layout 우회).
// 별도 브라우저 탭에서 열려서, 인쇄하거나 닫아도 원래 작업 중이던 탭/화면에는 전혀 영향을 주지 않는다.
export default function EmployeePayslipPrintPage() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [payslip, setPayslip] = useState<EmployeePayslipWithDetails | null>(null);
  const [company, setCompany] = useState<CompanyInfo | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      const user = await getCurrentUser();
      if (!user) { setUnauthorized(true); setLoading(false); return; }
      const [detail, companyInfo] = await Promise.all([
        getPayslipDetail(id),
        getCompanyInfo().catch(() => null),
      ]);
      setPayslip(detail);
      setCompany(companyInfo);
      setLoading(false);
    };
    load();
  }, [id]);

  if (loading) return <div style={{ padding: 40, fontSize: 14, color: '#666' }}>불러오는 중...</div>;
  if (unauthorized) return <div style={{ padding: 40, fontSize: 14, color: '#666' }}>로그인이 필요합니다.</div>;
  if (!payslip) return <div style={{ padding: 40, fontSize: 14, color: '#666' }}>급여명세서를 찾을 수 없습니다.</div>;

  const base = payslip.items.filter(i => i.category === 'base');
  const allowance = payslip.items.filter(i => i.category === 'allowance');
  const deduction = payslip.items.filter(i => i.category === 'deduction');

  return (
    <div className="print-page-wrapper" style={{ padding: '28px 36px 48px' }}>
      <style>{`
        @media print {
          .print-actions { display: none !important; }
          .print-page-wrapper { padding: 0 !important; }
          body { margin: 0; }
          @page { size: A4 portrait; margin: 14mm 15mm; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        table.payslip-items { border-collapse: collapse; width: 100%; }
        table.payslip-items th, table.payslip-items td { border: 1px solid #999; padding: 7px 10px; font-size: 13px; }
        table.payslip-items th { background: #f5f5f5; font-weight: 600; text-align: left; }
        table.payslip-items td.amount { text-align: right; font-variant-numeric: tabular-nums; }
      `}</style>

      <div className="print-actions" style={{ marginBottom: 20, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={() => window.print()}
          style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, cursor: 'pointer' }}
        >
          인쇄 / PDF 저장
        </button>
      </div>

      <div style={{ maxWidth: 700, margin: '0 auto', fontFamily: "'Segoe UI', Pretendard, sans-serif", color: '#1a1a1a' }}>
        {company && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            {company.logo_url && <img src={company.logo_url} alt="" style={{ height: 40 }} />}
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{company.name}</div>
              <div style={{ fontSize: 10.5, color: '#666', marginTop: 2 }}>
                {[company.address, company.phone && `Tel. ${company.phone}`].filter(Boolean).join('  ·  ')}
              </div>
            </div>
          </div>
        )}

        <div style={{ margin: '10px 0 18px', borderBottom: '3px solid #1a1a1a' }} />

        <div style={{ fontSize: 18, fontWeight: 700, textAlign: 'center', margin: '10px 0 20px' }}>
          급여명세서 ({payslip.created_at.slice(0, 7)})
        </div>

        <table style={{ width: '100%', fontSize: 13, marginBottom: 18 }}>
          <tbody>
            <tr>
              <td style={{ padding: '3px 0' }}><b>성명</b>&nbsp;&nbsp;{payslip.employee_name}</td>
              <td style={{ padding: '3px 0', textAlign: 'right' }}><b>직급</b>&nbsp;&nbsp;{payslip.employee_position_name || '-'}</td>
            </tr>
            {payslip.payment_date && (
              <tr>
                <td style={{ padding: '3px 0' }} colSpan={2}><b>지급일</b>&nbsp;&nbsp;{payslip.payment_date}</td>
              </tr>
            )}
          </tbody>
        </table>

        <table className="payslip-items">
          <thead>
            <tr><th style={{ width: '20%' }}>구분</th><th>항목</th><th style={{ width: '30%', textAlign: 'right' }}>금액</th></tr>
          </thead>
          <tbody>
            {base.length === 0 && allowance.length === 0 ? (
              <tr><td colSpan={3} style={{ textAlign: 'center', color: '#999' }}>등록된 지급 항목이 없습니다.</td></tr>
            ) : (
              [...base, ...allowance].map(item => (
                <tr key={item.id}>
                  <td>{CATEGORY_LABELS[item.category]}</td>
                  <td>{item.name}</td>
                  <td className="amount">{fmt(item.amount)}</td>
                </tr>
              ))
            )}
            <tr>
              <td colSpan={2} style={{ fontWeight: 600, background: '#fafafa' }}>지급액 합계</td>
              <td className="amount" style={{ fontWeight: 600, background: '#fafafa' }}>{fmt(payslip.base_amount + payslip.total_allowance)}</td>
            </tr>
            {deduction.length === 0 ? (
              <tr><td colSpan={3} style={{ textAlign: 'center', color: '#999' }}>공제 항목 없음</td></tr>
            ) : (
              deduction.map(item => (
                <tr key={item.id}>
                  <td>{CATEGORY_LABELS[item.category]}</td>
                  <td>{item.name}</td>
                  <td className="amount" style={{ color: '#b91c1c' }}>-{fmt(item.amount)}</td>
                </tr>
              ))
            )}
            <tr>
              <td colSpan={2} style={{ fontWeight: 600, background: '#fafafa' }}>공제액 합계</td>
              <td className="amount" style={{ fontWeight: 600, background: '#fafafa', color: '#b91c1c' }}>-{fmt(payslip.total_deduction)}</td>
            </tr>
          </tbody>
        </table>

        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>실지급액</span>
          <span style={{ fontWeight: 700, fontSize: 17, fontVariantNumeric: 'tabular-nums' }}>{fmt(payslip.net_amount)} 원</span>
        </div>

        {payslip.memo && (
          <div style={{ marginTop: 16, fontSize: 12, color: '#555' }}><b>비고</b>&nbsp;&nbsp;{payslip.memo}</div>
        )}

        <div style={{ textAlign: 'center', marginTop: 48, fontSize: 15, fontWeight: 600 }}>
          {company?.name || ''}
        </div>
      </div>
    </div>
  );
}
