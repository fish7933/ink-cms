import { useState, useEffect, useCallback } from 'react';
import { Plus, Star, Trash2, Edit2, ArrowLeft, Save, Upload, X, Download } from 'lucide-react';
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
import type { CrewEvaluationWithDetails, EvaluationAttachment } from '@/types/evaluation';
import type { SeaServiceRecord } from '@/types/crew-extended';
import type { Rank } from '@/types/models';
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
  const [officerRanks, setOfficerRanks] = useState<Rank[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formView, setFormView] = useState<{ record?: CrewEvaluationWithDetails } | null>(null);
  const [form, setForm] = useState({ evaluator_name: '', evaluator_rank: '', scores: {} as Record<string, number>, overallOverride: '', strengths: '', areas_for_improvement: '', recommendation: '', comments: '' });
  const [attachments, setAttachments] = useState<EvaluationAttachment[]>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  const loadData = useCallback(async () => {
    if (!record) return;
    setLoading(true);
    try { setEvaluations(await getEvaluationsBySeaServiceRecord(record.id)); }
    finally { setLoading(false); }
  }, [record]);

  useEffect(() => { if (open) { loadData(); setFormView(null); } }, [open, loadData]);
  useEffect(() => {
    if (!open) return;
    supabase.from('ranks').select('*').eq('rank_category', 'officer').order('display_order')
      .then(({ data }) => setOfficerRanks(data || []));
  }, [open]);

  const openForm = (evalRecord?: CrewEvaluationWithDetails) => {
    if (evalRecord) {
      const scores: Record<string, number> = {};
      CATEGORIES.forEach(c => { const v = evalRecord[c.key as keyof typeof evalRecord] as number | undefined; if (v) scores[c.key] = v; });
      setForm({ evaluator_name: evalRecord.evaluator_name || '', evaluator_rank: evalRecord.evaluator_rank || '', scores, overallOverride: evalRecord.overall_rating != null ? String(evalRecord.overall_rating) : '', strengths: evalRecord.strengths || '', areas_for_improvement: evalRecord.areas_for_improvement || '', recommendation: evalRecord.recommendation || '', comments: evalRecord.comments || '' });
      setAttachments(evalRecord.attachments || []);
    } else {
      setForm({ evaluator_name: '', evaluator_rank: '', scores: {}, overallOverride: '', strengths: '', areas_for_improvement: '', recommendation: '', comments: '' });
      setAttachments([]);
    }
    setNewFiles([]);
    setFormView({ record: evalRecord });
  };
  const closeForm = () => { setFormView(null); loadData(); onChanged?.(); };

  const calcOverall = () => { const vals = Object.values(form.scores); return vals.length ? parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)) : 0; };
  const getOverallRating = () => form.overallOverride.trim() !== '' ? parseFloat(form.overallOverride) : (calcOverall() || undefined);

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

  const uploadNewFiles = async (files: File[]): Promise<EvaluationAttachment[]> => {
    const uploaded: EvaluationAttachment[] = [];
    for (const file of files) {
      const ext = file.name.split('.').pop();
      const path = `evaluations/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
      const { error } = await supabase.storage.from('documents').upload(path, file);
      if (error) throw new Error(`${file.name} 업로드 실패`);
      uploaded.push({ name: file.name, path, size: file.size, type: file.type });
    }
    return uploaded;
  };

  const handleSave = async () => {
    if (!record) return;
    try {
      setSaving(true);
      setUploading(true);
      const uploadedFiles = await uploadNewFiles(newFiles);
      setUploading(false);
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
        overall_rating: getOverallRating(),
        strengths: form.strengths || undefined,
        areas_for_improvement: form.areas_for_improvement || undefined,
        recommendation: (form.recommendation || undefined) as CrewEvaluationWithDetails['recommendation'],
        comments: form.comments || undefined,
        attachments: [...attachments, ...uploadedFiles],
        status: 'submitted' as const,
      };
      if (formView?.record) { await updateEvaluation(formView.record.id, data); toast({ title: '수정 완료' }); }
      else { await addEvaluation(data); toast({ title: '등록 완료' }); }
      closeForm();
    } catch (e) { toast({ title: '저장 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }); } finally { setSaving(false); setUploading(false); }
  };

  const getAttachmentUrl = (path: string) => supabase.storage.from('documents').getPublicUrl(path).data.publicUrl;

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
            <div className="space-y-1.5">
              <Label className="text-xs">평가자 직급/성명</Label>
              <div className="grid grid-cols-2 gap-2">
                <Select value={form.evaluator_rank || '_none'} onValueChange={v => setForm({ ...form, evaluator_rank: v === '_none' ? '' : v })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="직급 선택" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">선택 안함</SelectItem>
                    {officerRanks.map(r => <SelectItem key={r.id} value={r.rank_code}>{r.rank_code} · {r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input value={form.evaluator_name} onChange={e => setForm({ ...form, evaluator_name: e.target.value })} placeholder="성명" className="h-9 text-sm" />
              </div>
            </div>
            <div className="border-t pt-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-600">평가 항목 (1~5점)</p>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-gray-500 whitespace-nowrap">종합점수 직접입력</Label>
                  <Input type="number" step="0.1" min="0" max="5" value={form.overallOverride} onChange={e => setForm({ ...form, overallOverride: e.target.value })} placeholder={String(calcOverall() || '-')} className="h-7 w-16 text-xs" />
                </div>
              </div>
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
            <div className="space-y-1.5 border-t pt-3">
              <Label className="text-xs">고과표 첨부 <span className="text-gray-400 font-normal">(여러 장 업로드 가능)</span></Label>
              <div className="border-2 border-dashed rounded-md p-3 text-center">
                <input type="file" id="eval-file-upload" multiple onChange={handleFileChange} className="hidden" disabled={saving} />
                <label htmlFor="eval-file-upload" className={`cursor-pointer flex flex-col items-center gap-1.5 ${saving ? 'opacity-50 pointer-events-none' : ''}`}>
                  <Upload className="w-6 h-6 text-gray-400" />
                  <div className="text-xs text-gray-600"><span className="text-blue-600 font-medium">파일 선택</span> 또는 드래그 앤 드롭 (최대 10MB)</div>
                </label>
              </div>
              {(attachments.length > 0 || newFiles.length > 0) && (
                <div className="space-y-1.5">
                  {attachments.map((a, idx) => (
                    <div key={`existing-${idx}`} className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-xs truncate">{a.name}</span>
                        <span className="text-xs text-gray-500 shrink-0">({(a.size / 1024).toFixed(1)} KB)</span>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => window.open(getAttachmentUrl(a.path), '_blank')}><Download className="h-3.5 w-3.5" /></Button>
                        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => removeExistingAttachment(idx)} disabled={saving}><X className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  ))}
                  {newFiles.map((f, idx) => (
                    <div key={`new-${idx}`} className="flex items-center justify-between p-2 bg-blue-50 rounded-md">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-xs truncate">{f.name}</span>
                        <span className="text-xs text-gray-500 shrink-0">({(f.size / 1024).toFixed(1)} KB)</span>
                      </div>
                      <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={() => removeNewFile(idx)} disabled={saving}><X className="h-3.5 w-3.5" /></Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" className="h-8" onClick={() => setFormView(null)} disabled={saving}>취소</Button>
              <Button size="sm" className="h-8 gap-1.5" onClick={handleSave} disabled={saving}><Save className="w-3.5 h-3.5" />{uploading ? '업로드 중...' : saving ? '저장 중...' : '저장'}</Button>
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
                      <p className="text-xs text-gray-500 mt-1">
                        평가자: {e.evaluator_rank ? `${e.evaluator_rank} ` : ''}{e.evaluator_name || '-'}
                        {e.attachments && e.attachments.length > 0 && <span className="ml-2 text-blue-500">첨부 {e.attachments.length}건</span>}
                      </p>
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
