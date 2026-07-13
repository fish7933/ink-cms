import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { rotationService } from '@/services/rotation.service';
import { getPorts } from '@/services/port.service';
import { getCurrentUser } from '@/lib/store';
import type { CrewRotationPlanWithDetails } from '@/types/rotation';
import RotationPlanDispatchSheet from '@/components/rotation/RotationPlanDispatchSheet';

// 사이드바/헤더/탭바 없이 순수 문서만 렌더링되는 독립 인쇄 페이지 (App.tsx 최상위 라우트, Layout 우회)
export default function RotationPlanPrintPage() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [plan, setPlan] = useState<CrewRotationPlanWithDetails | null>(null);
  const [portLabel, setPortLabel] = useState<string>('');

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      const user = await getCurrentUser();
      if (!user) { setUnauthorized(true); setLoading(false); return; }
      const [data, ports] = await Promise.all([rotationService.getRotationPlanById(id), getPorts()]);
      setPlan(data);
      if (data?.port_id) {
        const port = ports.find(p => p.id === data.port_id);
        if (port) setPortLabel(`${port.country_name} ${port.city_name}`);
      }
      setLoading(false);
    };
    load();
  }, [id]);

  if (loading) {
    return <div style={{ padding: 40, fontSize: 14, color: '#666' }}>불러오는 중...</div>;
  }
  if (unauthorized) {
    return <div style={{ padding: 40, fontSize: 14, color: '#666' }}>로그인이 필요합니다.</div>;
  }
  if (!plan) {
    return <div style={{ padding: 40, fontSize: 14, color: '#666' }}>교대 계획을 찾을 수 없습니다.</div>;
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
      <RotationPlanDispatchSheet plan={plan} portLabel={portLabel} />
    </div>
  );
}
