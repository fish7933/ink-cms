import { differenceInCalendarMonths, differenceInCalendarYears } from 'date-fns';

// 근로기준법 제60조 기준 연차 발생일수 계산.
// - 근속 1년 미만: 만 1개월 개근마다 1일 발생 (최대 11일)
// - 근속 1년 이상: 15일 + (3년차부터 매 2년마다 1일 가산), 최대 25일
//   (출근율 80% 이상을 전제로 하며, 이 시스템은 별도 출근율 데이터가 없어 항상 충족한다고 가정)
export function calculateAccruedLeaveDays(hireDate: string, asOfDate: string = new Date().toISOString().slice(0, 10)): number {
  const hire = new Date(hireDate);
  const asOf = new Date(asOfDate);
  if (Number.isNaN(hire.getTime()) || asOf < hire) return 0;

  const fullYears = differenceInCalendarYears(asOf, hire);
  if (fullYears < 1) {
    const fullMonths = differenceInCalendarMonths(asOf, hire);
    return Math.min(11, Math.max(0, fullMonths));
  }
  return Math.min(25, 15 + Math.floor((fullYears - 1) / 2));
}

export interface LeaveBalance {
  accrued: number;
  used: number;
  remaining: number;
}

export function calculateLeaveBalance(hireDate: string, usedDays: number, asOfDate?: string): LeaveBalance {
  const accrued = calculateAccruedLeaveDays(hireDate, asOfDate);
  return { accrued, used: usedDays, remaining: Math.round((accrued - usedDays) * 10) / 10 };
}
