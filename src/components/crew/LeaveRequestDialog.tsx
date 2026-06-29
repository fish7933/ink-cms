import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { addLeaveRequest, updateLeaveRequest } from '@/services/leave.service';
import type { LeaveRequestWithDetails } from '@/types/leave';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

interface LeaveRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record?: LeaveRequestWithDetails;
  onSuccess: () => void;
}

const LEAVE_TYPES = [
  { value: 'annual', label: '연차 휴가' },
  { value: 'sick', label: '병가' },
  { value: 'special', label: '특별 휴가' },
  { value: 'unpaid', label: '무급 휴가' },
  { value: 'compensatory', label: '보상 휴가' },
  { value: 'maternity', label: '출산 휴가' },
];

interface CrewOption { id: string; name: string; rank: string; }

export default function LeaveRequestDialog({ open, onOpenChange, record, onSuccess }: LeaveRequestDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [crewOptions, setCrewOptions] = useState<CrewOption[]>([]);

  const [formData, setFormData] = useState({
    crew_member_id: '',
    leave_type: 'annual' as string,
    start_date: '',
    end_date: '',
    total_days: '',
    reason: '',
    notes: '',
  });

  useEffect(() => {
    supabase.from('crew_members').select('id, name, rank').then(({ data }) => {
      if (data) setCrewOptions(data.map(c => ({ id: c.id, name: c.name || '', rank: c.rank || '' })));
    });
  }, []);

  useEffect(() => {
    if (record) {
      setFormData({
        crew_member_id: record.crew_member_id,
        leave_type: record.leave_type,
        start_date: record.start_date,
        end_date: record.end_date,
        total_days: record.total_days.toString(),
        reason: record.reason || '',
        notes: record.notes || '',
      });
    } else {
      setFormData({ crew_member_id: '', leave_type: 'annual', start_date: '', end_date: '', total_days: '', reason: '', notes: '' });
    }
  }, [record, open]);

  useEffect(() => {
    if (formData.start_date && formData.end_date) {
      const diff = Math.ceil((new Date(formData.end_date).getTime() - new Date(formData.start_date).getTime()) / (1000 * 60 * 60 * 24)) + 1;
      if (diff > 0) setFormData(prev => ({ ...prev, total_days: diff.toString() }));
    }
  }, [formData.start_date, formData.end_date]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = {
        crew_member_id: formData.crew_member_id,
        leave_type: formData.leave_type as LeaveRequestWithDetails['leave_type'],
        start_date: formData.start_date,
        end_date: formData.end_date,
        total_days: parseInt(formData.total_days),
        reason: formData.reason || undefined,
        status: 'pending' as const,
        notes: formData.notes || undefined,
      };
      if (record) {
        await updateLeaveRequest(record.id, data);
        toast({ title: '수정 완료', description: '휴가 신청이 수정되었습니다.' });
      } else {
        await addLeaveRequest(data);
        toast({ title: '등록 완료', description: '휴가 신청이 등록되었습니다.' });
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
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="text-base">{record ? '휴가 신청 수정' : '휴가 신청'}</DialogTitle>
          <DialogDescription className="text-xs">선원 휴가를 {record ? '수정' : '신청'}합니다</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-3 py-3">
            <div className="space-y-1.5">
              <Label className="text-xs">선원 *</Label>
              <Select value={formData.crew_member_id} onValueChange={v => setFormData({ ...formData, crew_member_id: v })}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="선원 선택" /></SelectTrigger>
                <SelectContent>{crewOptions.map(c => <SelectItem key={c.id} value={c.id} className="text-sm">{c.name} ({c.rank})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">휴가 유형 *</Label>
              <Select value={formData.leave_type} onValueChange={v => setFormData({ ...formData, leave_type: v })}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{LEAVE_TYPES.map(t => <SelectItem key={t.value} value={t.value} className="text-sm">{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">시작일 *</Label>
                <Input type="date" value={formData.start_date} onChange={e => setFormData({ ...formData, start_date: e.target.value })} required className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">종료일 *</Label>
                <Input type="date" value={formData.end_date} onChange={e => setFormData({ ...formData, end_date: e.target.value })} required className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">일수</Label>
                <Input type="number" value={formData.total_days} onChange={e => setFormData({ ...formData, total_days: e.target.value })} className="h-9 text-sm" readOnly />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">사유</Label>
              <Textarea value={formData.reason} onChange={e => setFormData({ ...formData, reason: e.target.value })} placeholder="휴가 사유" rows={2} className="text-sm resize-none" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">비고</Label>
              <Textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} placeholder="추가 정보" rows={2} className="text-sm resize-none" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" size="sm" variant="outline" onClick={() => onOpenChange(false)} disabled={loading} className="h-8">취소</Button>
            <Button type="submit" size="sm" className="h-8" disabled={loading}>{loading ? '저장 중...' : (record ? '수정' : '신청')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
