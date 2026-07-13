import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { CrewRotationPlanWithDetails } from '@/types/rotation';

// A4 세로 기준 여백(10mm) 제외 인쇄 가능 영역 (96dpi CSS px 환산)
const PAGE_WIDTH_PX = (210 - 20) * (96 / 25.4);
const PAGE_HEIGHT_PX = (297 - 20) * (96 / 25.4);

interface Props {
  plan: CrewRotationPlanWithDetails & { creator_name?: string };
  portLabel?: string;
}

const fmtDate = (d?: string | null) => (d ? format(new Date(d), 'yyyy-MM-dd', { locale: ko }) : '-');

// 배승계획서 — 인쇄 페이지와 엑셀 내보내기 미리보기 양쪽에서 재사용되는 문서 본문.
// 좌측 승선자(신규 배승) / 우측 하선자(교대 대상) 구성으로 한 행에 한 쌍씩 보여준다.
export default function RotationPlanDispatchSheet({ plan, portLabel }: Props) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [printZoom, setPrintZoom] = useState(1);

  useEffect(() => {
    const computeZoom = () => {
      const el = contentRef.current;
      if (!el) return;
      setPrintZoom(Math.min(1, PAGE_WIDTH_PX / el.scrollWidth, PAGE_HEIGHT_PX / el.scrollHeight));
    };
    computeZoom();
    window.addEventListener('beforeprint', computeZoom);
    return () => window.removeEventListener('beforeprint', computeZoom);
  }, [plan]);

  return (
    <div style={{ maxWidth: 1150, margin: '0 auto', fontFamily: "'Segoe UI', Pretendard, sans-serif", color: '#1a1a1a' }}>
      <style>{`
        @media print {
          body { margin: 0; }
          @page { size: A4 landscape; margin: 10mm; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print-content { zoom: var(--print-zoom, 1); }
        }
        table.dispatch-table { border-collapse: collapse; width: 100%; border: 2px solid #333; }
        table.dispatch-table th, table.dispatch-table td { border: 1px solid #ccc; padding: 8px 10px; font-size: 12.5px; }
        table.dispatch-table thead tr.group-row th { text-align: center; font-weight: 700; font-size: 13px; letter-spacing: 0.3px; padding: 8px 10px; }
        table.dispatch-table thead tr.col-row th { text-align: center; font-weight: 600; font-size: 11.5px; background: #fafafa; }
        table.dispatch-table th.group-board { background: #d1fae5; color: #065f46; }
        table.dispatch-table th.group-disembark { background: #ffedd5; color: #9a3412; }
        table.dispatch-table td.name-cell { font-weight: 600; }
        table.dispatch-table td.center { text-align: center; }
        table.dispatch-table col.divider { border-left: 2px solid #333; }
        table.dispatch-table th.divider-left, table.dispatch-table td.divider-left { border-left: 2px solid #333; }
        table.dispatch-table tbody tr:nth-child(even) td { background: #fbfbfb; }
        table.dispatch-table td.empty { color: #bbb; text-align: center; }
      `}</style>

      <div ref={contentRef} className="print-content" style={{ '--print-zoom': printZoom } as React.CSSProperties}>
        <div style={{ textAlign: 'center', marginBottom: 20, borderBottom: '3px solid #1a1a1a', paddingBottom: 14 }}>
          <div style={{ fontSize: 11, letterSpacing: 3, color: '#888', marginBottom: 6, textTransform: 'uppercase' }}>Crew Dispatch Plan</div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: 1 }}>배승계획서</h1>
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px 20px',
          marginBottom: 20, padding: '14px 18px', background: '#f8f9fb', borderRadius: 8, fontSize: 13,
        }}>
          <div><span style={{ color: '#888' }}>계획명</span><div style={{ fontWeight: 600 }}>{plan.plan_name}</div></div>
          <div><span style={{ color: '#888' }}>선박</span><div style={{ fontWeight: 600 }}>{plan.ship_name}</div></div>
          <div><span style={{ color: '#888' }}>선주 / 플릿</span><div style={{ fontWeight: 600 }}>{plan.owner_name}{plan.fleet_name ? ` / ${plan.fleet_name}` : ''}</div></div>
          <div><span style={{ color: '#888' }}>교대일</span><div style={{ fontWeight: 600 }}>{fmtDate(plan.rotation_date)}</div></div>
          <div><span style={{ color: '#888' }}>기준 교대일</span><div style={{ fontWeight: 600 }}>{plan.base_departure_date ? fmtDate(plan.base_departure_date) : '-'}</div></div>
          <div><span style={{ color: '#888' }}>교대 항구</span><div style={{ fontWeight: 600 }}>{portLabel || '-'}</div></div>
          <div><span style={{ color: '#888' }}>작성자</span><div style={{ fontWeight: 600 }}>{plan.creator_name || '-'}</div></div>
          <div><span style={{ color: '#888' }}>작성일</span><div style={{ fontWeight: 600 }}>{format(new Date(plan.created_at), 'yyyy-MM-dd', { locale: ko })}</div></div>
        </div>

        <table className="dispatch-table">
          <colgroup>
            <col style={{ width: '4%' }} />
            <col style={{ width: '9%' }} /><col style={{ width: '13%' }} /><col style={{ width: '11%' }} /><col style={{ width: '11%' }} />
            <col className="divider" style={{ width: '9%' }} /><col style={{ width: '13%' }} /><col style={{ width: '11%' }} /><col style={{ width: '11%' }} />
          </colgroup>
          <thead>
            <tr className="group-row">
              <th></th>
              <th className="group-board" colSpan={4}>신규 승선 (IN)</th>
              <th className="group-disembark divider-left" colSpan={4}>기존 하선 (OUT)</th>
            </tr>
            <tr className="col-row">
              <th>No.</th>
              <th>직급</th><th>성명</th><th>출국일</th><th>승선일</th>
              <th className="divider-left">직급</th><th>성명</th><th>하선일</th><th>귀국일</th>
            </tr>
          </thead>
          <tbody>
            {plan.assignments.length === 0 ? (
              <tr><td colSpan={9} className="empty" style={{ padding: 24 }}>배정된 선원이 없습니다</td></tr>
            ) : plan.assignments.map((a, i) => (
              <tr key={a.id}>
                <td className="center">{i + 1}</td>
                {a.on_crew_id ? (
                  <>
                    <td className="center">{a.on_rank_code}{a.on_rank_grade ? `(${a.on_rank_grade})` : ''}</td>
                    <td className="name-cell">{a.on_crew_name}</td>
                    <td className="center">{fmtDate(a.on_departure_date)}</td>
                    <td className="center">{fmtDate(a.embark_date)}</td>
                  </>
                ) : (
                  <td className="empty divider-left-none" colSpan={4}>승선 없음</td>
                )}
                {a.off_crew_id ? (
                  <>
                    <td className="center divider-left">{a.off_rank_code}{a.off_rank_grade ? `(${a.off_rank_grade})` : ''}</td>
                    <td className="name-cell">{a.off_crew_name}</td>
                    <td className="center">{fmtDate(a.off_disembark_date)}</td>
                    <td className="center">{fmtDate(a.off_return_date)}</td>
                  </>
                ) : (
                  <td className="empty divider-left" colSpan={4}>하선 없음</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {plan.notes && (
          <div style={{ marginTop: 16, fontSize: 12.5, color: '#444' }}>
            <span style={{ color: '#888' }}>비고: </span>{plan.notes}
          </div>
        )}
      </div>
    </div>
  );
}
