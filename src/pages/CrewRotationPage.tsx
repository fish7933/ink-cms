import { useState, useEffect } from 'react';
import { Plus, Ship, Users, Calendar, FileText, CheckCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { rotationService } from '@/services/rotation.service';
import { RotationPlanForm } from '@/components/rotation/RotationPlanForm';
import type { CrewRotationPlanWithDetails } from '@/types/rotation';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

export function CrewRotationPage() {
  const [plans, setPlans] = useState<CrewRotationPlanWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [formView, setFormView] = useState<{ plan: CrewRotationPlanWithDetails | null } | null>(null);

  useEffect(() => { loadPlans(); }, []);

  const loadPlans = async () => { setLoading(true); setPlans(await rotationService.getRotationPlans()); setLoading(false); };

  const handleDelete = async (planId: string) => {
    if (!confirm('이 교대 계획서를 삭제하시겠습니까?')) return;
    if (await rotationService.deleteRotationPlan(planId)) loadPlans();
  };

  const handleExecute = async (planId: string) => {
    if (!confirm('이 교대 계획을 실행하시겠습니까? 실행 후에는 취소할 수 없습니다.')) return;
    if (await rotationService.executeRotationPlan(planId)) { alert('교대 계획이 성공적으로 실행되었습니다.'); loadPlans(); }
    else alert('교대 계획 실행 중 오류가 발생했습니다.');
  };

  const getStatusBadge = (status: string) => {
    const cfg: Record<string, { label: string; variant: 'secondary' | 'default' | 'destructive' }> = {
      draft: { label: '임시저장', variant: 'secondary' }, pending_approval: { label: '결재대기', variant: 'default' },
      approved: { label: '승인됨', variant: 'default' }, rejected: { label: '반려됨', variant: 'destructive' }, executed: { label: '실행완료', variant: 'default' },
    };
    const c = cfg[status] || cfg.draft;
    return <Badge variant={c.variant}>{c.label}</Badge>;
  };

  if (formView !== null) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setFormView(null); loadPlans(); }}><ArrowLeft className="w-4 h-4" /></Button>
          <div>
            <h1 className="text-xl font-bold">{formView.plan ? '교대 계획 수정' : '새 교대 계획 작성'}</h1>
            <p className="text-xs text-muted-foreground">선원 승선/하선 교대 계획을 작성합니다</p>
          </div>
        </div>
        <RotationPlanForm plan={formView.plan} onSuccess={() => { setFormView(null); loadPlans(); }} onCancel={() => { setFormView(null); loadPlans(); }} />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold">선원 교대 발령</h1><p className="text-xs text-muted-foreground mt-1">선원 승선/하선 교대 계획을 작성하고 결재를 진행합니다</p></div>
        <Button onClick={() => setFormView({ plan: null })} size="sm"><Plus className="mr-2 h-4 w-4" />새 교대 계획 작성</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">전체 계획</CardTitle><FileText className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{plans.length}</div></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">임시저장</CardTitle><FileText className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{plans.filter(p => p.status === 'draft').length}</div></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">결재대기</CardTitle><Calendar className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{plans.filter(p => p.status === 'pending_approval').length}</div></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">실행완료</CardTitle><CheckCircle className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{plans.filter(p => p.status === 'executed').length}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">교대 계획 목록</CardTitle><CardDescription className="text-xs">작성된 선원 교대 계획서 목록입니다</CardDescription></CardHeader>
        <CardContent>
          {loading ? <div className="text-center py-8 text-muted-foreground text-sm">로딩 중...</div> : plans.length === 0 ? <div className="text-center py-8 text-muted-foreground text-sm">작성된 교대 계획이 없습니다</div> : (
            <Table>
              <TableHeader><TableRow><TableHead className="text-xs">계획명</TableHead><TableHead className="text-xs">선박</TableHead><TableHead className="text-xs">선주</TableHead><TableHead className="text-xs">교대일</TableHead><TableHead className="text-xs">교대인원</TableHead><TableHead className="text-xs">상태</TableHead><TableHead className="text-xs">작성일</TableHead><TableHead className="text-right text-xs">작업</TableHead></TableRow></TableHeader>
              <TableBody>
                {plans.map(plan => (
                  <TableRow key={plan.id} className="cursor-pointer" onClick={() => setFormView({ plan })}>
                    <TableCell className="font-medium text-xs">{plan.plan_name}</TableCell>
                    <TableCell className="text-xs"><div className="flex items-center gap-2"><Ship className="h-3.5 w-3.5 text-muted-foreground" />{plan.ship_name}</div></TableCell>
                    <TableCell className="text-xs">{plan.owner_name}</TableCell>
                    <TableCell className="text-xs">{format(new Date(plan.rotation_date), 'yyyy-MM-dd', { locale: ko })}</TableCell>
                    <TableCell className="text-xs"><div className="flex items-center gap-2"><Users className="h-3.5 w-3.5 text-muted-foreground" />{plan.assignments.length}명</div></TableCell>
                    <TableCell>{getStatusBadge(plan.status)}</TableCell>
                    <TableCell className="text-xs">{format(new Date(plan.created_at), 'yyyy-MM-dd', { locale: ko })}</TableCell>
                    <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex justify-end gap-2">
                        {plan.status === 'draft' && <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleDelete(plan.id)}>삭제</Button>}
                        {plan.status === 'approved' && <Button variant="default" size="sm" className="h-7 text-xs" onClick={() => handleExecute(plan.id)}>발령 실행</Button>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
