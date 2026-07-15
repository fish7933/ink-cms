import { Fragment } from 'react';
import { groupPayslipItems, isDeductionGroup } from '@/lib/employee-payslip-groups';
import type { EmployeePayslipWithDetails } from '@/types/employee-salary';

const fmt = (n: number) => n.toLocaleString('ko-KR');

// 회사 실제 급여명세서 양식(첨부 PDF)의 지급/공제 항목 외 나머지 섹션 — 근태와 계산방법.
// 소정근로시간 209H는 (주 40시간 + 주휴 8시간) 기준 월 평균 고정값이라 회사 규정상 항상
// 동일하다. 나머지 근태 항목(연장/휴일/야간 등)은 이 시스템에 근태 추적 기능이 없어 실측치를
// 낼 수 없으므로 0.00H로 표기한다 — 급여명세서 "양식"만은 그대로 보여주기 위한 고정값.
const STANDARD_MONTHLY_HOURS = 209;
const ATTENDANCE_FIELDS = ['주휴', '고정연장', '고정휴일', '고정휴일연장', '고정휴무', '고정야간', '연차', '변동연장', '변동휴일', '변동휴일연장'];

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
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
        table.payslip-items { border-collapse: collapse; width: 100%; }
        table.payslip-items th, table.payslip-items td { border: 1px solid #999; padding: 7px 10px; font-size: 13px; }
        table.payslip-items th { background: #f5f5f5; font-weight: 600; text-align: left; }
        table.payslip-items td.amount { text-align: right; font-variant-numeric: tabular-nums; }
        table.attendance-grid { border-collapse: collapse; width: 100%; }
        table.attendance-grid th, table.attendance-grid td { border: 1px solid #ccc; padding: 6px 8px; font-size: 12px; text-align: center; }
        table.attendance-grid th { background: #f5f5f5; font-weight: 600; }
      `}</style>

      {showTitle && (
        <div style={{ fontSize: 18, fontWeight: 700, textAlign: 'center', margin: '10px 0 20px' }}>
          급여명세서 ({payslip.period_year_month || payslip.created_at.slice(0, 7)})
        </div>
      )}

      <table style={{ width: '100%', fontSize: 13, marginBottom: 18 }}>
        <tbody>
          <tr>
            <td style={{ padding: '3px 0' }}><b>성명</b>&nbsp;&nbsp;{payslip.employee_name}</td>
            <td style={{ padding: '3px 0', textAlign: 'right' }}><b>직무</b>&nbsp;&nbsp;{payslip.employee_position_name || '-'}</td>
          </tr>
          <tr>
            <td style={{ padding: '3px 0' }}><b>생년월일</b>&nbsp;&nbsp;{payslip.employee_birth_date || '-'}</td>
            <td style={{ padding: '3px 0', textAlign: 'right' }}><b>입사일자</b>&nbsp;&nbsp;{payslip.employee_hire_date || '-'}</td>
          </tr>
          {payslip.payment_date && (
            <tr>
              <td style={{ padding: '3px 0' }} colSpan={2}><b>지급일</b>&nbsp;&nbsp;{payslip.payment_date}</td>
            </tr>
          )}
        </tbody>
      </table>

      <table className="payslip-items">
        <thead>
          <tr><th style={{ width: '20%' }}>구분</th><th>항목</th><th style={{ width: '30%', textAlign: 'right' }}>금액</th></tr>
        </thead>
        <tbody>
          {paymentGroups.length === 0 ? (
            <tr><td colSpan={3} style={{ textAlign: 'center', color: '#999' }}>등록된 지급 항목이 없습니다.</td></tr>
          ) : (
            paymentGroups.flatMap(group => group.items.map(item => (
              <tr key={item.id}>
                <td>{group.label}</td>
                <td>{item.name}</td>
                <td className="amount">{fmt(item.amount)}</td>
              </tr>
            )))
          )}
          <tr>
            <td colSpan={2} style={{ fontWeight: 600, background: '#fafafa' }}>지급액 합계</td>
            <td className="amount" style={{ fontWeight: 600, background: '#fafafa' }}>{fmt(payslip.base_amount + payslip.total_allowance)}</td>
          </tr>
          {!deductionGroup || deductionGroup.items.length === 0 ? (
            <tr><td colSpan={3} style={{ textAlign: 'center', color: '#999' }}>공제 항목 없음</td></tr>
          ) : (
            deductionGroup.items.map(item => (
              <tr key={item.id}>
                <td>{deductionGroup.label}</td>
                <td>{item.name}</td>
                <td className="amount" style={{ color: '#b91c1c' }}>-{fmt(item.amount)}</td>
              </tr>
            ))
          )}
          <tr>
            <td colSpan={2} style={{ fontWeight: 600, background: '#fafafa' }}>공제액 합계</td>
            <td className="amount" style={{ fontWeight: 600, background: '#fafafa', color: '#b91c1c' }}>-{fmt(payslip.total_deduction)}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6 }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>실지급액</span>
        <span style={{ fontWeight: 700, fontSize: 17, fontVariantNumeric: 'tabular-nums' }}>{fmt(payslip.net_amount)} 원</span>
      </div>

      <div style={{ marginTop: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>근태</div>
        <table className="attendance-grid">
          <tbody>
            {chunk([['소정', `${STANDARD_MONTHLY_HOURS.toFixed(2)}H`], ...ATTENDANCE_FIELDS.map(f => [f, '0.00H'] as [string, string])], 4).map((row, i) => (
              <tr key={i}>
                {row.map(([label, value]) => (
                  <Fragment key={label}><th>{label}</th><td>{value}</td></Fragment>
                ))}
                {row.length < 4 && Array.from({ length: 4 - row.length }).map((_, j) => (
                  <Fragment key={`pad-${j}`}><th></th><td></td></Fragment>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 16, fontSize: 11.5, color: '#555', lineHeight: 1.7, background: '#fafafa', border: '1px solid #e5e5e5', borderRadius: 6, padding: '10px 14px' }}>
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
