import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { crewService } from '@/services/crew.service';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/store';
import type { CrewStatus } from '@/types/models';

interface CrewMember {
  id: string;
  name: string;
  current_status: CrewStatus;
}

interface CrewStatusDialogProps {
  open: boolean;
  crew: CrewMember | null;
  onClose: (saved: boolean) => void;
}

export function CrewStatusDialog({ open, crew, onClose }: CrewStatusDialogProps) {
  const [status, setStatus] = useState<CrewStatus>('registered');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open && crew) {
      setStatus(crew.current_status);
      setNotes('');
    }
  }, [open, crew]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!crew) return;

    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) {
        alert('로그인이 필요합니다.');
        return;
      }

      await crewService.updateStatus(crew.id, status, currentUser.id, notes);
      
      // Record status change in history
      await supabase.from('crew_status_history').insert({
        crew_member_id: crew.id,
        status,
        notes,
        changed_by: currentUser.id,
      });

      onClose(true);
    } catch (error) {
      console.error('Failed to update crew status:', error);
      alert('상태 변경에 실패했습니다.');
    }
  };

  if (!crew) return null;

  return (
    <Dialog open={open} onOpenChange={() => onClose(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{crew.name} - 상태 변경</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>새로운 상태</Label>
            <Select value={status} onValueChange={(value: CrewStatus) => setStatus(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="registered">등록</SelectItem>
                <SelectItem value="available">대기</SelectItem>
                <SelectItem value="on_board">승선</SelectItem>
                <SelectItem value="on_leave">휴가</SelectItem>
                <SelectItem value="retired">퇴직</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>비고</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="상태 변경 사유를 입력하세요"
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onClose(false)}>
              취소
            </Button>
            <Button type="submit">
              변경
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default CrewStatusDialog;