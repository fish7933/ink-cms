import { HOURS_PER_DAY } from './leave-calc';

// 표준 근무시간 가정: 09:00~18:00, 점심시간 12:00~13:00 제외(순 8시간)를 기준으로
// 연차/질병휴가 시간을 계산한다. 주말과 등록된 공휴일(holidays 테이블)은 소정근로일이
// 아니므로 휴가 기간 안에 껴 있어도 소진 시간에서 제외한다.
export const WORK_START_HOUR = 9;
export const WORK_END_HOUR = 18;
export const LUNCH_START_HOUR = 12;
export const LUNCH_END_HOUR = 13;

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

function netHoursInWorkWindow(startMinutes: number, endMinutes: number): number {
  const s = Math.max(startMinutes, WORK_START_HOUR * 60);
  const e = Math.min(endMinutes, WORK_END_HOUR * 60);
  if (e <= s) return 0;
  const lunchOverlap = Math.max(0, Math.min(e, LUNCH_END_HOUR * 60) - Math.max(s, LUNCH_START_HOUR * 60));
  return (e - s - lunchOverlap) / 60;
}

// 소정근로일 여부: 토/일요일이 아니고 등록된 공휴일도 아니어야 근무일이다.
export function isWorkingDay(dateStr: string, holidayDates: Set<string> = new Set()): boolean {
  const day = new Date(dateStr).getDay(); // 0: 일, 6: 토
  if (day === 0 || day === 6) return false;
  return !holidayDates.has(dateStr);
}

// 시작/종료 일시로부터 소진되는 휴가 시간을 계산 (0.5시간 단위로 반올림).
// holidayDates에 포함된 날짜와 주말은 휴가 기간에 걸쳐 있어도 근무일이 아니므로 시간에서 제외한다.
export function calculateLeaveHours(startDate: string, startTime: string, endDate: string, endTime: string, holidayDates: Set<string> = new Set()): number {
  if (!startDate || !endDate || !startTime || !endTime) return 0;
  if (endDate < startDate) return 0;

  if (endDate === startDate) {
    if (endTime <= startTime) return 0;
    if (!isWorkingDay(startDate, holidayDates)) return 0;
    return Math.round(netHoursInWorkWindow(toMinutes(startTime), toMinutes(endTime)) * 2) / 2;
  }

  const firstDayHours = isWorkingDay(startDate, holidayDates) ? netHoursInWorkWindow(toMinutes(startTime), WORK_END_HOUR * 60) : 0;
  const lastDayHours = isWorkingDay(endDate, holidayDates) ? netHoursInWorkWindow(WORK_START_HOUR * 60, toMinutes(endTime)) : 0;

  let middleWorkingDays = 0;
  const cursor = new Date(startDate);
  cursor.setDate(cursor.getDate() + 1);
  const endBoundary = new Date(endDate);
  while (cursor < endBoundary) {
    const iso = cursor.toISOString().slice(0, 10);
    if (isWorkingDay(iso, holidayDates)) middleWorkingDays++;
    cursor.setDate(cursor.getDate() + 1);
  }

  const total = firstDayHours + middleWorkingDays * HOURS_PER_DAY + lastDayHours;
  return Math.round(total * 2) / 2;
}

export interface DateTimeRange {
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
}

// 두 일시 구간이 겹치는지 (경계가 정확히 맞닿는 경우는 겹침으로 보지 않음 — 예: 종료 13:00 / 시작 13:00)
export function rangesOverlap(a: DateTimeRange, b: DateTimeRange): boolean {
  const aStart = new Date(`${a.start_date}T${a.start_time}`).getTime();
  const aEnd = new Date(`${a.end_date}T${a.end_time}`).getTime();
  const bStart = new Date(`${b.start_date}T${b.start_time}`).getTime();
  const bEnd = new Date(`${b.end_date}T${b.end_time}`).getTime();
  return aStart < bEnd && bStart < aEnd;
}
