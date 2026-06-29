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
import { addTrainingRecord, updateTrainingRecord } from '@/services/crew-extended.service';
import type { TrainingRecord } from '@/types/crew-extended';
import { useToast } from '@/hooks/use-toast';

interface TrainingRecordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  crewId: string;
  record?: TrainingRecord;
  onSuccess: () => void;
}

const TRAINING_TYPES = [
  { value: 'safety', label: '안전 교육' },
  { value: 'technical', label: '기술 교육' },
  { value: 'management', label: '관리 교육' },
  { value: 'certification', label: '자격증 취득' },
  { value: 'other', label: '기타' },
];

const RESULT_OPTIONS = [
  { value: 'passed', label: '합격' },
  { value: 'failed', label: '불합격' },
  { value: 'in_progress', label: '진행 중' },
];

export default function TrainingRecordDialog({
  open,
  onOpenChange,
  crewId,
  record,
  onSuccess,
}: TrainingRecordDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    training_name: '',
    training_type: '' as string,
    training_provider: '',
    training_location: '',
    start_date: '',
    end_date: '',
    duration_hours: '',
    certificate_issued: false,
    certificate_number: '',
    certificate_expiry: '',
    result: '' as string,
    notes: '',
  });

  useEffect(() => {
    if (record) {
      setFormData({
        training_name: record.training_name,
        training_type: record.training_type || '',
        training_provider: record.training_provider || '',
        training_location: record.training_location || '',
        start_date: record.start_date,
        end_date: record.end_date || '',
        duration_hours: record.duration_hours?.toString() || '',
        certificate_issued: record.certificate_issued || false,
        certificate_number: record.certificate_number || '',
        certificate_expiry: record.certificate_expiry || '',
        result: record.result || '',
        notes: record.notes || '',
      });
    } else {
      setFormData({
        training_name: '',
        training_type: '',
        training_provider: '',
        training_location: '',
        start_date: '',
        end_date: '',
        duration_hours: '',
        certificate_issued: false,
        certificate_number: '',
        certificate_expiry: '',
        result: '',
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
        training_name: formData.training_name,
        training_type: (formData.training_type || undefined) as TrainingRecord['training_type'],
        training_provider: formData.training_provider || undefined,
        training_location: formData.training_location || undefined,
        start_date: formData.start_date,
        end_date: formData.end_date || undefined,
        duration_hours: formData.duration_hours ? parseInt(formData.duration_hours) : undefined,
        certificate_issued: formData.certificate_issued || undefined,
        certificate_number: formData.certificate_number || undefined,
        certificate_expiry: formData.certificate_expiry || undefined,
        result: (formData.result || undefined) as TrainingRecord['result'],
        notes: formData.notes || undefined,
      };

      if (record) {
        await updateTrainingRecord(record.id, data);
        toast({ title: '수정 완료', description: '교육 기록이 수정되었습니다.' });
      } else {
        await addTrainingRecord(data);
        toast({ title: '추가 완료', description: '교육 기록이 추가되었습니다.' });
      }
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast({ title: '저장 실패', description: '교육 기록 저장 중 오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{record ? '교육 기록 수정' : '교육 기록 추가'}</DialogTitle>
          <DialogDescription className="text-xs">선원의 교육 이력을 {record ? '수정' : '등록'}합니다</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-3 py-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">교육명 *</Label>
                <Input value={formData.training_name} onChange={e => setFormData({ ...formData, training_name: e.target.value })} placeholder="교육 과정명" required className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">교육 유형</Label>
                <Select value={formData.training_type} onValueChange={v => setFormData({ ...formData, training_type: v })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="유형 선택" /></SelectTrigger>
                  <SelectContent>{TRAINING_TYPES.map(t => <SelectItem key={t.value} value={t.value} className="text-sm">{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">교육 기관</Label>
                <Input value={formData.training_provider} onChange={e => setFormData({ ...formData, training_provider: e.target.value })} placeholder="교육 실시 기관" className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">교육 장소</Label>
                <Input value={formData.training_location} onChange={e => setFormData({ ...formData, training_location: e.target.value })} placeholder="교육 장소" className="h-9 text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">시작일 *</Label>
                <Input type="date" value={formData.start_date} onChange={e => setFormData({ ...formData, start_date: e.target.value })} required className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">종료일</Label>
                <Input type="date" value={formData.end_date} onChange={e => setFormData({ ...formData, end_date: e.target.value })} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">교육 시간</Label>
                <Input type="number" value={formData.duration_hours} onChange={e => setFormData({ ...formData, duration_hours: e.target.value })} placeholder="시간" className="h-9 text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">결과</Label>
                <Select value={formData.result} onValueChange={v => setFormData({ ...formData, result: v })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="결과 선택" /></SelectTrigger>
                  <SelectContent>{RESULT_OPTIONS.map(r => <SelectItem key={r.value} value={r.value} className="text-sm">{r.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex items-end space-x-2 pb-1">
                <input type="checkbox" id="cert_issued" checked={formData.certificate_issued} onChange={e => setFormData({ ...formData, certificate_issued: e.target.checked })} className="accent-blue-600 w-4 h-4" />
                <Label htmlFor="cert_issued" className="text-xs cursor-pointer">수료증/자격증 발급</Label>
              </div>
            </div>

            {formData.certificate_issued && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">수료증/자격증 번호</Label>
                  <Input value={formData.certificate_number} onChange={e => setFormData({ ...formData, certificate_number: e.target.value })} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">유효 만료일</Label>
                  <Input type="date" value={formData.certificate_expiry} onChange={e => setFormData({ ...formData, certificate_expiry: e.target.value })} className="h-9 text-sm" />
                </div>
              </div>
            )}

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
