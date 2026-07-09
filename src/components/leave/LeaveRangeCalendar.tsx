import { useMemo, useState } from 'react';
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, isToday, startOfMonth, startOfWeek, subMonths } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface LeaveRangeCalendarProps {
  startDate: string; // yyyy-MM-dd
  endDate: string; // yyyy-MM-dd
  onChange: (startDate: string, endDate: string) => void;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export default function LeaveRangeCalendar({ startDate, endDate, onChange }: LeaveRangeCalendarProps) {
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(startDate ? new Date(startDate) : new Date()));
  const [monthInputOpen, setMonthInputOpen] = useState(false);
  // 시작일 클릭 후 종료일을 기다리는 중인지 추적 — 두 번째 클릭이 오면 범위를 완성한다.
  const [anchor, setAnchor] = useState<string | null>(null);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(viewMonth));
    const end = endOfWeek(endOfMonth(viewMonth));
    return eachDayOfInterval({ start, end });
  }, [viewMonth]);

  const handleDayClick = (iso: string) => {
    if (!anchor) { setAnchor(iso); onChange(iso, iso); return; }
    if (iso < anchor) onChange(iso, anchor);
    else onChange(anchor, iso);
    setAnchor(null);
  };

  return (
    <div className="border rounded-md p-3 w-full max-w-sm shrink-0">
      <div className="flex items-center justify-between mb-2">
        <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setViewMonth(m => subMonths(m, 1))}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        {monthInputOpen ? (
          <Input
            type="month"
            autoFocus
            value={format(viewMonth, 'yyyy-MM')}
            onChange={e => { if (e.target.value) setViewMonth(startOfMonth(new Date(`${e.target.value}-01`))); }}
            onBlur={() => setMonthInputOpen(false)}
            className="h-7 w-36 text-sm text-center"
          />
        ) : (
          <button type="button" onClick={() => setMonthInputOpen(true)} className="text-sm font-medium hover:bg-gray-100 rounded px-2 py-0.5">
            {format(viewMonth, 'yyyy년 M월')}
          </button>
        )}
        <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setViewMonth(m => addMonths(m, 1))}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-gray-400 mb-1">
        {WEEKDAYS.map((w, i) => <div key={w} className={i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : ''}>{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map(day => {
          const iso = format(day, 'yyyy-MM-dd');
          const inMonth = isSameMonth(day, viewMonth);
          const isEndpoint = startDate === iso || endDate === iso;
          const inRange = !!startDate && !!endDate && iso >= startDate && iso <= endDate;
          const todayDate = isToday(day);
          const dow = day.getDay();
          return (
            <button
              type="button"
              key={iso}
              onClick={() => handleDayClick(iso)}
              className={[
                'h-8 w-8 mx-auto text-xs flex items-center justify-center relative rounded-md',
                isEndpoint ? 'bg-blue-600 text-white font-semibold' : inRange ? 'bg-blue-100 text-blue-800' : 'hover:bg-gray-100',
                !isEndpoint && !inRange ? (!inMonth ? 'text-gray-300' : dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-gray-700') : '',
                todayDate && !isEndpoint ? 'ring-1 ring-blue-400' : '',
              ].join(' ')}
            >
              {format(day, 'd')}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-gray-400 mt-2 pt-2 border-t">
        {anchor ? '종료일을 클릭하세요.' : '시작일을 클릭하세요. (당일 휴가는 같은 날짜만 클릭)'}
      </p>
    </div>
  );
}
