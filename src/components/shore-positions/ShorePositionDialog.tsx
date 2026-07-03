import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ShorePosition } from '@/types/models';

interface ShorePositionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  position: ShorePosition | null;
  onSave: (data: { name: string }) => void;
}

export default function ShorePositionDialog({
  open,
  onOpenChange,
  position,
  onSave,
}: ShorePositionDialogProps) {
  const [formData, setFormData] = useState({ name: '' });

  useEffect(() => {
    setFormData({ name: position ? position.name : '' });
  }, [position, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="text-base">{position ? '직급 수정' : '직급 추가'}</DialogTitle>
          <DialogDescription className="text-xs">육상 직원 직급 정보를 입력하세요</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-xs">직급명 *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className="h-9 text-sm"
              placeholder="예: 부장"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-9 text-sm">
              취소
            </Button>
            <Button type="submit" className="h-9 text-sm">
              {position ? '수정' : '추가'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
