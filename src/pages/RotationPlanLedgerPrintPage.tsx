import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { rotationService } from '@/services/rotation.service';
import { getPorts } from '@/services/port.service';
import { getCurrentUser } from '@/lib/store';
import type { CrewRotationPlanWithDetails } from '@/types/rotation';
import RotationPlanLedgerSheet from '@/components/rotation/RotationPlanLedgerSheet';

// 사이드바/헤더/탭바 없이 순수 문서만 렌더링되는 독립 인쇄 페이지 (App.tsx 최상위 라우트, Layout 우회).
// ?months=2026-07,2026-08 (여러 달, 선주/선박 필터 무관 전체 선박) 또는
// ?ids=uuid1,uuid2 (교대계획 목록에서 직접 선택한 계획만) 둘 중 하나로 대상을 지정한다.
export default function RotationPlanLedgerPrintPage() {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [plans, setPlans] = useState<CrewRotationPlanWithDetails[]>([]);
  const [portLabelByPlanId, setPortLabelByPlanId] = useState<Map<string, string>>(new Map());
  const [title, setTitle] = useState('배승 계획 목록');

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
        setTitle(`배승 계획 목록 (선택 ${matched.length}건)`);
      } else if (monthsParam) {
        const monthSet = new Set(monthsParam.split(',').filter(Boolean));
        matched = allPlans.filter(p => monthSet.has(p.rotation_date.slice(0, 7)));
        const sortedMonths = [...monthSet].sort();
        setTitle(`배승 계획 목록 (${sortedMonths.join(', ')})`);
      }

      setPlans(matched);
      setPortLabelByPlanId(new Map(matched.map(p => [p.id, p.port_id ? portMap.get(p.port_id) || '-' : '-'])));
      setLoading(false);
    };
    load();
  }, [searchParams]);

  if (loading) {
    return <div style={{ padding: 40, fontSize: 14, color: '#666' }}>불러오는 중...</div>;
  }
  if (unauthorized) {
    return <div style={{ padding: 40, fontSize: 14, color: '#666' }}>로그인이 필요합니다.</div>;
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
          인쇄 / PDF 저장
        </button>
      </div>
      <RotationPlanLedgerSheet plans={plans} portLabelByPlanId={portLabelByPlanId} title={title} />
    </div>
  );
}
