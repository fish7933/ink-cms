import { Fragment, type ReactNode } from 'react';
import { groupPayslipItems, isDeductionGroup } from '@/lib/employee-payslip-groups';
import type { EmployeePayslipWithDetails } from '@/types/employee-salary';

const fmt = (n: number) => n.toLocaleString('ko-KR');

// 회사 실제 급여명세서 양식(첨부 PDF)의 지급/공제 항목 외 나머지 섹션 — 근태와 계산방법.
// 소정근로시간 209H는 (주 40시간 + 주휴 8시간) 기준 월 평균 고정값이라 회사 규정상 항상
// 동일하다. 나머지 근태 항목(연장/휴일/야간 등)은 이 시스템에 근태 추적 기능이 없어 실측치를
// 낼 수 없으므로 0.00H로 표기한다 — 급여명세서 "양식"만은 그대로 보여주기 위한 고정값.
const STANDARD_MONTHLY_HOURS = 209;
const ATTENDANCE_FIELDS = ['주휴', '고정연장', '고정휴일', '고정휴일연장', '고정휴무', '고정야간', '연차', '변동연장', '변동휴일', '변동휴일연장'];
const ITEM_COLS = 4;

const GROUP_COLORS: Record<string, string> = {
  fixed: '#eef2ff',
  variable: '#ecfdf5',
  nontax: '#fffbeb',
  other: '#f5f3ff',
  deduction: '#fef2f2',
};

function chunkPad<T>(arr: T[], size: number): (T | null)[][] {
  const rows: (T | null)[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    const slice: (T | null)[] = arr.slice(i, i + size);
    while (slice.length < size) slice.push(null);
    rows.push(slice);
  }
  return rows;
}

interface GridItem { id: string; name: string; amount: number }
interface GridGroup { key: string; label: string; items: GridItem[] }

