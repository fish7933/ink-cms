import { useEffect, useState } from 'react';
import { CalendarDays, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { getCurrentUser } from '@/lib/store';
import { orgChartService } from '@/services/org-chart.service';
import { approvalDocumentService } from '@/services/approval-document.service';
import { getMyLeaveRequests, addLeaveRequest, cancelLeaveRequest, getLeaveBalance } from '@/services/shore-leave.service';
import type { LeaveBalance } from '@/lib/leave-calc';
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

function daysBetweenInclusive(start: string, end: string): number {
  if (!start || !end) return 0;
  const s = new Date(start);
  const e = new Date(end);
  const diff = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  return diff > 0 ? diff : 0;
}

export default function ShoreLeaveRequestPage() {
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [balance, setBalance] = useState<LeaveBalance>({ accrued: 0, used: 0, remaining: 0 });
  const [myRequests, setMyRequests] = useState<ShoreLeaveRequest[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [myOrgUnitId, setMyOrgUnitId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({ start_date: '', end_date: '', days: '', reason: '', ccOrgUnitIds: [] as string[] });

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

  useEffect(() => {
    const computed = daysBetweenInclusive(form.start_date, form.end_date);
    if (computed > 0) setForm(prev => ({ ...prev, days: String(computed) }));
  }, [form.start_date, form.end_date]);

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
    if (!form.start_date || !form.end_date) { toast({ title: '휴가 기간을 입력하세요.', variant: 'destructive' }); return; }
    const days = parseFloat(form.days) || 0;
    if (days <= 0) { toast({ title: '휴가 일수를 확인하세요.', variant: 'destructive' }); return; }
    if (days > balance.remaining) { toast({ title: `잔여 연차(${balance.remaining}일)를 초과했습니다.`, variant: 'destructive' }); return; }

    try {
      setSubmitting(true);
      const documentTypes = await approvalDocumentService.getDocumentTypes();
      const leaveType = documentTypes.find(t => t.code === 'LEAVE_REQUEST');
      if (!leaveType) throw new Error('연차 신청 문서유형이 등록되어 있지 않습니다.');

      const doc = await approvalDocumentService.createDocument({
        document_type_id: leaveType.id,
        title: `${currentUser.name} 연차 신청 (${form.start_date} ~ ${form.end_date}, ${days}일)`,
        content: form.reason || undefined,
        org_unit_id: myOrgUnitId,
        created_by: currentUser.id,
        ccOrgUnitIds: form.ccOrgUnitIds,
      });

      await addLeaveRequest({
        user_id: currentUser.id,
        start_date: form.start_date,
        end_date: form.end_date,
        days,
        reason: form.reason || undefined,
        approval_document_id: doc.id,
      });

      toast({ title: '연차 신청이 제출되었습니다.' });
      setForm({ start_date: '', end_date: '', days: '', reason: '', ccOrgUnitIds: [] });
      await loadData();
    } catch (e) {
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
            <p className="text-xl font-bold">{balance.accrued}일</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-md">
            <p className="text-xs text-gray-500">사용(승인) 연차</p>
            <p className="text-xl font-bold text-gray-500">{balance.used}일</p>
          </div>
          <div className="p-3 bg-blue-50 rounded-md">
            <p className="text-xs text-blue-600">잔여 연차</p>
            <p className="text-xl font-bold text-blue-700">{balance.remaining}일</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">신청서 작성</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">시작일 *</Label><Input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className="h-9 text-sm" disabled={submitting} /></div>
            <div className="space-y-1.5"><Label className="text-xs">종료일 *</Label><Input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} className="h-9 text-sm" disabled={submitting} /></div>
            <div className="space-y-1.5"><Label className="text-xs">일수 *</Label><Input type="number" step="0.5" min="0" value={form.days} onChange={e => setForm({ ...form, days: e.target.value })} className="h-9 text-sm" disabled={submitting} /></div>
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
                  <tr><th className="text-left p-2">기간</th><th className="text-center p-2">일수</th><th className="text-left p-2">사유</th><th className="text-center p-2">상태</th><th className="p-2 w-16"></th></tr>
                </thead>
                <tbody>
                  {myRequests.map(r => (
                    <tr key={r.id} className="border-b">
                      <td className="p-2">{r.start_date} ~ {r.end_date}</td>
                      <td className="p-2 text-center">{r.days}일</td>
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
