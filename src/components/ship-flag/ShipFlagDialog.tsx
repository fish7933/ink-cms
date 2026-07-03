import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import type { ShipFlag } from '@/types/ship-flag';

interface ShipFlagDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flag: ShipFlag | null;
  onSave: (data: Omit<ShipFlag, 'id' | 'created_at' | 'updated_at' | 'display_order'>) => void;
}

export default function ShipFlagDialog({ open, onOpenChange, flag, onSave }: ShipFlagDialogProps) {
  const [formData, setFormData] = useState({
    code: '',
    name_ko: '',
    name_en: '',
    is_active: true,
  });

  useEffect(() => {
    if (flag) {
      setFormData({
        code: flag.code,
        name_ko: flag.name_ko,
        name_en: flag.name_en,
        is_active: flag.is_active,
      });
    } else {
      setFormData({
        code: '',
        name_ko: '',
        name_en: '',
        is_active: true,
      });
    }
  }, [flag, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">{flag ? '선적국 수정' : '선적국 추가'}</DialogTitle>
          <DialogDescription className="text-xs">선적국 정보를 입력하세요</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="code" className="text-xs">국가 코드 (ISO 3166-1 alpha-2) *</Label>
            <Input
              id="code"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
              placeholder="예: KR, PA, LR"
              maxLength={3}
              required
              className="h-9 text-sm uppercase"
            />
            <p className="text-xs text-gray-500">2자리 국가 코드를 입력하세요</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name_ko" className="text-xs">한글명 *</Label>
            <Input
              id="name_ko"
              value={formData.name_ko}
              onChange={(e) => setFormData({ ...formData, name_ko: e.target.value })}
              placeholder="예: 대한민국"
              required
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="name_en" className="text-xs">영문명 *</Label>
            <Input
              id="name_en"
              value={formData.name_en}
              onChange={(e) => setFormData({ ...formData, name_en: e.target.value })}
              placeholder="예: Korea, Republic of"
              required
              className="h-9 text-sm"
            />
          </div>

          <div className="flex items-center justify-between p-3 border rounded-md">
            <div className="space-y-0.5">
              <Label htmlFor="is_active" className="text-sm font-medium">활성 상태</Label>
              <p className="text-xs text-gray-500">선박 등록 시 선택 가능 여부</p>
            </div>
            <Switch
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="submit" className="flex-1 h-9">
              {flag ? '수정' : '추가'}
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-9">
              취소
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}