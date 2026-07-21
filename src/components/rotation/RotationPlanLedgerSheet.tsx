import { useEffect, useRef, useState } from 'react';
import type { CrewRotationPlanWithDetails } from '@/types/rotation';
import { buildRotationPlanLedgerRows } from '@/utils/rotation-plan-export';

const PAGE_WIDTH_PX = (297 - 20) * (96 / 25.4); // A4 가로 기준
const PAGE_HEIGHT_PX = (210 - 20) * (96 / 25.4);

interface Props {
  plans: CrewRotationPlanWithDetails[];
  portLabelByPlanId: Map<string, string>;
  // 기간을 지정해 조회한 경우에만 제목 아래 괄호로 표기 (선택 건수 등은 표기하지 않음)
  periodLabel?: string;
}

// 배승 계획 목록 — 번호/선주/선박/승선자/하선자/교대일/교대국가·도시/비고 표 형태.
// 같은 선박끼리는 선주/선박 셀을 rowSpan으로 병합한다. 엑셀 내보내기와 동일한 그룹 로직 재사용.
export default function RotationPlanLedgerSheet({ plans, portLabelByPlanId, periodLabel }: Props) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [printZoom, setPrintZoom] = useState(1);
  const rows = buildRotationPlanLedgerRows(plans, portLabelByPlanId);

  useEffect(() => {
    const computeZoom = () => {
      const el = contentRef.current;
      if (!el) return;
      setPrintZoom(Math.min(1, PAGE_WIDTH_PX / el.scrollWidth, PAGE_HEIGHT_PX / el.scrollHeight));
    };
    computeZoom();
    window.addEventListener('beforeprint', computeZoom);
    return () => window.removeEventListener('beforeprint', computeZoom);
  }, [plans]);

  return (
    <div style={{ maxWidth: 1150, margin: '0 auto', fontFamily: "'Segoe UI', Pretendard, sans-serif", color: '#1a1a1a' }}>
      <style>{`
        @media print {
          body { margin: 0; }
          @page { size: A4 landscape; margin: 10mm; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print-content { zoom: var(--print-zoom, 1); }
        }
        table.ledger-table { border-collapse: collapse; width: 100%; border: 2px solid #333; }
        table.ledger-table th, table.ledger-table td { border: 1px solid #ccc; padding: 7px 10px; font-size: 12px; }
        table.ledger-table thead th { text-align: center; font-weight: 700; font-size: 12px; background: #f3f4f6; color: #333; border-bottom: 2px solid #333; }
        table.ledger-table td.center { text-align: center; }
        table.ledger-table td.owner-ship { font-weight: 600; text-align: center; vertical-align: middle; background: #fafbfc; }
      `}</style>

      <div ref={contentRef} className="print-content" style={{ '--print-zoom': printZoom } as React.CSSProperties}>
        <div style={{ textAlign: 'center', marginBottom: 20, borderBottom: '3px solid #1a1a1a', paddingBottom: 14 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: 1 }}>CREW DISPATCH PLAN</h1>
          {periodLabel && <div style={{ fontSize: 13, color: '#666', marginTop: 6 }}>({periodLabel})</div>}
        </div>

        <table className="ledger-table">
          <colgroup>
            <col style={{ width: '5%' }} /><col style={{ width: '13%' }} /><col style={{ width: '13%' }} />
            <col style={{ width: '17%' }} /><col style={{ width: '17%' }} />
            <col style={{ width: '9%' }} /><col style={{ width: '13%' }} /><col style={{ width: '13%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>No.</th><th>Owner</th><th>Vessel</th><th>On-Signer</th><th>Off-Signer</th><th>Rotation Date</th><th>Port (Country/City)</th><th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24, color: '#bbb' }}>No matching rotation plans found.</td></tr>
            ) : rows.map((r, i) => (
              <tr key={i}>
                <td className="center">{r.no}</td>
                {r.ownerGroupStart && <td className="owner-ship" rowSpan={r.ownerGroupSize}>{r.ownerName}</td>}
                {r.shipGroupStart && <td className="owner-ship" rowSpan={r.shipGroupSize}>{r.shipName}</td>}
                <td>{r.boarding}</td>
                <td>{r.disembark}</td>
                {r.planGroupStart && <td className="center" rowSpan={r.planGroupSize}>{r.rotationDate}</td>}
                {r.planGroupStart && <td className="center" rowSpan={r.planGroupSize}>{r.portLabel}</td>}
                {r.planGroupStart && <td rowSpan={r.planGroupSize}>{r.notes}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
