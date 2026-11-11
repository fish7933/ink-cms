import { useEffect, useMemo, useState } from 'react';
import { Plus, ChevronLeft } from 'lucide-react';
import { orgChartService } from '@/services/org-chart.service';
import { approvalDocumentService } from '@/services/approval-document.service';
import {
  getMyLeaveRequests, addLeaveRequest, cancelLeaveRequest, deleteLeaveRequest,
  linkLeaveRequestDocument, getLeaveBalance,
} from '@/services/shore-leave.service';
import {
  getMySickLeaveRequests, addSickLeaveRequest, cancelSickLeaveRequest,
  deleteSickLeaveRequest, linkSickLeaveRequestDocument, getUsedSickLeaveHours,
} from '@/services/sick-leave.service';
import { formatLeaveHours, getCurrentLeaveYearStart, HOURS_PER_DAY, type LeaveBalance } from '@/lib/leave-calc';
import { calculateLeaveHours, isWorkingDay, rangesOverlap } from '@/lib/leave-duration';
import { getHolidayDateSet } from '@/services/holiday.service';
import { useToast } from '@/hooks/use-toast';
import type { ShoreLeaveRequest } from '@/types/shore-leave';
import type { SickLeaveRequest } from '@/types/sick-leave';
import type { User } from '@/lib/store';

interface Props {
  currentUser: User;
}

type Tab = 'annual' | 'sick';
type LeaveType = 'full' | 'am' | 'pm';
const LEAVE_TYPE_OPTIONS: { value: LeaveType; label: string }[] = [
  { value: 'full', label: '종일' }, { value: 'am', label: '오전반차' }, { value: 'pm', label: '오후반차' },
];
const LEAVE_TYPE_TIMES: Record<LeaveType, { start_time: string; end_time: string }> = {
  full: { start_time: '09:00', end_time: '18:00' }, am: { start_time: '09:00', end_time: '14:00' }, pm: { start_time: '14:00', end_time: '18:00' },
};
const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending: { label: '결재중', color: 'bg-amber-100 text-amber-700' },
  approved: { label: '승인', color: 'bg-green-100 text-green-700' },
  rejected: { label: '반려', color: 'bg-red-100 text-red-700' },
  cancelled: { label: '취소', color: 'bg-gray-100 text-gray-400' },
};

function getTodayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
function countDays(start: string, end: string): number {
  if (!start || !end || end < start) return 0;
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1;
}

