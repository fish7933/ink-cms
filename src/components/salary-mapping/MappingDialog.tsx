import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
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
import type { Ship, SalaryTemplate, ShipSalaryAssignment } from '@/lib/salary-store';

interface MappingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingAssignment: ShipSalaryAssignment | null;
  ships: Ship[];
  unmappedShips: Ship[];
  templates: SalaryTemplate[];
  selectedShipIds: string[];
  selectedTemplateId: string;
  onShipIdsChange: (ids: string[]) => void;
  onTemplateIdChange: (id: string) => void;
  onSave: () => void;
}

export default function MappingDialog({
  open,
  onOpenChange,
  editingAssignment,
  ships,
  unmappedShips,
  templates,
  selectedShipIds,
  selectedTemplateId,
  onShipIdsChange,
  onTemplateIdChange,
  onSave,
}: MappingDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editingAssignment ? '급여 템플릿 매칭 수정' : '새 급여 템플릿 매칭'}
          </DialogTitle>
          <DialogDescription>
            {editingAssignment 
              ? '선박의 급여 템플릿을 변경합니다.'
              : '하나 이상의 선박에 급여 템플릿을 적용합니다.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>선박 선택</Label>
            {editingAssignment ? (
              <Select
                value={selectedShipIds[0] || ''}
                onValueChange={(value) => onShipIdsChange([value])}
              >
                <SelectTrigger>
                  <SelectValue placeholder="선박을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {ships.map((ship) => (
                    <SelectItem key={ship.id} value={String(ship.id)}>
                      {ship.name} (IMO: {ship.imo_number})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="border rounded-lg p-4 max-h-48 overflow-y-auto space-y-2">
                {unmappedShips.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">
                    모든 선박이 이미 매칭되었습니다.
                  </p>
                ) : (
                  unmappedShips.map((ship) => (
                    <label
                      key={ship.id}
                      className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedShipIds.includes(ship.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            onShipIdsChange([...selectedShipIds, ship.id]);
                          } else {
                            onShipIdsChange(selectedShipIds.filter(id => id !== ship.id));
                          }
                        }}
                        className="w-4 h-4"
                      />
                      <div className="flex-1">
                        <p className="font-medium">{ship.name}</p>
                        <p className="text-sm text-gray-500">IMO: {ship.imo_number}</p>
                      </div>
                    </label>
                  ))
                )}
              </div>
            )}
            {!editingAssignment && selectedShipIds.length > 0 && (
              <p className="text-sm text-gray-600">
                {selectedShipIds.length}개 선박 선택됨
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>급여 템플릿</Label>
            <Select
              value={selectedTemplateId}
              onValueChange={onTemplateIdChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="급여 템플릿을 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={String(template.id)}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={onSave}>
            {editingAssignment ? '수정' : '적용'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}