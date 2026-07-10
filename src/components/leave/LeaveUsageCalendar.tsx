import { useMemo, useState } from 'react';
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, isToday, startOfMonth, startOfWeek, subMonths } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ShoreLeaveRequestWithDetails } from '@/types/shore-leave';

interface LeaveUsageCalendarProps {
  requests: ShoreLeaveRequestWithDetails[]; // status === 'approved' 인 것만 넘겨받는다고 가정
  positionByUser: Map<string, string | null>;
}

interface DayEntry {
  id: string;
  label: string; // "이승혁 차장"
  typeLabel: string; // "종일" | "오전반차" | "오후반차"
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function normalizeTime(t: string): string {
  return t.slice(0, 5); // "09:00:00" -> "09:00"
}

function typeLabelFor(r: ShoreLeaveRequestWithDetails): string {
  if (r.start_date !== r.end_date) return '종일';
  const start = normalizeTime(r.start_time);
  const end = normalizeTime(r.end_time);
  if (start === '09:00' && end === '14:00') return '오전반차';
  if (start === '14:00' && end === '18:00') return '오후반차';
  return '종일';
}

export default function LeaveUsageCalendar({ requests, positionByUser }: LeaveUsageCalendarProps) {
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(viewMonth));
    const end = endOfWeek(endOfMonth(viewMonth));
    return eachDayOfInterval({ start, end });
  }, [viewMonth]);

  // 날짜별 항목 맵 — 시작일~종료일 범위의 모든 날짜에 항목을 펼쳐 넣는다.
  const entriesByDate = useMemo(() => {
    const map = new Map<string, DayEntry[]>();
    for (const r of requests) {
      const type = typeLabelFor(r);
      const position = positionByUser.get(r.user_id);
      const label = `${position ? `${position} ` : ''}${r.user_name}`;
      const rangeDays = eachDayOfInterval({ start: new Date(r.start_date), end: new Date(r.end_date) });
      for (const d of rangeDays) {
        const iso = format(d, 'yyyy-MM-dd');
        if (!map.has(iso)) map.set(iso, []);
        map.get(iso)!.push({ id: `${r.id}-${iso}`, label, typeLabel: type });
      }
    }
    return map;
  }, [requests, positionByUser]);

  const todayIso = format(new Date(), 'yyyy-MM-dd');

  return (
    <div className="border rounded-md overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5 border-b bg-gray-50">
        <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setViewMonth(m => subMonths(m, 1))}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm font-semibold">{format(viewMonth, 'yyyy년 M월')}</span>
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
          const entries = entriesByDate.get(iso) || [];
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
                {entries.map(e => (
                  <div key={e.id} className="text-[11px] leading-tight px-1 py-0.5 rounded bg-blue-50 text-blue-700 truncate" title={`${e.label} · ${e.typeLabel}`}>
                    {e.label} <span className="text-blue-400">· {e.typeLabel}</span>
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
