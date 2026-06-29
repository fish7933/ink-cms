import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { addEvaluation, updateEvaluation } from '@/services/evaluation.service';
import type { CrewEvaluationWithDetails } from '@/types/evaluation';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

interface EvaluationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record?: CrewEvaluationWithDetails;
  onSuccess: () => void;
}

const CATEGORIES = [
  { key: 'professional_knowledge', label: '전문 지식' },
  { key: 'work_performance', label: '업무 수행력' },
  { key: 'safety_awareness', label: '안전 의식' },
  { key: 'teamwork', label: '팀워크' },
  { key: 'leadership', label: '리더십' },
  { key: 'communication', label: '의사소통' },
  { key: 'discipline', label: '규율 준수' },
  { key: 'reliability', label: '신뢰성' },
];

const RECOMMENDATIONS = [
  { value: 'highly_recommend', label: '강력 추천' },
  { value: 'recommend', label: '추천' },
  { value: 'neutral', label: '보통' },
  { value: 'not_recommend', label: '비추천' },
];

interface CrewOption { id: string; name: string; rank: string; }
interface ShipOption { id: string; name: string; }

export default function EvaluationDialog({ open, onOpenChange, record, onSuccess }: EvaluationDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [crewOptions, setCrewOptions] = useState<CrewOption[]>([]);
  const [shipOptions, setShipOptions] = useState<ShipOption[]>([]);

  const [formData, setFormData] = useState({
    crew_member_id: '',
    evaluation_period_start: '',
    evaluation_period_end: '',
    ship_id: '',
    evaluator_name: '',
    evaluator_rank: '',
    scores: {} as Record<string, number>,
    strengths: '',
    areas_for_improvement: '',
    recommendation: '',
    comments: '',
  });

  useEffect(() => {
    supabase.from('crew_members').select('id, name, rank').then(({ data }) => {
      if (data) setCrewOptions(data.map(c => ({ id: c.id, name: c.name || '', rank: c.rank || '' })));
    });
    supabase.from('ships').select('id, name').then(({ data }) => {
      if (data) setShipOptions(data);
    });
  }, []);

  useEffect(() => {
    if (record) {
      const scores: Record<string, number> = {};
      CATEGORIES.forEach(c => { const v = record[c.key as keyof typeof record] as number | undefined; if (v) scores[c.key] = v; });
      setFormData({
        crew_member_id: record.crew_member_id,
        evaluation_period_start: record.evaluation_period_start,
        evaluation_period_end: record.evaluation_period_end,
        ship_id: record.ship_id || '',
        evaluator_name: record.evaluator_name || '',
        evaluator_rank: record.evaluator_rank || '',
        scores,
        strengths: record.strengths || '',
        areas_for_improvement: record.areas_for_improvement || '',
        recommendation: record.recommendation || '',
        comments: record.comments || '',
      });
    } else {
      setFormData({
        crew_member_id: '', evaluation_period_start: '', evaluation_period_end: '',
        ship_id: '', evaluator_name: '', evaluator_rank: '',
        scores: {}, strengths: '', areas_for_improvement: '', recommendation: '', comments: '',
      });
    }
  }, [record, open]);

  const setScore = (key: string, val: number) => setFormData(prev => ({ ...prev, scores: { ...prev.scores, [key]: val } }));

  const calcOverall = () => {
    const vals = Object.values(formData.scores);
    if (vals.length === 0) return 0;
    return parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const scoreFields: Record<string, number | undefined> = {};
      CATEGORIES.forEach(c => { scoreFields[c.key] = formData.scores[c.key] || undefined; });

      const data = {
        crew_member_id: formData.crew_member_id,
        evaluation_period_start: formData.evaluation_period_start,
        evaluation_period_end: formData.evaluation_period_end,
        ship_id: formData.ship_id || undefined,
        evaluator_name: formData.evaluator_name || undefined,
        evaluator_rank: formData.evaluator_rank || undefined,
        ...scoreFields,
        overall_rating: calcOverall() || undefined,
        strengths: formData.strengths || undefined,
        areas_for_improvement: formData.areas_for_improvement || undefined,
        recommendation: (formData.recommendation || undefined) as CrewEvaluationWithDetails['recommendation'],
        comments: formData.comments || undefined,
        status: 'submitted' as const,
      };

      if (record) {
        await updateEvaluation(record.id, data);
        toast({ title: '수정 완료', description: '평가가 수정되었습니다.' });
      } else {
        await addEvaluation(data);
        toast({ title: '등록 완료', description: '평가가 등록되었습니다.' });
      }
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast({ title: '저장 실패', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{record ? '선원 평가 수정' : '선원 평가 작성'}</DialogTitle>
          <DialogDescription className="text-xs">선원의 근무 평가를 {record ? '수정' : '작성'}합니다</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-3 py-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">선원 *</Label>
                <Select value={formData.crew_member_id} onValueChange={v => setFormData({ ...formData, crew_member_id: v })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="선원 선택" /></SelectTrigger>
                  <SelectContent>{crewOptions.map(c => <SelectItem key={c.id} value={c.id} className="text-sm">{c.name} ({c.rank})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">선박</Label>
                <Select value={formData.ship_id} onValueChange={v => setFormData({ ...formData, ship_id: v })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="선박 선택" /></SelectTrigger>
                  <SelectContent>{shipOptions.map(s => <SelectItem key={s.id} value={s.id} className="text-sm">{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">평가 기간 시작 *</Label>
                <Input type="date" value={formData.evaluation_period_start} onChange={e => setFormData({ ...formData, evaluation_period_start: e.target.value })} required className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">평가 기간 종료 *</Label>
                <Input type="date" value={formData.evaluation_period_end} onChange={e => setFormData({ ...formData, evaluation_period_end: e.target.value })} required className="h-9 text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">평가자 이름</Label>
                <Input value={formData.evaluator_name} onChange={e => setFormData({ ...formData, evaluator_name: e.target.value })} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">평가자 직급</Label>
                <Input value={formData.evaluator_rank} onChange={e => setFormData({ ...formData, evaluator_rank: e.target.value })} className="h-9 text-sm" />
              </div>
            </div>

            <div className="border-t pt-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-600">평가 항목 (1~5점)</p>
                <p className="text-xs text-blue-600 font-semibold">평균: {calcOverall() || '-'}점</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIES.map(cat => (
                  <div key={cat.key} className="flex items-center gap-2">
                    <span className="text-xs w-20">{cat.label}</span>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map(n => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setScore(cat.key, n)}
                          className={`w-7 h-7 rounded text-xs font-medium transition-colors ${
                            (formData.scores[cat.key] || 0) >= n
                              ? 'bg-blue-500 text-white'
                              : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">추천</Label>
              <Select value={formData.recommendation} onValueChange={v => setFormData({ ...formData, recommendation: v })}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="추천 선택" /></SelectTrigger>
                <SelectContent>{RECOMMENDATIONS.map(r => <SelectItem key={r.value} value={r.value} className="text-sm">{r.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">강점</Label>
              <Textarea value={formData.strengths} onChange={e => setFormData({ ...formData, strengths: e.target.value })} rows={2} className="text-sm resize-none" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">개선 필요 사항</Label>
              <Textarea value={formData.areas_for_improvement} onChange={e => setFormData({ ...formData, areas_for_improvement: e.target.value })} rows={2} className="text-sm resize-none" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">총평</Label>
              <Textarea value={formData.comments} onChange={e => setFormData({ ...formData, comments: e.target.value })} rows={2} className="text-sm resize-none" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" size="sm" variant="outline" onClick={() => onOpenChange(false)} disabled={loading} className="h-8">취소</Button>
            <Button type="submit" size="sm" className="h-8" disabled={loading}>{loading ? '저장 중...' : (record ? '수정' : '등록')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
