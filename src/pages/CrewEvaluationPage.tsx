import { useState, useEffect } from 'react';
import { Plus, Search, Star, Trash2, Edit2, ArrowLeft, Save } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getEvaluations, addEvaluation, updateEvaluation, deleteEvaluation } from '@/services/evaluation.service';
import type { CrewEvaluationWithDetails } from '@/types/evaluation';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

const CATEGORIES = [
  { key: 'professional_knowledge', label: '전문 지식' }, { key: 'work_performance', label: '업무 수행력' },
  { key: 'safety_awareness', label: '안전 의식' }, { key: 'teamwork', label: '팀워크' },
  { key: 'leadership', label: '리더십' }, { key: 'communication', label: '의사소통' },
  { key: 'discipline', label: '규율 준수' }, { key: 'reliability', label: '신뢰성' },
];
const RECOMMENDATIONS = [{ value: 'highly_recommend', label: '강력 추천' }, { value: 'recommend', label: '추천' }, { value: 'neutral', label: '보통' }, { value: 'not_recommend', label: '비추천' }];
const REC_LABELS: Record<string, { label: string; color: string }> = { highly_recommend: { label: '강력 추천', color: 'bg-green-100 text-green-700' }, recommend: { label: '추천', color: 'bg-blue-100 text-blue-700' }, neutral: { label: '보통', color: 'bg-gray-100 text-gray-700' }, not_recommend: { label: '비추천', color: 'bg-red-100 text-red-700' } };

interface CrewOption { id: string; name: string; rank: string; }
interface ShipOption { id: string; name: string; }

