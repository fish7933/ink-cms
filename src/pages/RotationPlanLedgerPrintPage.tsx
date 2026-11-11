import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import en from '@/i18n/locales/pages/RotationPlanLedgerPrintPage/en.json';
import { rotationService } from '@/services/rotation.service';
import { getPorts } from '@/services/port.service';
import { getCurrentUser } from '@/lib/store';
import type { CrewRotationPlanWithDetails } from '@/types/rotation';
import RotationPlanLedgerSheet from '@/components/rotation/RotationPlanLedgerSheet';
i18n.addResourceBundle('en', 'RotationPlanLedgerPrintPage', en, true, true);

// 사이드바/헤더/탭바 없이 순수 문서만 렌더링되는 독립 인쇄 페이지 (App.tsx 최상위 라우트, Layout 우회).
// ?months=2026-07,2026-08 (여러 달, 선주/선박 필터 무관 전체 선박) 또는
// ?ids=uuid1,uuid2 (교대계획 목록에서 직접 선택한 계획만) 둘 중 하나로 대상을 지정한다.
export default function RotationPlanLedgerPrintPage() {
  const { t } = useTranslation('RotationPlanLedgerPrintPage');
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [plans, setPlans] = useState<CrewRotationPlanWithDetails[]>([]);
  const [portLabelByPlanId, setPortLabelByPlanId] = useState<Map<string, string>>(new Map());
  const [periodLabel, setPeriodLabel] = useState('');

  useEffect(() => {
    const load = async () => {
      const user = await getCurrentUser();
      if (!user) { setUnauthorized(true); setLoading(false); return; }

      const monthsParam = searchParams.get('months');
      const idsParam = searchParams.get('ids');
      const [allPlans, ports] = await Promise.all([rotationService.getRotationPlans(), getPorts()]);
      const portMap = new Map(ports.map(p => [p.id, `${p.country_name} ${p.city_name}`]));

      let matched: CrewRotationPlanWithDetails[] = [];
      if (idsParam) {
        const idSet = new Set(idsParam.split(',').filter(Boolean));
        matched = allPlans.filter(p => idSet.has(p.id));
      } else if (monthsParam) {
        const monthSet = new Set(monthsParam.split(',').filter(Boolean));
        matched = allPlans.filter(p => monthSet.has(p.rotation_date.slice(0, 7)));
        const sortedMonths = [...monthSet].sort();
        // 선택된 달이 여러 개라도 하나하나 나열하지 않고 "시작월 ~ 종료월" 범위로만 표기한다.
        setPeriodLabel(sortedMonths.length > 1 ? `${sortedMonths[0]} ~ ${sortedMonths[sortedMonths.length - 1]}` : sortedMonths[0] || '');
      }

      setPlans(matched);
      setPortLabelByPlanId(new Map(matched.map(p => [p.id, p.port_id ? portMap.get(p.port_id) || '-' : '-'])));
      setLoading(false);
      document.title = 'Rotation Plan Ledger';
    };
    load();
  }, [searchParams]);

  if (loading) {
    return <div style={{ padding: 40, fontSize: 14, color: '#666' }}>{t('불러오는 중...')}</div>;
  }
  if (unauthorized) {
    return <div style={{ padding: 40, fontSize: 14, color: '#666' }}>{t('로그인이 필요합니다.')}</div>;
  }

  return (
    <div style={{ padding: '28px 36px 48px' }}>
      <style>{`
        @media print {
          .print-actions { display: none !important; }
        }
      `}</style>
      <div className="print-actions" style={{ marginBottom: 20, textAlign: 'right' }}>
        <button
          onClick={() => window.print()}
          style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, cursor: 'pointer' }}
        >
          {t('인쇄 / PDF 저장')}
        </button>
      </div>
      <RotationPlanLedgerSheet plans={plans} portLabelByPlanId={portLabelByPlanId} periodLabel={periodLabel} />
    </div>
  );
}
