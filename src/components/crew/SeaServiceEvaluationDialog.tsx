import { useState, useEffect, useCallback } from 'react';
import { Plus, Star, Trash2, Edit2, ArrowLeft, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  getEvaluationsBySeaServiceRecord, addEvaluation, updateEvaluation, deleteEvaluation,
} from '@/services/evaluation.service';
import type { CrewEvaluationWithDetails } from '@/types/evaluation';
import type { SeaServiceRecord } from '@/types/crew-extended';
import { useToast } from '@/hooks/use-toast';

const CATEGORIES = [
  { key: 'professional_knowledge', label: '전문 지식' }, { key: 'work_performance', label: '업무 수행력' },
  { key: 'safety_awareness', label: '안전 의식' }, { key: 'teamwork', label: '팀워크' },
  { key: 'leadership', label: '리더십' }, { key: 'communication', label: '의사소통' },
  { key: 'discipline', label: '규율 준수' }, { key: 'reliability', label: '신뢰성' },
];
const RECOMMENDATIONS = [{ value: 'highly_recommend', label: '강력 추천' }, { value: 'recommend', label: '추천' }, { value: 'neutral', label: '보통' }, { value: 'not_recommend', label: '비추천' }];
const REC_LABELS: Record<string, { label: string; color: string }> = { highly_recommend: { label: '강력 추천', color: 'bg-green-100 text-green-700' }, recommend: { label: '추천', color: 'bg-blue-100 text-blue-700' }, neutral: { label: '보통', color: 'bg-gray-100 text-gray-700' }, not_recommend: { label: '비추천', color: 'bg-red-100 text-red-700' } };

interface SeaServiceEvaluationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  crewId: string;
  record: SeaServiceRecord | null;
  onChanged?: () => void;
}

