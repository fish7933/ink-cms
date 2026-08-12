import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Stethoscope, Send, X, Paperclip, Upload, Trash2, FileText, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import LeaveRangeCalendar from '@/components/leave/LeaveRangeCalendar';
import { getCurrentUser } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { uploadCompressed, getFileUrl } from '@/lib/upload';
import { orgChartService } from '@/services/org-chart.service';
import { approvalDocumentService } from '@/services/approval-document.service';
import {
  getMySickLeaveRequests, addSickLeaveRequest, cancelSickLeaveRequest,
  deleteSickLeaveRequest, linkSickLeaveRequestDocument, linkSickLeaveCancellationDocument, getUsedSickLeaveHours, updateSickLeaveAttachments,
} from '@/services/sick-leave.service';
import { formatLeaveHours, HOURS_PER_DAY } from '@/lib/leave-calc';
import { rangesOverlap } from '@/lib/leave-duration';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import type { OrgUnit } from '@/types/org-chart';
import type { SickLeaveRequest, SickLeaveAttachment } from '@/types/sick-leave';
import type { User } from '@/types/models';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: '결재중', color: 'bg-yellow-100 text-yellow-700' },
  approved: { label: '승인', color: 'bg-green-100 text-green-700' },
  rejected: { label: '반려', color: 'bg-red-100 text-red-700' },
  cancelled: { label: '취소', color: 'bg-gray-100 text-gray-500' },
};

// 질병휴가는 시간이 아닌 일수 단위로만 신청한다 — 매일 표준 근무시간(09:00~18:00)을 그대로 사용해 시간으로 환산해 저장한다.
const SICK_START_TIME = '09:00';
const SICK_END_TIME = '18:00';

function countDays(startDate: string, endDate: string): number {
  if (!startDate || !endDate || endDate < startDate) return 0;
  return Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1;
}

function getTodayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export default function SickLeaveRequestPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const permissions = usePermissions('sick_leave_request');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [usedHours, setUsedHours] = useState(0);
  const [myRequests, setMyRequests] = useState<SickLeaveRequest[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [myOrgUnitId, setMyOrgUnitId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({ start_date: '', end_date: '', reason: '', ccOrgUnitIds: [] as string[] });

  const [evidenceRequest, setEvidenceRequest] = useState<SickLeaveRequest | null>(null);
  const [evidenceAttachments, setEvidenceAttachments] = useState<SickLeaveAttachment[]>([]);
  const [evidenceNewFiles, setEvidenceNewFiles] = useState<File[]>([]);
  const [evidenceSaving, setEvidenceSaving] = useState(false);

  const [cancellationDocStatuses, setCancellationDocStatuses] = useState<Map<string, string>>(new Map());
  const [cancelTarget, setCancelTarget] = useState<SickLeaveRequest | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

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

      const [units, members, requests, used] = await Promise.all([
        orgChartService.getOrgUnits(),
        orgChartService.getOrgMembers(),
        getMySickLeaveRequests(user.id),
        getUsedSickLeaveHours(user.id),
      ]);
      setOrgUnits(units);
      setMyRequests(requests);
      setUsedHours(used);
      const cancellationDocIds = requests.map(r => r.cancellation_document_id).filter((id): id is string => !!id);
      setCancellationDocStatuses(await approvalDocumentService.getDocumentStatuses(cancellationDocIds));
      const me = members.find(m => m.id === user.id);
      setMyOrgUnitId(me?.org_unit_ids[0] || null);
    } catch (e) {
      console.error(e);
      toast({ title: '데이터를 불러오는 중 오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const totalDays = countDays(form.start_date, form.end_date);
  const totalHours = totalDays * HOURS_PER_DAY;

  const toggleCcUnit = (unitId: string) => {
    setForm(prev => ({
      ...prev,
      ccOrgUnitIds: prev.ccOrgUnitIds.includes(unitId) ? prev.ccOrgUnitIds.filter(id => id !== unitId) : [...prev.ccOrgUnitIds, unitId],
    }));
  };

  const handleSubmit = async () => {
    if (!currentUser) return;
    if (!myOrgUnitId) { toast({ title: '소속 부서가 조직도에 등록되어 있지 않습니다. 관리자에게 문의하세요.', variant: 'destructive' }); return; }
    if (!form.start_date || !form.end_date) { toast({ title: '달력에서 휴가 기간을 선택하세요.', variant: 'destructive' }); return; }
    if (totalDays <= 0) { toast({ title: '휴가 기간을 확인하세요. (종료일이 시작일보다 늦어야 합니다)', variant: 'destructive' }); return; }

    // 이미 결재중이거나 승인된 신청과 날짜가 겹치면 중복 신청을 막는다.
    const newRange = { start_date: form.start_date, start_time: SICK_START_TIME, end_date: form.end_date, end_time: SICK_END_TIME };
    const conflict = (await getMySickLeaveRequests(currentUser.id)).find(r =>
      (r.status === 'pending' || r.status === 'approved') && rangesOverlap(newRange, r)
    );
    if (conflict) {
      toast({ title: '이미 같은 기간에 신청된 질병휴가가 있습니다.', description: `${conflict.start_date} ~ ${conflict.end_date} (${STATUS_LABELS[conflict.status]?.label})`, variant: 'destructive' });
      return;
    }

    let sickReq: SickLeaveRequest | null = null;
    try {
      setSubmitting(true);
      const documentTypes = await approvalDocumentService.getDocumentTypes();
      const sickType = documentTypes.find(t => t.code === 'SICK_LEAVE_REQUEST');
      if (!sickType) throw new Error('질병휴가 신청 문서유형이 등록되어 있지 않습니다.');

      sickReq = await addSickLeaveRequest({
        user_id: currentUser.id,
        start_date: form.start_date,
        start_time: SICK_START_TIME,
        end_date: form.end_date,
        end_time: SICK_END_TIME,
        hours: totalHours,
        reason: form.reason || undefined,
      });

      const sickContent = [
        `신청 기간: ${form.start_date} ~ ${form.end_date} (${totalDays}일)`,
        `신청 시간: ${formatLeaveHours(totalHours)}`,
        `사유: ${form.reason || '-'}`,
      ].join('\n');

      const doc = await approvalDocumentService.createDocument({
        document_type_id: sickType.id,
        title: `${currentUser.name} 질병휴가 신청 (${form.start_date} ~ ${form.end_date}, ${formatLeaveHours(totalHours)})`,
        content: sickContent,
        org_unit_id: myOrgUnitId,
        created_by: currentUser.id,
        ccOrgUnitIds: form.ccOrgUnitIds,
        reference_type: 'sick_leave_request',
        reference_id: sickReq.id,
      });

      await linkSickLeaveRequestDocument(sickReq.id, doc.id);

      toast({ title: '질병휴가 신청이 제출되었습니다.' });
      setForm({ start_date: '', end_date: '', reason: '', ccOrgUnitIds: [] });
      await loadData();
    } catch (e) {
      if (sickReq) await deleteSickLeaveRequest(sickReq.id).catch(() => {});
      toast({ title: '제출 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const openEvidence = (r: SickLeaveRequest) => {
    setEvidenceRequest(r);
    setEvidenceAttachments(r.attachments || []);
    setEvidenceNewFiles([]);
  };

  const handleEvidenceFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files).filter(f => {
      if (f.size > 10 * 1024 * 1024) { toast({ title: `${f.name}은 10MB를 초과합니다.`, variant: 'destructive' }); return false; }
      return true;
    });
    setEvidenceNewFiles(prev => [...prev, ...files]);
    e.target.value = '';
  };
  const removeNewEvidenceFile = (idx: number) => setEvidenceNewFiles(prev => prev.filter((_, i) => i !== idx));
  const removeExistingEvidenceAttachment = (idx: number) => setEvidenceAttachments(prev => prev.filter((_, i) => i !== idx));
  const getAttachmentUrl = (path: string) => getFileUrl('documents', path);

  const saveEvidence = async () => {
    if (!evidenceRequest) return;
    try {
      setEvidenceSaving(true);
      const uploaded: SickLeaveAttachment[] = [];
      for (const file of evidenceNewFiles) {
        try {
          uploaded.push(await uploadCompressed('documents', `sick-leave-evidence/${evidenceRequest.id}/`, file));
        } catch {
          throw new Error(`${file.name} 업로드 실패`);
        }
      }
      const merged = [...evidenceAttachments, ...uploaded];
      await updateSickLeaveAttachments(evidenceRequest.id, merged);
      toast({ title: '증빙 서류가 저장되었습니다.' });
      setEvidenceRequest(null);
      await loadData();
    } catch (e) {
      toast({ title: '증빙 서류 저장 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setEvidenceSaving(false);
    }
  };

  const handleCancel = async (id: string, approvalDocumentId: string | null) => {
    if (!confirm('이 질병휴가 신청을 취소하시겠습니까?')) return;
    try {
      await cancelSickLeaveRequest(id);
      if (approvalDocumentId) await approvalDocumentService.cancelDocument(approvalDocumentId);
      toast({ title: '취소되었습니다.' });
      await loadData();
    } catch {
      toast({ title: '취소 실패', variant: 'destructive' });
    }
  };

  // 이미 승인된 질병휴가도 휴가 당일 하루 전까지만 취소 신청을 할 수 있다.
  const canRequestCancellation = (r: SickLeaveRequest) => r.status === 'approved' && getTodayIso() < r.start_date;
  const isCancellationPending = (r: SickLeaveRequest) =>
    !!r.cancellation_document_id && cancellationDocStatuses.get(r.cancellation_document_id) === 'pending';

  const openCancelDialog = (r: SickLeaveRequest) => {
    setCancelTarget(r);
    setCancelReason('');
  };

  const submitCancellation = async () => {
    if (!cancelTarget || !currentUser || !myOrgUnitId) return;
    if (!cancelReason.trim()) { toast({ title: '취소 사유를 입력하세요.', variant: 'destructive' }); return; }
    try {
      setCancelSubmitting(true);
      const documentTypes = await approvalDocumentService.getDocumentTypes();
      const cancelType = documentTypes.find(t => t.code === 'SICK_LEAVE_CANCELLATION');
      if (!cancelType) throw new Error('질병휴가 취소 신청 문서유형이 등록되어 있지 않습니다.');

      const cancelContent = [
        `취소 대상 질병휴가: ${cancelTarget.start_date} ~ ${cancelTarget.end_date} (${formatLeaveHours(cancelTarget.hours)})`,
        `원래 사유: ${cancelTarget.reason || '-'}`,
        `취소 사유: ${cancelReason}`,
      ].join('\n');

      const doc = await approvalDocumentService.createDocument({
        document_type_id: cancelType.id,
        title: `${currentUser.name} 질병휴가 취소 신청 (${cancelTarget.start_date} ~ ${cancelTarget.end_date})`,
        content: cancelContent,
        org_unit_id: myOrgUnitId,
        created_by: currentUser.id,
        reference_type: 'sick_leave_cancellation',
        reference_id: cancelTarget.id,
      });

      await linkSickLeaveCancellationDocument(cancelTarget.id, doc.id, cancelReason);

      toast({ title: '질병휴가 취소 신청이 제출되었습니다.', description: '결재가 승인되면 질병휴가가 최종 취소됩니다.' });
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
        <Stethoscope className="w-6 h-6" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">질병휴가 신청</h1>
          <p className="text-sm text-gray-500">질병휴가는 연차와 별도로 집계되며, 연차 잔여일수에서 차감되지 않습니다.</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="p-3 bg-gray-50 rounded-md text-center">
            <p className="text-xs text-gray-500">누적 사용(승인) 질병휴가</p>
            <p className="text-xl font-bold">{formatLeaveHours(usedHours)}</p>
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
              <div className="p-3 bg-blue-50 rounded-md text-center">
                <p className="text-xs text-blue-600">신청 일수</p>
                <p className="text-xl font-bold text-blue-700">{totalDays > 0 ? `${totalDays}일` : '-'}</p>
              </div>
              <p className="text-[11px] text-gray-400">질병휴가는 시간 단위가 아닌 일 단위로만 신청할 수 있습니다.</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">사유 (진단명 등)</Label>
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
          {permissions.canCreate && (
            <div className="flex justify-end pt-1">
              <Button size="sm" className="gap-1.5 h-9" onClick={handleSubmit} disabled={submitting}>
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
                  <tr><th className="text-left p-2">기간</th><th className="text-center p-2">일수</th><th className="text-left p-2">사유</th><th className="text-center p-2">상태</th><th className="text-center p-2">증빙</th><th className="p-2 w-28"></th></tr>
                </thead>
                <tbody>
                  {myRequests.map(r => (
                    <tr key={r.id} className="border-b">
                      <td className="p-2">{r.start_date} ~ {r.end_date}</td>
                      <td className="p-2 text-center">{formatLeaveHours(r.hours)}</td>
                      <td className="p-2 text-gray-500">{r.reason || '-'}</td>
                      <td className="p-2 text-center"><Badge className={`text-xs ${STATUS_LABELS[r.status]?.color}`}>{STATUS_LABELS[r.status]?.label}</Badge></td>
                      <td className="p-2 text-center">
                        <Button variant="outline" size="sm" className="h-6 px-2 text-xs gap-1" onClick={() => openEvidence(r)}>
                          <Paperclip className="w-3 h-3" />{r.attachments?.length || 0}
                        </Button>
                      </td>
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

      <Dialog open={!!evidenceRequest} onOpenChange={open => !open && !evidenceSaving && setEvidenceRequest(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>증빙 서류 {evidenceRequest && `(${evidenceRequest.start_date} ~ ${evidenceRequest.end_date})`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-gray-500">진단서 등 증빙 서류는 신청 후에도 언제든 첨부할 수 있습니다.</p>
            {evidenceAttachments.length === 0 && evidenceNewFiles.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">첨부된 서류가 없습니다</p>
            ) : (
              <div className="space-y-1.5">
                {evidenceAttachments.map((a, idx) => (
                  <div key={a.path} className="flex items-center justify-between p-2 bg-gray-50 rounded-md text-sm">
                    <a href={getAttachmentUrl(a.path)} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-blue-600 hover:underline truncate">
                      <FileText className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{a.name}</span>
                    </a>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500 shrink-0" onClick={() => removeExistingEvidenceAttachment(idx)} disabled={evidenceSaving}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
                {evidenceNewFiles.map((f, idx) => (
                  <div key={`${f.name}-${idx}`} className="flex items-center justify-between p-2 bg-blue-50 rounded-md text-sm">
                    <span className="flex items-center gap-2 text-blue-700 truncate">
                      <FileText className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{f.name}</span>
                      <span className="text-xs text-blue-400 shrink-0">(신규)</span>
                    </span>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500 shrink-0" onClick={() => removeNewEvidenceFile(idx)} disabled={evidenceSaving}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <label className="flex items-center justify-center gap-1.5 h-9 border border-dashed rounded-md text-xs text-gray-500 cursor-pointer hover:bg-gray-50">
              <Upload className="w-3.5 h-3.5" />파일 추가 (최대 10MB)
              <input type="file" multiple className="hidden" onChange={handleEvidenceFileChange} disabled={evidenceSaving} />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEvidenceRequest(null)} disabled={evidenceSaving}>취소</Button>
            <Button onClick={saveEvidence} disabled={evidenceSaving}>{evidenceSaving ? '저장 중...' : '저장'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!cancelTarget} onOpenChange={open => !open && !cancelSubmitting && setCancelTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>질병휴가 취소 신청</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              이미 승인된 질병휴가는 취소도 신청과 동일하게 결재를 거쳐야 최종 취소됩니다. 결재가 승인될 때까지는 질병휴가가 그대로 유효합니다.
            </p>
            {cancelTarget && (
              <div className="p-2.5 bg-gray-50 rounded-md text-sm">
                <p className="font-medium">{cancelTarget.start_date} ~ {cancelTarget.end_date}</p>
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
