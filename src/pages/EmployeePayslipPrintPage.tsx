import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getCurrentUser } from '@/lib/store';
import { getPayslipDetail } from '@/services/employee-salary.service';
import { getCompanyInfo, type CompanyInfo } from '@/services/company-info.service';
import EmployeePayslipDetailView from '@/components/employee-salary/EmployeePayslipDetailView';
import type { EmployeePayslipWithDetails } from '@/types/employee-salary';

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

        <EmployeePayslipDetailView payslip={payslip} />

        <div style={{ textAlign: 'center', marginTop: 48, fontSize: 15, fontWeight: 600 }}>
          {company?.name || ''}
        </div>
      </div>
    </div>
  );
}
