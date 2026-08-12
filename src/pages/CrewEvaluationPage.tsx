import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Star, Trash2, Edit2, ArrowLeft, Save, Upload, X, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { getEvaluations, addEvaluation, updateEvaluation, deleteEvaluation } from '@/services/evaluation.service';
import type { CrewEvaluationWithDetails, EvaluationAttachment } from '@/types/evaluation';
import type { Rank } from '@/types/models';
import { supabase } from '@/lib/supabase';
import { getFileUrl } from '@/lib/upload';
import { sortRanksByDisplayOrder } from '@/lib/rank-order';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';

const CATEGORIES = [
  { key: 'professional_knowledge', label: '전문 지식' }, { key: 'work_performance', label: '업무 수행력' },
  { key: 'safety_awareness', label: '안전 의식' }, { key: 'teamwork', label: '팀워크' },
  { key: 'leadership', label: '리더십' }, { key: 'communication', label: '의사소통' },
  { key: 'discipline', label: '규율 준수' }, { key: 'reliability', label: '신뢰성' },
];
const RECOMMENDATIONS = [{ value: 'highly_recommend', label: '강력 추천' }, { value: 'recommend', label: '추천' }, { value: 'neutral', label: '보통' }, { value: 'not_recommend', label: '비추천' }];
const REC_LABELS: Record<string, { label: string; color: string }> = { highly_recommend: { label: '강력 추천', color: 'bg-green-100 text-green-700' }, recommend: { label: '추천', color: 'bg-blue-100 text-blue-700' }, neutral: { label: '보통', color: 'bg-gray-100 text-gray-700' }, not_recommend: { label: '비추천', color: 'bg-red-100 text-red-700' } };

interface CrewOption { id: string; name: string; rank: string; }
interface ShipOption { id: string; name: string; owner_id: string | null; fleet_id: string | null; }

