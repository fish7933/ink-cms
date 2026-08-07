import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Plus, Minus, History, Paperclip, RotateCcw, UserX, Undo2, BarChart3, ScrollText, Trash2, CalendarOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { getCurrentUser } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { getUsers } from '@/services/user.service';
import { orgChartService } from '@/services/org-chart.service';
import { useTabContext } from '@/contexts/TabContext';
import {
  getLeaveBalance, addLeaveAdjustment, resetLeaveUsage, setLeaveExempt, getAllLeaveRequests, getLeaveAdjustments, getAdminActionLog, deleteAdminActionLog,
} from '@/services/shore-leave.service';
import { getAllSickLeaveRequests } from '@/services/sick-leave.service';
import { getHolidays, addHoliday, deleteHoliday, type Holiday } from '@/services/holiday.service';
import { formatLeaveHours, formatLeaveDays, getCurrentLeaveYearStart, explainAccruedLeaveDays, HOURS_PER_DAY } from '@/lib/leave-calc';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import LeaveStatusCalendar, { type LeaveCalendarEntry } from '@/components/leave/LeaveStatusCalendar';
import LeaveUsageList from '@/components/leave/LeaveUsageList';
import type { User } from '@/types/models';
import type { SickLeaveRequestWithDetails } from '@/types/sick-leave';
import type { ShoreLeaveRequestWithDetails, ShoreLeaveAdjustment, ShoreLeaveAdminLogWithNames } from '@/types/shore-leave';

const ACTION_LABELS: Record<ShoreLeaveAdminLogWithNames['action_type'], { label: string; color: string }> = {
  grant: { label: '회사 부여', color: 'bg-blue-100 text-blue-700' },
  manual_use: { label: '사용 차감', color: 'bg-orange-100 text-orange-700' },
  reset: { label: '초기화', color: 'bg-red-100 text-red-700' },
  exempt_on: { label: '제외 지정', color: 'bg-gray-200 text-gray-700' },
  exempt_off: { label: '제외 해제', color: 'bg-gray-100 text-gray-600' },
};

const SHORE_ROLES = ['ship_manager', 'admin', 'system_admin'];
const RESET_ROLES = ['admin', 'system_admin'];
const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: '결재중', color: 'bg-yellow-100 text-yellow-700' },
  approved: { label: '승인', color: 'bg-green-100 text-green-700' },
  rejected: { label: '반려', color: 'bg-red-100 text-red-700' },
  cancelled: { label: '취소', color: 'bg-gray-100 text-gray-500' },
};

interface Row {
  user: User;
  positionName: string | null;
  legalAccruedHours: number;
  companyGrantedHours: number;
  accruedHours: number;
  usedHours: number;
  remainingHours: number;
}