// 연차/질병휴가 신청 — ShoreLeaveRequestPage/SickLeaveRequestPage의 실제 제출 로직(잔여 연차
// 검증, 당일/연속 신청 제한, 근무일 계산)을 그대로 재사용한다. 참조부서 선택, 질병휴가 증빙
// 서류 첨부, 취소 결재(이미 승인된 건 취소)는 복잡도가 높아 1차 범위에서 제외 — 결재중인
// 신청의 단순 취소만 지원한다.
export default function MobileLeaveRequestPage({ currentUser }: Props) {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('annual');
  const [view, setView] = useState<'list' | 'new'>('list');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [myOrgUnitId, setMyOrgUnitId] = useState<string | null>(null);
  const [holidayDateSet, setHolidayDateSet] = useState<Set<string>>(new Set());
  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [usedSickHours, setUsedSickHours] = useState(0);
  const [annualRequests, setAnnualRequests] = useState<ShoreLeaveRequest[]>([]);
  const [sickRequests, setSickRequests] = useState<SickLeaveRequest[]>([]);

  const [annualForm, setAnnualForm] = useState({ start_date: '', end_date: '', leaveType: 'full' as LeaveType, reason: '' });
  const [sickForm, setSickForm] = useState({ start_date: '', end_date: '', reason: '' });

  const load = async () => {
    const [members, holidays] = await Promise.all([orgChartService.getOrgMembers(), getHolidayDateSet()]);
    const orgUnitId = members.find(m => m.id === currentUser.id)?.org_unit_ids[0] || null;
    setMyOrgUnitId(orgUnitId);
    setHolidayDateSet(holidays);
    const [bal, used, annual, sick] = await Promise.all([
      getLeaveBalance(currentUser.id, currentUser.hire_date ?? null),
      getUsedSickLeaveHours(currentUser.id),
      getMyLeaveRequests(currentUser.id),
      getMySickLeaveRequests(currentUser.id),
    ]);
    setBalance(bal);
    setUsedSickHours(used);
    setAnnualRequests(annual);
    setSickRequests(sick);
    setLoading(false);
  };

  useEffect(() => { load(); }, [currentUser.id, currentUser.hire_date]);

  // --- 연차 ---
  const isSingleDay = !!annualForm.start_date && annualForm.start_date === annualForm.end_date;
  const effectiveLeaveType: LeaveType = isSingleDay ? annualForm.leaveType : 'full';
  const { start_time, end_time } = LEAVE_TYPE_TIMES[effectiveLeaveType];
  const annualHours = calculateLeaveHours(annualForm.start_date, start_time, annualForm.end_date, end_time, holidayDateSet);
  const singleDayIsNonWorking = isSingleDay && !!annualForm.start_date && !isWorkingDay(annualForm.start_date, holidayDateSet);
  const annualDayCount = countDays(annualForm.start_date, annualForm.end_date);
  const isMultiDay = annualDayCount >= 2;
  const isToday = annualForm.start_date === getTodayIso();
  const isSameDayRequestBlocked = isToday && (effectiveLeaveType === 'pm' ? new Date().getHours() >= 14 : new Date().getHours() >= 9);
  const daysUntilStart = annualForm.start_date
    ? Math.round((new Date(annualForm.start_date).getTime() - new Date(new Date().toDateString()).getTime()) / 86400000)
    : 0;
  const isMultiDayTooSoon = isMultiDay && daysUntilStart < 3;

  const handleSubmitAnnual = async () => {
    if (!currentUser.hire_date) { toast({ title: '입사일이 등록되어 있지 않습니다. 관리자에게 문의하세요.', variant: 'destructive' }); return; }
    if (!myOrgUnitId) { toast({ title: '소속 부서가 조직도에 등록되어 있지 않습니다. 관리자에게 문의하세요.', variant: 'destructive' }); return; }
    if (!annualForm.start_date || !annualForm.end_date) { toast({ title: '휴가 기간을 선택하세요.', variant: 'destructive' }); return; }
    if (isSameDayRequestBlocked) { toast({ title: effectiveLeaveType === 'pm' ? '당일 오후반차는 오후 2시 이전에만 신청할 수 있습니다.' : '당일 연차는 오전 9시 이전에만 신청할 수 있습니다.', variant: 'destructive' }); return; }
    if (isMultiDayTooSoon) { toast({ title: '이틀 이상의 연차는 최소 3일 전에 신청해야 합니다.', variant: 'destructive' }); return; }
    if (singleDayIsNonWorking) { toast({ title: '선택한 날짜는 주말/공휴일이라 연차를 신청할 수 없습니다.', variant: 'destructive' }); return; }
    if (annualHours <= 0) { toast({ title: '휴가 시간을 확인하세요.', variant: 'destructive' }); return; }
    if (!balance || annualHours > balance.remainingHours) { toast({ title: `잔여 연차(${formatLeaveHours(balance?.remainingHours || 0)})를 초과했습니다.`, variant: 'destructive' }); return; }
    if (isMultiDay && !annualForm.reason.trim()) { toast({ title: '2일 이상 신청 시 사유를 입력해야 합니다.', variant: 'destructive' }); return; }

    const newRange = { start_date: annualForm.start_date, start_time, end_date: annualForm.end_date, end_time };
    const conflict = annualRequests.find(r => (r.status === 'pending' || r.status === 'approved') && rangesOverlap(newRange, r));
    if (conflict) { toast({ title: '이미 같은 기간에 신청된 연차가 있습니다.', variant: 'destructive' }); return; }

    let leaveReq: ShoreLeaveRequest | null = null;
    setSubmitting(true);
    try {
      const documentTypes = await approvalDocumentService.getDocumentTypes();
      const leaveType = documentTypes.find(t => t.code === 'LEAVE_REQUEST');
      if (!leaveType) throw new Error('연차 신청 문서유형이 등록되어 있지 않습니다.');

      leaveReq = await addLeaveRequest({
        user_id: currentUser.id, start_date: annualForm.start_date, start_time, end_date: annualForm.end_date, end_time,
        hours: annualHours, reason: annualForm.reason || undefined,
        remaining_hours_after: balance.remainingHours - annualHours,
        leave_year_start_date: getCurrentLeaveYearStart(currentUser.hire_date),
      });

      const leaveTypeLabel = LEAVE_TYPE_OPTIONS.find(o => o.value === effectiveLeaveType)?.label || '종일';
      const content = [
        `휴가 종류: ${leaveTypeLabel}`,
        `신청 기간: ${annualForm.start_date} ${start_time} ~ ${annualForm.end_date} ${end_time}`,
        `신청 시간: ${formatLeaveHours(annualHours)}`,
        `잔여 연차 (사용 후): ${formatLeaveHours(balance.remainingHours - annualHours)}`,
        `사유: ${annualForm.reason || '-'}`,
      ].join('\n');

      const doc = await approvalDocumentService.createDocument({
        document_type_id: leaveType.id,
        title: `${currentUser.name} 연차 신청 (${annualForm.start_date} ~ ${annualForm.end_date}, ${formatLeaveHours(annualHours)})`,
        content, org_unit_id: myOrgUnitId, created_by: currentUser.id,
        reference_type: 'shore_leave_request', reference_id: leaveReq.id,
      });
      await linkLeaveRequestDocument(leaveReq.id, doc.id);

      toast({ title: '연차 신청이 제출되었습니다.' });
      setAnnualForm({ start_date: '', end_date: '', leaveType: 'full', reason: '' });
      setView('list');
      await load();
    } catch (e) {
      if (leaveReq) await deleteLeaveRequest(leaveReq.id).catch(() => {});
      toast({ title: '제출 실패', variant: 'destructive' });
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelAnnual = async (id: string) => {
    if (!confirm('이 연차 신청을 취소하시겠습니까?')) return;
    await cancelLeaveRequest(id);
    await load();
  };

  // --- 질병휴가 ---
  const sickDayCount = countDays(sickForm.start_date, sickForm.end_date);
  const sickHours = sickDayCount * HOURS_PER_DAY;

  const handleSubmitSick = async () => {
    if (!myOrgUnitId) { toast({ title: '소속 부서가 조직도에 등록되어 있지 않습니다. 관리자에게 문의하세요.', variant: 'destructive' }); return; }
    if (!sickForm.start_date || !sickForm.end_date) { toast({ title: '휴가 기간을 선택하세요.', variant: 'destructive' }); return; }
    if (sickDayCount <= 0) { toast({ title: '종료일이 시작일보다 늦어야 합니다.', variant: 'destructive' }); return; }

    const newRange = { start_date: sickForm.start_date, start_time: '09:00', end_date: sickForm.end_date, end_time: '18:00' };
    const conflict = sickRequests.find(r => (r.status === 'pending' || r.status === 'approved') && rangesOverlap(newRange, r));
    if (conflict) { toast({ title: '이미 같은 기간에 신청된 질병휴가가 있습니다.', variant: 'destructive' }); return; }

    let sickReq: SickLeaveRequest | null = null;
    setSubmitting(true);
    try {
      const documentTypes = await approvalDocumentService.getDocumentTypes();
      const sickType = documentTypes.find(t => t.code === 'SICK_LEAVE_REQUEST');
      if (!sickType) throw new Error('질병휴가 신청 문서유형이 등록되어 있지 않습니다.');

      sickReq = await addSickLeaveRequest({
        user_id: currentUser.id, start_date: sickForm.start_date, start_time: '09:00', end_date: sickForm.end_date, end_time: '18:00',
        hours: sickHours, reason: sickForm.reason || undefined,
      });

      const content = [
        `신청 기간: ${sickForm.start_date} ~ ${sickForm.end_date} (${sickDayCount}일)`,
        `신청 시간: ${formatLeaveHours(sickHours)}`,
        `사유: ${sickForm.reason || '-'}`,
      ].join('\n');

      const doc = await approvalDocumentService.createDocument({
        document_type_id: sickType.id,
        title: `${currentUser.name} 질병휴가 신청 (${sickForm.start_date} ~ ${sickForm.end_date}, ${formatLeaveHours(sickHours)})`,
        content, org_unit_id: myOrgUnitId, created_by: currentUser.id,
        reference_type: 'sick_leave_request', reference_id: sickReq.id,
      });
      await linkSickLeaveRequestDocument(sickReq.id, doc.id);

      toast({ title: '질병휴가 신청이 제출되었습니다. (증빙 서류는 PC에서 첨부해주세요)' });
      setSickForm({ start_date: '', end_date: '', reason: '' });
      setView('list');
      await load();
    } catch (e) {
      if (sickReq) await deleteSickLeaveRequest(sickReq.id).catch(() => {});
      toast({ title: '제출 실패', variant: 'destructive' });
      console.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelSick = async (id: string) => {
    if (!confirm('이 질병휴가 신청을 취소하시겠습니까?')) return;
    await cancelSickLeaveRequest(id);
    await load();
  };

  const sortedAnnual = useMemo(() => [...annualRequests].sort((a, b) => b.start_date.localeCompare(a.start_date)), [annualRequests]);
  const sortedSick = useMemo(() => [...sickRequests].sort((a, b) => b.start_date.localeCompare(a.start_date)), [sickRequests]);

  if (loading) {
    return <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex rounded-lg border bg-white p-1">
        {(['annual', 'sick'] as Tab[]).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => { setTab(t); setView('list'); }}
            className={`flex-1 h-9 rounded-md text-sm font-medium ${tab === t ? 'bg-blue-600 text-white' : 'text-gray-500'}`}
          >
            {t === 'annual' ? '연차' : '질병휴가'}
          </button>
        ))}
      </div>

      {tab === 'annual' && (
        <div className="rounded-xl border bg-white p-4 shadow-sm flex items-center justify-between">
          <span className="text-sm text-gray-500">잔여 연차</span>
          <span className="text-base font-bold text-blue-700">{formatLeaveHours(balance?.remainingHours || 0)}</span>
        </div>
      )}
      {tab === 'sick' && (
        <div className="rounded-xl border bg-white p-4 shadow-sm flex items-center justify-between">
          <span className="text-sm text-gray-500">사용한 질병휴가</span>
          <span className="text-base font-bold text-gray-700">{formatLeaveHours(usedSickHours)}</span>
        </div>
      )}

      {view === 'list' && (
        <>
          <button
            type="button"
            onClick={() => setView('new')}
            className="w-full h-10 rounded-lg bg-blue-600 text-white text-sm font-medium flex items-center justify-center gap-1.5"
          >
            <Plus className="w-4 h-4" />{tab === 'annual' ? '연차 신청' : '질병휴가 신청'}
          </button>

          <div className="space-y-2">
            {(tab === 'annual' ? sortedAnnual : sortedSick).map(r => (
              <div key={r.id} className="rounded-xl border bg-white px-4 py-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-800">{r.start_date} ~ {r.end_date}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_LABEL[r.status]?.color}`}>{STATUS_LABEL[r.status]?.label}</span>
                </div>
                <div className="text-xs text-gray-500 mt-1">{formatLeaveHours(r.hours)}{r.reason ? ` · ${r.reason}` : ''}</div>
                {r.status === 'pending' && (
                  <button
                    type="button"
                    onClick={() => (tab === 'annual' ? handleCancelAnnual(r.id) : handleCancelSick(r.id))}
                    className="mt-2 text-xs text-red-500 underline"
                  >
                    신청 취소
                  </button>
                )}
              </div>
            ))}
            {(tab === 'annual' ? sortedAnnual : sortedSick).length === 0 && (
              <div className="text-center text-sm text-gray-400 py-10">신청 내역이 없습니다.</div>
            )}
          </div>
        </>
      )}

      {view === 'new' && tab === 'annual' && (
        <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
          <button type="button" onClick={() => setView('list')} className="flex items-center gap-1 text-sm text-gray-500">
            <ChevronLeft className="w-4 h-4" />목록으로
          </button>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-400 block mb-1">시작일</label>
              <input
                type="date"
                value={annualForm.start_date}
                onChange={e => {
                  // 종료일을 아직 안 건드렸으면(또는 시작일보다 앞서게 되면) 시작일과 같은 날로
                  // 맞춰준다 — 그래야 하루짜리(반차) 신청에서 바로 반차 선택지가 뜬다. 종료일을
                  // 이미 다른 날로 지정해둔 경우(여러 날 신청)는 그대로 둔다.
                  const v = e.target.value;
                  setAnnualForm(f => ({ ...f, start_date: v, end_date: (!f.end_date || f.end_date < v) ? v : f.end_date }));
                }}
                className="w-full h-10 rounded-lg border border-gray-200 px-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">종료일</label>
              <input type="date" value={annualForm.end_date} onChange={e => setAnnualForm(f => ({ ...f, end_date: e.target.value }))} className="w-full h-10 rounded-lg border border-gray-200 px-2 text-sm" />
            </div>
          </div>
          {isSingleDay && (
            <div className="grid grid-cols-3 gap-2">
              {LEAVE_TYPE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAnnualForm(f => ({ ...f, leaveType: opt.value }))}
                  className={`h-9 rounded-md text-xs border ${annualForm.leaveType === opt.value ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
          <textarea
            value={annualForm.reason}
            onChange={e => setAnnualForm(f => ({ ...f, reason: e.target.value }))}
            placeholder={isMultiDay ? '사유 (2일 이상 신청 시 필수)' : '사유 (선택)'}
            className="w-full min-h-16 rounded-lg border border-gray-200 p-2.5 text-sm"
          />
          {singleDayIsNonWorking && <p className="text-xs text-red-500">선택한 날짜는 주말/공휴일입니다.</p>}
          {isSameDayRequestBlocked && <p className="text-xs text-red-500">당일 신청 가능 시간이 지났습니다.</p>}
          {isMultiDayTooSoon && <p className="text-xs text-red-500">이틀 이상의 연차는 최소 3일 전에 신청해야 합니다.</p>}
          {annualHours > 0 && <p className="text-sm text-gray-600">신청 시간: <b>{formatLeaveHours(annualHours)}</b></p>}
          <button
            type="button"
            disabled={submitting || isSameDayRequestBlocked || isMultiDayTooSoon || singleDayIsNonWorking}
            onClick={handleSubmitAnnual}
            className="w-full h-10 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-50"
          >
            {submitting ? '제출 중...' : '제출'}
          </button>
        </div>
      )}

      {view === 'new' && tab === 'sick' && (
        <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
          <button type="button" onClick={() => setView('list')} className="flex items-center gap-1 text-sm text-gray-500">
            <ChevronLeft className="w-4 h-4" />목록으로
          </button>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-400 block mb-1">시작일</label>
              <input type="date" value={sickForm.start_date} onChange={e => setSickForm(f => ({ ...f, start_date: e.target.value }))} className="w-full h-10 rounded-lg border border-gray-200 px-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">종료일</label>
              <input type="date" value={sickForm.end_date} onChange={e => setSickForm(f => ({ ...f, end_date: e.target.value }))} className="w-full h-10 rounded-lg border border-gray-200 px-2 text-sm" />
            </div>
          </div>
          <textarea
            value={sickForm.reason}
            onChange={e => setSickForm(f => ({ ...f, reason: e.target.value }))}
            placeholder="사유 (선택)"
            className="w-full min-h-16 rounded-lg border border-gray-200 p-2.5 text-sm"
          />
          <p className="text-xs text-gray-400">증빙 서류 첨부는 PC 화면에서 가능합니다.</p>
          {sickHours > 0 && <p className="text-sm text-gray-600">신청 시간: <b>{formatLeaveHours(sickHours)}</b></p>}
          <button
            type="button"
            disabled={submitting}
            onClick={handleSubmitSick}
            className="w-full h-10 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-50"
          >
            {submitting ? '제출 중...' : '제출'}
          </button>
        </div>
      )}
    </div>
  );
}