export default function CrewEvaluationPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const permissions = usePermissions('crew_evaluations');
  const [evaluations, setEvaluations] = useState<CrewEvaluationWithDetails[]>([]);
  const [crewOptions, setCrewOptions] = useState<CrewOption[]>([]);
  const [shipOptions, setShipOptions] = useState<ShipOption[]>([]);
  const [companyNameById, setCompanyNameById] = useState<Map<string, string>>(new Map());
  const [fleetNameById, setFleetNameById] = useState<Map<string, string>>(new Map());
  const [officerRanks, setOfficerRanks] = useState<Rank[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [formView, setFormView] = useState<{ record?: CrewEvaluationWithDetails } | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ crew_member_id: '', ship_id: '', evaluation_period_start: '', evaluation_period_end: '', evaluator_name: '', evaluator_rank: '', scores: {} as Record<string, number>, overallOverride: '', strengths: '', areas_for_improvement: '', recommendation: '', comments: '' });
  const [attachments, setAttachments] = useState<EvaluationAttachment[]>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [filterOwner, setFilterOwner] = useState('all');
  const [filterFleet, setFilterFleet] = useState('all');
  const [filterShip, setFilterShip] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  useEffect(() => {
    loadData();
    supabase.from('crew_members').select('id, name, rank').then(({ data }) => { if (data) setCrewOptions(data.map(c => ({ id: c.id, name: c.name || '', rank: c.rank || '' }))); });
    supabase.from('ships').select('id, name, owner_id, fleet_id').then(({ data }) => { if (data) setShipOptions(data); });
    supabase.from('companies').select('id, name').then(({ data }) => { if (data) setCompanyNameById(new Map(data.map(c => [c.id, c.name]))); });
    supabase.from('fleets').select('id, name').then(({ data }) => { if (data) setFleetNameById(new Map(data.map(f => [f.id, f.name]))); });
    supabase.from('ranks').select('*').eq('rank_category', 'officer').then(({ data }) => setOfficerRanks(sortRanksByDisplayOrder(data || [])));
  }, []);

  // 선주>플릿>선박은 선박정보가 있는 한 항상 세트로 함께 다녀야 하는 정보이므로,
  // 선박을 고르면 선주/플릿은 그 선박에서 그대로 파생되어 보여지기만 하고 별도로 선택하지 않는다.
  const selectedShip = shipOptions.find(s => s.id === form.ship_id);
  const derivedOwnerName = selectedShip?.owner_id ? companyNameById.get(selectedShip.owner_id) : undefined;
  const derivedFleetName = selectedShip?.fleet_id ? fleetNameById.get(selectedShip.fleet_id) : undefined;

  const loadData = async () => { try { setLoading(true); setEvaluations(await getEvaluations()); } catch (e) { console.error(e); } finally { setLoading(false); } };

  // 메뉴 접속(canView) 권한이 명시적으로 꺼진 경우에도 접근 차단 — 로딩 중(loading)에는
  // 아직 기본값이라 판단하지 않고 기다린다(정상 권한 사용자가 잠깐 튕겨나가는 걸 방지).
  useEffect(() => {
    if (!permissions.loading && !permissions.canView) navigate('/dashboard');
  }, [permissions.loading, permissions.canView, navigate]);

  const openForm = (record?: CrewEvaluationWithDetails) => {
    if (record) {
      const scores: Record<string, number> = {};
      CATEGORIES.forEach(c => { const v = record[c.key as keyof typeof record] as number | undefined; if (v) scores[c.key] = v; });
      setForm({ crew_member_id: record.crew_member_id, ship_id: record.ship_id || '', evaluation_period_start: record.evaluation_period_start, evaluation_period_end: record.evaluation_period_end, evaluator_name: record.evaluator_name || '', evaluator_rank: record.evaluator_rank || '', scores, overallOverride: record.overall_rating != null ? String(record.overall_rating) : '', strengths: record.strengths || '', areas_for_improvement: record.areas_for_improvement || '', recommendation: record.recommendation || '', comments: record.comments || '' });
      setAttachments(record.attachments || []);
    } else {
      setForm({ crew_member_id: '', ship_id: '', evaluation_period_start: '', evaluation_period_end: '', evaluator_name: '', evaluator_rank: '', scores: {}, overallOverride: '', strengths: '', areas_for_improvement: '', recommendation: '', comments: '' });
      setAttachments([]);
    }
    setNewFiles([]);
    setFormView({ record });
  };
  const closeForm = () => { setFormView(null); loadData(); };

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
  const getAttachmentUrl = (path: string) => getFileUrl('documents', path);

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
    if (!form.crew_member_id || !form.evaluation_period_start || !form.evaluation_period_end) { toast({ title: '필수 항목을 입력하세요', variant: 'destructive' }); return; }
    try {
      setSaving(true);
      setUploading(true);
      const uploadedFiles = await uploadNewFiles(newFiles);
      setUploading(false);
      const scoreFields: Record<string, number | undefined> = {};
      CATEGORIES.forEach(c => { scoreFields[c.key] = form.scores[c.key] || undefined; });
      const data = { crew_member_id: form.crew_member_id, evaluation_period_start: form.evaluation_period_start, evaluation_period_end: form.evaluation_period_end, ship_id: form.ship_id || undefined, evaluator_name: form.evaluator_name || undefined, evaluator_rank: form.evaluator_rank || undefined, ...scoreFields, overall_rating: getOverallRating(), strengths: form.strengths || undefined, areas_for_improvement: form.areas_for_improvement || undefined, recommendation: (form.recommendation || undefined) as CrewEvaluationWithDetails['recommendation'], comments: form.comments || undefined, attachments: [...attachments, ...uploadedFiles], status: 'submitted' as const };
      if (formView?.record) { await updateEvaluation(formView.record.id, data); toast({ title: '수정 완료' }); }
      else { await addEvaluation(data); toast({ title: '등록 완료' }); }
      closeForm();
    } catch (e) { toast({ title: '저장 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }); } finally { setSaving(false); setUploading(false); }
  };

  const handleDelete = async (id: string) => { if (!confirm('삭제하시겠습니까?')) return; try { await deleteEvaluation(id); toast({ title: '삭제 완료' }); loadData(); } catch { toast({ title: '실패', variant: 'destructive' }); } };

  const confirmBulkDelete = async () => {
    try {
      await Promise.all(selectedIds.map(id => deleteEvaluation(id)));
      toast({ title: `${selectedIds.length}건 삭제 완료` });
      setSelectedIds([]);
      setShowDeleteDialog(false);
      loadData();
    } catch { toast({ title: '삭제 실패', variant: 'destructive' }); }
  };

  const toggleSelect = (id: string) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleSelectAll = (checked: boolean) => setSelectedIds(checked ? filtered.map(e => e.id) : []);

  // 검색: 선원명/직급/선주사/플릿/선박 대상
  const searched = useMemo(() => {
    if (!searchTerm) return evaluations;
    const t = searchTerm.toLowerCase();
    return evaluations.filter(e =>
      e.crew_name.toLowerCase().includes(t) ||
      e.rank_name.toLowerCase().includes(t) ||
      (e.rank_code || '').toLowerCase().includes(t) ||
      (e.owner_name || '').toLowerCase().includes(t) ||
      (e.fleet_name || '').toLowerCase().includes(t) ||
      (e.ship_name || '').toLowerCase().includes(t)
    );
  }, [evaluations, searchTerm]);

  // 선주/플릿/선박 필터 옵션 — 실제 데이터에 존재하는 값만, 선주를 고르면 플릿/선박이, 플릿을 고르면 선박이 좁혀진다.
  const ownerOptions = useMemo(() => [...new Set(evaluations.map(e => e.owner_name).filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, 'ko')), [evaluations]);
  const fleetOptions = useMemo(() => [...new Set(evaluations.filter(e => filterOwner === 'all' || e.owner_name === filterOwner).map(e => e.fleet_name).filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, 'ko')), [evaluations, filterOwner]);
  const shipOptions2 = useMemo(() => [...new Set(evaluations.filter(e => (filterOwner === 'all' || e.owner_name === filterOwner) && (filterFleet === 'all' || e.fleet_name === filterFleet)).map(e => e.ship_name).filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, 'ko')), [evaluations, filterOwner, filterFleet]);

  useEffect(() => { if (filterFleet !== 'all' && !fleetOptions.includes(filterFleet)) setFilterFleet('all'); }, [fleetOptions, filterFleet]);
  useEffect(() => { if (filterShip !== 'all' && !shipOptions2.includes(filterShip)) setFilterShip('all'); }, [shipOptions2, filterShip]);

  const filteredBySelectors = useMemo(() => searched.filter(e =>
    (filterOwner === 'all' || e.owner_name === filterOwner) &&
    (filterFleet === 'all' || e.fleet_name === filterFleet) &&
    (filterShip === 'all' || e.ship_name === filterShip)
  ), [searched, filterOwner, filterFleet, filterShip]);

  // 정렬: 선주사 > 플릿 > 선박 > 직급 > 이름
  const filtered = useMemo(() => {
    return [...filteredBySelectors].sort((a, b) =>
      (a.owner_name || '').localeCompare(b.owner_name || '', 'ko') ||
      (a.fleet_name || '').localeCompare(b.fleet_name || '', 'ko') ||
      (a.ship_name || '').localeCompare(b.ship_name || '', 'ko') ||
      (a.rank_code || a.rank_name).localeCompare(b.rank_code || b.rank_name, 'ko') ||
      a.crew_name.localeCompare(b.crew_name, 'ko')
    );
  }, [filteredBySelectors]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, filterOwner, filterFleet, filterShip]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const goToPage = (p: number) => setCurrentPage(Math.max(1, Math.min(p, totalPages)));

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>;

  return (
    <div className="max-w-[1600px] mx-auto px-3 sm:px-4 lg:px-6 py-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              {formView !== null && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={closeForm}><ArrowLeft className="w-4 h-4" /></Button>}
              <div>
                <CardTitle className="text-base">{formView !== null ? (formView.record ? '고과 수정' : '고과 작성') : '고과 관리'}</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">{formView !== null ? '선원 근무 고과를 작성합니다' : '선원 근무 고과를 관리합니다'}</p>
              </div>
            </div>
            {formView !== null ? (
              <Button size="sm" className="gap-1.5 h-8" onClick={handleSave} disabled={saving}><Save className="w-4 h-4" />{uploading ? '업로드 중...' : saving ? '저장 중...' : '저장'}</Button>
            ) : (
              <div className="flex gap-2">
                {selectedIds.length > 0 && permissions.canDelete && (
                  <Button size="sm" variant="destructive" className="gap-1.5 h-8" onClick={() => setShowDeleteDialog(true)}><Trash2 className="w-4 h-4" />선택 삭제 ({selectedIds.length})</Button>
                )}
                {permissions.canCreate && (
                  <Button size="sm" className="gap-1.5 h-8" onClick={() => openForm()}><Plus className="w-4 h-4" />평가 작성</Button>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {formView !== null ? (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label className="text-xs">선원 *</Label><Select value={form.crew_member_id} onValueChange={v => setForm({ ...form, crew_member_id: v })}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="선원 선택" /></SelectTrigger><SelectContent>{crewOptions.map(c => <SelectItem key={c.id} value={c.id}>{c.name} ({c.rank})</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1.5">
                  <Label className="text-xs">선박</Label>
                  <Select value={form.ship_id} onValueChange={v => setForm({ ...form, ship_id: v })}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="선박 선택" /></SelectTrigger><SelectContent>{shipOptions.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select>
                  {form.ship_id && (
                    <p className="text-[11px] text-gray-400">선주사: {derivedOwnerName || '-'} · 플릿: {derivedFleetName || '-'} <span className="text-gray-300">(선박 정보에서 자동으로 가져옴)</span></p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label className="text-xs">평가 기간 시작 *</Label><Input type="date" value={form.evaluation_period_start} onChange={e => setForm({ ...form, evaluation_period_start: e.target.value })} className="h-9 text-sm" /></div>
                <div className="space-y-1.5"><Label className="text-xs">평가 기간 종료 *</Label><Input type="date" value={form.evaluation_period_end} onChange={e => setForm({ ...form, evaluation_period_end: e.target.value })} className="h-9 text-sm" /></div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">평가자 직급/성명</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Select value={form.evaluator_rank || '_none'} onValueChange={v => setForm({ ...form, evaluator_rank: v === '_none' ? '' : v })}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="직급 선택" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">선택 안함</SelectItem>
                      {officerRanks.map(r => <SelectItem key={r.id} value={r.rank_code}>{r.rank_code}</SelectItem>)}
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
              <div className="space-y-1.5 border-t pt-3">
                <Label className="text-xs">고과표 첨부 <span className="text-gray-400 font-normal">(여러 장 업로드 가능)</span></Label>
                <div className="border-2 border-dashed rounded-md p-3 text-center">
                  <input type="file" id="eval-page-file-upload" multiple onChange={handleFileChange} className="hidden" disabled={saving} />
                  <label htmlFor="eval-page-file-upload" className={`cursor-pointer flex flex-col items-center gap-1.5 ${saving ? 'opacity-50 pointer-events-none' : ''}`}>
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
            </div>
          ) : (
            <>
              <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" /><Input placeholder="선원명, 직급, 선주사, 플릿, 선박으로 검색..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 h-9 text-sm" /></div>
              <div className="flex flex-wrap gap-2">
                <Select value={filterOwner} onValueChange={setFilterOwner}>
                  <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="선주사" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-sm">전체 선주사</SelectItem>
                    {ownerOptions.map(o => <SelectItem key={o} value={o} className="text-sm">{o}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterFleet} onValueChange={setFilterFleet}>
                  <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="플릿" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-sm">전체 플릿</SelectItem>
                    {fleetOptions.map(f => <SelectItem key={f} value={f} className="text-sm">{f}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterShip} onValueChange={setFilterShip}>
                  <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="선박" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-sm">전체 선박</SelectItem>
                    {shipOptions2.map(s => <SelectItem key={s} value={s} className="text-sm">{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-between items-center">
                <p className="text-xs text-gray-500">총 {filtered.length}건</p>
                <div className="flex items-center gap-2">
                  <Label className="text-xs">페이지당:</Label>
                  <Select value={itemsPerPage.toString()} onValueChange={v => { setItemsPerPage(+v); setCurrentPage(1); }}>
                    <SelectTrigger className="h-7 w-16 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{[10, 20, 50, 100].map(n => <SelectItem key={n} value={String(n)} className="text-sm">{n}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <table className="w-full text-xs">
                <thead><tr className="border-b bg-gray-50">
                  <th className="w-8 p-2"><Checkbox checked={filtered.length > 0 && filtered.every(e => selectedIds.includes(e.id))} onCheckedChange={checked => toggleSelectAll(!!checked)} /></th>
                  <th className="text-left p-2">선주사</th><th className="text-left p-2">플릿</th><th className="text-left p-2">선박</th><th className="text-left p-2">직급</th><th className="text-left p-2">선원명</th><th className="text-left p-2">평가 기간</th><th className="text-center p-2">평균점수</th><th className="text-center p-2">추천</th><th className="text-center p-2">작업</th>
                </tr></thead>
                <tbody>
                  {paginated.length === 0 ? <tr><td colSpan={10} className="text-center py-8 text-gray-400">데이터가 없습니다.</td></tr> : paginated.map(e => (
                    <tr key={e.id} className={`border-b hover:bg-gray-50 ${permissions.canEdit ? 'cursor-pointer' : ''}`} onClick={() => permissions.canEdit && openForm(e)}>
                      <td className="p-2" onClick={ev => ev.stopPropagation()}><Checkbox checked={selectedIds.includes(e.id)} onCheckedChange={() => toggleSelect(e.id)} /></td>
                      <td className="p-2 text-gray-600">{e.owner_name || '-'}</td>
                      <td className="p-2 text-gray-500">{e.fleet_name || '-'}</td>
                      <td className="p-2">{e.ship_name || '-'}</td>
                      <td className="p-2">{(e.rank_code || e.rank_name)}{e.rank_grade ? `(${e.rank_grade})` : ''}</td>
                      <td className="p-2 font-medium">{e.crew_name}</td>
                      <td className="p-2">{e.evaluation_period_start} ~ {e.evaluation_period_end}</td>
                      <td className="p-2 text-center">{e.overall_rating ? <span className="inline-flex items-center gap-0.5 font-semibold"><Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />{e.overall_rating}</span> : '-'}</td>
                      <td className="p-2 text-center">{e.recommendation ? <Badge className={`text-xs ${REC_LABELS[e.recommendation]?.color}`}>{REC_LABELS[e.recommendation]?.label}</Badge> : '-'}</td>
                      <td className="p-2 text-center" onClick={ev => ev.stopPropagation()}>
                        {permissions.canDelete && (
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={() => handleDelete(e.id)}><Trash2 className="h-3 w-3" /></Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {totalPages > 1 && (
                <div className="flex justify-center items-center gap-2 pt-3">
                  <Button variant="outline" size="sm" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1} className="h-8">
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const p = totalPages <= 5 ? i + 1
                      : currentPage <= 3 ? i + 1
                      : currentPage >= totalPages - 2 ? totalPages - 4 + i
                      : currentPage - 2 + i;
                    return (
                      <Button key={p} variant={currentPage === p ? 'default' : 'outline'} size="sm"
                        onClick={() => goToPage(p)} className="h-8 w-8 p-0">{p}</Button>
                    );
                  })}
                  <Button variant="outline" size="sm" onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages} className="h-8">
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>평가 삭제 확인</AlertDialogTitle>
            <AlertDialogDescription>선택한 {selectedIds.length}건의 평가를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBulkDelete} className="bg-red-600 hover:bg-red-700">삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
