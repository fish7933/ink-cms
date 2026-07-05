import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  getSalaryTemplateWithItems,
  getSalaryComponents,
  type SalaryTemplateWithItems,
  type SalaryComponent,
} from '@/lib/salary-store';
import { getRanks, getCurrentUser } from '@/lib/store';
import type { Rank } from '@/types/models';
import SalaryTemplateWageSheet from '@/components/salary/SalaryTemplateWageSheet';

// 사이드바/헤더/탭바 없이 순수 문서만 렌더링되는 독립 인쇄 페이지 (App.tsx 최상위 라우트, Layout 우회)
export default function SalaryTemplatePrintPage() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [data, setData] = useState<SalaryTemplateWithItems | null>(null);
  const [components, setComponents] = useState<SalaryComponent[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      const user = await getCurrentUser();
      if (!user) { setUnauthorized(true); setLoading(false); return; }
      const [full, comp, rnk] = await Promise.all([getSalaryTemplateWithItems(id), getSalaryComponents(), getRanks()]);
      setData(full);
      setComponents(comp);
      setRanks(rnk);
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
  if (!data) {
    return <div style={{ padding: 40, fontSize: 14, color: '#666' }}>템플릿을 찾을 수 없습니다.</div>;
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
      <SalaryTemplateWageSheet template={data} components={components} ranks={ranks} />
    </div>
  );
}
