import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { addMedicalRecord, updateMedicalRecord } from '@/services/crew-extended.service';
import type { MedicalRecord } from '@/types/crew-extended';
import { useToast } from '@/hooks/use-toast';

interface MedicalRecordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  crewId: string;
  record?: MedicalRecord;
  onSuccess: () => void;
}

const RECORD_TYPES = [
  { value: 'checkup', label: '정기 검진' },
  { value: 'illness', label: '질병' },
  { value: 'injury', label: '부상' },
  { value: 'vaccination', label: '예방접종' },
  { value: 'other', label: '기타' },
];

const FITNESS_OPTIONS = [
  { value: 'fit', label: '적합 (Fit)' },
  { value: 'fit_with_restrictions', label: '조건부 적합' },
  { value: 'unfit', label: '부적합 (Unfit)' },
  { value: 'pending', label: '대기 중' },
];

export default function MedicalRecordDialog({
  open,
  onOpenChange,
  crewId,
  record,
  onSuccess,
}: MedicalRecordDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    record_date: '',
    record_type: '' as string,
    diagnosis: '',
    treatment: '',
    doctor_name: '',
    hospital_clinic: '',
    location: '',
    ship_name: '',
    days_off_duty: '',
    fitness_status: '' as string,
    follow_up_required: false,
    follow_up_date: '',
    notes: '',
  });

  useEffect(() => {
    if (record) {
      setFormData({
        record_date: record.record_date,
        record_type: record.record_type,
        diagnosis: record.diagnosis,
        treatment: record.treatment || '',
        doctor_name: record.doctor_name || '',
        hospital_clinic: record.hospital_clinic || '',
        location: record.location || '',
        ship_name: record.ship_name || '',
        days_off_duty: record.days_off_duty?.toString() || '',
        fitness_status: record.fitness_status || '',
        follow_up_required: record.follow_up_required || false,
        follow_up_date: record.follow_up_date || '',
        notes: record.notes || '',
      });
    } else {
      setFormData({
        record_date: new Date().toISOString().split('T')[0],
        record_type: '',
        diagnosis: '',
        treatment: '',
        doctor_name: '',
        hospital_clinic: '',
        location: '',
        ship_name: '',
        days_off_duty: '',
        fitness_status: '',
        follow_up_required: false,
        follow_up_date: '',
        notes: '',
      });
    }
  }, [record, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = {
        crew_member_id: crewId,
        record_date: formData.record_date,
        record_type: formData.record_type as MedicalRecord['record_type'],
        diagnosis: formData.diagnosis,
        treatment: formData.treatment || undefined,
        doctor_name: formData.doctor_name || undefined,
        hospital_clinic: formData.hospital_clinic || undefined,
        location: formData.location || undefined,
        ship_name: formData.ship_name || undefined,
        days_off_duty: formData.days_off_duty ? parseInt(formData.days_off_duty) : undefined,
        fitness_status: (formData.fitness_status || undefined) as MedicalRecord['fitness_status'],
        follow_up_required: formData.follow_up_required || undefined,
        follow_up_date: formData.follow_up_date || undefined,
        notes: formData.notes || undefined,
      };

      if (record) {
        await updateMedicalRecord(record.id, data);
        toast({ title: '수정 완료', description: '진료 기록이 수정되었습니다.' });
      } else {
        await addMedicalRecord(data);
        toast({ title: '추가 완료', description: '진료 기록이 추가되었습니다.' });
      }
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast({ title: '저장 실패', description: '진료 기록 저장 중 오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{record ? '진료 기록 수정' : '진료 기록 추가'}</DialogTitle>
          <DialogDescription className="text-xs">선원의 진료/건강 기록을 {record ? '수정' : '등록'}합니다</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-3 py-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">기록일 *</Label>
                <Input type="date" value={formData.record_date} onChange={e => setFormData({ ...formData, record_date: e.target.value })} required className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">유형 *</Label>
                <Select value={formData.record_type} onValueChange={v => setFormData({ ...formData, record_type: v })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="유형 선택" /></SelectTrigger>
                  <SelectContent>{RECORD_TYPES.map(t => <SelectItem key={t.value} value={t.value} className="text-sm">{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">진단 내용 *</Label>
              <Input value={formData.diagnosis} onChange={e => setFormData({ ...formData, diagnosis: e.target.value })} placeholder="진단명 또는 내용" required className="h-9 text-sm" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">치료 내용</Label>
              <Textarea value={formData.treatment} onChange={e => setFormData({ ...formData, treatment: e.target.value })} placeholder="치료 방법 및 처방 내용" rows={2} className="text-sm resize-none" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">담당 의사</Label>
                <Input value={formData.doctor_name} onChange={e => setFormData({ ...formData, doctor_name: e.target.value })} placeholder="의사명" className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">병원/의원</Label>
                <Input value={formData.hospital_clinic} onChange={e => setFormData({ ...formData, hospital_clinic: e.target.value })} placeholder="병원명" className="h-9 text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">장소</Label>
                <Input value={formData.location} onChange={e => setFormData({ ...formData, location: e.target.value })} placeholder="진료 장소 (도시/국가)" className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">당시 승선 선박</Label>
                <Input value={formData.ship_name} onChange={e => setFormData({ ...formData, ship_name: e.target.value })} placeholder="선박명" className="h-9 text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">휴무 일수</Label>
                <Input type="number" min="0" value={formData.days_off_duty} onChange={e => setFormData({ ...formData, days_off_duty: e.target.value })} placeholder="일" className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">적합성 판정</Label>
                <Select value={formData.fitness_status} onValueChange={v => setFormData({ ...formData, fitness_status: v })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="판정 선택" /></SelectTrigger>
                  <SelectContent>{FITNESS_OPTIONS.map(f => <SelectItem key={f.value} value={f.value} className="text-sm">{f.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-end space-x-2 pb-1">
                <input type="checkbox" id="follow_up" checked={formData.follow_up_required} onChange={e => setFormData({ ...formData, follow_up_required: e.target.checked })} className="accent-blue-600 w-4 h-4" />
                <Label htmlFor="follow_up" className="text-xs cursor-pointer">추적 관찰 필요</Label>
              </div>
              {formData.follow_up_required && (
                <div className="space-y-1.5">
                  <Label className="text-xs">추적 관찰일</Label>
                  <Input type="date" value={formData.follow_up_date} onChange={e => setFormData({ ...formData, follow_up_date: e.target.value })} className="h-9 text-sm" />
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">비고</Label>
              <Textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} placeholder="추가 정보" rows={3} className="text-sm resize-none" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" size="sm" variant="outline" onClick={() => onOpenChange(false)} disabled={loading} className="h-8">취소</Button>
            <Button type="submit" size="sm" className="h-8" disabled={loading}>{loading ? '저장 중...' : (record ? '수정' : '추가')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
