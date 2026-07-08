import { useEffect, useMemo, useState } from 'react';
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isAfter, isSameDay, isSameMonth, startOfDay, startOfMonth, startOfWeek, subMonths } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getShipContractRanges, type CrewContractRange } from '@/services/ship-crew-roster.service';
import { isContractActiveOnDate } from '@/lib/crew-contract-coverage';

interface ShipRosterCalendarProps {
  shipId: string;
  selectedDate: string; // yyyy-MM-dd
  onSelectDate: (date: string) => void;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export default function ShipRosterCalendar({ shipId, selectedDate, onSelectDate }: ShipRosterCalendarProps) {
  const [ranges, setRanges] = useState<CrewContractRange[]>([]);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date(selectedDate)));
  const [monthInputOpen, setMonthInputOpen] = useState(false);

  useEffect(() => {
    getShipContractRanges(shipId).then(setRanges).catch(console.error);
  }, [shipId]);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(viewMonth));
    const end = endOfWeek(endOfMonth(viewMonth));
    return eachDayOfInterval({ start, end });
  }, [viewMonth]);

  const today = startOfDay(new Date());

  // 미래 날짜는 실제로 누가 승선해 있을지 알 수 없으므로(예정 계약일 뿐) 선택도, 표시도 하지 않는다
  const hasOnboard = (day: Date) => {
    if (isAfter(day, today)) return false;
    const iso = format(day, 'yyyy-MM-dd');
    return ranges.some(r => isContractActiveOnDate(r, iso));
  };

  const selected = new Date(selectedDate);

  return (
    <div className="border rounded-md p-3 w-full max-w-sm">
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
        {WEEKDAYS.map(w => <div key={w}>{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map(day => {
          const iso = format(day, 'yyyy-MM-dd');
          const inMonth = isSameMonth(day, viewMonth);
          const isFuture = isAfter(day, today);
          const onboard = hasOnboard(day);
          const isSelected = isSameDay(day, selected);
          const isToday = isSameDay(day, today);
          return (
            <button
              type="button"
              key={iso}
              disabled={isFuture}
              onClick={() => onSelectDate(iso)}
              className={[
                'h-8 w-8 mx-auto rounded-md text-xs flex items-center justify-center relative',
                isFuture ? 'text-gray-200 cursor-not-allowed' : !inMonth ? 'text-gray-300' : 'text-gray-700',
                !isFuture && isSelected ? 'bg-blue-600 text-white font-semibold' : !isFuture && onboard ? 'bg-blue-100 text-blue-800 font-medium hover:bg-blue-200' : !isFuture ? 'hover:bg-gray-100' : '',
                isToday && !isSelected ? 'ring-1 ring-blue-400' : '',
              ].join(' ')}
            >
              {format(day, 'd')}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-3 mt-2 pt-2 border-t text-[11px] text-gray-400">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-100 inline-block" />승선 인원 있음</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-600 inline-block" />선택된 날짜</span>
      </div>
    </div>
  );
}
