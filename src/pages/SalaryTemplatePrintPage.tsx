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

const CURRENCY_SYMBOLS: Record<string, string> = { USD: '$', EUR: '€', KRW: '₩', JPY: '¥' };

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

  const rankCodeOf = (rankName: string) => ranks.find(r => r.name === rankName)?.rank_code || rankName;
  const gradesForRank = (rank: string): string[] =>
    data ? Array.from(new Set(data.items.filter(i => i.rank === rank && i.rank_grade).map(i => i.rank_grade as string))).sort() : [];

  if (loading) {
    return <div style={{ padding: 40, fontSize: 14, color: '#666' }}>불러오는 중...</div>;
  }
  if (unauthorized) {
    return <div style={{ padding: 40, fontSize: 14, color: '#666' }}>로그인이 필요합니다.</div>;
  }
  if (!data) {
    return <div style={{ padding: 40, fontSize: 14, color: '#666' }}>템플릿을 찾을 수 없습니다.</div>;
  }

  const symbol = CURRENCY_SYMBOLS[data.currency] || data.currency;
  const fmt = (n: number) => `${symbol} ${n.toLocaleString()}`;

  const earningIds = components
    .filter(c => (c.component_type ?? 'earning') === 'earning' && data.items.some(i => i.component_id === c.id))
    .map(c => c.id);
  const deductionIds = components
    .filter(c => c.component_type === 'deduction' && data.items.some(i => i.component_id === c.id))
    .map(c => c.id);
  const orderedComps = [...earningIds, ...deductionIds]
    .map(cid => components.find(c => c.id === cid))
    .filter((c): c is SalaryComponent => Boolean(c));

  return (
    <div style={{ maxWidth: 1150, margin: '0 auto', padding: '28px 36px 48px', fontFamily: "'Segoe UI', Pretendard, sans-serif", color: '#1a1a1a' }}>
      <style>{`
        @media print {
          .print-actions { display: none !important; }
          body { margin: 0; }
          @page { size: A4 landscape; margin: 10mm; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        table.wage-table { border-collapse: collapse; width: 100%; border: 2px solid #333; }
        table.wage-table th, table.wage-table td { border: 1px solid #ccc; padding: 8px 10px; font-size: 12.5px; }
        table.wage-table thead tr.group-row th { text-align: center; font-weight: 700; font-size: 12px; letter-spacing: 0.3px; padding: 7px 10px; }
        table.wage-table thead tr.col-row th { text-align: center; font-weight: 600; font-size: 12px; background: #fafafa; vertical-align: bottom; }
        table.wage-table th.group-earning { background: #dbeafe; color: #1e40af; }
        table.wage-table th.group-deduction { background: #fee2e2; color: #b91c1c; }
        table.wage-table th.group-result { background: #e5e7eb; color: #374151; }
        table.wage-table td.rank-cell { font-weight: 600; text-align: center; background: #fafafa; }
        table.wage-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
        table.wage-table td.num-deduction { color: #b91c1c; background: #fef2f2; }
        table.wage-table td.result-tw { font-weight: 700; background: #f3f4f6; }
        table.wage-table td.result-aw { font-weight: 700; color: #1e40af; background: #eff6ff; }
        table.wage-table col.divider { border-left: 2px solid #333; }
        table.wage-table th.divider-left, table.wage-table td.divider-left { border-left: 2px solid #333; }
        table.wage-table tbody tr:nth-child(even) td:not(.num-deduction):not(.result-tw):not(.result-aw) { background: #fbfbfb; }
      `}</style>

      <div className="print-actions" style={{ marginBottom: 20, textAlign: 'right' }}>
        <button
          onClick={() => window.print()}
          style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, cursor: 'pointer' }}
        >
          인쇄 / PDF 저장
        </button>
      </div>

      <div style={{ textAlign: 'center', marginBottom: 22, borderBottom: '3px solid #1a1a1a', paddingBottom: 14 }}>
        <div style={{ fontSize: 11, letterSpacing: 2, color: '#888', marginBottom: 6, textTransform: 'uppercase' }}>Wage Table</div>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: 0.5 }}>{data.name}</h1>
        <p style={{ fontSize: 13, color: '#555', marginTop: 8 }}>
          통화 {data.currency} ({symbol}) &nbsp;|&nbsp; 유효기간 {data.effective_from} ~ {data.effective_until || '현재'}
        </p>
      </div>

      <table className="wage-table">
        <thead>
          <tr className="group-row">
            <th rowSpan={2} style={{ background: '#1a1a1a', color: '#fff' }}>직급</th>
            {earningIds.length > 0 && <th className="group-earning" colSpan={earningIds.length}>급여 구성 항목</th>}
            {deductionIds.length > 0 && <th className="group-deduction divider-left" colSpan={deductionIds.length}>공제 항목</th>}
            <th className="group-result divider-left" colSpan={2}>계산 결과</th>
          </tr>
          <tr className="col-row">
            {orderedComps.map((comp, i) => (
              <th
                key={comp.id}
                style={comp.component_type === 'deduction' && orderedComps[i - 1]?.component_type !== 'deduction' ? { borderLeft: '2px solid #333' } : undefined}
              >
                {comp.name}
              </th>
            ))}
            <th style={{ borderLeft: '2px solid #333' }}>TW<div style={{ fontWeight: 400, fontSize: 10, color: '#666' }}>월 총액</div></th>
            <th>AW<div style={{ fontWeight: 400, fontSize: 10, color: '#666' }}>월 실지급액</div></th>
          </tr>
        </thead>
        <tbody>
          {data.ranks.flatMap(rank => {
            const grades = gradesForRank(rank);
            const gradeRows: (string | null)[] = grades.length ? grades : [null];
            return gradeRows.map(grade => {
              const findItem = (compId: string) =>
                data.items.find(i => i.rank === rank && i.component_id === compId && (i.rank_grade || null) === grade);
              const earningTotal = orderedComps.reduce((s, comp) => {
                if ((comp.component_type ?? 'earning') !== 'earning') return s;
                return s + (findItem(comp.id)?.amount || 0);
              }, 0);
              const deferred = orderedComps.reduce((s, comp) => {
                if ((comp.component_type ?? 'earning') !== 'earning' || comp.payment_type !== 'deferred') return s;
                return s + (findItem(comp.id)?.amount || 0);
              }, 0);
              const deduction = orderedComps.reduce((s, comp) => {
                if (comp.component_type !== 'deduction') return s;
                return s + (findItem(comp.id)?.amount || 0);
              }, 0);
              return (
                <tr key={`${rank}::${grade || '_'}`}>
                  <td className="rank-cell">{rankCodeOf(rank)}{grade ? ` (${grade})` : ''}</td>
                  {orderedComps.map((comp, i) => {
                    const isDeduction = comp.component_type === 'deduction';
                    const isFirstDeduction = isDeduction && orderedComps[i - 1]?.component_type !== 'deduction';
                    return (
                      <td
                        key={comp.id}
                        className={`num${isDeduction ? ' num-deduction' : ''}`}
                        style={isFirstDeduction ? { borderLeft: '2px solid #333' } : undefined}
                      >
                        {fmt(findItem(comp.id)?.amount || 0)}
                      </td>
                    );
                  })}
                  <td className="num result-tw" style={{ borderLeft: '2px solid #333' }}>{fmt(earningTotal)}</td>
                  <td className="num result-aw">{fmt(earningTotal - deferred - deduction)}</td>
                </tr>
              );
            });
          })}
        </tbody>
      </table>
    </div>
  );
}
