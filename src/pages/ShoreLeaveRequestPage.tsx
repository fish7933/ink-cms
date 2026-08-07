import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Send, X, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import LeaveRangeCalendar from '@/components/leave/LeaveRangeCalendar';
import { getCurrentUser } from '@/lib/store';
import { orgChartService } from '@/services/org-chart.service';
import { approvalDocumentService } from '@/services/approval-document.service';
import { getMyLeaveRequests, addLeaveRequest, cancelLeaveRequest, deleteLeaveRequest, linkLeaveRequestDocument, linkLeaveCancellationDocument, getLeaveBalance } from '@/services/shore-leave.service';
import { formatLeaveHours, type LeaveBalance } from '@/lib/leave-calc';
import { calculateLeaveHours, isWorkingDay, rangesOverlap } from '@/lib/leave-duration';
import { getHolidays, type Holiday } from '@/services/holiday.service';
import type { OrgUnit, ApprovalChainStep } from '@/types/org-chart';
import type { ShoreLeaveRequest } from '@/types/shore-leave';
import type { User } from '@/types/models';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: '결재중', color: 'bg-yellow-100 text-yellow-700' },
  approved: { label: '승인', color: 'bg-green-100 text-green-700' },
  rejected: { label: '반려', color: 'bg-red-100 text-red-700' },
  cancelled: { label: '취소', color: 'bg-gray-100 text-gray-500' },
};

type LeaveType = 'full' | 'am' | 'pm';

const LEAVE_TYPE_OPTIONS: { value: LeaveType; label: string; range: string }[] = [
  { value: 'full', label: '종일', range: '09:00~18:00' },
  { value: 'am', label: '오전반차', range: '09:00~14:00' },
  { value: 'pm', label: '오후반차', range: '14:00~18:00' },
];

const LEAVE_TYPE_TIMES: Record<LeaveType, { start_time: string; end_time: string }> = {
  full: { start_time: '09:00', end_time: '18:00' },
  am: { start_time: '09:00', end_time: '14:00' },
  pm: { start_time: '14:00', end_time: '18:00' },
};

function getTodayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export default function ShoreLeaveRequestPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const permissions = usePermissions('shore_leave_request');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [balance, setBalance] = useState<LeaveBalance>({ legalAccruedHours: 0, companyGrantedHours: 0, accruedHours: 0, usedHours: 0, remainingHours: 0 });
  const [myRequests, setMyRequests] = useState<ShoreLeaveRequest[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [myOrgUnitId, setMyOrgUnitId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [approvalChain, setApprovalChain] = useState<ApprovalChainStep[]>([]);
  const [chainLoading, setChainLoading] = useState(true);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [cancellationDocStatuses, setCancellationDocStatuses] = useState<Map<string, string>>(new Map());
  const [cancelTarget, setCancelTarget] = useState<ShoreLeaveRequest | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  const [form, setForm] = useState({ start_date: '', end_date: '', leaveType: 'full' as LeaveType, reason: '', ccOrgUnitIds: [] as string[] });

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (!permissions.loading && !permissions.canView) navigate('/dashboard');
  }, [permissions.loading, permissions.canView, navigate]);

  const loadData = async () => {
    setLoading(true);
    try {
      const user = await getCurrentUser();
      setCurrentUser(user);
      if (!user) return;

      const [units, members, requests, bal, holidayList] = await Promise.all([
        orgChartService.getOrgUnits(),
        orgChartService.getOrgMembers(),
        getMyLeaveRequests(user.id),
        getLeaveBalance(user.id, user.hire_date || null),
        getHolidays(),
      ]);
      setOrgUnits(units);
      setMyRequests(requests);
      setBalance(bal);
      setHolidays(holidayList);
      const cancellationDocIds = requests.map(r => r.cancellation_document_id).filter((id): id is string => !!id);
      setCancellationDocStatuses(await approvalDocumentService.getDocumentStatuses(cancellationDocIds));
      const me = members.find(m => m.id === user.id);
      const orgUnitId = me?.org_unit_ids[0] || null;
      setMyOrgUnitId(orgUnitId);
      await loadApprovalChain(orgUnitId);
    } catch (e) {
      console.error(e);
      toast({ title: '데이터를 불러오는 중 오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const loadApprovalChain = async (orgUnitId: string | null) => {
    setChainLoading(true);
    try {
      if (!orgUnitId) { setApprovalChain([]); return; }
      const documentTypes = await approvalDocumentService.getDocumentTypes();
      const leaveType = documentTypes.find(t => t.code === 'LEAVE_REQUEST');
      if (!leaveType) { setApprovalChain([]); return; }
      const chain = await approvalDocumentService.previewChain(orgUnitId, leaveType.id);
      setApprovalChain(chain);
    } catch (e) {
      console.error(e);
      setApprovalChain([]);
    } finally {
      setChainLoading(false);
    }
  };

  const holidayMap = new Map(holidays.map(h => [h.date, h.name]));
  const holidayDateSet = new Set(holidays.map(h => h.date));
  const isSingleDay = !!form.start_date && form.start_date === form.end_date;
  const effectiveLeaveType: LeaveType = isSingleDay ? form.leaveType : 'full';
  const { start_time, end_time } = LEAVE_TYPE_TIMES[effectiveLeaveType];
  const totalHours = calculateLeaveHours(form.start_date, start_time, form.end_date, end_time, holidayDateSet);
  // 하루짜리 연차인데 그 날이 주말/공휴일이면 애초에 신청할 수 없는 날이므로 별도로 안내한다.
  const singleDayIsNonWorking = isSingleDay && !!form.start_date && !isWorkingDay(form.start_date, holidayDateSet);
  const dayCount = form.start_date && form.end_date
    ? Math.round((new Date(form.end_date).getTime() - new Date(form.start_date).getTime()) / 86400000) + 1
    : 0;
  const isMultiDay = dayCount >= 2;
  const isToday = form.start_date === getTodayIso();
  // 당일 신청은 원칙적으로 오전 9시 전까지만 가능하지만, 오후반차는 오후(14시)에 시작하므로
  // 당일 오전 중에는(14시 전까지) 신청할 수 있게 예외를 둔다.
  const isSameDayRequestBlocked = isToday && (
    effectiveLeaveType === 'pm' ? new Date().getHours() >= 14 : new Date().getHours() >= 9
  );
  // 이틀 이상 연속 연차는 최소 3일 전(=시작일이 오늘부터 3일 이상 남았을 때)에 신청해야 한다.
  const daysUntilStart = form.start_date
    ? Math.round((new Date(form.start_date).getTime() - new Date(new Date().toDateString()).getTime()) / 86400000)
    : 0;
  const isMultiDayTooSoon = isMultiDay && daysUntilStart < 3;

  const toggleCcUnit = (unitId: string) => {
    setForm(prev => ({
      ...prev,
      ccOrgUnitIds: prev.ccOrgUnitIds.includes(unitId) ? prev.ccOrgUnitIds.filter(id => id !== unitId) : [...prev.ccOrgUnitIds, unitId],
    }));
  };

  const handleSubmit = async () => {
    if (!currentUser) return;
    if (!currentUser.hire_date) { toast({ title: '입사일이 등록되어 있지 않습니다. 관리자에게 문의하세요.', variant: 'destructive' }); return; }
    if (!myOrgUnitId) { toast({ title: '소속 부서가 조직도에 등록되어 있지 않습니다. 관리자에게 문의하세요.', variant: 'destructive' }); return; }
    if (!form.start_date || !form.end_date) { toast({ title: '달력에서 휴가 기간을 선택하세요.', variant: 'destructive' }); return; }
    if (isSameDayRequestBlocked) { toast({ title: effectiveLeaveType === 'pm' ? '당일 오후반차는 오후 2시 이전에만 신청할 수 있습니다.' : '당일 연차는 오전 9시 이전에만 신청할 수 있습니다.', variant: 'destructive' }); return; }
    if (isMultiDayTooSoon) { toast({ title: '이틀 이상의 연차는 최소 3일 전에 신청해야 합니다.', variant: 'destructive' }); return; }
    if (singleDayIsNonWorking) { toast({ title: '선택한 날짜는 주말/공휴일이라 연차를 신청할 수 없습니다.', variant: 'destructive' }); return; }
    if (totalHours <= 0) { toast({ title: '휴가 시간을 확인하세요. (선택한 기간에 근무일이 없거나, 종료 시각이 시작 시각보다 늦어야 합니다)', variant: 'destructive' }); return; }
    if (totalHours > balance.remainingHours) { toast({ title: `잔여 연차(${formatLeaveHours(balance.remainingHours)})를 초과했습니다.`, variant: 'destructive' }); return; }
    if (isMultiDay && !form.reason.trim()) { toast({ title: '2일 이상 신청 시 특별한 사유를 입력해야 합니다.', description: '예: 여름휴가 등', variant: 'destructive' }); return; }

    // 이미 결재중이거나 승인된 신청과 날짜/시간대가 겹치면 중복 신청을 막는다.
    const newRange = { start_date: form.start_date, start_time, end_date: form.end_date, end_time };
    const conflict = (await getMyLeaveRequests(currentUser.id)).find(r =>
      (r.status === 'pending' || r.status === 'approved') && rangesOverlap(newRange, r)
    );
    if (conflict) {
      toast({ title: '이미 같은 기간에 신청된 연차가 있습니다.', description: `${conflict.start_date} ${conflict.start_time} ~ ${conflict.end_date} ${conflict.end_time} (${STATUS_LABELS[conflict.status]?.label})`, variant: 'destructive' });
      return;
    }

    let leaveReq: ShoreLeaveRequest | null = null;
    try {
      setSubmitting(true);
      const documentTypes = await approvalDocumentService.getDocumentTypes();
      const leaveType = documentTypes.find(t => t.code === 'LEAVE_REQUEST');
      if (!leaveType) throw new Error('연차 신청 문서유형이 등록되어 있지 않습니다.');

      // 결재문서가 최종 승인되는 순간(applyReferenceSideEffect)에 이 신청 건을 찾아 상태를
      // 동기화하므로, 문서를 만들기 전에 신청 건부터 만들어 reference_id로 넘겨줘야 한다.
      leaveReq = await addLeaveRequest({
        user_id: currentUser.id,
        start_date: form.start_date,
        start_time,
        end_date: form.end_date,
        end_time,
        hours: totalHours,
        reason: form.reason || undefined,
      });

      const leaveTypeLabel = LEAVE_TYPE_OPTIONS.find(o => o.value === effectiveLeaveType)?.label || '종일';
      const leaveContent = [
        `휴가 종류: ${leaveTypeLabel}`,
        `신청 기간: ${form.start_date} ${start_time} ~ ${form.end_date} ${end_time}`,
        `신청 시간: ${formatLeaveHours(totalHours)}`,
        `잔여 연차(신청 전): ${formatLeaveHours(balance.remainingHours)}`,
        `사유: ${form.reason || '-'}`,
      ].join('\n');

      const doc = await approvalDocumentService.createDocument({
        document_type_id: leaveType.id,
        title: `${currentUser.name} 연차 신청 (${form.start_date} ~ ${form.end_date}, ${formatLeaveHours(totalHours)})`,
        content: leaveContent,
        org_unit_id: myOrgUnitId,
        created_by: currentUser.id,
        ccOrgUnitIds: form.ccOrgUnitIds,
        reference_type: 'shore_leave_request',
        reference_id: leaveReq.id,
      });

      await linkLeaveRequestDocument(leaveReq.id, doc.id);

      toast({ title: '연차 신청이 제출되었습니다.' });
      setForm({ start_date: '', end_date: '', leaveType: 'full', reason: '', ccOrgUnitIds: [] });
      await loadData();
    } catch (e) {
      if (leaveReq) await deleteLeaveRequest(leaveReq.id).catch(() => {});
      toast({ title: '제출 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (id: string, approvalDocumentId: string | null) => {
    if (!confirm('이 연차 신청을 취소하시겠습니까?')) return;
    try {
      await cancelLeaveRequest(id);
      if (approvalDocumentId) await approvalDocumentService.cancelDocument(approvalDocumentId);
      toast({ title: '취소되었습니다.' });
      await loadData();
    } catch {
      toast({ title: '취소 실패', variant: 'destructive' });
    }
  };

  // 이미 승인된 연차는 휴가 당일 하루 전까지만 취소 신청을 할 수 있다 (당일이 되면 더 이상 취소 불가).
  const canRequestCancellation = (r: ShoreLeaveRequest) => r.status === 'approved' && getTodayIso() < r.start_date;
  const isCancellationPending = (r: ShoreLeaveRequest) =>
    !!r.cancellation_document_id && cancellationDocStatuses.get(r.cancellation_document_id) === 'pending';

  const openCancelDialog = (r: ShoreLeaveRequest) => {
    setCancelTarget(r);
    setCancelReason('');
  };

  const submitCancellation = async () => {
    if (!cancelTarget || !currentUser || !myOrgUnitId) return;
    if (!cancelReason.trim()) { toast({ title: '취소 사유를 입력하세요.', variant: 'destructive' }); return; }
    try {
      setCancelSubmitting(true);
      const documentTypes = await approvalDocumentService.getDocumentTypes();
      const cancelType = documentTypes.find(t => t.code === 'LEAVE_CANCELLATION');
      if (!cancelType) throw new Error('연차 취소 신청 문서유형이 등록되어 있지 않습니다.');

      const cancelContent = [
        `취소 대상 연차: ${cancelTarget.start_date} ${cancelTarget.start_time} ~ ${cancelTarget.end_date} ${cancelTarget.end_time} (${formatLeaveHours(cancelTarget.hours)})`,
        `원래 사유: ${cancelTarget.reason || '-'}`,
        `취소 사유: ${cancelReason}`,
      ].join('\n');

      const doc = await approvalDocumentService.createDocument({
        document_type_id: cancelType.id,
        title: `${currentUser.name} 연차 취소 신청 (${cancelTarget.start_date} ~ ${cancelTarget.end_date})`,
        content: cancelContent,
        org_unit_id: myOrgUnitId,
        created_by: currentUser.id,
        reference_type: 'shore_leave_cancellation',
        reference_id: cancelTarget.id,
      });

      await linkLeaveCancellationDocument(cancelTarget.id, doc.id, cancelReason);

      toast({ title: '연차 취소 신청이 제출되었습니다.', description: '결재가 승인되면 연차가 최종 취소됩니다.' });
      setCancelTarget(null);
      await loadData();
    } catch (e) {
      toast({ title: '취소 신청 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setCancelSubmitting(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>;

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
      <div className="flex items-center gap-2">
        <CalendarDays className="w-6 h-6" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">연차 신청</h1>
          <p className="text-sm text-gray-500">근로기준법 기준으로 자동 계산된 잔여 연차 내에서 신청할 수 있습니다.</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
          <div className="p-3 bg-gray-50 rounded-md">
            <p className="text-xs text-gray-500">법정 발생 연차</p>
            <p className="text-xl font-bold">{formatLeaveHours(balance.legalAccruedHours)}</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-md">
            <p className="text-xs text-gray-500">회사 부여 연차</p>
            <p className="text-xl font-bold">{formatLeaveHours(balance.companyGrantedHours)}</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-md">
            <p className="text-xs text-gray-500">사용(승인) 연차</p>
            <p className="text-xl font-bold text-gray-500">{formatLeaveHours(balance.usedHours)}</p>
          </div>
          <div className="p-3 bg-blue-50 rounded-md">
            <p className="text-xs text-blue-600">잔여 연차</p>
            <p className="text-xl font-bold text-blue-700">{formatLeaveHours(balance.remainingHours)}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">신청서 작성</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col md:flex-row gap-4">
            <LeaveRangeCalendar
              startDate={form.start_date}
              endDate={form.end_date}
              holidays={holidayMap}
              onChange={(start_date, end_date) => setForm(prev => ({ ...prev, start_date, end_date, leaveType: start_date === end_date ? prev.leaveType : 'full', reason: start_date === end_date ? '' : prev.reason }))}
            />
            <div className="flex-1 space-y-3">
              <div className="p-3 bg-gray-50 rounded-md text-sm">
                <p className="text-xs text-gray-500 mb-1">선택된 기간</p>
                <p className="font-medium">
                  {form.start_date && form.end_date ? `${form.start_date} ~ ${form.end_date}` : '달력에서 시작일과 종료일을 클릭하세요'}
                </p>
              </div>
              {singleDayIsNonWorking && (
                <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-md p-2">
                  선택한 날짜({holidayMap.get(form.start_date) || '주말'})는 근무일이 아니라 연차를 신청할 수 없습니다.
                </p>
              )}
              {isSameDayRequestBlocked && (
                <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-md p-2">
                  {effectiveLeaveType === 'pm' ? '당일 오후반차는 오후 2시 이전에만 신청할 수 있습니다.' : '당일 연차는 오전 9시 이전에만 신청할 수 있습니다.'}
                </p>
              )}
              {isMultiDayTooSoon && (
                <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-md p-2">
                  이틀 이상의 연차는 최소 3일 전에 신청해야 합니다.
                </p>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs">휴가 종류</Label>
                <div className="grid grid-cols-3 gap-2">
                  {LEAVE_TYPE_OPTIONS.map(opt => (
                    <button
                      key={opt.value} type="button" disabled={submitting || (opt.value !== 'full' && !isSingleDay)}
                      onClick={() => setForm(prev => ({ ...prev, leaveType: opt.value }))}
                      className={`px-2 py-2 rounded-md text-xs border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${effectiveLeaveType === opt.value ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                    >
                      <p className="font-medium">{opt.label}</p>
                      <p className={`text-[10px] ${effectiveLeaveType === opt.value ? 'text-blue-100' : 'text-gray-400'}`}>{opt.range}</p>
                    </button>
                  ))}
                </div>
                {!isSingleDay && <p className="text-[11px] text-gray-400">반차는 하루짜리 연차에만 선택할 수 있습니다.</p>}
              </div>
              <div className="p-3 bg-blue-50 rounded-md text-center">
                <p className="text-xs text-blue-600">자동 계산된 신청 연차</p>
                <p className="text-xl font-bold text-blue-700">{formatLeaveHours(totalHours)}</p>
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">사유 {isMultiDay && <span className="text-red-500">*</span>}</Label>
            <Textarea
              value={form.reason}
              onChange={e => setForm({ ...form, reason: e.target.value })}
              rows={2}
              className="text-sm resize-none"
              disabled={submitting || !isMultiDay}
              placeholder={isMultiDay ? '특별한 사유를 입력하세요 (예: 여름휴가 등)' : '2일 이상 신청 시에만 입력할 수 있습니다'}
            />
            <p className="text-[11px] text-gray-400">연차는 특별한 사유(여름휴가 등)가 없으면 2일 이상 연속으로 신청할 수 없으며, 최소 3일 전에 신청해야 합니다.</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">결재선</Label>
            {chainLoading ? (
              <p className="text-xs text-gray-400">결재선을 불러오는 중...</p>
            ) : approvalChain.length === 0 ? (
              <p className="text-xs text-red-500">결재라인을 구성할 수 없습니다. 부서장이 지정되어 있는지 관리자에게 문의하세요.</p>
            ) : (
              <div className="flex items-center gap-1.5 flex-wrap p-2.5 bg-gray-50 rounded-md">
                <div className="px-2.5 py-1.5 rounded border bg-purple-50 border-purple-300 text-xs">
                  <p className="font-medium">신청자</p>
                  <p className="text-gray-500">{currentUser?.name}</p>
                </div>
                {approvalChain.map((step, idx) => (
                  <div key={step.approver_id + idx} className="flex items-center gap-1.5">
                    <span className="text-gray-300">→</span>
                    <div className="px-2.5 py-1.5 rounded border bg-white border-gray-200 text-xs">
                      <p className="text-[10px] text-gray-500 font-medium">{idx === approvalChain.length - 1 ? '최종결재자' : '중간결재자'}</p>
                      <p className="font-medium">{idx + 1}. {step.approver_name}</p>
                      <p className="text-gray-500">{step.approver_role}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">참조 부서 <span className="text-gray-400 font-normal">(결재선과 별개로 통보, 예: 총무팀)</span></Label>
            <div className="flex flex-wrap gap-1.5">
              {orgUnits.map(u => (
                <button
                  key={u.id} type="button" onClick={() => toggleCcUnit(u.id)} disabled={submitting}
                  className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${form.ccOrgUnitIds.includes(u.id) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                >
                  {u.name}
                </button>
              ))}
            </div>
          </div>
          {permissions.canCreate && (
            <div className="flex justify-end pt-1">
              <Button size="sm" className="gap-1.5 h-9" onClick={handleSubmit} disabled={submitting || isSameDayRequestBlocked || isMultiDayTooSoon || singleDayIsNonWorking}>
                <Send className="w-4 h-4" />{submitting ? '제출 중...' : '결재 상신'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">내 신청 내역</CardTitle></CardHeader>
        <CardContent>
          {myRequests.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">신청 내역이 없습니다</p>
          ) : (
            <div className="border rounded-md overflow-hidden overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b">
                  <tr><th className="text-left p-2">기간</th><th className="text-center p-2">일수/시간</th><th className="text-left p-2">사유</th><th className="text-center p-2">상태</th><th className="p-2 w-28"></th></tr>
                </thead>
                <tbody>
                  {myRequests.map(r => (
                    <tr key={r.id} className="border-b">
                      <td className="p-2">{r.start_date} ~ {r.end_date}</td>
                      <td className="p-2 text-center">{formatLeaveHours(r.hours)}</td>
                      <td className="p-2 text-gray-500">{r.reason || '-'}</td>
                      <td className="p-2 text-center"><Badge className={`text-xs ${STATUS_LABELS[r.status]?.color}`}>{STATUS_LABELS[r.status]?.label}</Badge></td>
                      <td className="p-2 text-center">
                        {r.status === 'pending' && (
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={() => handleCancel(r.id, r.approval_document_id)}><X className="h-3 w-3" /></Button>
                        )}
                        {r.status === 'approved' && isCancellationPending(r) && (
                          <Badge className="text-[10px] bg-orange-100 text-orange-700">취소 결재중</Badge>
                        )}
                        {r.status === 'approved' && !isCancellationPending(r) && canRequestCancellation(r) && (
                          <Button variant="outline" size="sm" className="h-6 px-2 text-[11px] gap-1 text-red-600 border-red-200 hover:bg-red-50" onClick={() => openCancelDialog(r)}>
                            <Ban className="h-3 w-3" />취소 신청
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!cancelTarget} onOpenChange={open => !open && !cancelSubmitting && setCancelTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>연차 취소 신청</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              이미 승인된 연차는 취소도 신청과 동일하게 결재를 거쳐야 최종 취소됩니다. 결재가 승인될 때까지는 연차가 그대로 유효합니다.
            </p>
            {cancelTarget && (
              <div className="p-2.5 bg-gray-50 rounded-md text-sm">
                <p className="font-medium">{cancelTarget.start_date} {cancelTarget.start_time} ~ {cancelTarget.end_date} {cancelTarget.end_time}</p>
                <p className="text-xs text-gray-500 mt-0.5">{formatLeaveHours(cancelTarget.hours)}</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">취소 사유 *</Label>
              <Textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} rows={2} className="text-sm resize-none" disabled={cancelSubmitting} placeholder="취소 사유를 입력하세요" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)} disabled={cancelSubmitting}>닫기</Button>
            <Button variant="destructive" onClick={submitCancellation} disabled={cancelSubmitting}>{cancelSubmitting ? '제출 중...' : '취소 신청 제출'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
