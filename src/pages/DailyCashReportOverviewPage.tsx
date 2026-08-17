import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, isToday, startOfMonth, startOfWeek, subMonths } from 'date-fns';
import { FileText, ChevronLeft, ChevronRight, CalendarDays, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { getDailyReports, deleteDraftDailyReport } from '@/services/accounting-daily-report.service';
import { usePermissions } from '@/hooks/usePermissions';
import { useTabContext } from '@/contexts/TabContext';
import { useToast } from '@/hooks/use-toast';
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
  const { toast } = useToast();
  const permissions = usePermissions('accounting_daily_report');
  const [reports, setReports] = useState<DailyCashReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  useEffect(() => {
    if (!permissions.loading && !permissions.canView) navigate('/dashboard');
  }, [permissions.loading, permissions.canView, navigate]);

  const loadReports = async () => {
    setLoading(true);
    try {
      setReports(await getDailyReports());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadReports(); }, []);

  // 자금일보 작성 화면(다른 탭)에서 삭제/확정취소 등으로 상태가 바뀌면 이 목록·달력도 함께
  // 갱신한다 — 안 그러면 예를 들어 삭제된 자금일보가 여기엔 그대로 남아 보인다.
  useEffect(() => {
    const handler = () => loadReports();
    window.addEventListener('daily-report-data-changed', handler);
    return () => window.removeEventListener('daily-report-data-changed', handler);
  }, []);

  // 결재상신을 한 번도 하지 않은(작성중) 자금일보만 완전히 지울 수 있다 — 지우고 나면
  // 달력의 상태 뱃지와 아래 이력 목록 양쪽에서 바로 사라진다(둘 다 이 reports 하나로 그린다).
  const handleDelete = async (r: DailyCashReport) => {
    if (!confirm(`${r.report_date} 자금일보(작성중)를 완전히 삭제하시겠습니까? 이력/달력에서 사라지며 되돌릴 수 없습니다.`)) return;
    setDeleting(r.id);
    try {
      await deleteDraftDailyReport(r.id);
      toast({ title: '삭제되었습니다.' });
      await loadReports();
    } catch (e) {
      toast({ title: '삭제 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setDeleting(null);
    }
  };

  // 선택삭제 대상은 작성중(draft) 상태뿐이다 — 확정(confirmed)/결재중(pending_approval)은
  // 절대 대상에 포함하지 않는다(개별 삭제와 동일한 규칙, 서비스 레이어에서도 다시 한번 막힘).
  const draftIdsOnPage = () => paged.filter(r => r.status === 'draft').map(r => r.id);
  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    const draftIds = draftIdsOnPage();
    setSelectedIds(prev => {
      const allSelected = draftIds.length > 0 && draftIds.every(id => prev.has(id));
      if (allSelected) return new Set();
      return new Set(draftIds);
    });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`선택한 ${selectedIds.size}건의 자금일보(작성중)를 완전히 삭제하시겠습니까? 이력/달력에서 사라지며 되돌릴 수 없습니다.`)) return;
    setBulkDeleting(true);
    try {
      for (const id of selectedIds) await deleteDraftDailyReport(id);
      toast({ title: `${selectedIds.size}건이 삭제되었습니다.` });
      setSelectedIds(new Set());
      await loadReports();
    } catch (e) {
      toast({ title: '삭제 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setBulkDeleting(false);
    }
  };

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

  // 자금일보가 없는 날짜를 클릭하면 그 즉시 draft 행이 생겨버리므로(getOrCreateDraftReport),
  // 실수로 눌러도 빈 이력이 쌓이지 않도록 새로 작성할지 먼저 확인한다. 이미 자금일보가
  // 있는 날짜는 조회일 뿐이니 바로 들어간다.
  const handleDayClick = (day: Date, iso: string) => {
    if (reportByDate.has(iso)) { goToDate(iso); return; }
    if (confirm(`${format(day, 'yyyy년 M월 d일')}의 자금일보를 작성하시겠습니까?`)) goToDate(iso);
  };

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
                const isFuture = iso > today;
                return (
                  <button
                    type="button"
                    key={iso}
                    onClick={() => !isFuture && handleDayClick(day, iso)}
                    disabled={isFuture}
                    className={`min-h-[68px] border-b border-r p-1.5 text-left align-top transition-colors ${isFuture ? 'cursor-not-allowed bg-gray-50/70' : 'hover:bg-blue-50/40'} ${!inMonth ? 'bg-gray-50/50' : ''} ${isToday(day) ? 'bg-blue-50/60' : ''}`}
                  >
                    <p className={`text-xs mb-1 ${isFuture ? 'text-gray-300' : !inMonth ? 'text-gray-300' : iso === today ? 'font-bold text-blue-600' : dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-gray-600'}`}>
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
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base">전체 이력</CardTitle>
            <div className="flex items-center gap-2">
              {permissions.canDelete && selectedIds.size > 0 && (
                <Button size="sm" variant="outline" className="gap-1.5 h-8 text-red-600 border-red-200" disabled={bulkDeleting} onClick={handleBulkDelete}>
                  <Trash2 className="w-3.5 h-3.5" />선택 {selectedIds.size}건 삭제
                </Button>
              )}
              <span className="text-xs text-gray-400">{reports.length}건</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {permissions.canDelete && (
                    <th className="p-2 w-8 text-center">
                      <Checkbox checked={draftIdsOnPage().length > 0 && draftIdsOnPage().every(id => selectedIds.has(id))} onCheckedChange={toggleSelectAll} />
                    </th>
                  )}
                  <th className="text-right p-2 w-10 text-xs font-medium text-gray-600">No.</th>
                  <th className="text-left p-2 text-xs font-medium text-gray-600">날짜</th>
                  <th className="text-left p-2 text-xs font-medium text-gray-600">상태</th>
                  <th className="text-left p-2 text-xs font-medium text-gray-600">확정일시</th>
                  <th className="p-2 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {paged.length === 0 ? (
                  <tr><td colSpan={permissions.canDelete ? 6 : 5} className="text-center py-8 text-gray-400 text-sm">작성된 자금일보가 없습니다.</td></tr>
                ) : paged.map((r, idx) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50 cursor-pointer" onClick={() => goToDate(r.report_date)}>
                    {permissions.canDelete && (
                      <td className="p-2 text-center" onClick={e => e.stopPropagation()}>
                        {r.status === 'draft' && <Checkbox checked={selectedIds.has(r.id)} onCheckedChange={() => toggleSelected(r.id)} />}
                      </td>
                    )}
                    <td className="p-2 text-right text-gray-400">{(currentPage - 1) * PAGE_SIZE + idx + 1}</td>
                    <td className="p-2 font-medium">{r.report_date}</td>
                    <td className="p-2"><Badge className={`text-[10px] ${STATUS_BADGE[r.status].className}`}>{STATUS_BADGE[r.status].label}</Badge></td>
                    <td className="p-2 text-gray-500">{r.confirmed_at ? new Date(r.confirmed_at).toLocaleString('ko-KR') : '-'}</td>
                    <td className="p-2 text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => goToDate(r.report_date)}>보기</Button>
                        {permissions.canDelete && r.status === 'draft' && (
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-600" title="삭제" disabled={deleting === r.id} onClick={() => handleDelete(r)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
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
