import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ShipType } from '@/types/ship-classification';
import { SHIP_CATEGORIES } from '@/types/ship-classification';

interface ShipTypeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shipType: ShipType | null;
  onSave: (data: Omit<ShipType, 'id' | 'created_at' | 'updated_at'>) => void;
}

export default function ShipTypeDialog({
  open,
  onOpenChange,
  shipType,
  onSave,
}: ShipTypeDialogProps) {
  const [formData, setFormData] = useState({
    name: '',
    name_ko: '',
    category: '',
    description: '',
  });

  useEffect(() => {
    if (shipType) {
      setFormData({
        name: shipType.name,
        name_ko: shipType.name_ko,
        category: shipType.category || '',
        description: shipType.description || '',
      });
    } else {
      setFormData({
        name: '',
        name_ko: '',
        category: '',
        description: '',
      });
    }
  }, [shipType, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.category) {
      alert('카테고리를 선택해주세요.');
      return;
    }
    onSave(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-base">
            {shipType ? '선종 수정' : '선종 추가'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            선종 정보를 입력하세요
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-xs">선종명 (영문) *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className="h-9 text-sm"
              placeholder="예: Bulk Carrier"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="name_ko" className="text-xs">선종명 (한글) *</Label>
            <Input
              id="name_ko"
              value={formData.name_ko}
              onChange={(e) => setFormData({ ...formData, name_ko: e.target.value })}
              required
              className="h-9 text-sm"
              placeholder="예: 벌크선"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="category" className="text-xs">카테고리 *</Label>
            <Select
              value={formData.category}
              onValueChange={(value) => setFormData({ ...formData, category: value })}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="카테고리를 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {SHIP_CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value} className="text-sm">
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description" className="text-xs">설명</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="text-sm resize-none"
              placeholder="선종에 대한 설명을 입력하세요"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-9 text-sm"
            >
              취소
            </Button>
            <Button type="submit" className="h-9 text-sm">
              {shipType ? '수정' : '추가'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}