export default function ShoreLeaveManagementPage() {
  const navigate = useNavigate();
  const { openNewTab } = useTabContext();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [exemptRows, setExemptRows] = useState<Row[]>([]);
  const [adminLog, setAdminLog] = useState<ShoreLeaveAdminLogWithNames[]>([]);
  const [approvedLeaveRequests, setApprovedLeaveRequests] = useState<ShoreLeaveRequestWithDetails[]>([]);
  const [allLeaveRequests, setAllLeaveRequests] = useState<ShoreLeaveRequestWithDetails[]>([]);
  const [exemptUserIds, setExemptUserIds] = useState<Set<string>>(new Set());
  const [sickRequests, setSickRequests] = useState<SickLeaveRequestWithDetails[]>([]);
  const [positionByUser, setPositionByUser] = useState<Map<string, string | null>>(new Map());
  const [loading, setLoading] = useState(true);
  const [exemptSubmittingId, setExemptSubmittingId] = useState<string | null>(null);

  const [adjustDialog, setAdjustDialog] = useState<{ user: User; type: 'grant' | 'manual_use' } | null>(null);
  const [adjustForm, setAdjustForm] = useState({ days: '0', hoursExtra: '0', reason: '' });
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);

  const [resetDialog, setResetDialog] = useState<Row | null>(null);
  const [resetForm, setResetForm] = useState({ reason: '', deleteHistory: false, resetGrants: false });
  const [resetSubmitting, setResetSubmitting] = useState(false);

  const [legalExplainRow, setLegalExplainRow] = useState<Row | null>(null);

  const [grantExplainRow, setGrantExplainRow] = useState<Row | null>(null);
  const [grantExplainList, setGrantExplainList] = useState<ShoreLeaveAdjustment[]>([]);
  const [grantExplainLoading, setGrantExplainLoading] = useState(false);

  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [holidayForm, setHolidayForm] = useState({ date: '', name: '' });
  const [holidaySubmitting, setHolidaySubmitting] = useState(false);

  const permissions = usePermissions('shore_leave_management');

  useEffect(() => {
    const init = async () => {
      const me = await getCurrentUser();
      if (!me || !SHORE_ROLES.includes(me.role)) { navigate('/dashboard'); return; }
      setCurrentUser(me);
      await loadData();
    };
    init();
  }, [navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  // 메뉴 접속(canView) 권한이 명시적으로 꺼진 경우에도 접근 차단 — 로딩 중(loading)에는
  // 아직 기본값이라 판단하지 않고 기다린다(정상 권한 사용자가 잠깐 튕겨나가는 걸 방지).
  useEffect(() => {
    if (!permissions.loading && !permissions.canView) navigate('/dashboard');
  }, [permissions.loading, permissions.canView, navigate]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [allUsers, members, sick, leaveRequests, log, holidayList] = await Promise.all([
        getUsers(),
        orgChartService.getOrgMembers(),
        getAllSickLeaveRequests(),
        getAllLeaveRequests(),
        getAdminActionLog(),
        getHolidays(),
      ]);
      const posMap = new Map(members.map(m => [m.id, m.position_name]));
      const posOrderMap = new Map(members.map(m => [m.id, m.position_order]));
      setPositionByUser(posMap);
      setSickRequests(sick);
      setAdminLog(log);
      setHolidays(holidayList);
      const exemptIds = new Set(allUsers.filter(u => u.is_leave_exempt).map(u => u.id));
      setExemptUserIds(exemptIds);
      setAllLeaveRequests(leaveRequests);
      setApprovedLeaveRequests(leaveRequests.filter(r => r.status === 'approved' && !exemptIds.has(r.user_id)));

      const shoreUsers = allUsers.filter(u => SHORE_ROLES.includes(u.role));
      const computed = await Promise.all(shoreUsers.map(async u => {
        const balance = await getLeaveBalance(u.id, u.hire_date || null);
        return { user: u, positionName: posMap.get(u.id) || null, ...balance };
      }));
      // 직급 순서(낮을수록 선임) → 같은 직급이면 입사일 빠른 순으로 정렬
      computed.sort((a, b) => {
        const aOrder = posOrderMap.get(a.user.id) ?? Number.MAX_SAFE_INTEGER;
        const bOrder = posOrderMap.get(b.user.id) ?? Number.MAX_SAFE_INTEGER;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return (a.user.hire_date || '9999-99-99').localeCompare(b.user.hire_date || '9999-99-99');
      });
      setRows(computed.filter(r => !r.user.is_leave_exempt));
      setExemptRows(computed.filter(r => r.user.is_leave_exempt));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const openDetail = (user: User) => {
    openNewTab(`/shore-leave-management/${user.id}`, `${user.name} 연차 내역`);
  };

  const handleDeleteLog = async (log: ShoreLeaveAdminLogWithNames) => {
    if (!confirm('이 작업 로그를 삭제하시겠습니까? 되돌릴 수 없습니다.')) return;
    try {
      await deleteAdminActionLog(log.id);
      setAdminLog(prev => prev.filter(l => l.id !== log.id));
      toast({ title: '삭제되었습니다.' });
    } catch (e) {
      toast({ title: '삭제 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  const handleAddHoliday = async () => {
    if (!holidayForm.date) { toast({ title: '날짜를 선택하세요.', variant: 'destructive' }); return; }
    if (!holidayForm.name.trim()) { toast({ title: '공휴일 이름을 입력하세요.', variant: 'destructive' }); return; }
    try {
      setHolidaySubmitting(true);
      const created = await addHoliday(holidayForm.date, holidayForm.name.trim());
      setHolidays(prev => [...prev, created].sort((a, b) => a.date.localeCompare(b.date)));
      setHolidayForm({ date: '', name: '' });
      toast({ title: '공휴일이 등록되었습니다.' });
    } catch (e) {
      toast({ title: '등록 실패', description: e instanceof Error ? e.message : '이미 등록된 날짜일 수 있습니다.', variant: 'destructive' });
    } finally {
      setHolidaySubmitting(false);
    }
  };

  const handleDeleteHoliday = async (holiday: Holiday) => {
    if (!confirm(`'${holiday.name}'(${holiday.date})을(를) 삭제하시겠습니까?`)) return;
    try {
      await deleteHoliday(holiday.id);
      setHolidays(prev => prev.filter(h => h.id !== holiday.id));
      toast({ title: '삭제되었습니다.' });
    } catch (e) {
      toast({ title: '삭제 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  const openAdjust = (user: User, type: 'grant' | 'manual_use') => {
    setAdjustForm({ days: '0', hoursExtra: '0', reason: '' });
    setAdjustDialog({ user, type });
  };

  const adjustTotalHours = (parseFloat(adjustForm.days) || 0) * HOURS_PER_DAY + (parseFloat(adjustForm.hoursExtra) || 0);

  const submitAdjust = async () => {
    if (!adjustDialog || !currentUser) return;
    if (adjustTotalHours <= 0) { toast({ title: '일수/시간을 확인하세요.', variant: 'destructive' }); return; }
    if (!adjustForm.reason.trim()) { toast({ title: '사유를 입력하세요.', variant: 'destructive' }); return; }
    try {
      setAdjustSubmitting(true);
      await addLeaveAdjustment({
        user_id: adjustDialog.user.id,
        adjustment_type: adjustDialog.type,
        hours: adjustTotalHours,
        reason: adjustForm.reason,
        created_by: currentUser.id,
      });
      toast({ title: adjustDialog.type === 'grant' ? '연차가 부여되었습니다.' : '연차 사용이 입력되었습니다.' });
      setAdjustDialog(null);
      await loadData();
    } catch (e) {
      console.error(e);
      toast({ title: '처리 실패', variant: 'destructive' });
    } finally {
      setAdjustSubmitting(false);
    }
  };

  const openReset = (row: Row) => {
    setResetForm({ reason: '', deleteHistory: false, resetGrants: false });
    setResetDialog(row);
  };

  const submitReset = async () => {
    if (!resetDialog || !currentUser) return;
    // 계산상 사용/부여가 0이어도, "내역까지 삭제"를 선택했다면 남아있는 이력만 정리하려는 것일 수 있으므로 허용한다.
    const willResetSomething = resetDialog.usedHours > 0 || (resetForm.resetGrants && resetDialog.companyGrantedHours > 0) || resetForm.deleteHistory;
    if (!willResetSomething) { toast({ title: '초기화할 내역이 없습니다.', variant: 'destructive' }); return; }
    if (!resetForm.reason.trim()) { toast({ title: '사유를 입력하세요.', variant: 'destructive' }); return; }
    try {
      setResetSubmitting(true);
      await resetLeaveUsage({
        user_id: resetDialog.user.id,
        delete_history: resetForm.deleteHistory,
        reset_grants: resetForm.resetGrants,
        reason: resetForm.reason,
        created_by: currentUser.id,
      });
      toast({ title: '사용/잔여 연차가 초기화되었습니다.' });
      setResetDialog(null);
      await loadData();
    } catch (e) {
      console.error(e);
      toast({ title: '초기화 실패', variant: 'destructive' });
    } finally {
      setResetSubmitting(false);
    }
  };

  const toggleExempt = async (row: Row, exempt: boolean) => {
    if (!currentUser) return;
    if (exempt && !confirm(`${row.user.name}님을 연차 적용 제외자로 지정하시겠습니까? 연차 현황/관리 대상에서 제외됩니다.`)) return;
    try {
      setExemptSubmittingId(row.user.id);
      await setLeaveExempt(row.user.id, exempt, currentUser.id);
      toast({ title: exempt ? '연차 적용 제외자로 지정되었습니다.' : '연차 적용 대상으로 다시 포함되었습니다.' });
      await loadData();
    } catch (e) {
      console.error(e);
      toast({ title: '처리 실패', variant: 'destructive' });
    } finally {
      setExemptSubmittingId(null);
    }
  };

  const openGrantExplain = async (row: Row) => {
    setGrantExplainRow(row);
    setGrantExplainLoading(true);
    try {
      const all = await getLeaveAdjustments(row.user.id);
      setGrantExplainList(all.filter(a => a.adjustment_type === 'grant'));
    } catch (e) {
      console.error(e);
      toast({ title: '부여 내역을 불러오는 중 오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setGrantExplainLoading(false);
    }
  };

  const sickTotalsByUser = new Map<string, number>();
  for (const r of sickRequests) {
    if (r.status !== 'approved') continue;
    sickTotalsByUser.set(r.user_id, (sickTotalsByUser.get(r.user_id) || 0) + Number(r.hours));
  }

  const calendarEntries: LeaveCalendarEntry[] = useMemo(() => [
    ...allLeaveRequests
      .filter(r => (r.status === 'approved' || r.status === 'pending') && !exemptUserIds.has(r.user_id))
      .map(r => ({ id: r.id, user_id: r.user_id, user_name: r.user_name, kind: 'annual' as const, status: r.status, start_date: r.start_date, end_date: r.end_date, start_time: r.start_time, end_time: r.end_time })),
    ...sickRequests
      .filter(r => r.status === 'approved' || r.status === 'pending')
      .map(r => ({ id: r.id, user_id: r.user_id, user_name: r.user_name, kind: 'sick' as const, status: r.status, start_date: r.start_date, end_date: r.end_date, start_time: r.start_time, end_time: r.end_time })),
  ], [allLeaveRequests, sickRequests, exemptUserIds]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>;

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
      <div className="flex items-center gap-2">
        <Users className="w-6 h-6" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">육상 직원 휴가 관리</h1>
          <p className="text-sm text-gray-500">근로기준법에 따라 자동 발생하는 법정 연차와 회사가 재량으로 부여한 연차를 구분해서 관리하며, 승인된 신청 내역/수동 사용 입력을 반영해 잔여 연차를 계산합니다. 사용/부여 내역은 각자의 다음 연차 발생일이 지나면 자동으로 새로 초기화됩니다(이월 없음). 연차 적용 제외자(임원 등)는 현황·관리 대상에서 제외됩니다.</p>
        </div>
      </div>

      <Tabs defaultValue="annual">
        <TabsList>
          <TabsTrigger value="annual">연차 관리</TabsTrigger>
          <TabsTrigger value="leave-status" className="gap-1"><BarChart3 className="w-3.5 h-3.5" />휴가 사용 현황</TabsTrigger>
          <TabsTrigger value="holidays" className="gap-1"><CalendarOff className="w-3.5 h-3.5" />공휴일 관리</TabsTrigger>
        </TabsList>

        <TabsContent value="annual" className="space-y-4 mt-3">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">직원별 연차 현황</CardTitle></CardHeader>
            <CardContent>
              <div className="border rounded-md overflow-hidden overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left p-2 text-xs font-medium text-gray-600">이름</th>
                      <th className="text-left p-2 text-xs font-medium text-gray-600">입사일</th>
                      <th className="text-left p-2 text-xs font-medium text-gray-600">연차 발생일</th>
                      <th className="text-center p-2 text-xs font-medium text-gray-600">법정 발생</th>
                      <th className="text-center p-2 text-xs font-medium text-gray-600">회사 부여</th>
                      <th className="text-center p-2 text-xs font-medium text-gray-600">총 발생 연차</th>
                      <th className="text-center p-2 text-xs font-medium text-gray-600">사용</th>
                      <th className="text-center p-2 text-xs font-medium text-gray-600">잔여</th>
                      <th className="text-center p-2 text-xs font-medium text-gray-600">작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr><td colSpan={9} className="text-center py-8 text-gray-400">등록된 육상 직원이 없습니다</td></tr>
                    ) : rows.map(r => (
                      <tr key={r.user.id} className="border-b hover:bg-gray-50">
                        <td className="p-2 font-medium">{r.positionName ? `${r.positionName} ` : ''}{r.user.name}</td>
                        <td className="p-2 text-gray-500">
                          {r.user.hire_date || <span className="text-red-500">미등록</span>}
                        </td>
                        <td className="p-2 text-gray-500">
                          {r.user.hire_date ? getCurrentLeaveYearStart(r.user.hire_date) : '-'}
                        </td>
                        <td className="p-2 text-center">
                          <button type="button" className="underline decoration-dotted underline-offset-2 hover:text-blue-600" onClick={() => setLegalExplainRow(r)} title="계산 방법 보기">
                            {formatLeaveHours(r.legalAccruedHours)}
                          </button>
                        </td>
                        <td className="p-2 text-center text-blue-600">
                          {r.companyGrantedHours > 0 ? (
                            <button type="button" className="underline decoration-dotted underline-offset-2 hover:text-blue-800" onClick={() => openGrantExplain(r)} title="부여 사유 보기">
                              {formatLeaveHours(r.companyGrantedHours)}
                            </button>
                          ) : '-'}
                        </td>
                        <td className="p-2 text-center font-medium">{formatLeaveHours(r.accruedHours)}</td>
                        <td className="p-2 text-center text-gray-500">{formatLeaveDays(r.usedHours)}</td>
                        <td className="p-2 text-center font-semibold text-blue-700">{formatLeaveHours(r.remainingHours)}</td>
                        <td className="p-2">
                          <div className="flex items-center justify-center gap-0.5 whitespace-nowrap">
                            <Button variant="outline" size="sm" className="h-7 px-1.5 text-xs gap-0.5" onClick={() => openDetail(r.user)} title="연차 내역">
                              <History className="w-3 h-3" />내역
                            </Button>
                            {permissions.canCreate && (
                              <>
                                <Button variant="outline" size="sm" className="h-7 px-1.5 text-xs gap-0.5 text-blue-600" onClick={() => openAdjust(r.user, 'grant')} title="회사 부여">
                                  <Plus className="w-3 h-3" />부여
                                </Button>
                                <Button variant="outline" size="sm" className="h-7 px-1.5 text-xs gap-0.5 text-orange-600" onClick={() => openAdjust(r.user, 'manual_use')} title="수동 사용 입력">
                                  <Minus className="w-3 h-3" />차감
                                </Button>
                              </>
                            )}
                            {currentUser && RESET_ROLES.includes(currentUser.role) && (
                              <Button variant="outline" size="sm" className="h-7 px-1.5 text-xs gap-0.5 text-red-600" onClick={() => openReset(r)} title="사용/잔여 초기화">
                                <RotateCcw className="w-3 h-3" />초기화
                              </Button>
                            )}
                            {currentUser && RESET_ROLES.includes(currentUser.role) && (
                              <Button variant="outline" size="sm" className="h-7 px-1.5 text-xs gap-0.5 text-gray-500" disabled={exemptSubmittingId === r.user.id} onClick={() => toggleExempt(r, true)} title="연차 적용 제외">
                                <UserX className="w-3 h-3" />제외
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {exemptRows.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-1.5"><UserX className="w-4 h-4 text-gray-400" />연차 적용 제외자 ({exemptRows.length}명)</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-2">
                  {exemptRows.map(r => (
                    <div key={r.user.id} className="flex items-center gap-2 pl-3 pr-1.5 py-1 bg-gray-50 border rounded-full text-sm">
                      <span className="text-gray-600">{r.positionName ? `${r.positionName} ` : ''}{r.user.name}</span>
                      {currentUser && RESET_ROLES.includes(currentUser.role) && (
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1 text-blue-600" disabled={exemptSubmittingId === r.user.id} onClick={() => toggleExempt(r, false)}>
                          <Undo2 className="w-3 h-3" />포함
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-1.5"><ScrollText className="w-4 h-4 text-gray-400" />관리자 작업 로그</CardTitle>
              <p className="text-xs text-gray-500">
                부여/차감/초기화/제외 지정·해제 등 관리자가 수행한 작업을 담당자와 함께 기록합니다.
                {currentUser?.role === 'admin' ? ' 슈퍼관리자만 삭제할 수 있습니다.' : ' 이 로그는 삭제할 수 없습니다.'}
              </p>
            </CardHeader>
            <CardContent className="pt-0">
              {adminLog.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">작업 로그가 없습니다</p>
              ) : (
                <div className="border rounded-md overflow-hidden overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left p-2">일시</th>
                        <th className="text-left p-2">대상 직원</th>
                        <th className="text-center p-2">작업</th>
                        <th className="text-center p-2">시간</th>
                        <th className="text-left p-2">사유</th>
                        <th className="text-left p-2">담당자</th>
                        {currentUser?.role === 'admin' && <th className="text-center p-2 w-12">작업</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {adminLog.map(l => (
                        <tr key={l.id} className="border-b">
                          <td className="p-2 text-gray-500 whitespace-nowrap">{new Date(l.created_at).toLocaleString('ko-KR')}</td>
                          <td className="p-2 font-medium">{l.user_name}</td>
                          <td className="p-2 text-center"><Badge className={`text-xs ${ACTION_LABELS[l.action_type]?.color}`}>{ACTION_LABELS[l.action_type]?.label}</Badge></td>
                          <td className="p-2 text-center">{l.hours != null ? formatLeaveHours(l.hours) : '-'}</td>
                          <td className="p-2 text-gray-500">{l.reason || '-'}</td>
                          <td className="p-2 text-blue-700 font-medium whitespace-nowrap">{l.performed_by_name}</td>
                          {currentUser?.role === 'admin' && (
                            <td className="p-2 text-center">
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400 hover:text-red-600" onClick={() => handleDeleteLog(l)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leave-status" className="space-y-4 mt-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">휴가 현황 캘린더</CardTitle>
              <p className="text-xs text-gray-500">승인된 연차/질병휴가와 상신 후 결재중인 건을 함께 표시합니다.</p>
            </CardHeader>
            <CardContent>
              <LeaveStatusCalendar entries={calendarEntries} positionByUser={positionByUser} />
            </CardContent>
          </Card>

          <Tabs defaultValue="annual-usage">
            <TabsList>
              <TabsTrigger value="annual-usage">직원별 연차 사용</TabsTrigger>
              <TabsTrigger value="sick-usage">질병 휴가 현황</TabsTrigger>
            </TabsList>

            <TabsContent value="annual-usage" className="space-y-4 mt-3">
              <LeaveUsageOverview rows={rows} />
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">연차 사용/예정 내역</CardTitle>
                  <p className="text-xs text-gray-500">사용한 연차와 앞으로 사용 예정인 승인 건을 최근 발생순으로 나열합니다.</p>
                </CardHeader>
                <CardContent>
                  <LeaveUsageList requests={approvedLeaveRequests} positionByUser={positionByUser} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="sick-usage" className="space-y-4 mt-3">
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base">직원별 누적 질병휴가(승인 기준)</CardTitle></CardHeader>
                <CardContent>
                  <div className="border rounded-md overflow-hidden overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="text-left p-2 text-xs font-medium text-gray-600">이름</th>
                          <th className="text-center p-2 text-xs font-medium text-gray-600">누적 사용</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.length === 0 ? (
                          <tr><td colSpan={2} className="text-center py-8 text-gray-400">데이터가 없습니다</td></tr>
                        ) : rows.map(r => (
                          <tr key={r.user.id} className="border-b hover:bg-gray-50">
                            <td className="p-2 font-medium">{r.positionName ? `${r.positionName} ` : ''}{r.user.name}</td>
                            <td className="p-2 text-center">{formatLeaveHours(sickTotalsByUser.get(r.user.id) || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base">질병휴가 신청 내역 (전체)</CardTitle></CardHeader>
                <CardContent>
                  <div className="border rounded-md overflow-hidden overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="text-left p-2">이름</th>
                          <th className="text-left p-2">기간</th>
                          <th className="text-center p-2">일수/시간</th>
                          <th className="text-left p-2">사유</th>
                          <th className="text-center p-2">상태</th>
                          <th className="text-center p-2">증빙</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sickRequests.length === 0 ? (
                          <tr><td colSpan={6} className="text-center py-8 text-gray-400">신청 내역이 없습니다</td></tr>
                        ) : sickRequests.map(r => (
                          <tr key={r.id} className="border-b">
                            <td className="p-2 font-medium">{positionByUser.get(r.user_id) ? `${positionByUser.get(r.user_id)} ` : ''}{r.user_name}</td>
                            <td className="p-2">{r.start_date} ~ {r.end_date}</td>
                            <td className="p-2 text-center">{formatLeaveHours(r.hours)}</td>
                            <td className="p-2 text-gray-500">{r.reason || '-'}</td>
                            <td className="p-2 text-center"><Badge className={`text-xs ${STATUS_LABELS[r.status]?.color}`}>{STATUS_LABELS[r.status]?.label}</Badge></td>
                            <td className="p-2 text-center">
                              {r.attachments && r.attachments.length > 0 ? (
                                <details className="inline-block text-left">
                                  <summary className="cursor-pointer text-blue-600 inline-flex items-center gap-1 list-none"><Paperclip className="w-3 h-3" />{r.attachments.length}</summary>
                                  <div className="mt-1 space-y-0.5">
                                    {r.attachments.map(a => (
                                      <a key={a.path} href={supabase.storage.from('documents').getPublicUrl(a.path).data.publicUrl} target="_blank" rel="noreferrer" className="block text-blue-600 hover:underline truncate max-w-[160px]">{a.name}</a>
                                    ))}
                                  </div>
                                </details>
                              ) : <span className="text-gray-300">-</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="holidays" className="space-y-4 mt-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">공휴일 관리</CardTitle>
              <p className="text-xs text-gray-500 mt-1">여기에 등록된 날짜는 연차/반차 신청 시 주말과 함께 근무일에서 자동 제외됩니다. 설날/추석 등 음력 명절은 매년 날짜가 바뀌므로 연초에 새로 등록해주세요.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {permissions.canCreate && (
                <div className="flex items-end gap-2 flex-wrap p-3 bg-gray-50 rounded-md">
                  <div className="space-y-1.5">
                    <Label className="text-xs">날짜</Label>
                    <Input type="date" className="h-9 text-sm" value={holidayForm.date} onChange={e => setHolidayForm(f => ({ ...f, date: e.target.value }))} disabled={holidaySubmitting} />
                  </div>
                  <div className="space-y-1.5 flex-1 min-w-[160px]">
                    <Label className="text-xs">이름</Label>
                    <Input className="h-9 text-sm" placeholder="예: 설날, 창립기념일" value={holidayForm.name} onChange={e => setHolidayForm(f => ({ ...f, name: e.target.value }))} disabled={holidaySubmitting} />
                  </div>
                  <Button size="sm" className="h-9 gap-1.5" onClick={handleAddHoliday} disabled={holidaySubmitting}><Plus className="w-4 h-4" />추가</Button>
                </div>
              )}
              <div className="border rounded-md overflow-hidden overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left p-2 text-xs font-medium text-gray-600">날짜</th>
                      <th className="text-left p-2 text-xs font-medium text-gray-600">요일</th>
                      <th className="text-left p-2 text-xs font-medium text-gray-600">이름</th>
                      {permissions.canDelete && <th className="text-center p-2 text-xs font-medium text-gray-600 w-16">삭제</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {holidays.length === 0 ? (
                      <tr><td colSpan={4} className="text-center py-8 text-gray-400">등록된 공휴일이 없습니다</td></tr>
                    ) : holidays.map(h => (
                      <tr key={h.id} className="border-b hover:bg-gray-50">
                        <td className="p-2 font-medium">{h.date}</td>
                        <td className="p-2 text-gray-500">{['일', '월', '화', '수', '목', '금', '토'][new Date(h.date).getDay()]}</td>
                        <td className="p-2">{h.name}</td>
                        {permissions.canDelete && (
                          <td className="p-2 text-center">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-red-600" onClick={() => handleDeleteHoliday(h)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 직원별 연차 내역 */}
      {/* 수동 부여 / 사용 입력 */}
      <Dialog open={!!adjustDialog} onOpenChange={open => !open && setAdjustDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {adjustDialog?.user.name}님 {adjustDialog?.type === 'grant' ? '연차 회사 부여' : '연차 수동 사용 입력'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">일수</Label><Input type="number" step="0.5" min="0" value={adjustForm.days} onChange={e => setAdjustForm({ ...adjustForm, days: e.target.value })} className="h-9 text-sm" disabled={adjustSubmitting} /></div>
              <div className="space-y-1.5"><Label className="text-xs">시간</Label><Input type="number" step="0.5" min="0" max="23.5" value={adjustForm.hoursExtra} onChange={e => setAdjustForm({ ...adjustForm, hoursExtra: e.target.value })} className="h-9 text-sm" disabled={adjustSubmitting} /></div>
            </div>
            <p className="text-xs text-gray-500">합계: <span className="font-medium text-gray-700">{formatLeaveHours(adjustTotalHours)}</span></p>
            <div className="space-y-1.5">
              <Label className="text-xs">사유 *</Label>
              <Textarea value={adjustForm.reason} onChange={e => setAdjustForm({ ...adjustForm, reason: e.target.value })} rows={2} className="text-sm resize-none" disabled={adjustSubmitting} placeholder={adjustDialog?.type === 'grant' ? '예: 포상휴가, 창립기념일 특별연차' : '예: 소급 반영 - 결재 없이 사용한 연차'} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustDialog(null)} disabled={adjustSubmitting}>취소</Button>
            <Button onClick={submitAdjust} disabled={adjustSubmitting}>{adjustSubmitting ? '처리 중...' : '저장'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 사용/잔여 초기화 (시스템관리자 이상) */}
      <Dialog open={!!resetDialog} onOpenChange={open => !open && setResetDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{resetDialog?.user.name}님 연차 사용/잔여 초기화</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 bg-gray-50 rounded-md text-sm">
                <p className="text-xs text-gray-500">현재 사용</p>
                <p className="font-semibold text-orange-600">{resetDialog && formatLeaveDays(resetDialog.usedHours)}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-md text-sm">
                <p className="text-xs text-gray-500">현재 회사 부여</p>
                <p className="font-semibold text-blue-600">{resetDialog && formatLeaveHours(resetDialog.companyGrantedHours)}</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">사유 *</Label>
              <Textarea value={resetForm.reason} onChange={e => setResetForm({ ...resetForm, reason: e.target.value })} rows={2} className="text-sm resize-none" disabled={resetSubmitting} placeholder="예: 연차 재산정으로 인한 초기화" />
            </div>
            <label className="flex items-start gap-2 p-2.5 border rounded-md cursor-pointer">
              <Checkbox checked={resetForm.resetGrants} onCheckedChange={c => setResetForm({ ...resetForm, resetGrants: c === true })} disabled={resetSubmitting} className="mt-0.5" />
              <span className="text-xs">
                <span className="font-medium text-blue-700">회사 부여 연차도 함께 초기화</span>
                <span className="block text-gray-500 mt-0.5">체크하지 않으면 사용/잔여만 초기화되고 회사 부여분은 그대로 유지됩니다. 체크하면 회사 부여분도 0으로 초기화됩니다.</span>
              </span>
            </label>
            <label className="flex items-start gap-2 p-2.5 border rounded-md cursor-pointer">
              <Checkbox checked={resetForm.deleteHistory} onCheckedChange={c => setResetForm({ ...resetForm, deleteHistory: c === true })} disabled={resetSubmitting} className="mt-0.5" />
              <span className="text-xs">
                <span className="font-medium text-red-600">내역까지 삭제</span>
                <span className="block text-gray-500 mt-0.5">체크하면 초기화 이전의 연차 신청/수동 사용 입력{resetForm.resetGrants ? '/회사 부여' : ''} 내역 자체를 삭제합니다. 되돌릴 수 없습니다. 체크하지 않으면 내역은 그대로 남고 잔여 계산에서만 제외됩니다.</span>
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetDialog(null)} disabled={resetSubmitting}>취소</Button>
            <Button variant="destructive" onClick={submitReset} disabled={resetSubmitting}>{resetSubmitting ? '처리 중...' : '초기화'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 법정 발생 계산식 */}
      <Dialog open={!!legalExplainRow} onOpenChange={open => !open && setLegalExplainRow(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{legalExplainRow?.user.name}님 법정 발생 연차 계산</DialogTitle>
          </DialogHeader>
          {legalExplainRow && (() => {
            const ex = legalExplainRow.user.hire_date ? explainAccruedLeaveDays(legalExplainRow.user.hire_date) : null;
            if (!ex || !legalExplainRow.user.hire_date) {
              return <p className="text-sm text-gray-400 py-4 text-center">입사일이 등록되어 있지 않아 계산할 수 없습니다.</p>;
            }
            return (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 bg-gray-50 rounded-md">
                    <p className="text-xs text-gray-500">입사일</p>
                    <p className="font-medium">{ex.hireDate}</p>
                  </div>
                  <div className="p-2.5 bg-gray-50 rounded-md">
                    <p className="text-xs text-gray-500">기준일(오늘)</p>
                    <p className="font-medium">{ex.asOfDate}</p>
                  </div>
                </div>
                <div className="p-2.5 bg-gray-50 rounded-md">
                  <p className="text-xs text-gray-500">적용 규정</p>
                  <p className="font-medium">{ex.ruleLabel} (근로기준법 제60조)</p>
                </div>
                <div className="p-3 bg-blue-50 rounded-md">
                  <p className="text-xs text-blue-600 mb-1">계산 과정</p>
                  <p className="text-sm text-blue-900">{ex.formulaText}</p>
                </div>
                <div className="p-3 bg-blue-50 rounded-md text-center">
                  <p className="text-xs text-blue-600">결과</p>
                  <p className="text-lg font-bold text-blue-700">{ex.days}일 ({ex.days * HOURS_PER_DAY}시간)</p>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* 회사 부여 사유 */}
      <Dialog open={!!grantExplainRow} onOpenChange={open => !open && setGrantExplainRow(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{grantExplainRow?.user.name}님 회사 부여 연차 내역</DialogTitle>
          </DialogHeader>
          {grantExplainLoading ? (
            <div className="py-8 text-center text-sm text-gray-400">불러오는 중...</div>
          ) : grantExplainList.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">부여 내역이 없습니다</div>
          ) : (
            <div className="space-y-2">
              {grantExplainList.map(a => (
                <div key={a.id} className="p-2.5 bg-blue-50 rounded-md text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">{new Date(a.created_at).toLocaleDateString('ko-KR')}</span>
                    <span className="font-semibold text-blue-700">+{formatLeaveHours(a.hours)}</span>
                  </div>
                  <p className="text-gray-700 mt-0.5">{a.reason || '사유 미기재'}</p>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// 전체 인원의 연차 사용 현황을 한눈에 보는 요약 뷰. 사용률(사용/발생) 기준 내림차순 막대 목록.
function LeaveUsageOverview({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return <Card><CardContent className="py-12 text-center text-gray-400">표시할 인원이 없습니다</CardContent></Card>;
  }

  const withRate = rows.map(r => ({ ...r, rate: r.accruedHours > 0 ? Math.min(100, (r.usedHours / r.accruedHours) * 100) : 0 }));
  const sorted = [...withRate].sort((a, b) => b.rate - a.rate);

  const totalAccrued = rows.reduce((s, r) => s + r.accruedHours, 0);
  const totalUsed = rows.reduce((s, r) => s + r.usedHours, 0);
  const avgRate = totalAccrued > 0 ? Math.round((totalUsed / totalAccrued) * 1000) / 10 : 0;
  const zeroUsageCount = rows.filter(r => r.usedHours === 0).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-xs text-gray-500">전체 인원</p>
          <p className="text-xl font-bold">{rows.length}명</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-xs text-gray-500">평균 사용률</p>
          <p className="text-xl font-bold text-blue-700">{avgRate}%</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center">
          <p className="text-xs text-gray-500">연차 미사용자</p>
          <p className="text-xl font-bold text-orange-600">{zeroUsageCount}명</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">인원별 사용률 (사용 / 발생, 높은 순)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {sorted.map(r => (
            <div key={r.user.id}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="font-medium text-gray-800">{r.positionName ? `${r.positionName} ` : ''}{r.user.name}</span>
                <span className="text-xs text-gray-500 tabular-nums">
                  {formatLeaveHours(r.usedHours)} / {formatLeaveHours(r.accruedHours)} <span className="font-medium text-gray-700">({Math.round(r.rate)}%)</span>
                </span>
              </div>
              <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-600 rounded-full" style={{ width: `${r.rate}%` }} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
