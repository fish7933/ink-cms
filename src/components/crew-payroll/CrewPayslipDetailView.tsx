import { Fragment, type ReactNode } from 'react';
import type { CrewPayslipWithDetails, CrewPayslipItem } from '@/types/crew-payroll';

const fmt = (n: number) => n.toLocaleString('ko-KR');
const ITEM_COLS = 4;

function chunkPad<T>(arr: T[], size: number): (T | null)[][] {
  const rows: (T | null)[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    const slice: (T | null)[] = arr.slice(i, i + size);
    while (slice.length < size) slice.push(null);
    rows.push(slice);
  }
  return rows;
}

interface GridGroup { key: string; label: string; items: CrewPayslipItem[] }

// 직원 급여명세서(EmployeePayslipDetailView)와 같은 표 형태의 정형화된 서식 — 구분(기본급/
// 수당/공제) 라벨 옆에 항목명을 가로로 나열한 헤더 행, 그 아래 금액 행으로 된 4열 고정 그리드.
function PayGridTable({ groups, negative, totalLabel, totalValue }: { groups: GridGroup[]; negative?: boolean; totalLabel: string; totalValue: number }) {
  return (
    <table className="paygrid">
      <tbody>
        {groups.flatMap(group => {
          const rows = chunkPad(group.items, ITEM_COLS);
          return rows.map((row, i) => (
            <Fragment key={`${group.key}-${i}`}>
              <tr>
                {i === 0 && <th className="group-label" rowSpan={rows.length * 2}>{group.label}</th>}
                {row.map((item, j) => item ? <th key={item.id}>{item.name}{item.payment_method === 'owner_billed' ? ' (선주청구)' : ''}</th> : <th key={j} className="empty" />)}
              </tr>
              <tr>
                {row.map((item, j) => item ? (
                  <td key={item.id} className={negative ? 'neg' : ''}>{item.amount === 0 ? '-' : `${negative ? '-' : ''}${fmt(item.amount)}`}</td>
                ) : <td key={j} className="empty" />)}
              </tr>
            </Fragment>
          ));
        })}
        <tr className="total-row">
          <td colSpan={ITEM_COLS + 1}>
            <div className="total-line"><span>{totalLabel}</span><span>{negative ? '-' : ''}{fmt(totalValue)}</span></div>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function BorderedTable({ children }: { children: ReactNode }) {
  return <div style={{ border: '1px solid #999' }}>{children}</div>;
}

interface Props {
  payslip: CrewPayslipWithDetails;
  shipName?: string;
  showTitle?: boolean;
}

export default function CrewPayslipDetailView({ payslip, shipName, showTitle = true }: Props) {
  const baseItems = payslip.items.filter(i => i.source === 'template' && i.category === 'earning');
  const allowanceItems = payslip.items.filter(i => i.source === 'contract' && i.category === 'earning');
  const deductionItems = payslip.items.filter(i => i.category === 'deduction');
  const paymentGroups: GridGroup[] = [
    ...(baseItems.length > 0 ? [{ key: 'base', label: '기본급', items: baseItems }] : []),
    ...(allowanceItems.length > 0 ? [{ key: 'allowance', label: '수당', items: allowanceItems }] : []),
  ];
  const ratio = payslip.days_in_month > 0 ? Math.round((payslip.days_served / payslip.days_in_month) * 1000) / 10 : 0;

  return (
    <div style={{ fontFamily: "Pretendard, 'Segoe UI', sans-serif", color: '#222' }}>
      <style>{`
        table.paygrid { border-collapse: collapse; width: 100%; table-layout: fixed; }
        table.paygrid th, table.paygrid td { border: 1px solid #ccc; padding: 3px 4px; font-size: 10px; line-height: 1.3; text-align: center; }
        table.paygrid th { font-weight: 500; color: #444; background: #fafafa; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        table.paygrid th.group-label { width: 50px; color: #222; font-weight: 600; background: #f0f0f0; }
        table.paygrid td { font-variant-numeric: tabular-nums; color: #222; }
        table.paygrid td.neg { color: #a33; }
        table.paygrid th.empty, table.paygrid td.empty { background: #fdfdfd; border-color: #e5e5e5; }
        table.paygrid tr.total-row td { background: #f7f7f7; border-color: #999; border-top: 2px solid #888; padding: 0; }
        table.paygrid .total-line { display: flex; justify-content: space-between; padding: 4px 12px; font-weight: 600; font-size: 10.5px; }
      `}</style>

      {showTitle && (
        <div style={{ textAlign: 'center', margin: '0 0 12px' }}>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: 2 }}>선 원 급 여 명 세 서</div>
          <div style={{ fontSize: 10.5, color: '#777', marginTop: 2 }}>{payslip.period_year_month || payslip.created_at.slice(0, 7)}</div>
        </div>
      )}

      <div style={{ border: '1px solid #999', padding: '6px 12px', marginBottom: 10, fontSize: 11 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1.5px 0' }}>
          <span><span style={{ color: '#777' }}>성명</span>&nbsp;&nbsp;{payslip.crew_name}</span>
          <span><span style={{ color: '#777' }}>직급</span>&nbsp;&nbsp;{payslip.rank_code || payslip.rank_name}{payslip.rank_grade ? `(${payslip.rank_grade})` : ''}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1.5px 0' }}>
          <span><span style={{ color: '#777' }}>선박</span>&nbsp;&nbsp;{shipName || '-'}</span>
          <span><span style={{ color: '#777' }}>국적</span>&nbsp;&nbsp;{payslip.nationality || '-'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1.5px 0' }}>
          <span><span style={{ color: '#777' }}>급여 계산기간</span>&nbsp;&nbsp;{payslip.period_start_date} ~ {payslip.period_end_date}</span>
          <span><span style={{ color: '#777' }}>근무일수</span>&nbsp;&nbsp;{payslip.days_served}일 / {payslip.days_in_month}일 ({ratio}%)</span>
        </div>
      </div>

      <div style={{ fontSize: 11, fontWeight: 600, margin: '0 0 4px', color: '#333' }}>지급내역</div>
      {paymentGroups.length === 0 ? (
        <p style={{ fontSize: 10.5, color: '#999', textAlign: 'center', padding: '4px 0' }}>등록된 지급 항목이 없습니다.</p>
      ) : (
        <BorderedTable><PayGridTable groups={paymentGroups} totalLabel="지급액 합계" totalValue={payslip.base_amount + payslip.total_allowance} /></BorderedTable>
      )}

      <div style={{ fontSize: 11, fontWeight: 600, margin: '10px 0 4px', color: '#333' }}>공제내역</div>
      {deductionItems.length === 0 ? (
        <p style={{ fontSize: 10.5, color: '#999', textAlign: 'center', padding: '4px 0' }}>공제 항목 없음</p>
      ) : (
        <BorderedTable><PayGridTable groups={[{ key: 'deduction', label: '공제', items: deductionItems }]} negative totalLabel="공제액 합계" totalValue={payslip.total_deduction} /></BorderedTable>
      )}

      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 12px', border: '1px solid #999', borderTop: '2px solid #888', background: '#f7f7f7' }}>
        <span style={{ fontWeight: 600, fontSize: 11.5 }}>실지급액</span>
        <span style={{ fontWeight: 700, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{fmt(payslip.net_amount)} {payslip.currency}</span>
      </div>

      <div style={{ marginTop: 10, fontSize: 9.5, color: '#666', lineHeight: 1.55, border: '1px solid #ddd', padding: '6px 12px' }}>
        <div style={{ fontWeight: 600, color: '#333', marginBottom: 1 }}>계산방법</div>
        <div>기본급/수당/공제는 선박에 배정된 급여 템플릿과 선원 계약 조건을 기준으로, 이 달의 실제 근무기간({payslip.period_start_date} ~ {payslip.period_end_date}, {payslip.days_served}/{payslip.days_in_month}일)에 맞춰 일할계산되었습니다.</div>
        <div>"(선주청구)" 표시된 수당은 본선/회사가 지급하는 금액이 아니라 선주에게 별도로 청구되는 금액이라 실지급액 합계에서는 제외되었습니다.</div>
      </div>

      {payslip.memo && (
        <div style={{ marginTop: 8, fontSize: 10.5, color: '#555' }}><span style={{ color: '#777' }}>비고</span>&nbsp;&nbsp;{payslip.memo}</div>
      )}
    </div>
  );
}
