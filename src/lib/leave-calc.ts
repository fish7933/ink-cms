import { differenceInCalendarMonths, differenceInCalendarYears } from 'date-fns';

// 연차 소진은 시간 단위(반차/시간차)까지 지원하므로, 법정 발생일수(일 단위)를
// 시간으로 환산해 관리한다. 1일 = 소정근로 8시간 기준.
export const HOURS_PER_DAY = 8;

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

export function calculateAccruedLeaveHours(hireDate: string, asOfDate?: string): number {
  return calculateAccruedLeaveDays(hireDate, asOfDate) * HOURS_PER_DAY;
}

export interface LeaveBalance {
  accruedHours: number;
  usedHours: number;
  remainingHours: number;
}

export function calculateLeaveBalance(hireDate: string, usedHours: number, asOfDate?: string): LeaveBalance {
  const accruedHours = calculateAccruedLeaveHours(hireDate, asOfDate);
  return { accruedHours, usedHours, remainingHours: Math.round((accruedHours - usedHours) * 10) / 10 };
}

// 시간 단위 값을 "N일 M시간" 형태로 표시 (예: 26 -> "3일 2시간")
export function formatLeaveHours(hours: number): string {
  const sign = hours < 0 ? '-' : '';
  const abs = Math.abs(Math.round(hours * 10) / 10);
  const days = Math.floor(abs / HOURS_PER_DAY);
  const rem = Math.round((abs - days * HOURS_PER_DAY) * 10) / 10;
  if (days > 0 && rem > 0) return `${sign}${days}일 ${rem}시간`;
  if (days > 0) return `${sign}${days}일`;
  return `${sign}${rem}시간`;
}
