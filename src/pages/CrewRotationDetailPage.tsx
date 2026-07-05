import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Ship, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { rotationService } from '@/services/rotation.service';
import type { CrewRotationPlanWithDetails } from '@/types/rotation';
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

  const loadPlan = async () => {
    if (!id) return;
    setLoading(true);
    const data = await rotationService.getRotationPlanById(id);
    setPlan(data);
    if (activeTabId && data) updateTab(activeTabId, { title: data.plan_name || '교대계획' });
    setLoading(false);
  };

  useEffect(() => { loadPlan(); }, [id]);

  const handleSubmitApproval = async () => {
    if (!plan || !confirm('결재 상신하시겠습니까? 작성자 소속 부서를 기준으로 결재라인이 자동 구성됩니다.')) return;
    const result = await rotationService.submitRotationPlanForApproval(plan.id);
    if (!result.ok) { toast({ title: '결재 상신 실패', description: result.message, variant: 'destructive' }); return; }
    toast({ title: '결재 상신 완료', description: '내 결재함(일반 문서)에서 진행 상황을 확인할 수 있습니다.' });
    loadPlan();
  };

  const handleExecute = async () => {
    if (!plan || !confirm('발령을 실행하시겠습니까? 실행하면 선원 상태가 즉시 변경됩니다.')) return;
    const ok = await rotationService.executeRotationPlan(plan.id);
    if (ok) { toast({ title: '발령이 실행되었습니다', description: '선원 상태가 업데이트되었습니다.' }); loadPlan(); }
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
    <div className="max-w-5xl mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-3">
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
              {plan.status === 'draft' && (
                <Button size="sm" variant="outline" className="h-8 text-blue-600 border-blue-300 hover:bg-blue-50" onClick={handleSubmitApproval}>결재 상신</Button>
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
          {plan.notes && (
            <div>
              <Label className="text-xs text-gray-500">비고</Label>
              <p className="text-sm mt-0.5 text-gray-700 whitespace-pre-wrap">{plan.notes}</p>
            </div>
          )}
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
                          {a.on_rank_code} {a.on_crew_name}
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
                          {a.off_rank_code} {a.off_crew_name}
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
    </div>
  );
}
