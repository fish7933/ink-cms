import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ShoreLeaveRequestWithDetails } from '@/types/shore-leave';

interface LeaveUsageListProps {
  requests: ShoreLeaveRequestWithDetails[]; // status === 'approved' 인 것만 넘겨받는다고 가정
  positionByUser: Map<string, string | null>;
}

const PAGE_SIZE = 15;

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

function periodLabel(r: ShoreLeaveRequestWithDetails): string {
  return r.start_date === r.end_date ? r.start_date : `${r.start_date} ~ ${r.end_date}`;
}

// 월별 캘린더 밑에 두는 목록 뷰 — 캘린더는 "이번 달"만 보여주는 반면, 이건 연도/월/직원으로
// 걸러가며 사용한/예정된 연차를 최근 발생순으로 계속 스크롤해서 볼 수 있게 한다.
export default function LeaveUsageList({ requests, positionByUser }: LeaveUsageListProps) {
  const todayIso = new Date().toISOString().slice(0, 10);

  const years = useMemo(() => {
    const set = new Set(requests.map(r => r.start_date.slice(0, 4)));
    set.add(String(new Date().getFullYear()));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [requests]);

  const employees = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of requests) {
      const position = positionByUser.get(r.user_id);
      map.set(r.user_id, `${position ? `${position} ` : ''}${r.user_name}`);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], 'ko'));
  }, [requests, positionByUser]);

  const [year, setYear] = useState<string>('all');
  const [month, setMonth] = useState<string>('all');
  const [userId, setUserId] = useState<string>('all');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    return requests
      .filter(r => year === 'all' || r.start_date.slice(0, 4) === year)
      .filter(r => month === 'all' || r.start_date.slice(5, 7) === month)
      .filter(r => userId === 'all' || r.user_id === userId)
      // 최근 발생순 — 연차 시작일이 최신인(미래 예정 포함) 순으로 정렬.
      .sort((a, b) => b.start_date.localeCompare(a.start_date) || b.created_at.localeCompare(a.created_at));
  }, [requests, year, month, userId]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const changeFilter = (fn: () => void) => { fn(); setPage(1); };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={year} onValueChange={v => changeFilter(() => setYear(v))}>
          <SelectTrigger className="h-8 w-[100px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">전체 연도</SelectItem>
            {years.map(y => <SelectItem key={y} value={y} className="text-xs">{y}년</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={month} onValueChange={v => changeFilter(() => setMonth(v))}>
          <SelectTrigger className="h-8 w-[90px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">전체 월</SelectItem>
            {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map(m => (
              <SelectItem key={m} value={m} className="text-xs">{Number(m)}월</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={userId} onValueChange={v => changeFilter(() => setUserId(v))}>
          <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">전체 직원</SelectItem>
            {employees.map(([id, label]) => <SelectItem key={id} value={id} className="text-xs">{label}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-xs text-gray-400 ml-auto">{filtered.length}건</span>
      </div>

      <div className="border rounded-md overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left p-2 text-xs font-medium text-gray-600">이름</th>
              <th className="text-left p-2 text-xs font-medium text-gray-600">기간</th>
              <th className="text-center p-2 text-xs font-medium text-gray-600">구분</th>
              <th className="text-center p-2 text-xs font-medium text-gray-600">상태</th>
              <th className="text-left p-2 text-xs font-medium text-gray-600">사유</th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr><td colSpan={5} className="p-6 text-center text-gray-400 text-sm">내역이 없습니다.</td></tr>
            ) : paged.map(r => {
              const position = positionByUser.get(r.user_id);
              const label = `${position ? `${position} ` : ''}${r.user_name}`;
              const isUpcoming = r.start_date > todayIso;
              return (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="p-2 font-medium whitespace-nowrap">{label}</td>
                  <td className="p-2 whitespace-nowrap">{periodLabel(r)}</td>
                  <td className="p-2 text-center whitespace-nowrap">{typeLabelFor(r)}</td>
                  <td className="p-2 text-center">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${isUpcoming ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                      {isUpcoming ? '예정' : '사용'}
                    </span>
                  </td>
                  <td className="p-2 text-gray-500">{r.reason || '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button type="button" size="sm" variant="outline" className="h-7 px-2" disabled={currentPage <= 1} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          <span className="text-xs text-gray-500">{currentPage} / {totalPages}</span>
          <Button type="button" size="sm" variant="outline" className="h-7 px-2" disabled={currentPage >= totalPages} onClick={() => setPage(p => p + 1)}>
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