export default function CrewEvaluationPage() {
  const { toast } = useToast();
  const [evaluations, setEvaluations] = useState<CrewEvaluationWithDetails[]>([]);
  const [crewOptions, setCrewOptions] = useState<CrewOption[]>([]);
  const [shipOptions, setShipOptions] = useState<ShipOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [formView, setFormView] = useState<{ record?: CrewEvaluationWithDetails } | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ crew_member_id: '', ship_id: '', evaluation_period_start: '', evaluation_period_end: '', evaluator_name: '', evaluator_rank: '', scores: {} as Record<string, number>, strengths: '', areas_for_improvement: '', recommendation: '', comments: '' });

  useEffect(() => {
    loadData();
    supabase.from('crew_members').select('id, name, rank').then(({ data }) => { if (data) setCrewOptions(data.map(c => ({ id: c.id, name: c.name || '', rank: c.rank || '' }))); });
    supabase.from('ships').select('id, name').then(({ data }) => { if (data) setShipOptions(data); });
  }, []);

  const loadData = async () => { try { setLoading(true); setEvaluations(await getEvaluations()); } catch (e) { console.error(e); } finally { setLoading(false); } };

  const openForm = (record?: CrewEvaluationWithDetails) => {
    if (record) {
      const scores: Record<string, number> = {};
      CATEGORIES.forEach(c => { const v = record[c.key as keyof typeof record] as number | undefined; if (v) scores[c.key] = v; });
      setForm({ crew_member_id: record.crew_member_id, ship_id: record.ship_id || '', evaluation_period_start: record.evaluation_period_start, evaluation_period_end: record.evaluation_period_end, evaluator_name: record.evaluator_name || '', evaluator_rank: record.evaluator_rank || '', scores, strengths: record.strengths || '', areas_for_improvement: record.areas_for_improvement || '', recommendation: record.recommendation || '', comments: record.comments || '' });
    } else {
      setForm({ crew_member_id: '', ship_id: '', evaluation_period_start: '', evaluation_period_end: '', evaluator_name: '', evaluator_rank: '', scores: {}, strengths: '', areas_for_improvement: '', recommendation: '', comments: '' });
    }
    setFormView({ record });
  };
  const closeForm = () => { setFormView(null); loadData(); };

  const calcOverall = () => { const vals = Object.values(form.scores); return vals.length ? parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)) : 0; };

  const handleSave = async () => {
    if (!form.crew_member_id || !form.evaluation_period_start || !form.evaluation_period_end) { toast({ title: '필수 항목을 입력하세요', variant: 'destructive' }); return; }
    try {
      setSaving(true);
      const scoreFields: Record<string, number | undefined> = {};
      CATEGORIES.forEach(c => { scoreFields[c.key] = form.scores[c.key] || undefined; });
      const data = { crew_member_id: form.crew_member_id, evaluation_period_start: form.evaluation_period_start, evaluation_period_end: form.evaluation_period_end, ship_id: form.ship_id || undefined, evaluator_name: form.evaluator_name || undefined, evaluator_rank: form.evaluator_rank || undefined, ...scoreFields, overall_rating: calcOverall() || undefined, strengths: form.strengths || undefined, areas_for_improvement: form.areas_for_improvement || undefined, recommendation: (form.recommendation || undefined) as CrewEvaluationWithDetails['recommendation'], comments: form.comments || undefined, status: 'submitted' as const };
      if (formView?.record) { await updateEvaluation(formView.record.id, data); toast({ title: '수정 완료' }); }
      else { await addEvaluation(data); toast({ title: '등록 완료' }); }
      closeForm();
    } catch { toast({ title: '저장 실패', variant: 'destructive' }); } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => { if (!confirm('삭제하시겠습니까?')) return; try { await deleteEvaluation(id); toast({ title: '삭제 완료' }); loadData(); } catch { toast({ title: '실패', variant: 'destructive' }); } };

  const filtered = evaluations.filter(e => { if (!searchTerm) return true; const t = searchTerm.toLowerCase(); return e.crew_name.toLowerCase().includes(t) || e.rank_name.toLowerCase().includes(t); });

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>;

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              {formView !== null && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={closeForm}><ArrowLeft className="w-4 h-4" /></Button>}
              <div>
                <CardTitle className="text-base">{formView !== null ? (formView.record ? '평가 수정' : '평가 작성') : '선원 평가'}</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">{formView !== null ? '선원 근무 평가를 작성합니다' : '선원 근무 평가를 관리합니다'}</p>
              </div>
            </div>
            {formView !== null ? (
              <Button size="sm" className="gap-1.5 h-8" onClick={handleSave} disabled={saving}><Save className="w-4 h-4" />{saving ? '저장 중...' : '저장'}</Button>
            ) : (
              <Button size="sm" className="gap-1.5 h-8" onClick={() => openForm()}><Plus className="w-4 h-4" />평가 작성</Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {formView !== null ? (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label className="text-xs">선원 *</Label><Select value={form.crew_member_id} onValueChange={v => setForm({ ...form, crew_member_id: v })}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="선원 선택" /></SelectTrigger><SelectContent>{crewOptions.map(c => <SelectItem key={c.id} value={c.id}>{c.name} ({c.rank})</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1.5"><Label className="text-xs">선박</Label><Select value={form.ship_id} onValueChange={v => setForm({ ...form, ship_id: v })}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="선박 선택" /></SelectTrigger><SelectContent>{shipOptions.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label className="text-xs">평가 기간 시작 *</Label><Input type="date" value={form.evaluation_period_start} onChange={e => setForm({ ...form, evaluation_period_start: e.target.value })} className="h-9 text-sm" /></div>
                <div className="space-y-1.5"><Label className="text-xs">평가 기간 종료 *</Label><Input type="date" value={form.evaluation_period_end} onChange={e => setForm({ ...form, evaluation_period_end: e.target.value })} className="h-9 text-sm" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label className="text-xs">평가자 이름</Label><Input value={form.evaluator_name} onChange={e => setForm({ ...form, evaluator_name: e.target.value })} className="h-9 text-sm" /></div>
                <div className="space-y-1.5"><Label className="text-xs">평가자 직급</Label><Input value={form.evaluator_rank} onChange={e => setForm({ ...form, evaluator_rank: e.target.value })} className="h-9 text-sm" /></div>
              </div>
              <div className="border-t pt-3">
                <div className="flex items-center justify-between mb-2"><p className="text-xs font-semibold text-gray-600">평가 항목 (1~5점)</p><p className="text-xs text-blue-600 font-semibold">평균: {calcOverall() || '-'}점</p></div>
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORIES.map(cat => (
                    <div key={cat.key} className="flex items-center gap-2">
                      <span className="text-xs w-20">{cat.label}</span>
                      <div className="flex gap-1">{[1,2,3,4,5].map(n => (
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
            </div>
          ) : (
            <>
              <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" /><Input placeholder="선원명, 직급으로 검색..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 h-9 text-sm" /></div>
              <table className="w-full text-xs">
                <thead><tr className="border-b bg-gray-50">
                  <th className="text-left p-2">선원명</th><th className="text-left p-2">직급</th><th className="text-left p-2">선박</th><th className="text-left p-2">평가 기간</th><th className="text-center p-2">평균점수</th><th className="text-center p-2">추천</th><th className="text-center p-2">작업</th>
                </tr></thead>
                <tbody>
                  {filtered.length === 0 ? <tr><td colSpan={7} className="text-center py-8 text-gray-400">데이터가 없습니다.</td></tr> : filtered.map(e => (
                    <tr key={e.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => openForm(e)}>
                      <td className="p-2 font-medium">{e.crew_name}</td><td className="p-2">{e.rank_code || e.rank_name}</td><td className="p-2">{e.ship_name || '-'}</td>
                      <td className="p-2">{e.evaluation_period_start} ~ {e.evaluation_period_end}</td>
                      <td className="p-2 text-center">{e.overall_rating ? <span className="inline-flex items-center gap-0.5 font-semibold"><Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />{e.overall_rating}</span> : '-'}</td>
                      <td className="p-2 text-center">{e.recommendation ? <Badge className={`text-xs ${REC_LABELS[e.recommendation]?.color}`}>{REC_LABELS[e.recommendation]?.label}</Badge> : '-'}</td>
                      <td className="p-2 text-center" onClick={ev => ev.stopPropagation()}><Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={() => handleDelete(e.id)}><Trash2 className="h-3 w-3" /></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-gray-400 text-right">총 {filtered.length}건</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
