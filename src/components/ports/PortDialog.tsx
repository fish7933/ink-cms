import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Port } from '@/types/port';

interface PortDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  port: Port | null;
  onSave: (data: { country_code: string | null; country_name: string; city_name: string; is_active: boolean }) => void;
}

const EMPTY_FORM = { country_code: '', country_name: '', city_name: '', is_active: true };

export default function PortDialog({ open, onOpenChange, port, onSave }: PortDialogProps) {
  const [formData, setFormData] = useState(EMPTY_FORM);

  useEffect(() => {
    if (port) {
      setFormData({
        country_code: port.country_code || '',
        country_name: port.country_name,
        city_name: port.city_name,
        is_active: port.is_active,
      });
    } else {
      setFormData(EMPTY_FORM);
    }
  }, [port, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      country_code: formData.country_code || null,
      country_name: formData.country_name,
      city_name: formData.city_name,
      is_active: formData.is_active,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="text-base">{port ? '교대지 수정' : '교대지 추가'}</DialogTitle>
          <DialogDescription className="text-xs">국가/도시 정보를 입력하세요</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="country_name" className="text-xs">국가명 *</Label>
              <Input id="country_name" value={formData.country_name} onChange={e => setFormData({ ...formData, country_name: e.target.value })} required className="h-9 text-sm" placeholder="예: South Korea" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="country_code" className="text-xs">국가 코드</Label>
              <Input id="country_code" value={formData.country_code} onChange={e => setFormData({ ...formData, country_code: e.target.value.toUpperCase() })} maxLength={2} className="h-9 text-sm font-mono uppercase" placeholder="예: KR" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="city_name" className="text-xs">도시명 *</Label>
            <Input id="city_name" value={formData.city_name} onChange={e => setFormData({ ...formData, city_name: e.target.value })} required className="h-9 text-sm" placeholder="예: Busan" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer pt-1">
            <Checkbox checked={formData.is_active} onCheckedChange={c => setFormData({ ...formData, is_active: c === true })} />
            <span className="text-xs">활성 상태</span>
          </label>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-9 text-sm">취소</Button>
            <Button type="submit" className="h-9 text-sm">{port ? '수정' : '추가'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
