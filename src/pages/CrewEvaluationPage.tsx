import { useState, useEffect } from 'react';
import { Plus, Search, Star, Trash2, Edit2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import Layout from '@/components/Layout';
import EvaluationDialog from '@/components/crew/EvaluationDialog';
import { getEvaluations, deleteEvaluation } from '@/services/evaluation.service';
import type { CrewEvaluationWithDetails } from '@/types/evaluation';
import { useToast } from '@/hooks/use-toast';

const REC_LABELS: Record<string, { label: string; color: string }> = {
  highly_recommend: { label: '강력 추천', color: 'bg-green-100 text-green-700' },
  recommend: { label: '추천', color: 'bg-blue-100 text-blue-700' },
  neutral: { label: '보통', color: 'bg-gray-100 text-gray-700' },
  not_recommend: { label: '비추천', color: 'bg-red-100 text-red-700' },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: '임시', color: 'bg-gray-100 text-gray-600' },
  submitted: { label: '제출', color: 'bg-blue-100 text-blue-700' },
  acknowledged: { label: '확인', color: 'bg-green-100 text-green-700' },
};

export default function CrewEvaluationPage() {
  const { toast } = useToast();
  const [evaluations, setEvaluations] = useState<CrewEvaluationWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<CrewEvaluationWithDetails | undefined>();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try { setLoading(true); setEvaluations(await getEvaluations()); } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const filtered = evaluations.filter(e => {
    if (!searchTerm) return true;
    const t = searchTerm.toLowerCase();
    return e.crew_name.toLowerCase().includes(t) || e.rank_name.toLowerCase().includes(t) || (e.ship_name || '').toLowerCase().includes(t);
  });

  const handleDelete = async (id: string) => {
    if (!confirm('이 평가를 삭제하시겠습니까?')) return;
    try { await deleteEvaluation(id); toast({ title: '삭제 완료' }); loadData(); } catch { toast({ title: '삭제 실패', variant: 'destructive' }); }
  };

  if (loading) {
    return <Layout><div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div></Layout>;
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-base">선원 평가</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">선원 근무 평가를 관리합니다</p>
              </div>
              <Button size="sm" className="gap-1.5 h-8" onClick={() => { setEditingRecord(undefined); setDialogOpen(true); }}>
                <Plus className="w-4 h-4" />평가 작성
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input placeholder="선원명, 직급, 선박명으로 검색..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 h-9 text-sm" />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="border-b bg-gray-50">
                  <th className="text-left p-2">선원명</th>
                  <th className="text-left p-2">직급</th>
                  <th className="text-left p-2">선박</th>
                  <th className="text-left p-2">평가 기간</th>
                  <th className="text-center p-2">평균점수</th>
                  <th className="text-center p-2">추천</th>
                  <th className="text-center p-2">상태</th>
                  <th className="text-center p-2">작업</th>
                </tr></thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-8 text-gray-400">평가 데이터가 없습니다.</td></tr>
                  ) : filtered.map(e => (
                    <tr key={e.id} className="border-b hover:bg-gray-50">
                      <td className="p-2 font-medium">{e.crew_name}</td>
                      <td className="p-2">{e.rank_code || e.rank_name}</td>
                      <td className="p-2">{e.ship_name || '-'}</td>
                      <td className="p-2">{e.evaluation_period_start} ~ {e.evaluation_period_end}</td>
                      <td className="p-2 text-center">
                        {e.overall_rating ? (
                          <span className="inline-flex items-center gap-0.5 font-semibold">
                            <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />{e.overall_rating}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="p-2 text-center">
                        {e.recommendation ? <Badge className={`text-xs ${REC_LABELS[e.recommendation]?.color || ''}`}>{REC_LABELS[e.recommendation]?.label}</Badge> : '-'}
                      </td>
                      <td className="p-2 text-center">
                        <Badge className={`text-xs ${STATUS_LABELS[e.status]?.color || ''}`}>{STATUS_LABELS[e.status]?.label}</Badge>
                      </td>
                      <td className="p-2 text-center">
                        <div className="flex justify-center gap-1">
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { setEditingRecord(e); setDialogOpen(true); }}><Edit2 className="h-3 w-3" /></Button>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={() => handleDelete(e.id)}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400 text-right">총 {filtered.length}건</p>
          </CardContent>
        </Card>
      </div>
      <EvaluationDialog open={dialogOpen} onOpenChange={setDialogOpen} record={editingRecord} onSuccess={loadData} />
    </Layout>
  );
}
