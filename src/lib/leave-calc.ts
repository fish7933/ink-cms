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

export interface AccruedLeaveExplanation {
  hireDate: string;
  asOfDate: string;
  fullYears: number;
  fullMonths: number;
  days: number;
  ruleLabel: string; // "근속 1년 미만" | "근속 1년 이상"
  formulaText: string; // 계산 과정을 그대로 보여줄 텍스트
  cappedAt: number; // 상한 (11 또는 25)
}

// calculateAccruedLeaveDays와 동일한 규칙으로, "왜 이 날수가 나왔는지"를 사람이 읽을 수 있는 형태로 반환한다.
export function explainAccruedLeaveDays(hireDate: string, asOfDate: string = new Date().toISOString().slice(0, 10)): AccruedLeaveExplanation {
  const hire = new Date(hireDate);
  const asOf = new Date(asOfDate);
  const invalid = Number.isNaN(hire.getTime()) || asOf < hire;
  const fullYears = invalid ? 0 : differenceInCalendarYears(asOf, hire);
  const fullMonths = invalid ? 0 : differenceInCalendarMonths(asOf, hire);

  if (invalid) {
    return { hireDate, asOfDate, fullYears: 0, fullMonths: 0, days: 0, ruleLabel: '계산 불가', formulaText: '입사일이 등록되어 있지 않거나 기준일보다 이후입니다.', cappedAt: 0 };
  }

  if (fullYears < 1) {
    const days = Math.min(11, Math.max(0, fullMonths));
    return {
      hireDate, asOfDate, fullYears, fullMonths, days,
      ruleLabel: '근속 1년 미만',
      formulaText: `만 1개월 개근마다 1일 발생 → 입사 후 ${fullMonths}개월 경과 = ${fullMonths}일${fullMonths > 11 ? ' (상한 11일 적용)' : ''}`,
      cappedAt: 11,
    };
  }
  const addOn = Math.floor((fullYears - 1) / 2);
  const rawDays = 15 + addOn;
  const days = Math.min(25, rawDays);
  return {
    hireDate, asOfDate, fullYears, fullMonths, days,
    ruleLabel: '근속 1년 이상',
    formulaText: `기본 15일 + ⌊(근속연수 ${fullYears}년 − 1) ÷ 2⌋ = 15 + ⌊${fullYears - 1} ÷ 2⌋ = 15 + ${addOn} = ${rawDays}일${rawDays > 25 ? ' (상한 25일 적용 → 25일)' : ''}`,
    cappedAt: 25,
  };
}

// 연차는 입사일 기준으로 매년 갱신되므로(회계연도 구분 없음), "올해"의 발생일은
// 입사일의 월/일을 기준연도로 옮긴 날짜다 (예: 입사일 2019-03-15 -> 2026년 발생일 2026-03-15).
export function getThisYearLeaveGrantDate(hireDate: string, referenceYear: number = new Date().getFullYear()): string {
  const hire = new Date(hireDate);
  const date = new Date(referenceYear, hire.getMonth(), hire.getDate());
  // 2/29생 입사일이 평년과 만나는 경우 등 날짜가 다음 달로 넘어가면 그 달의 마지막 날로 보정
  if (date.getMonth() !== hire.getMonth()) date.setDate(0);
  return date.toISOString().slice(0, 10);
}

// 현재 "연차 사용연도"의 시작일 — 입사일 기준으로 가장 최근에 지난(또는 오늘인) 발생일.
// 아직 첫 발생일(=입사 1주년)이 지나지 않았다면 입사일 자체가 시작일이다.
// 이 날짜 이전의 사용/부여 내역은 지난 연차년도 것으로 보고 잔여 계산에서 제외한다
// (근로기준법상 미사용 연차는 원칙적으로 다음 해로 이월되지 않음).
export function getCurrentLeaveYearStart(hireDate: string, asOfDate: string = new Date().toISOString().slice(0, 10)): string {
  const thisYear = getThisYearLeaveGrantDate(hireDate, new Date(asOfDate).getFullYear());
  if (thisYear <= asOfDate) return thisYear > hireDate ? thisYear : hireDate;
  const lastYear = getThisYearLeaveGrantDate(hireDate, new Date(asOfDate).getFullYear() - 1);
  return lastYear > hireDate ? lastYear : hireDate;
}

export interface LeaveBalance {
  legalAccruedHours: number; // 근로기준법상 자동 발생분
  companyGrantedHours: number; // 회사가 재량으로 수동 부여한 분 (포상휴가 등)
  accruedHours: number; // legalAccruedHours + companyGrantedHours
  usedHours: number;
  remainingHours: number;
}

export function calculateLeaveBalance(hireDate: string, usedHours: number, asOfDate?: string): LeaveBalance {
  const legalAccruedHours = calculateAccruedLeaveHours(hireDate, asOfDate);
  const accruedHours = legalAccruedHours;
  return { legalAccruedHours, companyGrantedHours: 0, accruedHours, usedHours, remainingHours: Math.round((accruedHours - usedHours) * 10) / 10 };
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

// "사용" 연차처럼 반차 미만 단위도 항상 일수로 보여주고 싶을 때 쓰는 소수점 일수 표기
// (예: 4시간 -> "0.5일", 26시간 -> "3.3일"). formatLeaveHours와 달리 항상 "일" 단위 하나로만 표시한다.
export function formatLeaveDays(hours: number): string {
  const sign = hours < 0 ? '-' : '';
  const abs = Math.abs(hours);
  const days = Math.round((abs / HOURS_PER_DAY) * 10) / 10;
  return `${sign}${days}일`;
}
