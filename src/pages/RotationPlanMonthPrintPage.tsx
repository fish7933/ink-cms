import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { rotationService } from '@/services/rotation.service';
import { getPorts } from '@/services/port.service';
import { getCurrentUser } from '@/lib/store';
import type { CrewRotationPlanWithDetails } from '@/types/rotation';
import RotationPlanDispatchSheet from '@/components/rotation/RotationPlanDispatchSheet';

// 사이드바/헤더/탭바 없이 순수 문서만 렌더링되는 독립 인쇄 페이지 (App.tsx 최상위 라우트, Layout 우회)
// 선박/선주 필터와 무관하게 지정한 월(YYYY-MM)에 교대일이 속한 모든 선박의 배승계획서를 이어서 출력한다.
export default function RotationPlanMonthPrintPage() {
  const { month } = useParams<{ month: string }>();
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [plans, setPlans] = useState<CrewRotationPlanWithDetails[]>([]);
  const [portLabelById, setPortLabelById] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const load = async () => {
      if (!month) return;
      const user = await getCurrentUser();
      if (!user) { setUnauthorized(true); setLoading(false); return; }
      const [allPlans, ports] = await Promise.all([rotationService.getRotationPlans(), getPorts()]);
      const matched = allPlans
        .filter(p => p.rotation_date.slice(0, 7) === month)
        .sort((a, b) => a.ship_name.localeCompare(b.ship_name));
      setPlans(matched);
      setPortLabelById(new Map(ports.map(p => [p.id, `${p.country_name} ${p.city_name}`])));
      setLoading(false);
    };
    load();
  }, [month]);

  if (loading) {
    return <div style={{ padding: 40, fontSize: 14, color: '#666' }}>불러오는 중...</div>;
  }
  if (unauthorized) {
    return <div style={{ padding: 40, fontSize: 14, color: '#666' }}>로그인이 필요합니다.</div>;
  }
  if (plans.length === 0) {
    return <div style={{ padding: 40, fontSize: 14, color: '#666' }}>{month} 교대일에 해당하는 교대 계획이 없습니다.</div>;
  }

  return (
    <div style={{ padding: '28px 36px 48px' }}>
      <style>{`
        @media print {
          .print-actions { display: none !important; }
          .plan-sheet { page-break-after: always; }
          .plan-sheet:last-child { page-break-after: auto; }
        }
      `}</style>
      <div className="print-actions" style={{ marginBottom: 20, textAlign: 'right' }}>
        <button
          onClick={() => window.print()}
          style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, cursor: 'pointer' }}
        >
          인쇄 / PDF 저장 ({plans.length}건)
        </button>
      </div>
      {plans.map(plan => (
        <div key={plan.id} className="plan-sheet" style={{ marginBottom: 40 }}>
          <RotationPlanDispatchSheet plan={plan} portLabel={plan.port_id ? portLabelById.get(plan.port_id) : undefined} />
        </div>
      ))}
    </div>
  );
}
