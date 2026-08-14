import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FileText, ChevronLeft, ChevronRight, RefreshCw, Send, ExternalLink, List, Ban, Upload, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { getCurrentUser } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { uploadCompressed, getFileUrl } from '@/lib/upload';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { useTabContext } from '@/contexts/TabContext';
import {
  getOrCreateDraftReport, regenerateDraftReport, prepareDailyReportDraft, forceCancelConfirmedReport,
  updateReportRemarks, updateReportAttachments, deleteDraftDailyReport,
} from '@/services/accounting-daily-report.service';
import { DailyCashReportTable } from '@/components/accounting/daily-cash-report-table';
import type { DailyCashReport, AccountingDailyReportStatus, CashTransactionAttachment } from '@/types/accounting';
import type { User } from '@/types/models';

const STATUS_BADGE: Record<AccountingDailyReportStatus, { label: string; className: string }> = {
  draft: { label: '작성중', className: 'bg-gray-100 text-gray-600' },
  pending_approval: { label: '결재중', className: 'bg-yellow-100 text-yellow-700' },
  confirmed: { label: '확정', className: 'bg-green-100 text-green-700' },
};

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
function shiftDate(date: string, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function DailyCashReportPage() {
  const navigate = useNavigate();
  const params = useParams<{ date?: string }>();
  const { toast } = useToast();
  const { openNewTab, activeTabId, closeTab } = useTabContext();
  const permissions = usePermissions('accounting_daily_report');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [date, setDate] = useState(params.date || todayIso());
  const [report, setReport] = useState<DailyCashReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [forceCancelOpen, setForceCancelOpen] = useState(false);
  const [forceCancelReason, setForceCancelReason] = useState('');
  const [forceCancelSubmitting, setForceCancelSubmitting] = useState(false);
  const [remarksDraft, setRemarksDraft] = useState('');
  const [remarksSaving, setRemarksSaving] = useState(false);
  const [attachments, setAttachments] = useState<CashTransactionAttachment[]>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [attachmentsSaving, setAttachmentsSaving] = useState(false);

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'system_admin';

  useEffect(() => {
    if (!permissions.loading && !permissions.canView) navigate('/dashboard');
  }, [permissions.loading, permissions.canView, navigate]);

  // 날짜 이동(화살표/직접 입력) 시 주소도 함께 바꿔, 이 탭을 새로고침하거나 다시 열어도
  // 같은 날짜가 유지되게 한다. 아직 지나지 않은 날은 자금일보 자체가 만들어지지 않으므로
  // (서비스 레이어에서도 막힘) 오늘을 넘어가지 못하게 막는다.
  const changeDate = (next: string) => {
    if (next > todayIso()) return;
    setDate(next);
    navigate(`/accounting/daily-report/${next}`, { replace: true });
  };

  const loadReport = useCallback(async (targetDate: string, userId: string) => {
    setLoading(true);
    try {
      let r = await getOrCreateDraftReport(targetDate, userId);
      if (r.status === 'draft') r = await regenerateDraftReport(targetDate, userId);
      setReport(r);
    } catch (e) {
      console.error(e);
      setReport(null);
      toast({ title: '자금일보를 불러오는 중 오류가 발생했습니다.', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    (async () => {
      const user = await getCurrentUser();
      setCurrentUser(user);
      if (user) await loadReport(date, user.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (currentUser) loadReport(date, currentUser.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  useEffect(() => {
    setRemarksDraft(report?.remarks || '');
  }, [report?.id, report?.remarks]);

  useEffect(() => {
    setAttachments(report?.attachments || []);
    setNewFiles([]);
  }, [report?.id, report?.attachments]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files).filter(f => {
      if (f.size > 10 * 1024 * 1024) { toast({ title: `${f.name}은 10MB를 초과합니다.`, variant: 'destructive' }); return false; }
      return true;
    });
    setNewFiles(prev => [...prev, ...files]);
    e.target.value = '';
  };
  const removeNewFile = (idx: number) => setNewFiles(prev => prev.filter((_, i) => i !== idx));
  const removeExistingAttachment = (idx: number) => setAttachments(prev => prev.filter((_, i) => i !== idx));
  const getAttachmentUrl = (path: string) => getFileUrl('documents', path);

  const handleSaveAttachments = async () => {
    if (!report || report.status !== 'draft') return;
    setAttachmentsSaving(true);
    try {
      const uploaded: CashTransactionAttachment[] = [];
      for (const file of newFiles) {
        try {
          uploaded.push(await uploadCompressed('documents', `accounting-daily-report-attachments/${report.id}/`, file));
        } catch {
          throw new Error(`${file.name} 업로드 실패`);
        }
      }
      const merged = [...attachments, ...uploaded];
      await updateReportAttachments(report.id, merged);
      setReport(prev => (prev ? { ...prev, attachments: merged } : prev));
      setAttachments(merged);
      setNewFiles([]);
      toast({ title: '첨부파일이 저장되었습니다.' });
    } catch (e) {
      toast({ title: '첨부파일 저장 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setAttachmentsSaving(false);
    }
  };

  const handleSaveRemarks = async () => {
    if (!report || report.status !== 'draft') return;
    setRemarksSaving(true);
    try {
      await updateReportRemarks(report.id, remarksDraft.trim());
      setReport(prev => (prev ? { ...prev, remarks: remarksDraft.trim() || null } : prev));
      toast({ title: '비고가 저장되었습니다.' });
    } catch (e) {
      toast({ title: '비고 저장 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setRemarksSaving(false);
    }
  };

  const handleRegenerate = async () => {
    if (!currentUser || !report || report.status !== 'draft') return;
    setWorking(true);
    try {
      setReport(await regenerateDraftReport(date, currentUser.id));
      toast({ title: '다시 계산되었습니다.' });
    } catch (e) {
      toast({ title: '재계산 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setWorking(false);
    }
  };

  const handleSubmit = async () => {
    if (!currentUser || !report || report.status !== 'draft') return;
    if (!confirm(`${date} 자금일보 기안문을 작성하시겠습니까? 기안문 작성 화면에서 결재선을 확인하고 최종 상신할 수 있습니다.`)) return;
    setWorking(true);
    try {
      const { draftId } = await prepareDailyReportDraft(date, currentUser.id);
      openNewTab(`/documents/new?draft=${draftId}`, `${date} 자금일보 기안`);
    } catch (e) {
      toast({ title: '기안문 작성 준비 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setWorking(false);
    }
  };

  const handleForceCancel = async () => {
    if (!currentUser || !report || report.status !== 'confirmed') return;
    if (!forceCancelReason.trim()) { toast({ title: '사유를 입력하세요.', variant: 'destructive' }); return; }
    setForceCancelSubmitting(true);
    try {
      await forceCancelConfirmedReport({ reportId: report.id, reason: forceCancelReason.trim(), performedBy: currentUser.id });
      toast({ title: '확정이 취소되었습니다.', description: '작성중 상태로 되돌아갔습니다. 필요하면 수정 후 다시 상신하세요.' });
      setForceCancelOpen(false);
      await loadReport(date, currentUser.id);
    } catch (e) {
      toast({ title: '확정 취소 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setForceCancelSubmitting(false);
    }
  };

  // 목록 화면(DailyCashReportOverviewPage)의 작성중 건 삭제와 동일한 기능 — 결재상신을 한 번도
  // 안 한 자금일보를 완전히 지운다(이력/달력에서 사라짐). 이 화면은 열 때마다 draft 행을 만들기
  // 때문에(getOrCreateDraftReport), 삭제 후에는 그대로 두면 다시 같은 draft가 생기므로 탭을 닫는다.
  const handleDeleteDraft = async () => {
    if (!report || report.status !== 'draft') return;
    if (!confirm(`${date} 자금일보(작성중)를 완전히 삭제하시겠습니까? 이력/달력에서 사라지며 되돌릴 수 없습니다.`)) return;
    setDeleting(true);
    try {
      await deleteDraftDailyReport(report.id);
      toast({ title: '삭제되었습니다.' });
      if (activeTabId) closeTab(activeTabId);
      else navigate('/accounting/daily-report');
    } catch (e) {
      toast({ title: '삭제 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  if (loading && !report) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>;
  }

  const sections = report?.snapshot || [];
  const isDraft = report?.status === 'draft';
  // 결재 상신 시 실제로 함께 첨부되는 그날 각 거래의 증빙서류를, 상신 전에도 미리 한눈에
  // 볼 수 있게 여기서도 모아서 보여준다(같은 파일이 여러 거래에 겹쳐 있으면 한 번만).
  const transactionAttachments = [...new Map(
    sections.flatMap(s => s.transactions.flatMap(t => t.attachments)).map(a => [a.path, a])
  ).values()];

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <FileText className="w-6 h-6" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">자금일보</h1>
            <p className="text-sm text-gray-500">통장·현금 계좌별로 전일이월-거래내역-금일잔액을 정리해 결재로 상신합니다.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => openNewTab('/accounting/daily-report', '자금일보')}>
          <List className="w-3.5 h-3.5" />목록
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => changeDate(shiftDate(date, -1))}><ChevronLeft className="w-4 h-4" /></Button>
              <Input type="date" value={date} max={todayIso()} onChange={e => changeDate(e.target.value)} className="h-8 w-[150px] text-sm" />
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => changeDate(shiftDate(date, 1))} disabled={date >= todayIso()}><ChevronRight className="w-4 h-4" /></Button>
              {report && <Badge className={`text-xs ${STATUS_BADGE[report.status].className}`}>{STATUS_BADGE[report.status].label}</Badge>}
            </div>
            <div className="flex items-center gap-2">
              {isDraft && (
                <>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={handleRegenerate} disabled={working || loading}>
                    <RefreshCw className="w-3.5 h-3.5" />새로고침
                  </Button>
                  {permissions.canDelete && (
                    <Button variant="outline" size="sm" className="h-8 gap-1.5 text-red-600 border-red-200 hover:bg-red-50" onClick={handleDeleteDraft} disabled={deleting || working || loading}>
                      <Trash2 className="w-3.5 h-3.5" />작성취소
                    </Button>
                  )}
                  {permissions.canCreate && (
                    <Button size="sm" className="h-8 gap-1.5" onClick={handleSubmit} disabled={working || loading}>
                      <Send className="w-3.5 h-3.5" />결재 상신
                    </Button>
                  )}
                </>
              )}
              {!isDraft && report?.approval_document_id && (
                <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => openNewTab(`/documents/${report.approval_document_id}`, `${date} 자금일보`)}>
                  <ExternalLink className="w-3.5 h-3.5" />결재문서 보기
                </Button>
              )}
              {report?.status === 'confirmed' && isAdmin && (
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-red-600 border-red-200 hover:bg-red-50" onClick={() => { setForceCancelReason(''); setForceCancelOpen(true); }}>
                  <Ban className="w-3.5 h-3.5" />확정 취소
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
          <DailyCashReportTable sections={sections} onTransactionClick={id => openNewTab(`/accounting/cashbook/transaction/${id}`, '거래 수정')} />
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">비고</Label>
              {isDraft && (
                <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={handleSaveRemarks} disabled={remarksSaving || remarksDraft === (report?.remarks || '')}>
                  {remarksSaving ? '저장 중...' : '비고 저장'}
                </Button>
              )}
            </div>
            <Textarea
              value={remarksDraft}
              onChange={e => setRemarksDraft(e.target.value)}
              rows={3}
              className="text-sm resize-y"
              placeholder="자금일보에 남길 비고가 있으면 입력하세요"
              disabled={!isDraft}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">첨부파일 <span className="text-gray-400 font-normal">(각 거래의 증빙서류와 별개로, 자금일보 자체에 붙이는 파일 — 결재 상신 시 거래 증빙서류와 함께 일괄 첨부됩니다)</span></Label>
              {isDraft && newFiles.length > 0 && (
                <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={handleSaveAttachments} disabled={attachmentsSaving}>
                  {attachmentsSaving ? '저장 중...' : '첨부파일 저장'}
                </Button>
              )}
            </div>
            {transactionAttachments.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] text-gray-400">거래 증빙서류 (자동 포함, {transactionAttachments.length}건 — 각 거래에서 직접 첨부/삭제)</p>
                {transactionAttachments.map(a => (
                  <div key={a.path} className="flex items-center justify-between p-2 bg-gray-50 rounded-md text-sm">
                    <a href={getAttachmentUrl(a.path)} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-blue-600 hover:underline truncate">
                      <FileText className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{a.name}</span>
                    </a>
                  </div>
                ))}
              </div>
            )}
            {(attachments.length > 0 || newFiles.length > 0) && (
              <div className="space-y-1.5">
                {attachments.map((a, idx) => (
                  <div key={a.path} className="flex items-center justify-between p-2 bg-gray-50 rounded-md text-sm">
                    <a href={getAttachmentUrl(a.path)} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-blue-600 hover:underline truncate">
                      <FileText className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{a.name}</span>
                    </a>
                    {isDraft && (
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500 shrink-0" onClick={() => removeExistingAttachment(idx)} disabled={attachmentsSaving}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
                {newFiles.map((f, idx) => (
                  <div key={`${f.name}-${idx}`} className="flex items-center justify-between p-2 bg-blue-50 rounded-md text-sm">
                    <span className="flex items-center gap-2 text-blue-700 truncate">
                      <FileText className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{f.name}</span>
                      <span className="text-xs text-blue-400 shrink-0">(신규)</span>
                    </span>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500 shrink-0" onClick={() => removeNewFile(idx)} disabled={attachmentsSaving}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {isDraft && (
              <label className="flex items-center justify-center gap-1.5 h-9 border border-dashed rounded-md text-xs text-gray-500 cursor-pointer hover:bg-gray-50">
                <Upload className="w-3.5 h-3.5" />첨부파일 추가 (최대 10MB)
                <input type="file" multiple className="hidden" onChange={handleFileChange} disabled={attachmentsSaving} />
              </label>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={forceCancelOpen} onOpenChange={open => !open && !forceCancelSubmitting && setForceCancelOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{date} 자금일보 확정 취소</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              결재 절차 없이 관리자 권한으로 즉시 취소되어 작성중 상태로 돌아갑니다. 확정 당시 결재문서는 기록으로 그대로 남고, 다시 상신하면 새 결재문서가 만들어집니다.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">사유 *</Label>
              <Textarea value={forceCancelReason} onChange={e => setForceCancelReason(e.target.value)} rows={2} className="text-sm resize-none" disabled={forceCancelSubmitting} placeholder="확정 취소 사유를 입력하세요" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForceCancelOpen(false)} disabled={forceCancelSubmitting}>닫기</Button>
            <Button variant="destructive" onClick={handleForceCancel} disabled={forceCancelSubmitting}>{forceCancelSubmitting ? '처리 중...' : '확정 취소'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
