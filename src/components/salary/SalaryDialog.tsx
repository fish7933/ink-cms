import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { Ship } from '@/types/models';

interface SalaryFormData {
  ship_id: string;
  rank: string;
  onboard_salary: string;
  leave_salary: string;
  special_allowance: string;
  currency: string;
}

interface SalaryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formData: SalaryFormData;
  onFormDataChange: (data: SalaryFormData) => void;
  onSubmit: (e: React.FormEvent) => void;
  isEditing: boolean;
  ships: Ship[];
}

export default function SalaryDialog({
  open,
  onOpenChange,
  formData,
  onFormDataChange,
  onSubmit,
  isEditing,
  ships,
}: SalaryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? '급여 수정' : '급여 추가'}</DialogTitle>
          <DialogDescription>급여 정보를 입력하세요</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ship_id">선박</Label>
            <select
              id="ship_id"
              value={formData.ship_id}
              onChange={(e) => onFormDataChange({...formData, ship_id: e.target.value})}
              className="w-full h-10 px-3 rounded-md border border-input bg-background"
            >
              <option value="">선택하세요</option>
              {ships.map(ship => (
                <option key={ship.id} value={ship.id}>{ship.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rank">직급 코드 *</Label>
            <Input
              id="rank"
              value={formData.rank}
              onChange={(e) => onFormDataChange({...formData, rank: e.target.value})}
              placeholder="예: MSTR, C/O, 2/O"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="onboard_salary">승선 급여 *</Label>
              <Input
                id="onboard_salary"
                type="number"
                value={formData.onboard_salary}
                onChange={(e) => onFormDataChange({...formData, onboard_salary: e.target.value})}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="leave_salary">휴가 급여 *</Label>
              <Input
                id="leave_salary"
                type="number"
                value={formData.leave_salary}
                onChange={(e) => onFormDataChange({...formData, leave_salary: e.target.value})}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="special_allowance">특별 수당</Label>
            <Input
              id="special_allowance"
              type="number"
              value={formData.special_allowance}
              onChange={(e) => onFormDataChange({...formData, special_allowance: e.target.value})}
              placeholder="선택사항"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="currency">통화 *</Label>
            <select
              id="currency"
              value={formData.currency}
              onChange={(e) => onFormDataChange({...formData, currency: e.target.value})}
              className="w-full h-10 px-3 rounded-md border border-input bg-background"
              required
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="KRW">KRW</option>
            </select>
          </div>
          <div className="flex gap-2 pt-4">
            <Button type="submit" className="flex-1">
              {isEditing ? '수정' : '추가'}
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              취소
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}