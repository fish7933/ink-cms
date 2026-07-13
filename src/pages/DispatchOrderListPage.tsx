import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, TrendingUp, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { dispatchService } from '@/services/dispatch.service';
import { approvalService } from '@/services/approval.service';
import { getCurrentUser } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { useTabContext } from '@/contexts/TabContext';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import type { CrewDispatchOrderWithDetails, DispatchStatus } from '@/types/dispatch';
import type { ApprovalLineWithSteps } from '@/types/approval';
import type { User } from '@/types/models';

const STATUS_CONFIG: Record<DispatchStatus, { label: string; variant: 'secondary' | 'default' | 'destructive' }> = {
  draft: { label: '임시저장', variant: 'secondary' },
  pending_approval: { label: '결재대기', variant: 'default' },
  approved: { label: '승인됨', variant: 'default' },
  rejected: { label: '반려됨', variant: 'destructive' },
  executed: { label: '실행완료', variant: 'default' },
};

type StatusTab = 'all' | DispatchStatus;

export default function DispatchOrderListPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { openNewTab } = useTabContext();
  const permissions = usePermissions('crew_dispatch');

  const [orders, setOrders] = useState<CrewDispatchOrderWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [approvalLines, setApprovalLines] = useState<ApprovalLineWithSteps[]>([]);
  const [submitOrderId, setSubmitOrderId] = useState<string | null>(null);
  const [submitLineId, setSubmitLineId] = useState('');
  const [submitComment, setSubmitComment] = useState('');
  const [defaultLineId, setDefaultLineId] = useState('');
  const [saveLineDefault, setSaveLineDefault] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!permissions.loading && !permissions.canView) navigate('/dashboard');
  }, [permissions.loading, permissions.canView, navigate]);

  useEffect(() => {
    loadOrders();
    getCurrentUser().then(async u => {
      setCurrentUser(u);
      if (!u) return;
      approvalService.getApprovalLines(u.company_id ?? null).then(setApprovalLines);
      const { data: pref } = await supabase.from('users').select('default_approval_line_id').eq('id', u.id).single();
      if (pref?.default_approval_line_id) setDefaultLineId(pref.default_approval_line_id);
    });
  }, []);

  const loadOrders = async () => {
    setLoading(true);
    setOrders(await dispatchService.getDispatchOrders());
    setLoading(false);
  };

  const countByStatus = (s: StatusTab) => s === 'all' ? orders.length : orders.filter(o => o.status === s).length;
  const filteredOrders = statusTab === 'all' ? orders : orders.filter(o => o.status === statusTab);

  const openSubmitDialog = (orderId: string) => {
    setSubmitOrderId(orderId);
    setSubmitLineId(defaultLineId || '');
    setSubmitComment('');
    setSaveLineDefault(false);
  };

  const handleSubmitApproval = async () => {
    if (!submitOrderId || !submitLineId || !currentUser) return;
    try {
      setSubmitting(true);
      if (saveLineDefault) {
        await supabase.from('users').update({ default_approval_line_id: submitLineId }).eq('id', currentUser.id);
        setDefaultLineId(submitLineId);
      }
      const result = await dispatchService.submitDispatchOrderForApproval(submitOrderId, submitLineId, submitComment || undefined);
      if (!result.ok) { toast({ title: '결재 상신 실패', description: result.message, variant: 'destructive' }); return; }
      toast({ title: '결재 상신 완료', description: '발령 결재함(승진/강등)에서 진행 상황을 확인할 수 있습니다.' });
      setSubmitOrderId(null);
      loadOrders();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 발령(임시저장)을 삭제하시겠습니까?')) return;
    if (await dispatchService.deleteDispatchOrder(id)) loadOrders();
    else toast({ title: '삭제 실패', variant: 'destructive' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">승진/강등 발령</CardTitle>
            {permissions.canCreate && (
              <Button size="sm" className="gap-1.5 h-8" onClick={() => openNewTab('/crew-dispatch/new', '승진/강등 발령')}>
                <Plus className="h-4 w-4" />새 발령 작성
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <Tabs value={statusTab} onValueChange={v => setStatusTab(v as StatusTab)}>
            <TabsList className="h-9 flex-wrap">
              <TabsTrigger value="all" className="text-xs">전체 ({countByStatus('all')})</TabsTrigger>
              <TabsTrigger value="draft" className="text-xs">임시저장 ({countByStatus('draft')})</TabsTrigger>
              <TabsTrigger value="pending_approval" className="text-xs">결재대기 ({countByStatus('pending_approval')})</TabsTrigger>
              <TabsTrigger value="approved" className="text-xs">승인됨 ({countByStatus('approved')})</TabsTrigger>
              <TabsTrigger value="rejected" className="text-xs">반려됨 ({countByStatus('rejected')})</TabsTrigger>
              <TabsTrigger value="executed" className="text-xs">실행완료 ({countByStatus('executed')})</TabsTrigger>
            </TabsList>
            <TabsContent value={statusTab} className="mt-3">
              {filteredOrders.length === 0 ? (
                <div className="text-center py-8 text-sm text-gray-500">해당하는 발령이 없습니다.</div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">선원</TableHead>
                        <TableHead className="text-xs">유형</TableHead>
                        <TableHead className="text-xs">변경</TableHead>
                        <TableHead className="text-xs">선박</TableHead>
                        <TableHead className="text-xs">발효일</TableHead>
                        <TableHead className="text-xs">상태</TableHead>
                        <TableHead className="text-right text-xs">작업</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredOrders.map(o => (
                        <TableRow key={o.id}>
                          <TableCell className="text-sm font-medium">{o.crew_name}</TableCell>
                          <TableCell>
                            {o.dispatch_type === 'promotion'
                              ? <Badge className="bg-emerald-600 gap-1 text-xs"><TrendingUp className="w-3 h-3" />승진</Badge>
                              : <Badge className="bg-red-500 gap-1 text-xs"><TrendingDown className="w-3 h-3" />강등</Badge>}
                          </TableCell>
                          <TableCell className="text-xs">
                            {o.previous_rank_code}{o.previous_grade ? `(${o.previous_grade})` : ''} → <span className="font-medium">{o.new_rank_code}{o.new_grade ? `(${o.new_grade})` : ''}</span>
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">{o.ship_name || '-'}</TableCell>
                          <TableCell className="text-xs text-gray-600">{o.effective_date}</TableCell>
                          <TableCell><Badge variant={STATUS_CONFIG[o.status].variant} className="text-xs">{STATUS_CONFIG[o.status].label}</Badge></TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {o.status === 'draft' && permissions.canEdit && (
                                <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-blue-600 border-blue-300 hover:bg-blue-50" onClick={() => openSubmitDialog(o.id)}>결재 상신</Button>
                              )}
                              {o.status === 'draft' && permissions.canDelete && (
                                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-600" onClick={() => handleDelete(o.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={!!submitOrderId} onOpenChange={o => !submitting && setSubmitOrderId(o ? submitOrderId : null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>발령 결재 상신</DialogTitle>
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
                  <Checkbox id="save-line-default-dispatch-list" checked={saveLineDefault} onCheckedChange={c => setSaveLineDefault(c as boolean)} />
                  <label htmlFor="save-line-default-dispatch-list" className="text-sm text-gray-700 cursor-pointer">앞으로도 해당 결재 라인 이용</label>
                </div>
              )}
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">요청 사유 (선택)</label>
              <Textarea value={submitComment} onChange={e => setSubmitComment(e.target.value)} placeholder="요청 사유를 입력하세요..." className="min-h-[80px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitOrderId(null)} disabled={submitting}>취소</Button>
            <Button onClick={handleSubmitApproval} disabled={submitting || !submitLineId} className="bg-blue-600 hover:bg-blue-700">
              {submitting ? '처리 중...' : '결재 상신'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
