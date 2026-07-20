import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getCurrentUser } from '@/lib/store';
import { crewPayrollService } from '@/services/crew-payroll.service';
import { getCompanyInfo, type CompanyInfo } from '@/services/company-info.service';
import CrewPayslipDetailView from '@/components/crew-payroll/CrewPayslipDetailView';
import type { CrewPayslipWithDetails } from '@/types/crew-payroll';

// 사이드바/헤더/탭바 없이 순수 명세서만 렌더링되는 독립 인쇄 페이지 (App.tsx 최상위 라우트, Layout 우회).
export default function CrewPayslipPrintPage() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [payslip, setPayslip] = useState<(CrewPayslipWithDetails & { ship_name: string }) | null>(null);
  const [company, setCompany] = useState<CompanyInfo | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      const user = await getCurrentUser();
      if (!user) { setUnauthorized(true); setLoading(false); return; }
      const [detail, companyInfo] = await Promise.all([
        crewPayrollService.getPayslipById(id),
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
          @page { size: A4 portrait; margin: 9mm 11mm; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div className="print-actions" style={{ marginBottom: 20, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={() => window.print()}
          style={{ padding: '7px 14px', background: '#fff', color: '#333', border: '1px solid #999', borderRadius: 4, fontSize: 12.5, cursor: 'pointer' }}
        >
          인쇄 / PDF 저장
        </button>
      </div>

      <div style={{ maxWidth: 700, margin: '0 auto', fontFamily: "Pretendard, 'Segoe UI', sans-serif", color: '#222' }}>
        {company && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            {company.logo_url && <img src={company.logo_url} alt="" style={{ height: 28 }} />}
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: '#333' }}>{company.name}</div>
              <div style={{ fontSize: 9.5, color: '#999', marginTop: 1 }}>
                {[company.address, company.phone && `Tel. ${company.phone}`].filter(Boolean).join('  ·  ')}
              </div>
            </div>
          </div>
        )}

        <CrewPayslipDetailView payslip={payslip} shipName={payslip.ship_name} />

        <div style={{ textAlign: 'center', marginTop: 14, fontSize: 10, color: '#999' }}>
          {company?.name || ''}
        </div>
      </div>
    </div>
  );
}
