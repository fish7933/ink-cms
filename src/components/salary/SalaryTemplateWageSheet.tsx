import { useEffect, useRef, useState } from 'react';
import type { SalaryTemplateWithItems, SalaryComponent } from '@/lib/salary-store';
import type { Rank } from '@/types/models';

const CURRENCY_SYMBOLS: Record<string, string> = { USD: '$', EUR: '€', KRW: '₩', JPY: '¥' };

// A4 세로 기준 여백(10mm) 제외 인쇄 가능 영역 (96dpi CSS px 환산)
const PAGE_WIDTH_PX = (210 - 20) * (96 / 25.4);
const PAGE_HEIGHT_PX = (297 - 20) * (96 / 25.4);

interface Props {
  template: SalaryTemplateWithItems;
  components: SalaryComponent[];
  ranks: Rank[];
}

// 급여 템플릿 급여표 — 인쇄 페이지와 인쇄 모달 양쪽에서 재사용되는 문서 본문
export default function SalaryTemplateWageSheet({ template: data, components, ranks }: Props) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [printZoom, setPrintZoom] = useState(1);

  useEffect(() => {
    // '--print-zoom'은 @media print 안에서만 적용되므로 화면 레이아웃(scrollWidth/Height)에는 영향이 없다
    const computeZoom = () => {
      const el = contentRef.current;
      if (!el) return;
      setPrintZoom(Math.min(1, PAGE_WIDTH_PX / el.scrollWidth, PAGE_HEIGHT_PX / el.scrollHeight));
    };
    computeZoom();
    window.addEventListener('beforeprint', computeZoom);
    return () => window.removeEventListener('beforeprint', computeZoom);
  }, [data, components, ranks]);

  const rankCodeOf = (rankName: string) => ranks.find(r => r.name === rankName)?.rank_code || rankName;
  const gradesForRank = (rank: string): string[] =>
    Array.from(new Set(data.items.filter(i => i.rank === rank && i.rank_grade).map(i => i.rank_grade as string))).sort();

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
    <div style={{ maxWidth: 1150, margin: '0 auto', fontFamily: "'Segoe UI', Pretendard, sans-serif", color: '#1a1a1a' }}>
      <style>{`
        @media print {
          body { margin: 0; }
          @page { size: A4 portrait; margin: 10mm; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print-content { zoom: var(--print-zoom, 1); }
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

      <div ref={contentRef} className="print-content" style={{ '--print-zoom': printZoom } as React.CSSProperties}>
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
              <th rowSpan={2} style={{ background: '#e0e7ff', color: '#3730a3' }}>직급</th>
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
    </div>
  );
}
