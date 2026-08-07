import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Ship, Users, Download, Printer } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { rotationService } from '@/services/rotation.service';
import { approvalService } from '@/services/approval.service';
import { getPorts } from '@/services/port.service';
import { exportRotationPlanToExcel } from '@/utils/rotation-plan-export';
import { getCurrentUser } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import type { User } from '@/types/models';
import type { CrewRotationPlanWithDetails } from '@/types/rotation';
import type { ApprovalLineWithSteps } from '@/types/approval';
import { useTabContext } from '@/contexts/TabContext';
import { useToast } from '@/hooks/use-toast';

const STATUS_CONFIG: Record<string, { label: string; variant: 'secondary' | 'default' | 'destructive' }> = {
  draft: { label: '임시저장', variant: 'secondary' },
  pending_approval: { label: '결재대기', variant: 'default' },
  approved: { label: '승인됨', variant: 'default' },
  rejected: { label: '반려됨', variant: 'destructive' },
  executed: { label: '실행완료', variant: 'default' },
};

export default function CrewRotationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { activeTabId, updateTab } = useTabContext();
  const { toast } = useToast();
  const [plan, setPlan] = useState<CrewRotationPlanWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [portLabel, setPortLabel] = useState('');
  const [exporting, setExporting] = useState(false);

  // 배승 결재 상신 다이얼로그 — 채용 결재와 동일하게 결재선을 직접 선택
  const [approvalLines, setApprovalLines] = useState<ApprovalLineWithSteps[]>([]);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [submitLineId, setSubmitLineId] = useState('');
  const [submitComment, setSubmitComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [defaultLineId, setDefaultLineId] = useState('');
  const [saveLineDefault, setSaveLineDefault] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // 비고 — 발령 실행 후에도(다른 입력부는 다 잠긴 뒤에도) 대리점/비자 정보 등 특이사항을
  // 계속 기록할 수 있어야 하므로, 기존 내용을 덮어쓰지 않고 시각/작성자를 붙여 이어붙인다.
  const [addingNote, setAddingNote] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const loadPlan = async () => {
    if (!id) return;
    setLoading(true);
    const [data, ports] = await Promise.all([rotationService.getRotationPlanById(id), getPorts()]);
    setPlan(data);
    if (data?.port_id) {
      const port = ports.find(p => p.id === data.port_id);
      if (port) setPortLabel(`${port.country_name} ${port.city_name}`);
    }
    if (activeTabId && data) updateTab(activeTabId, { title: data.plan_name || '교대계획' });
    setLoading(false);
  };

  const handleExportExcel = async () => {
    if (!plan) return;
    setExporting(true);
    try {
      await exportRotationPlanToExcel(plan, portLabel);
    } finally {
      setExporting(false);
    }
  };

  const handlePrint = () => {
    if (!plan) return;
    window.open(`/print/rotation-plans/${plan.id}`, '_blank');
  };

  useEffect(() => { loadPlan(); }, [id]);
  useEffect(() => {
    getCurrentUser().then(async u => {
      setCurrentUser(u);
      if (!u) return;
      approvalService.getApprovalLines(u.company_id ?? null).then(setApprovalLines);
      const { data: pref } = await supabase.from('users').select('default_approval_line_id').eq('id', u.id).single();
      if (pref?.default_approval_line_id) setDefaultLineId(pref.default_approval_line_id);
    });
  }, []);

  const openSubmitDialog = () => { setSubmitLineId(defaultLineId || ''); setSubmitComment(''); setSaveLineDefault(false); setSubmitDialogOpen(true); };

  const handleSubmitApproval = async () => {
    if (!plan || !submitLineId || !currentUser) return;
    try {
      setSubmitting(true);
      if (saveLineDefault) {
        await supabase.from('users').update({ default_approval_line_id: submitLineId }).eq('id', currentUser.id);
        setDefaultLineId(submitLineId);
      }
      const result = await rotationService.submitRotationPlanForApproval(plan.id, submitLineId, submitComment || undefined);
      if (!result.ok) { toast({ title: '결재 상신 실패', description: result.message, variant: 'destructive' }); return; }
      toast({ title: '결재 상신 완료', description: '발령 결재함(배승)에서 진행 상황을 확인할 수 있습니다.' });
      setSubmitDialogOpen(false);
      loadPlan();
      window.dispatchEvent(new CustomEvent('rotation-plan-data-changed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddNote = async () => {
    if (!plan || !currentUser || !newNoteText.trim()) return;
    setSavingNote(true);
    try {
      const stamp = format(new Date(), 'yyyy-MM-dd HH:mm', { locale: ko });
      const entry = `[${stamp} ${currentUser.name}] ${newNoteText.trim()}`;
      const combined = plan.notes ? `${plan.notes}\n${entry}` : entry;
      const updated = await rotationService.updateRotationPlan(plan.id, { notes: combined });
      if (updated) {
        setPlan({ ...plan, notes: combined });
        setNewNoteText('');
        setAddingNote(false);
      } else {
        toast({ title: '비고 추가 중 오류가 발생했습니다', variant: 'destructive' });
      }
    } finally {
      setSavingNote(false);
    }
  };

  const handleExecute = async () => {
    if (!plan || !confirm('발령을 실행하시겠습니까? 실행하면 선원 상태가 즉시 변경됩니다.')) return;
    const ok = await rotationService.executeRotationPlan(plan.id);
    if (ok) { toast({ title: '발령이 실행되었습니다', description: '선원 상태가 업데이트되었습니다.' }); loadPlan(); window.dispatchEvent(new CustomEvent('rotation-plan-data-changed')); }
    else toast({ title: '실행 중 오류가 발생했습니다', variant: 'destructive' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-gray-500">교대 계획을 찾을 수 없습니다.</p>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[plan.status] || STATUS_CONFIG.draft;

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-3">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Ship className="w-4 h-4" />{plan.plan_name}
              </CardTitle>
              <p className="text-xs text-gray-500 mt-1">
                {plan.ship_name} · {plan.owner_name}{plan.fleet_name ? ` · ${plan.fleet_name}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
              <Button size="sm" variant="outline" className="h-8" onClick={handleExportExcel} disabled={exporting}>
                <Download className="w-3.5 h-3.5 mr-1" />{exporting ? '내보내는 중...' : '엑셀 다운로드'}
              </Button>
              <Button size="sm" variant="outline" className="h-8" onClick={handlePrint}>
                <Printer className="w-3.5 h-3.5 mr-1" />PDF 출력
              </Button>
              {plan.status === 'draft' && (
                <Button size="sm" variant="outline" className="h-8 text-blue-600 border-blue-300 hover:bg-blue-50" onClick={openSubmitDialog}>결재 상신</Button>
              )}
              {plan.status === 'approved' && (
                <Button size="sm" className="h-8" onClick={handleExecute}>발령 실행</Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <Label className="text-xs text-gray-500">교대일</Label>
              <div className="mt-0.5">{format(new Date(plan.rotation_date), 'yyyy-MM-dd', { locale: ko })}</div>
            </div>
            <div>
              <Label className="text-xs text-gray-500">기준 교대일</Label>
              <div className="mt-0.5">{plan.base_departure_date || '-'}</div>
            </div>
            <div>
              <Label className="text-xs text-gray-500">작성자</Label>
              <div className="mt-0.5">{plan.creator_name || '-'}</div>
            </div>
            <div>
              <Label className="text-xs text-gray-500">작성일시</Label>
              <div className="mt-0.5">{format(new Date(plan.created_at), 'yyyy-MM-dd HH:mm', { locale: ko })}</div>
            </div>
          </div>
          <div>
            <Label className="text-xs text-gray-500">비고</Label>
            {plan.notes && <p className="text-sm mt-0.5 text-gray-700 whitespace-pre-wrap">{plan.notes}</p>}
            {addingNote ? (
              <div className="mt-2 space-y-2">
                <Textarea
                  value={newNoteText}
                  onChange={e => setNewNoteText(e.target.value)}
                  placeholder="대리점 정보, 비자 정보 등 특이사항을 입력하세요"
                  className="text-sm min-h-[70px]"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleAddNote} disabled={savingNote || !newNoteText.trim()}>
                    {savingNote ? '저장 중...' : '추가'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setAddingNote(false); setNewNoteText(''); }} disabled={savingNote}>
                    취소
                  </Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="outline" className="mt-2 h-7 text-xs" onClick={() => setAddingNote(true)}>
                + 비고 추가
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Users className="w-4 h-4" />교대 인원 ({plan.assignments.length}명)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {plan.assignments.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">배정된 선원이 없습니다.</p>
          ) : (
            plan.assignments.map((a, i) => (
              <div key={a.id} className="border rounded-md p-3 text-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-400">#{i + 1}</span>
                  <span className="text-xs text-gray-400">계약 {a.contract_months ?? '-'}개월</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className="text-[11px] font-medium text-emerald-700 mb-1">승선자</div>
                    {a.on_crew_id ? (
                      <>
                        <div className="font-medium">
                          {a.on_crew_name}
                          {a.on_rank_grade && <span className="text-blue-600 text-xs ml-1">({a.on_rank_grade})</span>}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">출국 {a.on_departure_date || '-'} · 승선 {a.embark_date}</div>
                      </>
                    ) : <div className="text-gray-400 text-xs">없음</div>}
                  </div>
                  <div>
                    <div className="text-[11px] font-medium text-orange-700 mb-1">하선자</div>
                    {a.off_crew_id ? (
                      <>
                        <div className="font-medium">
                          {a.off_crew_name}
                          {a.off_rank_grade && <span className="text-blue-600 text-xs ml-1">({a.off_rank_grade})</span>}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">하선 {a.off_disembark_date || '-'} · 귀국 {a.off_return_date || '-'}</div>
                      </>
                    ) : <div className="text-gray-400 text-xs">없음</div>}
                  </div>
                </div>
                {a.notes && <p className="text-xs text-gray-500 mt-2 pt-2 border-t">비고: {a.notes}</p>}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={submitDialogOpen} onOpenChange={o => !submitting && setSubmitDialogOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>배승 결재 상신</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">결재 라인 선택 *</label>
              <Select value={submitLineId} onValueChange={setSubmitLineId}>
                <SelectTrigger><SelectValue placeholder="결재 라인을 선택하세요" /></SelectTrigger>
                <SelectContent>
                  {approvalLines.length === 0
                    ? <SelectItem value="none" disabled>등록된 결재 라인이 없습니다</SelectItem>
                    : approvalLines.map(l => <SelectItem key={l.id} value={String(l.id)}>{l.name} ({l.steps.length}단계)</SelectItem>)}
                </SelectContent>
              </Select>
              {submitLineId && (
                <div className="flex items-center space-x-2 mt-2">
                  <Checkbox id="save-line-default-rotation-detail" checked={saveLineDefault} onCheckedChange={c => setSaveLineDefault(c as boolean)} />
                  <label htmlFor="save-line-default-rotation-detail" className="text-sm text-gray-700 cursor-pointer">앞으로도 해당 결재 라인 이용</label>
                </div>
              )}
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">요청 사유 (선택)</label>
              <Textarea value={submitComment} onChange={e => setSubmitComment(e.target.value)} placeholder="요청 사유를 입력하세요..." className="min-h-[80px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitDialogOpen(false)} disabled={submitting}>취소</Button>
            <Button onClick={handleSubmitApproval} disabled={submitting || !submitLineId} className="bg-blue-600 hover:bg-blue-700">
              {submitting ? '처리 중...' : '결재 상신'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
