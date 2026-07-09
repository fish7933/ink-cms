import { useEffect, useState } from 'react';
import { CalendarDays, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import LeaveRangeCalendar from '@/components/leave/LeaveRangeCalendar';
import { getCurrentUser } from '@/lib/store';
import { orgChartService } from '@/services/org-chart.service';
import { approvalDocumentService } from '@/services/approval-document.service';
import { getMyLeaveRequests, addLeaveRequest, cancelLeaveRequest, deleteLeaveRequest, linkLeaveRequestDocument, getLeaveBalance } from '@/services/shore-leave.service';
import { formatLeaveHours, type LeaveBalance } from '@/lib/leave-calc';
import { calculateLeaveHours, rangesOverlap } from '@/lib/leave-duration';
import type { OrgUnit } from '@/types/org-chart';
import type { ShoreLeaveRequest } from '@/types/shore-leave';
import type { User } from '@/types/models';
import { useToast } from '@/hooks/use-toast';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: '결재중', color: 'bg-yellow-100 text-yellow-700' },
  approved: { label: '승인', color: 'bg-green-100 text-green-700' },
  rejected: { label: '반려', color: 'bg-red-100 text-red-700' },
  cancelled: { label: '취소', color: 'bg-gray-100 text-gray-500' },
};

export default function ShoreLeaveRequestPage() {
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [balance, setBalance] = useState<LeaveBalance>({ accruedHours: 0, usedHours: 0, remainingHours: 0 });
  const [myRequests, setMyRequests] = useState<ShoreLeaveRequest[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [myOrgUnitId, setMyOrgUnitId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({ start_date: '', start_time: '09:00', end_date: '', end_time: '18:00', reason: '', ccOrgUnitIds: [] as string[] });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const user = await getCurrentUser();
      setCurrentUser(user);
      if (!user) return;

      const [units, members, requests, bal] = await Promise.all([
        orgChartService.getOrgUnits(),
        orgChartService.getOrgMembers(),
        getMyLeaveRequests(user.id),
        getLeaveBalance(user.id, user.hire_date || null),
      ]);
      setOrgUnits(units);
      setMyRequests(requests);
      setBalance(bal);
      const me = members.find(m => m.id === user.id);
      setMyOrgUnitId(me?.org_unit_ids[0] || null);
    } catch (e) {
      console.error(e);
      toast({ title: '데이터를 불러오는 중 오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const totalHours = calculateLeaveHours(form.start_date, form.start_time, form.end_date, form.end_time);

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
    if (totalHours <= 0) { toast({ title: '휴가 시간을 확인하세요. (종료 시각이 시작 시각보다 늦어야 합니다)', variant: 'destructive' }); return; }
    if (totalHours > balance.remainingHours) { toast({ title: `잔여 연차(${formatLeaveHours(balance.remainingHours)})를 초과했습니다.`, variant: 'destructive' }); return; }

    // 이미 결재중이거나 승인된 신청과 날짜/시간대가 겹치면 중복 신청을 막는다.
    const newRange = { start_date: form.start_date, start_time: form.start_time, end_date: form.end_date, end_time: form.end_time };
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
        start_time: form.start_time,
        end_date: form.end_date,
        end_time: form.end_time,
        hours: totalHours,
        reason: form.reason || undefined,
      });

      const doc = await approvalDocumentService.createDocument({
        document_type_id: leaveType.id,
        title: `${currentUser.name} 연차 신청 (${form.start_date} ~ ${form.end_date}, ${formatLeaveHours(totalHours)})`,
        content: form.reason || undefined,
        org_unit_id: myOrgUnitId,
        created_by: currentUser.id,
        ccOrgUnitIds: form.ccOrgUnitIds,
        reference_type: 'shore_leave_request',
        reference_id: leaveReq.id,
      });

      await linkLeaveRequestDocument(leaveReq.id, doc.id);

      toast({ title: '연차 신청이 제출되었습니다.' });
      setForm({ start_date: '', start_time: '09:00', end_date: '', end_time: '18:00', reason: '', ccOrgUnitIds: [] });
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

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>;

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
      <div className="flex items-center gap-2">
        <CalendarDays className="w-6 h-6" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">연차 신청</h1>
          <p className="text-sm text-gray-500">근로기준법 기준으로 자동 계산된 잔여 연차 내에서 신청할 수 있습니다.</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4 grid grid-cols-3 gap-3 text-center">
          <div className="p-3 bg-gray-50 rounded-md">
            <p className="text-xs text-gray-500">발생 연차</p>
            <p className="text-xl font-bold">{formatLeaveHours(balance.accruedHours)}</p>
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
              onChange={(start_date, end_date) => setForm(prev => ({ ...prev, start_date, end_date }))}
            />
            <div className="flex-1 space-y-3">
              <div className="p-3 bg-gray-50 rounded-md text-sm">
                <p className="text-xs text-gray-500 mb-1">선택된 기간</p>
                <p className="font-medium">
                  {form.start_date && form.end_date ? `${form.start_date} ~ ${form.end_date}` : '달력에서 시작일과 종료일을 클릭하세요'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="text-xs">시작 시각</Label><Input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} className="h-9 text-sm" disabled={submitting} /></div>
                <div className="space-y-1.5"><Label className="text-xs">종료 시각</Label><Input type="time" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} className="h-9 text-sm" disabled={submitting} /></div>
              </div>
              <div className="p-3 bg-blue-50 rounded-md text-center">
                <p className="text-xs text-blue-600">자동 계산된 신청 연차</p>
                <p className="text-xl font-bold text-blue-700">{formatLeaveHours(totalHours)}</p>
              </div>
              <p className="text-[11px] text-gray-400">기준 근무시간 09:00~18:00 (점심시간 12:00~13:00 제외, 1일 = 8시간)</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">사유</Label>
            <Textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} rows={2} className="text-sm resize-none" disabled={submitting} />
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
          <div className="flex justify-end pt-1">
            <Button size="sm" className="gap-1.5 h-9" onClick={handleSubmit} disabled={submitting}>
              <Send className="w-4 h-4" />{submitting ? '제출 중...' : '결재 상신'}
            </Button>
          </div>
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
                  <tr><th className="text-left p-2">기간</th><th className="text-center p-2">일수/시간</th><th className="text-left p-2">사유</th><th className="text-center p-2">상태</th><th className="p-2 w-16"></th></tr>
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
