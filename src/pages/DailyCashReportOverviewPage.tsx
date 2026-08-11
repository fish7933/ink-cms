import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, isToday, startOfMonth, startOfWeek, subMonths } from 'date-fns';
import { FileText, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getDailyReports } from '@/services/accounting-daily-report.service';
import { usePermissions } from '@/hooks/usePermissions';
import { useTabContext } from '@/contexts/TabContext';
import type { DailyCashReport, AccountingDailyReportStatus } from '@/types/accounting';

const PAGE_SIZE = 20;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const STATUS_BADGE: Record<AccountingDailyReportStatus, { label: string; className: string; dot: string }> = {
  draft: { label: '작성중', className: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' },
  pending_approval: { label: '결재중', className: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-400' },
  confirmed: { label: '확정', className: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
};

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// 자금일보 커버 페이지 — 달력으로 날짜별 결재 현황을 한눈에 보고, 아래 목록에서 과거 이력을
// 페이지네이션으로 훑어본 뒤 원하는 날짜의 자금일보(DailyCashReportPage)로 들어간다.
export default function DailyCashReportOverviewPage() {
  const navigate = useNavigate();
  const { openNewTab } = useTabContext();
  const permissions = usePermissions('accounting_daily_report');
  const [reports, setReports] = useState<DailyCashReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!permissions.loading && !permissions.canView) navigate('/dashboard');
  }, [permissions.loading, permissions.canView, navigate]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        setReports(await getDailyReports());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const reportByDate = useMemo(() => new Map(reports.map(r => [r.report_date, r])), [reports]);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(viewMonth));
    const end = endOfWeek(endOfMonth(viewMonth));
    return eachDayOfInterval({ start, end });
  }, [viewMonth]);

  const totalPages = Math.max(1, Math.ceil(reports.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = reports.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const goToDate = (date: string) => openNewTab(`/accounting/daily-report/${date}`, `${date} 자금일보`);
  const today = todayIso();

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>;
  }

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <FileText className="w-6 h-6" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">자금일보</h1>
            <p className="text-sm text-gray-500">날짜별 결재 현황을 확인하고 자금일보를 작성·조회합니다.</p>
          </div>
        </div>
        <Button size="sm" className="h-8 gap-1.5" onClick={() => goToDate(today)}>
          <CalendarDays className="w-3.5 h-3.5" />오늘 자금일보
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="border rounded-md overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2.5 border-b bg-gray-50">
              <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setViewMonth(m => subMonths(m, 1))}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold">{format(viewMonth, 'yyyy년 M월')}</span>
                <span className="flex items-center gap-2.5 text-[11px] text-gray-500">
                  {(Object.keys(STATUS_BADGE) as AccountingDailyReportStatus[]).map(s => (
                    <span key={s} className="flex items-center gap-1"><span className={`w-2 h-2 rounded-full ${STATUS_BADGE[s].dot}`} />{STATUS_BADGE[s].label}</span>
                  ))}
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
                const r = reportByDate.get(iso);
                const dow = day.getDay();
                return (
                  <button
                    type="button"
                    key={iso}
                    onClick={() => goToDate(iso)}
                    className={`min-h-[68px] border-b border-r p-1.5 text-left align-top hover:bg-blue-50/40 transition-colors ${!inMonth ? 'bg-gray-50/50' : ''} ${isToday(day) ? 'bg-blue-50/60' : ''}`}
                  >
                    <p className={`text-xs mb-1 ${!inMonth ? 'text-gray-300' : iso === today ? 'font-bold text-blue-600' : dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-gray-600'}`}>
                      {format(day, 'd')}
                    </p>
                    {r && (
                      <span className={`inline-block text-[10px] leading-tight px-1.5 py-0.5 rounded-full ${STATUS_BADGE[r.status].className}`}>
                        {STATUS_BADGE[r.status].label}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">전체 이력</CardTitle>
            <span className="text-xs text-gray-400">{reports.length}건</span>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-2 text-xs font-medium text-gray-600">날짜</th>
                  <th className="text-left p-2 text-xs font-medium text-gray-600">상태</th>
                  <th className="text-left p-2 text-xs font-medium text-gray-600">확정일시</th>
                  <th className="p-2 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {paged.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-8 text-gray-400 text-sm">작성된 자금일보가 없습니다.</td></tr>
                ) : paged.map(r => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50 cursor-pointer" onClick={() => goToDate(r.report_date)}>
                    <td className="p-2 font-medium">{r.report_date}</td>
                    <td className="p-2"><Badge className={`text-[10px] ${STATUS_BADGE[r.status].className}`}>{STATUS_BADGE[r.status].label}</Badge></td>
                    <td className="p-2 text-gray-500">{r.confirmed_at ? new Date(r.confirmed_at).toLocaleString('ko-KR') : '-'}</td>
                    <td className="p-2 text-right">
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={e => { e.stopPropagation(); goToDate(r.report_date); }}>보기</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button type="button" size="sm" variant="outline" className="h-7 px-2" disabled={currentPage <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="w-3.5 h-3.5" /></Button>
              <span className="text-xs text-gray-500">{currentPage} / {totalPages}</span>
              <Button type="button" size="sm" variant="outline" className="h-7 px-2" disabled={currentPage >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="w-3.5 h-3.5" /></Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
