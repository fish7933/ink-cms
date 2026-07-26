import { Fragment, type ReactNode } from 'react';
import type { CrewPayslipWithDetails, CrewPayslipItem } from '@/types/crew-payroll';

const fmt = (n: number) => n.toLocaleString('en-US');
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

// Same fixed table format as the shore-staff payslip (EmployeePayslipDetailView) — a header
// row listing item names next to a group label (Base Pay/Allowance/Deduction), amounts below,
// laid out as a fixed 4-column grid.
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
                {row.map((item, j) => item ? <th key={item.id}>{item.name}{item.payment_method === 'owner_billed' ? ' (Owner Billed)' : ''}</th> : <th key={j} className="empty" />)}
              </tr>
              <tr>
                {row.map((item, j) => item ? (
                  <td key={item.id} className={negative ? 'neg' : ''}>{item.amount === 0 ? '0' : `${negative ? '-' : ''}${fmt(item.amount)}`}</td>
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
  const baseItems = payslip.items.filter(i => i.source === 'template' && i.category === 'earning' && i.payment_type !== 'deferred_accrual' && i.payment_type !== 'deferred_payout');
  const allowanceItems = payslip.items.filter(i => i.source === 'contract' && i.category === 'earning');
  const deductionItems = payslip.items.filter(i => i.category === 'deduction');
  // 하선월의 (Lump Sum)도 여기 함께 보여준다 — Total Earnings/Net Pay 계산에서는 빠지고
  // (급여와는 별도로 정산되므로), 참고용으로 이번달 적립분과 함께 안내만 한다.
  const deferredItems = payslip.items.filter(i => i.payment_type === 'deferred_accrual' || i.payment_type === 'deferred_payout');
  const paymentGroups: GridGroup[] = [
    ...(baseItems.length > 0 ? [{ key: 'base', label: 'Base Pay', items: baseItems }] : []),
    ...(allowanceItems.length > 0 ? [{ key: 'allowance', label: 'Allowance', items: allowanceItems }] : []),
  ];
  const ratio = payslip.days_in_month > 0 ? Math.round((payslip.days_served / payslip.days_in_month) * 1000) / 10 : 0;

  // 급여 구성항목/수당유형 약어(BW/OT/OA/LP 등) 설명을 한 줄짜리 각주로 — 최대한 자리를
  // 안 차지하게, (Accrued)/(Lump Sum) 같은 접미사는 뭉쳐서 항목당 한 번만 보여준다.
  const legendEntries: [string, string][] = [];
  const seenLegend = new Set<string>();
  for (const item of payslip.items) {
    if (!item.description) continue;
    const baseName = item.name.replace(/\s*\([^)]*\)\s*$/, '');
    if (seenLegend.has(baseName)) continue;
    seenLegend.add(baseName);
    legendEntries.push([baseName, item.description]);
  }

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
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: 2 }}>C R E W   P A Y S L I P</div>
          <div style={{ fontSize: 10.5, color: '#777', marginTop: 2 }}>{payslip.period_year_month || payslip.created_at.slice(0, 7)}</div>
        </div>
      )}

      <div style={{ border: '1px solid #999', padding: '6px 12px', marginBottom: 10, fontSize: 11 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1.5px 0' }}>
          <span><span style={{ color: '#777' }}>Rank</span>&nbsp;&nbsp;{payslip.rank_code || payslip.rank_name}{payslip.rank_grade ? `(${payslip.rank_grade})` : ''}</span>
          <span><span style={{ color: '#777' }}>Name</span>&nbsp;&nbsp;{payslip.crew_name}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1.5px 0' }}>
          <span><span style={{ color: '#777' }}>Vessel</span>&nbsp;&nbsp;{shipName || '-'}</span>
          <span><span style={{ color: '#777' }}>Nationality</span>&nbsp;&nbsp;{payslip.nationality || '-'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1.5px 0' }}>
          <span><span style={{ color: '#777' }}>Pay Period</span>&nbsp;&nbsp;{payslip.period_start_date} ~ {payslip.period_end_date}</span>
          <span><span style={{ color: '#777' }}>Days Served</span>&nbsp;&nbsp;{payslip.days_served} / {payslip.days_in_month} days ({ratio}%)</span>
        </div>
      </div>

      <div style={{ fontSize: 11, fontWeight: 600, margin: '0 0 4px', color: '#333' }}>Earnings</div>
      {paymentGroups.length === 0 ? (
        <p style={{ fontSize: 10.5, color: '#999', textAlign: 'center', padding: '4px 0' }}>No earning items.</p>
      ) : (
        <BorderedTable><PayGridTable groups={paymentGroups} totalLabel="Total Earnings" totalValue={payslip.base_amount + payslip.total_allowance} /></BorderedTable>
      )}

      <div style={{ fontSize: 11, fontWeight: 600, margin: '10px 0 4px', color: '#333' }}>Deductions</div>
      {deductionItems.length === 0 ? (
        <p style={{ fontSize: 10.5, color: '#999', textAlign: 'center', padding: '4px 0' }}>No deduction items.</p>
      ) : (
        <BorderedTable><PayGridTable groups={[{ key: 'deduction', label: 'Deduction', items: deductionItems }]} negative totalLabel="Total Deductions" totalValue={payslip.total_deduction} /></BorderedTable>
      )}

      {legendEntries.length > 0 && (
        <div style={{ marginTop: 4, fontSize: 8.5, color: '#999', lineHeight: 1.4 }}>
          {legendEntries.map(([name, desc]) => `${name}: ${desc}`).join('  ·  ')}
        </div>
      )}

      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 12px', border: '1px solid #999', borderTop: '2px solid #888', background: '#f7f7f7' }}>
        <span style={{ fontWeight: 600, fontSize: 11.5 }}>Net Pay</span>
        <span style={{ fontWeight: 700, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{fmt(payslip.net_amount)} {payslip.currency}</span>
      </div>

      {deferredItems.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, margin: '0 0 4px', color: '#333' }}>Deferred Pay (Settled Separately, Not Included in Net Pay)</div>
          <div style={{ border: '1px solid #d9c58a', background: '#fffbea' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
              <thead>
                <tr style={{ background: '#f5edd0' }}>
                  <th style={{ textAlign: 'left', padding: '3px 8px', fontWeight: 600, color: '#7a6110' }}>Item</th>
                  <th style={{ textAlign: 'right', padding: '3px 8px', fontWeight: 600, color: '#7a6110' }}>Accrued This Month</th>
                  <th style={{ textAlign: 'right', padding: '3px 8px', fontWeight: 600, color: '#7a6110' }}>Total Accrued to Date</th>
                </tr>
              </thead>
              <tbody>
                {deferredItems.map(item => (
                  <tr key={item.id}>
                    <td style={{ padding: '3px 8px', borderTop: '1px solid #e6dba8' }}>{item.name}</td>
                    <td style={{ padding: '3px 8px', textAlign: 'right', borderTop: '1px solid #e6dba8', fontVariantNumeric: 'tabular-nums' }}>{item.payment_type === 'deferred_payout' ? '-' : fmt(item.amount)}</td>
                    <td style={{ padding: '3px 8px', textAlign: 'right', borderTop: '1px solid #e6dba8', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmt(item.accrued_to_date ?? item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div style={{ marginTop: 10, fontSize: 9.5, color: '#666', lineHeight: 1.55, border: '1px solid #ddd', padding: '6px 12px' }}>
        <div style={{ fontWeight: 600, color: '#333', marginBottom: 1 }}>Calculation Notes</div>
        <div>Base pay, allowances and deductions are pro-rated based on the vessel&apos;s salary template and the crew member&apos;s contract terms, for the actual period served this month ({payslip.period_start_date} ~ {payslip.period_end_date}, {payslip.days_served}/{payslip.days_in_month} days).</div>
        <div>Allowances marked &quot;(Owner Billed)&quot; are billed separately to the shipowner rather than paid by the vessel/company, and are excluded from Net Pay.</div>
        {deferredItems.length > 0 && (
          <div>Deferred (leave-type) pay items accrue monthly but are withheld from Net Pay every month (see &quot;Deferred Pay&quot; above) and settled separately from regular salary, not as part of this payslip.</div>
        )}
      </div>

      {payslip.memo && (
        <div style={{ marginTop: 8, fontSize: 10.5, color: '#555' }}><span style={{ color: '#777' }}>Remarks</span>&nbsp;&nbsp;{payslip.memo}</div>
      )}

      <div style={{ marginTop: 28, display: 'flex', justifyContent: 'flex-end', gap: 32, fontSize: 10.5 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ borderBottom: '1px solid #999', width: 160, height: 22 }} />
          <div style={{ color: '#777', marginTop: 3 }}>Crew Signature</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ borderBottom: '1px solid #999', width: 100, height: 22 }} />
          <div style={{ color: '#777', marginTop: 3 }}>Date</div>
        </div>
      </div>
    </div>
  );
}
