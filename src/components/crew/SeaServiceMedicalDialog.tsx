import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Edit2, ArrowLeft, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  getMedicalRecordsBySeaServiceRecord, addMedicalRecord, updateMedicalRecord, deleteMedicalRecord,
} from '@/services/crew-extended.service';
import type { MedicalRecord } from '@/types/crew-extended';
import type { SeaServiceRecord } from '@/types/crew-extended';
import { useToast } from '@/hooks/use-toast';
import MedicalRecordFollowUp from '@/components/crew/MedicalRecordFollowUp';

const RECORD_TYPES = [{ value: 'injury', label: '부상' }, { value: 'illness', label: '질병' }];
const RECORD_TYPE_LABELS: Record<string, string> = { injury: '부상', illness: '질병' };
const FITNESS_OPTIONS = [
  { value: 'fit', label: '적합 (Fit)' }, { value: 'fit_with_restrictions', label: '조건부 적합' },
  { value: 'unfit', label: '부적합 (Unfit)' }, { value: 'pending', label: '대기 중' },
];
const FITNESS_LABELS: Record<string, { label: string; color: string }> = {
  fit: { label: '적합', color: 'bg-green-100 text-green-700' },
  fit_with_restrictions: { label: '조건부 적합', color: 'bg-yellow-100 text-yellow-700' },
  unfit: { label: '부적합', color: 'bg-red-100 text-red-700' },
  pending: { label: '대기 중', color: 'bg-gray-100 text-gray-700' },
};

interface SeaServiceMedicalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  crewId: string;
  record: SeaServiceRecord | null;
  onChanged?: () => void;
}

