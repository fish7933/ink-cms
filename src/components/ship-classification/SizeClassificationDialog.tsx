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
import type { ShipSizeClassification, ShipType } from '@/types/ship-classification';

interface SizeClassificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classification: ShipSizeClassification | null;
  shipTypes: ShipType[];
  onSave: (data: Omit<ShipSizeClassification, 'id' | 'created_at' | 'updated_at'>) => void;
}

export default function SizeClassificationDialog({
  open,
  onOpenChange,
  classification,
  shipTypes,
  onSave,
}: SizeClassificationDialogProps) {
  const [formData, setFormData] = useState({
    name: '',
    name_ko: '',
    ship_type_id: '',
    min_gt: '',
    max_gt: '',
    min_dwt: '',
    max_dwt: '',
    dwt_gt_ratio: '',
    description: '',
  });

  useEffect(() => {
    if (classification) {
      setFormData({
        name: classification.name,
        name_ko: classification.name_ko,
        ship_type_id: classification.ship_type_id != null ? String(classification.ship_type_id) : '',
        min_gt: classification.min_gt?.toString() || '',
        max_gt: classification.max_gt?.toString() || '',
        min_dwt: classification.min_dwt?.toString() || '',
        max_dwt: classification.max_dwt?.toString() || '',
        dwt_gt_ratio: classification.dwt_gt_ratio?.toString() || '',
        description: classification.description || '',
      });
    } else {
      setFormData({
        name: '',
        name_ko: '',
        ship_type_id: '',
        min_gt: '',
        max_gt: '',
        min_dwt: '',
        max_dwt: '',
        dwt_gt_ratio: '',
        description: '',
      });
    }
  }, [classification, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const data: Omit<ShipSizeClassification, 'id' | 'created_at' | 'updated_at'> = {
      name: formData.name,
      name_ko: formData.name_ko,
      ship_type_id: formData.ship_type_id ? Number(formData.ship_type_id) : undefined,
      min_gt: formData.min_gt ? Number(formData.min_gt) : undefined,
      max_gt: formData.max_gt ? Number(formData.max_gt) : undefined,
      min_dwt: formData.min_dwt ? Number(formData.min_dwt) : undefined,
      max_dwt: formData.max_dwt ? Number(formData.max_dwt) : undefined,
      dwt_gt_ratio: formData.dwt_gt_ratio ? Number(formData.dwt_gt_ratio) : undefined,
      description: formData.description || undefined,
    };

    onSave(data);
  };

  // Group ship types by category for easier selection
  const groupedShipTypes = shipTypes.reduce<Record<string, ShipType[]>>((acc, st) => {
    const cat = st.category || '기타';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(st);
    return acc;
  }, {});

  const sortedCategories = Object.keys(groupedShipTypes).sort();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            {classification ? '크기 분류 수정' : '크기 분류 추가'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            선박 크기 분류 정보를 입력하세요
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-xs">분류명 (영문) *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                className="h-9 text-sm"
                placeholder="예: Capesize"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="name_ko" className="text-xs">분류명 (한글) *</Label>
              <Input
                id="name_ko"
                value={formData.name_ko}
                onChange={(e) => setFormData({ ...formData, name_ko: e.target.value })}
                required
                className="h-9 text-sm"
                placeholder="예: 케이프사이즈"
              />
            </div>
          </div>

          {/* Ship Type Selection */}
          <div className="space-y-1.5">
            <Label htmlFor="ship_type_id" className="text-xs">소속 선종</Label>
            <Select
              value={formData.ship_type_id}
              onValueChange={(value) => setFormData({ ...formData, ship_type_id: value === '__none__' ? '' : value })}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="선종을 선택하세요" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                <SelectItem value="__none__" className="text-sm text-gray-500">
                  선택 안함
                </SelectItem>
                {sortedCategories.map((category) => (
                  <div key={category}>
                    <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 bg-gray-50">
                      {category}
                    </div>
                    {groupedShipTypes[category].map((st) => (
                      <SelectItem key={st.id} value={String(st.id)} className="text-sm pl-4">
                        {st.name_ko} ({st.name})
                      </SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="min_gt" className="text-xs">최소 GT</Label>
              <Input
                id="min_gt"
                type="number"
                value={formData.min_gt}
                onChange={(e) => setFormData({ ...formData, min_gt: e.target.value })}
                className="h-9 text-sm"
                placeholder="예: 50000"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="max_gt" className="text-xs">최대 GT</Label>
              <Input
                id="max_gt"
                type="number"
                value={formData.max_gt}
                onChange={(e) => setFormData({ ...formData, max_gt: e.target.value })}
                className="h-9 text-sm"
                placeholder="예: 100000"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="min_dwt" className="text-xs">최소 DWT</Label>
              <Input
                id="min_dwt"
                type="number"
                value={formData.min_dwt}
                onChange={(e) => setFormData({ ...formData, min_dwt: e.target.value })}
                className="h-9 text-sm"
                placeholder="예: 100000"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="max_dwt" className="text-xs">최대 DWT</Label>
              <Input
                id="max_dwt"
                type="number"
                value={formData.max_dwt}
                onChange={(e) => setFormData({ ...formData, max_dwt: e.target.value })}
                className="h-9 text-sm"
                placeholder="예: 200000"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dwt_gt_ratio" className="text-xs">
              DWT/GT 비율 (자동 계산용)
            </Label>
            <Input
              id="dwt_gt_ratio"
              type="number"
              step="0.01"
              value={formData.dwt_gt_ratio}
              onChange={(e) => setFormData({ ...formData, dwt_gt_ratio: e.target.value })}
              className="h-9 text-sm"
              placeholder="예: 1.85"
            />
            <p className="text-xs text-gray-500">
              GT 입력 시 DWT를 자동 계산하는데 사용됩니다
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description" className="text-xs">설명</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
              className="text-sm resize-none"
              placeholder="분류에 대한 설명을 입력하세요"
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
              {classification ? '수정' : '추가'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}