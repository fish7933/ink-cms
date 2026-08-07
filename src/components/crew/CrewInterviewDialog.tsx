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
import { addCrewInterviewLog, updateCrewInterviewLog } from '@/services/crew-extended.service';
import type { CrewInterviewLog } from '@/types/crew-extended';
import { useToast } from '@/hooks/use-toast';
import { getCurrentUser, getShips } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import type { Ship } from '@/lib/store';

interface CrewInterviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  crewId: string;
  record?: CrewInterviewLog;
  onSuccess: () => void;
}

export default function CrewInterviewDialog({
  open,
  onOpenChange,
  crewId,
  record,
  onSuccess,
}: CrewInterviewDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [owners, setOwners] = useState<{ id: string; name: string }[]>([]);
  const [fleets, setFleets] = useState<{ id: string; name: string; owner_id: string }[]>([]);
  const [ships, setShips] = useState<Ship[]>([]);

  const [formData, setFormData] = useState({
    interview_date: '',
    interviewer_name: '',
    desired_owner_id: '',
    desired_fleet_id: '',
    desired_ship_id: '',
    desired_embark_date: '',
    notes: '',
  });

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [{ data: ownerRows }, { data: fleetRows }, shipRows] = await Promise.all([
        supabase.from('companies').select('id, name').eq('type', 'owner').order('name'),
        supabase.from('fleets').select('id, name, owner_id').order('name'),
        getShips(),
      ]);
      setOwners(ownerRows || []);
      setFleets((fleetRows || []) as { id: string; name: string; owner_id: string }[]);
      setShips(shipRows);
    })();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (record) {
      setFormData({
        interview_date: record.interview_date,
        interviewer_name: record.interviewer_name,
        desired_owner_id: record.desired_owner_id || '',
        desired_fleet_id: record.desired_fleet_id || '',
        desired_ship_id: record.desired_ship_id || '',
        desired_embark_date: record.desired_embark_date || '',
        notes: record.notes || '',
      });
    } else {
      (async () => {
        const user = await getCurrentUser();
        setFormData({
          interview_date: new Date().toISOString().slice(0, 10),
          interviewer_name: user?.name || '',
          desired_owner_id: '',
          desired_fleet_id: '',
          desired_ship_id: '',
          desired_embark_date: '',
          notes: '',
        });
      })();
    }
  }, [record, open]);

  const fleetsForOwner = formData.desired_owner_id ? fleets.filter(f => f.owner_id === formData.desired_owner_id) : [];
  const shipsForSelection = ships.filter(s =>
    (!formData.desired_owner_id || s.owner_id === formData.desired_owner_id) &&
    (!formData.desired_fleet_id || s.fleet_id === formData.desired_fleet_id)
  );

  const handleOwnerChange = (v: string) => setFormData(p => ({ ...p, desired_owner_id: v === '_none' ? '' : v, desired_fleet_id: '', desired_ship_id: '' }));
  const handleFleetChange = (v: string) => setFormData(p => ({ ...p, desired_fleet_id: v === '_none' ? '' : v, desired_ship_id: '' }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = {
        crew_member_id: crewId,
        interview_date: formData.interview_date,
        interviewer_name: formData.interviewer_name,
        desired_owner_id: formData.desired_owner_id || null,
        desired_fleet_id: formData.desired_fleet_id || null,
        desired_ship_id: formData.desired_ship_id || null,
        desired_embark_date: formData.desired_embark_date || null,
        notes: formData.notes || undefined,
      };

      if (record) {
        await updateCrewInterviewLog(record.id, data);
        toast({ title: '수정 완료', description: '면담 일지가 수정되었습니다.' });
      } else {
        await addCrewInterviewLog(data);
        toast({ title: '추가 완료', description: '면담 일지가 추가되었습니다.' });
      }
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast({ title: '저장 실패', description: '면담 일지 저장 중 오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{record ? '면담 일지 수정' : '면담 일지 추가'}</DialogTitle>
          <DialogDescription className="text-xs">매닝회사 면담 내용을 {record ? '수정' : '등록'}합니다. 가장 최근 면담의 승선 희망일이 기본정보에 반영됩니다.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-3 py-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">면담일 *</Label>
                <Input type="date" value={formData.interview_date} onChange={e => setFormData({ ...formData, interview_date: e.target.value })} required className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">면담자(작성자) *</Label>
                <Input value={formData.interviewer_name} onChange={e => setFormData({ ...formData, interviewer_name: e.target.value })} placeholder="매닝회사 면담자 이름" required className="h-9 text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">승선 희망 선주</Label>
                <Select value={formData.desired_owner_id || '_none'} onValueChange={handleOwnerChange}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="선주 선택" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">선택 안 함</SelectItem>
                    {owners.map(o => <SelectItem key={o.id} value={o.id} className="text-sm">{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">희망 플릿</Label>
                <Select value={formData.desired_fleet_id || '_none'} onValueChange={handleFleetChange} disabled={!formData.desired_owner_id}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="플릿 선택" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">선택 안 함</SelectItem>
                    {fleetsForOwner.map(f => <SelectItem key={f.id} value={f.id} className="text-sm">{f.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">희망 선박</Label>
                <Select value={formData.desired_ship_id || '_none'} onValueChange={v => setFormData(p => ({ ...p, desired_ship_id: v === '_none' ? '' : v }))} disabled={!formData.desired_owner_id}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="선박 선택" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">선택 안 함</SelectItem>
                    {shipsForSelection.map(s => <SelectItem key={s.id} value={s.id} className="text-sm">{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">승선 희망일</Label>
              <Input type="date" value={formData.desired_embark_date} onChange={e => setFormData({ ...formData, desired_embark_date: e.target.value })} className="h-9 text-sm w-1/2" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">비고</Label>
              <Textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} placeholder="면담 내용 등 추가 정보" rows={3} className="text-sm resize-none" />
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