// 승선 기록(어느 배에 승선 중/승선했을 때)과 연결된 상병(부상/질병) 기록을 관리하는 다이얼로그.
// SeaServiceEvaluationDialog(고과)와 동일한 구조.
export default function SeaServiceMedicalDialog({ open, onOpenChange, crewId, record, onChanged }: SeaServiceMedicalDialogProps) {
  const { toast } = useToast();
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formView, setFormView] = useState<{ record?: MedicalRecord } | null>(null);
  const [form, setForm] = useState({
    record_date: '', record_type: 'injury', diagnosis: '', treatment: '', doctor_name: '', hospital_clinic: '',
    location: '', days_off_duty: '', fitness_status: '', follow_up_required: false, follow_up_date: '', notes: '',
  });

  const loadData = useCallback(async () => {
    if (!record) return;
    setLoading(true);
    try { setRecords(await getMedicalRecordsBySeaServiceRecord(record.id)); }
    finally { setLoading(false); }
  }, [record]);

  useEffect(() => { if (open) { loadData(); setFormView(null); } }, [open, loadData]);

  const openForm = (rec?: MedicalRecord) => {
    if (rec) {
      setForm({
        record_date: rec.record_date, record_type: rec.record_type, diagnosis: rec.diagnosis, treatment: rec.treatment || '',
        doctor_name: rec.doctor_name || '', hospital_clinic: rec.hospital_clinic || '', location: rec.location || '',
        days_off_duty: rec.days_off_duty?.toString() || '', fitness_status: rec.fitness_status || '',
        follow_up_required: rec.follow_up_required || false, follow_up_date: rec.follow_up_date || '', notes: rec.notes || '',
      });
    } else {
      setForm({
        record_date: new Date().toISOString().split('T')[0], record_type: 'injury', diagnosis: '', treatment: '',
        doctor_name: '', hospital_clinic: '', location: '', days_off_duty: '', fitness_status: '',
        follow_up_required: false, follow_up_date: '', notes: '',
      });
    }
    setFormView({ record: rec });
  };
  const closeForm = () => { setFormView(null); loadData(); onChanged?.(); };

  const handleSave = async () => {
    if (!record) return;
    if (!form.diagnosis.trim()) { toast({ title: '진단 내용을 입력하세요', variant: 'destructive' }); return; }
    try {
      setSaving(true);
      const data = {
        crew_member_id: crewId,
        sea_service_record_id: record.id,
        record_date: form.record_date,
        record_type: form.record_type as MedicalRecord['record_type'],
        diagnosis: form.diagnosis,
        treatment: form.treatment || undefined,
        doctor_name: form.doctor_name || undefined,
        hospital_clinic: form.hospital_clinic || undefined,
        location: form.location || undefined,
        ship_name: record.ship_name,
        days_off_duty: form.days_off_duty ? parseInt(form.days_off_duty) : undefined,
        fitness_status: (form.fitness_status || undefined) as MedicalRecord['fitness_status'],
        follow_up_required: form.follow_up_required || undefined,
        follow_up_date: form.follow_up_date || undefined,
        notes: form.notes || undefined,
      };
      if (formView?.record) {
        await updateMedicalRecord(formView.record.id, data);
        toast({ title: '수정 완료' });
        closeForm();
      } else {
        const created = await addMedicalRecord(data);
        toast({ title: '등록 완료', description: '이어서 치료 로그나 첨부파일을 등록할 수 있습니다.' });
        setFormView({ record: created });
        onChanged?.();
      }
    } catch (e) { toast({ title: '저장 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }); } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return;
    try { await deleteMedicalRecord(id); toast({ title: '삭제 완료' }); loadData(); onChanged?.(); }
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
              <DialogTitle className="text-base">{formView !== null ? (formView.record ? '상병 기록 수정' : '상병 기록 추가') : '승선 중 상병'}</DialogTitle>
              <DialogDescription className="text-xs">
                {record.ship_name} · {record.sign_on_date} ~ {record.sign_off_date || '진행중'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {formView !== null ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">발생일 *</Label>
                <Input type="date" value={form.record_date} onChange={e => setForm({ ...form, record_date: e.target.value })} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">유형 *</Label>
                <Select value={form.record_type} onValueChange={v => setForm({ ...form, record_type: v })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{RECORD_TYPES.map(t => <SelectItem key={t.value} value={t.value} className="text-sm">{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">진단 내용 *</Label>
              <Input value={form.diagnosis} onChange={e => setForm({ ...form, diagnosis: e.target.value })} placeholder="진단명 또는 내용" className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">치료 내용</Label>
              <Textarea value={form.treatment} onChange={e => setForm({ ...form, treatment: e.target.value })} rows={2} className="text-sm resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">담당 의사</Label>
                <Input value={form.doctor_name} onChange={e => setForm({ ...form, doctor_name: e.target.value })} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">병원/의원</Label>
                <Input value={form.hospital_clinic} onChange={e => setForm({ ...form, hospital_clinic: e.target.value })} className="h-9 text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">장소</Label>
                <Input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="도시/국가" className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">휴무 일수</Label>
                <Input type="number" min="0" value={form.days_off_duty} onChange={e => setForm({ ...form, days_off_duty: e.target.value })} className="h-9 text-sm" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">적합성 판정</Label>
              <Select value={form.fitness_status || '_none'} onValueChange={v => setForm({ ...form, fitness_status: v === '_none' ? '' : v })}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="판정 선택" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">선택 안함</SelectItem>
                  {FITNESS_OPTIONS.map(f => <SelectItem key={f.value} value={f.value} className="text-sm">{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-end space-x-2 pb-1">
                <input type="checkbox" id="ss-follow-up" checked={form.follow_up_required} onChange={e => setForm({ ...form, follow_up_required: e.target.checked })} className="accent-blue-600 w-4 h-4" />
                <Label htmlFor="ss-follow-up" className="text-xs cursor-pointer">추적 관찰 필요</Label>
              </div>
              {form.follow_up_required && (
                <div className="space-y-1.5">
                  <Label className="text-xs">추적 관찰일</Label>
                  <Input type="date" value={form.follow_up_date} onChange={e => setForm({ ...form, follow_up_date: e.target.value })} className="h-9 text-sm" />
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">비고</Label>
              <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="text-sm resize-none" />
            </div>

            {formView?.record && (
              <div className="border-t pt-3">
                <MedicalRecordFollowUp
                  medicalRecordId={formView.record.id}
                  attachments={formView.record.attachments || []}
                  onChanged={onChanged}
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" className="h-8" onClick={() => setFormView(null)} disabled={saving}>{formView?.record ? '목록으로' : '취소'}</Button>
              <Button size="sm" className="h-8 gap-1.5" onClick={handleSave} disabled={saving}><Save className="w-3.5 h-3.5" />{saving ? '저장 중...' : '저장'}</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" className="h-8 gap-1.5" onClick={() => openForm()}><Plus className="w-3.5 h-3.5" />상병 기록 추가</Button>
            </div>
            {loading ? (
              <div className="text-center py-6 text-sm text-gray-400">로딩 중...</div>
            ) : records.length === 0 ? (
              <div className="text-center py-6 text-sm text-gray-400 border-2 border-dashed rounded-md">이 승선 기간에 등록된 상병 기록이 없습니다.</div>
            ) : (
              <div className="space-y-2">
                {records.map(r => (
                  <div key={r.id} className="border rounded-md p-3 flex items-center justify-between cursor-pointer hover:bg-gray-50" onClick={() => openForm(r)}>
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{RECORD_TYPE_LABELS[r.record_type]}</Badge>
                        <span className="text-sm font-medium">{r.diagnosis}</span>
                        {r.fitness_status && <Badge className={`text-xs ${FITNESS_LABELS[r.fitness_status]?.color}`}>{FITNESS_LABELS[r.fitness_status]?.label}</Badge>}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{r.record_date}{r.days_off_duty ? ` · 휴무 ${r.days_off_duty}일` : ''}</p>
                    </div>
                    <div className="flex gap-1" onClick={ev => ev.stopPropagation()}>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openForm(r)}><Edit2 className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => handleDelete(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
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
