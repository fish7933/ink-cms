import { useMemo, useState } from 'react';
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, isToday, startOfMonth, startOfWeek, subMonths } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface LeaveCalendarEntry {
  id: string;
  user_id: string;
  user_name: string;
  kind: 'annual' | 'sick';
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
}

interface LeaveStatusCalendarProps {
  entries: LeaveCalendarEntry[]; // status가 'approved' 또는 'pending'인 것만 넘겨받는다고 가정
  positionByUser: Map<string, string | null>;
}

interface DayEntry {
  id: string;
  label: string; // "이승혁 차장"
  typeLabel: string; // "종일" | "오전반차" | "오후반차"
  kind: 'annual' | 'sick';
  pending: boolean;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function normalizeTime(t: string): string {
  return t.slice(0, 5); // "09:00:00" -> "09:00"
}

function typeLabelFor(e: { start_date: string; end_date: string; start_time: string; end_time: string }): string {
  if (e.start_date !== e.end_date) return '종일';
  const start = normalizeTime(e.start_time);
  const end = normalizeTime(e.end_time);
  if (start === '09:00' && end === '14:00') return '오전반차';
  if (start === '14:00' && end === '18:00') return '오후반차';
  return '종일';
}

// 연차/질병휴가 현황을 함께 보여주는 월별 캘린더 — 승인된 건은 진한 색, 상신 후 결재중인 건은
// 옅은 색 + "(상신중)" 표기로 구분한다. 육상 직원 연차 관리(관리자용)와 전 직원 공유 캘린더
// (직원 휴가 현황) 양쪽에서 재사용된다.
export default function LeaveStatusCalendar({ entries, positionByUser }: LeaveStatusCalendarProps) {
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(viewMonth));
    const end = endOfWeek(endOfMonth(viewMonth));
    return eachDayOfInterval({ start, end });
  }, [viewMonth]);

  // 날짜별 항목 맵 — 시작일~종료일 범위의 모든 날짜에 항목을 펼쳐 넣는다.
  const entriesByDate = useMemo(() => {
    const map = new Map<string, DayEntry[]>();
    for (const e of entries) {
      const type = typeLabelFor(e);
      const position = positionByUser.get(e.user_id);
      const label = `${position ? `${position} ` : ''}${e.user_name}`;
      const rangeDays = eachDayOfInterval({ start: new Date(e.start_date), end: new Date(e.end_date) });
      for (const d of rangeDays) {
        const iso = format(d, 'yyyy-MM-dd');
        if (!map.has(iso)) map.set(iso, []);
        map.get(iso)!.push({ id: `${e.id}-${iso}`, label, typeLabel: type, kind: e.kind, pending: e.status === 'pending' });
      }
    }
    return map;
  }, [entries, positionByUser]);

  const todayIso = format(new Date(), 'yyyy-MM-dd');

  const colorClass = (e: DayEntry) => {
    if (e.pending) return 'bg-amber-50 text-amber-700';
    return e.kind === 'sick' ? 'bg-rose-50 text-rose-700' : 'bg-blue-50 text-blue-700';
  };
  const dotClass = (e: DayEntry) => (e.pending ? 'text-amber-400' : e.kind === 'sick' ? 'text-rose-400' : 'text-blue-400');

  return (
    <div className="border rounded-md overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5 border-b bg-gray-50">
        <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setViewMonth(m => subMonths(m, 1))}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">{format(viewMonth, 'yyyy년 M월')}</span>
          <span className="flex items-center gap-2.5 text-[11px] text-gray-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400" />연차</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-400" />질병휴가</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" />상신중</span>
          </span>
        </div>
        <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setViewMonth(m => addMonths(m, 1))}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 text-center text-xs font-medium text-gray-400 border-b">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={`py-1.5 ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : ''}`}>{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map(day => {
          const iso = format(day, 'yyyy-MM-dd');
          const inMonth = isSameMonth(day, viewMonth);
          const dayEntries = entriesByDate.get(iso) || [];
          const dow = day.getDay();
          return (
            <div
              key={iso}
              className={`min-h-[92px] border-b border-r p-1.5 align-top ${!inMonth ? 'bg-gray-50/50' : ''} ${isToday(day) ? 'bg-blue-50/60' : ''}`}
            >
              <p className={`text-xs mb-1 ${!inMonth ? 'text-gray-300' : iso === todayIso ? 'font-bold text-blue-600' : dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-gray-600'}`}>
                {format(day, 'd')}
              </p>
              <div className="space-y-0.5">
                {dayEntries.map(e => (
                  <div key={e.id} className={`text-[11px] leading-tight px-1 py-0.5 rounded truncate ${colorClass(e)}`} title={`${e.label} · ${e.typeLabel}${e.pending ? ' (상신중)' : ''}`}>
                    {e.label} <span className={dotClass(e)}>· {e.typeLabel}{e.pending ? ' (상신중)' : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