// 실제 회사 급여명세서 양식과 같은 모양 — 구분(고정급여/수당/비과세/기타급여/공제) 라벨 옆에
// 항목명을 가로로 나열한 헤더 행, 그 아래 금액 행으로 된 그리드(항상 4열 고정, 남는 칸은 빈
// 칸으로 채워 표가 항상 반듯하게 정렬되게 한다). 합계 행도 같은 표 안에 넣어 표 경계선이
// 끊기지 않게 한다.
function PayGridTable({ groups, negative, totalLabel, totalValue }: { groups: GridGroup[]; negative?: boolean; totalLabel: string; totalValue: number }) {
  return (
    <table className="paygrid">
      <tbody>
        {groups.flatMap(group => {
          const rows = chunkPad(group.items, ITEM_COLS);
          return rows.map((row, i) => (
            <Fragment key={`${group.key}-${i}`}>
              <tr>
                {i === 0 && (
                  <th className="group-label" rowSpan={rows.length * 2} style={{ background: GROUP_COLORS[group.key] || '#f5f5f5' }}>
                    {group.label}
                  </th>
                )}
                {row.map((item, j) => item ? <th key={item.id}>{item.name}</th> : <th key={j} className="empty" />)}
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

function RoundedTable({ children }: { children: ReactNode }) {
  return <div style={{ border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden' }}>{children}</div>;
}

interface Props {
  payslip: EmployeePayslipWithDetails;
  showTitle?: boolean;
}

export default function EmployeePayslipDetailView({ payslip, showTitle = true }: Props) {
  const groups = groupPayslipItems(payslip.items);
  const paymentGroups = groups.filter(g => !isDeductionGroup(g));
  const deductionGroup = groups.find(isDeductionGroup);
  const hourlyWage = payslip.base_amount > 0 ? Math.round(payslip.base_amount / STANDARD_MONTHLY_HOURS) : 0;

  return (
    <div style={{ fontFamily: "'Segoe UI', Pretendard, sans-serif", color: '#1a1a1a' }}>
      <style>{`
        table.paygrid { border-collapse: collapse; width: 100%; table-layout: fixed; }
        table.paygrid th, table.paygrid td { border: 1px solid #e2e2e2; padding: 8px 6px; font-size: 12px; text-align: center; }
        table.paygrid th { font-weight: 600; color: #444; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        table.paygrid th.group-label { width: 64px; color: #1a1a1a; font-weight: 700; }
        table.paygrid td { font-variant-numeric: tabular-nums; color: #1a1a1a; }
        table.paygrid td.neg { color: #b91c1c; }
        table.paygrid th.empty, table.paygrid td.empty { background: #fcfcfc; border-color: #eee; }
        table.paygrid tr.total-row td { background: #f5f5f5; border-color: #ccc; padding: 0; }
        table.paygrid .total-line { display: flex; justify-content: space-between; padding: 9px 14px; font-weight: 700; font-size: 12.5px; }
        table.attendance-grid { border-collapse: collapse; width: 100%; }
        table.attendance-grid th, table.attendance-grid td { border: 1px solid #e2e2e2; padding: 7px 8px; font-size: 12px; text-align: center; }
        table.attendance-grid th { background: #fafafa; font-weight: 600; color: #444; }
        table.attendance-grid th.empty, table.attendance-grid td.empty { background: #fcfcfc; border-color: #eee; }
      `}</style>

      {showTitle && (
        <div style={{ fontSize: 19, fontWeight: 800, textAlign: 'center', letterSpacing: 1, margin: '4px 0 20px' }}>
          급여명세서 <span style={{ fontWeight: 500, fontSize: 15, color: '#666' }}>({payslip.period_year_month || payslip.created_at.slice(0, 7)})</span>
        </div>
      )}

      <div style={{ border: '1px solid #e2e2e2', borderRadius: 8, padding: '10px 16px', marginBottom: 20, fontSize: 13 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
          <span><b>성명</b>&nbsp;&nbsp;{payslip.employee_name}</span>
          <span><b>직무</b>&nbsp;&nbsp;{payslip.employee_position_name || '-'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
          <span><b>생년월일</b>&nbsp;&nbsp;{payslip.employee_birth_date || '-'}</span>
          <span><b>입사일자</b>&nbsp;&nbsp;{payslip.employee_hire_date || '-'}</span>
        </div>
        {payslip.payment_date && (
          <div style={{ padding: '3px 0' }}><b>지급일</b>&nbsp;&nbsp;{payslip.payment_date}</div>
        )}
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, margin: '4px 0 8px' }}>지급내역</div>
      {paymentGroups.length === 0 ? (
        <p style={{ fontSize: 12, color: '#999', textAlign: 'center', padding: '8px 0' }}>등록된 지급 항목이 없습니다.</p>
      ) : (
        <RoundedTable><PayGridTable groups={paymentGroups} totalLabel="지급액 합계" totalValue={payslip.base_amount + payslip.total_allowance} /></RoundedTable>
      )}

      <div style={{ fontSize: 13, fontWeight: 700, margin: '20px 0 8px' }}>공제내역</div>
      {!deductionGroup || deductionGroup.items.length === 0 ? (
        <p style={{ fontSize: 12, color: '#999', textAlign: 'center', padding: '8px 0' }}>공제 항목 없음</p>
      ) : (
        <RoundedTable><PayGridTable groups={[deductionGroup]} negative totalLabel="공제액 합계" totalValue={payslip.total_deduction} /></RoundedTable>
      )}

      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>실지급액</span>
        <span style={{ fontWeight: 800, fontSize: 18, fontVariantNumeric: 'tabular-nums', color: '#1d4ed8' }}>{fmt(payslip.net_amount)} 원</span>
      </div>

      <div style={{ marginTop: 22 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>근태</div>
        <RoundedTable>
          <table className="attendance-grid">
            <tbody>
              {chunkPad([['소정', `${STANDARD_MONTHLY_HOURS.toFixed(2)}H`] as [string, string], ...ATTENDANCE_FIELDS.map(f => [f, '0.00H'] as [string, string])], 4).map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => cell ? (
                    <Fragment key={cell[0]}><th>{cell[0]}</th><td>{cell[1]}</td></Fragment>
                  ) : (
                    <Fragment key={`pad-${j}`}><th className="empty" /><td className="empty" /></Fragment>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </RoundedTable>
      </div>

      <div style={{ marginTop: 18, fontSize: 11.5, color: '#555', lineHeight: 1.8, background: '#fafafa', border: '1px solid #e5e5e5', borderRadius: 8, padding: '12px 16px' }}>
        <b style={{ color: '#1a1a1a' }}>계산방법</b>
        <div>시급 {fmt(hourlyWage)}원 (소정근로시간 {STANDARD_MONTHLY_HOURS}H 기준) · 연장/휴일근로 1.5배, 휴일연장근로 2배, 야간근로 0.5배 가산</div>
        <div>임금지급일 : {payslip.payment_date ? `${payslip.payment_date} (1일부터 말일까지 정산하여 지급)` : '1일부터 말일까지 정산하여 익월 15일 지급'}</div>
        <div>원천징수액 : 관련법령에 따름</div>
        <div>기타 : 월 중도입사 또는 중도퇴사 시 근무일수에 따라 일할계산됩니다.</div>
      </div>

      {payslip.memo && (
        <div style={{ marginTop: 16, fontSize: 12, color: '#555' }}><b>비고</b>&nbsp;&nbsp;{payslip.memo}</div>
      )}
    </div>
  );
}
