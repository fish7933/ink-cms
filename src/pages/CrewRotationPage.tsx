import { useState, useEffect } from 'react';
import { Plus, Ship, Users, Calendar, FileText, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import Layout from '@/components/Layout';
import { rotationService } from '@/services/rotation.service';
import { RotationPlanDialog } from '@/components/rotation/RotationPlanDialog';
import type { CrewRotationPlanWithDetails } from '@/types/rotation';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

export function CrewRotationPage() {
  const [plans, setPlans] = useState<CrewRotationPlanWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<CrewRotationPlanWithDetails | null>(null);

  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    setLoading(true);
    const data = await rotationService.getRotationPlans();
    setPlans(data);
    setLoading(false);
  };

  const handleCreateNew = () => {
    setSelectedPlan(null);
    setDialogOpen(true);
  };

  const handleEdit = (plan: CrewRotationPlanWithDetails) => {
    setSelectedPlan(plan);
    setDialogOpen(true);
  };

  const handleDelete = async (planId: string) => {
    if (!confirm('이 교대 계획서를 삭제하시겠습니까?')) return;

    const success = await rotationService.deleteRotationPlan(planId);
    if (success) {
      loadPlans();
    }
  };

  const handleExecute = async (planId: string) => {
    if (!confirm('이 교대 계획을 실행하시겠습니까? 실행 후에는 취소할 수 없습니다.')) return;

    const success = await rotationService.executeRotationPlan(planId);
    if (success) {
      alert('교대 계획이 성공적으로 실행되었습니다.');
      loadPlans();
    } else {
      alert('교대 계획 실행 중 오류가 발생했습니다.');
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      draft: { label: '임시저장', variant: 'secondary' as const },
      pending_approval: { label: '결재대기', variant: 'default' as const },
      approved: { label: '승인됨', variant: 'default' as const },
      rejected: { label: '반려됨', variant: 'destructive' as const },
      executed: { label: '실행완료', variant: 'default' as const },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.draft;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  return (
    <Layout>
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">선원 교대 발령</h1>
            <p className="text-muted-foreground mt-1">
              선원 승선/하선 교대 계획을 작성하고 결재를 진행합니다
            </p>
          </div>
          <Button onClick={handleCreateNew}>
            <Plus className="mr-2 h-4 w-4" />
            새 교대 계획 작성
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">전체 계획</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{plans.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">임시저장</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {plans.filter((p) => p.status === 'draft').length}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">결재대기</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {plans.filter((p) => p.status === 'pending_approval').length}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">실행완료</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {plans.filter((p) => p.status === 'executed').length}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>교대 계획 목록</CardTitle>
            <CardDescription>작성된 선원 교대 계획서 목록입니다</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
            ) : plans.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                작성된 교대 계획이 없습니다
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>계획명</TableHead>
                    <TableHead>선박</TableHead>
                    <TableHead>선주</TableHead>
                    <TableHead>교대일</TableHead>
                    <TableHead>교대인원</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>작성일</TableHead>
                    <TableHead className="text-right">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plans.map((plan) => (
                    <TableRow key={plan.id}>
                      <TableCell className="font-medium">{plan.plan_name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Ship className="h-4 w-4 text-muted-foreground" />
                          {plan.ship_name}
                        </div>
                      </TableCell>
                      <TableCell>{plan.owner_name}</TableCell>
                      <TableCell>
                        {format(new Date(plan.rotation_date), 'yyyy-MM-dd', { locale: ko })}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          {plan.assignments.length}명
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(plan.status)}</TableCell>
                      <TableCell>
                        {format(new Date(plan.created_at), 'yyyy-MM-dd', { locale: ko })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {plan.status === 'draft' && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEdit(plan)}
                              >
                                수정
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDelete(plan.id)}
                              >
                                삭제
                              </Button>
                            </>
                          )}
                          {plan.status === 'approved' && (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handleExecute(plan.id)}
                            >
                              발령 실행
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(plan)}
                          >
                            상세보기
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <RotationPlanDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          plan={selectedPlan}
          onSuccess={loadPlans}
        />
      </div>
    </Layout>
  );
}