export default function SeaServiceEvaluationDialog({ open, onOpenChange, crewId, record, onChanged }: SeaServiceEvaluationDialogProps) {
  const { toast } = useToast();
  const [evaluations, setEvaluations] = useState<CrewEvaluationWithDetails[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formView, setFormView] = useState<{ record?: CrewEvaluationWithDetails } | null>(null);
  const [form, setForm] = useState({ evaluator_name: '', evaluator_rank: '', scores: {} as Record<string, number>, strengths: '', areas_for_improvement: '', recommendation: '', comments: '' });

  const loadData = useCallback(async () => {
    if (!record) return;
    setLoading(true);
    try { setEvaluations(await getEvaluationsBySeaServiceRecord(record.id)); }
    finally { setLoading(false); }
  }, [record]);

  useEffect(() => { if (open) { loadData(); setFormView(null); } }, [open, loadData]);

  const openForm = (evalRecord?: CrewEvaluationWithDetails) => {
    if (evalRecord) {
      const scores: Record<string, number> = {};
      CATEGORIES.forEach(c => { const v = evalRecord[c.key as keyof typeof evalRecord] as number | undefined; if (v) scores[c.key] = v; });
      setForm({ evaluator_name: evalRecord.evaluator_name || '', evaluator_rank: evalRecord.evaluator_rank || '', scores, strengths: evalRecord.strengths || '', areas_for_improvement: evalRecord.areas_for_improvement || '', recommendation: evalRecord.recommendation || '', comments: evalRecord.comments || '' });
    } else {
      setForm({ evaluator_name: '', evaluator_rank: '', scores: {}, strengths: '', areas_for_improvement: '', recommendation: '', comments: '' });
    }
    setFormView({ record: evalRecord });
  };
  const closeForm = () => { setFormView(null); loadData(); onChanged?.(); };

  const calcOverall = () => { const vals = Object.values(form.scores); return vals.length ? parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)) : 0; };

  const handleSave = async () => {
    if (!record) return;
    try {
      setSaving(true);
      const scoreFields: Record<string, number | undefined> = {};
      CATEGORIES.forEach(c => { scoreFields[c.key] = form.scores[c.key] || undefined; });
      const data = {
        crew_member_id: crewId,
        sea_service_record_id: record.id,
        ship_id: undefined,
        evaluation_period_start: record.sign_on_date,
        evaluation_period_end: record.sign_off_date || record.sign_on_date,
        evaluator_name: form.evaluator_name || undefined,
        evaluator_rank: form.evaluator_rank || undefined,
        ...scoreFields,
        overall_rating: calcOverall() || undefined,
        strengths: form.strengths || undefined,
        areas_for_improvement: form.areas_for_improvement || undefined,
        recommendation: (form.recommendation || undefined) as CrewEvaluationWithDetails['recommendation'],
        comments: form.comments || undefined,
        status: 'submitted' as const,
      };
      if (formView?.record) { await updateEvaluation(formView.record.id, data); toast({ title: '수정 완료' }); }
      else { await addEvaluation(data); toast({ title: '등록 완료' }); }
      closeForm();
    } catch { toast({ title: '저장 실패', variant: 'destructive' }); } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return;
    try { await deleteEvaluation(id); toast({ title: '삭제 완료' }); loadData(); onChanged?.(); }
    catch { toast({ title: '실패', variant: 'destructive' }); }
  };

  if (!record) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {formView !== null && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setFormView(null)}><ArrowLeft className="w-4 h-4" /></Button>}
            <div>
              <DialogTitle className="text-base">{formView !== null ? (formView.record ? '고과 수정' : '고과 작성') : '승선 고과'}</DialogTitle>
              <DialogDescription className="text-xs">
                {record.ship_name} · {record.sign_on_date} ~ {record.sign_off_date || '진행중'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {formView !== null ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">평가자 이름</Label><Input value={form.evaluator_name} onChange={e => setForm({ ...form, evaluator_name: e.target.value })} className="h-9 text-sm" /></div>
              <div className="space-y-1.5"><Label className="text-xs">평가자 직급</Label><Input value={form.evaluator_rank} onChange={e => setForm({ ...form, evaluator_rank: e.target.value })} className="h-9 text-sm" /></div>
            </div>
            <div className="border-t pt-3">
              <div className="flex items-center justify-between mb-2"><p className="text-xs font-semibold text-gray-600">평가 항목 (1~5점)</p><p className="text-xs text-blue-600 font-semibold">평균: {calcOverall() || '-'}점</p></div>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIES.map(cat => (
                  <div key={cat.key} className="flex items-center gap-2">
                    <span className="text-xs w-20">{cat.label}</span>
                    <div className="flex gap-1">{[1, 2, 3, 4, 5].map(n => (
                      <button key={n} type="button" onClick={() => setForm(prev => ({ ...prev, scores: { ...prev.scores, [cat.key]: n } }))} className={`w-7 h-7 rounded text-xs font-medium transition-colors ${(form.scores[cat.key] || 0) >= n ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}>{n}</button>
                    ))}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">추천</Label><Select value={form.recommendation} onValueChange={v => setForm({ ...form, recommendation: v })}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="선택" /></SelectTrigger><SelectContent>{RECOMMENDATIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label className="text-xs">강점</Label><Textarea value={form.strengths} onChange={e => setForm({ ...form, strengths: e.target.value })} rows={2} className="text-sm resize-none" /></div>
            <div className="space-y-1.5"><Label className="text-xs">개선 필요 사항</Label><Textarea value={form.areas_for_improvement} onChange={e => setForm({ ...form, areas_for_improvement: e.target.value })} rows={2} className="text-sm resize-none" /></div>
            <div className="space-y-1.5"><Label className="text-xs">총평</Label><Textarea value={form.comments} onChange={e => setForm({ ...form, comments: e.target.value })} rows={2} className="text-sm resize-none" /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" className="h-8" onClick={() => setFormView(null)} disabled={saving}>취소</Button>
              <Button size="sm" className="h-8 gap-1.5" onClick={handleSave} disabled={saving}><Save className="w-3.5 h-3.5" />{saving ? '저장 중...' : '저장'}</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" className="h-8 gap-1.5" onClick={() => openForm()}><Plus className="w-3.5 h-3.5" />고과 작성</Button>
            </div>
            {loading ? (
              <div className="text-center py-6 text-sm text-gray-400">로딩 중...</div>
            ) : evaluations.length === 0 ? (
              <div className="text-center py-6 text-sm text-gray-400 border-2 border-dashed rounded-md">이 승선 기간에 작성된 고과가 없습니다.</div>
            ) : (
              <div className="space-y-2">
                {evaluations.map(e => (
                  <div key={e.id} className="border rounded-md p-3 flex items-center justify-between cursor-pointer hover:bg-gray-50" onClick={() => openForm(e)}>
                    <div>
                      <div className="flex items-center gap-2">
                        {e.overall_rating ? <span className="inline-flex items-center gap-0.5 font-semibold text-sm"><Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />{e.overall_rating}</span> : <span className="text-sm text-gray-400">점수 없음</span>}
                        {e.recommendation && <Badge className={`text-xs ${REC_LABELS[e.recommendation]?.color}`}>{REC_LABELS[e.recommendation]?.label}</Badge>}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">평가자: {e.evaluator_name || '-'} {e.evaluator_rank ? `(${e.evaluator_rank})` : ''}</p>
                    </div>
                    <div className="flex gap-1" onClick={ev => ev.stopPropagation()}>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openForm(e)}><Edit2 className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => handleDelete(e.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
