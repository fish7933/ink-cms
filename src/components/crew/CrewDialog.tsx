import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { Rank } from '@/types/models';

interface CrewFormData {
  name: string;
  nationality: string;
  date_of_birth: string;
  rank: string;
  email: string;
  phone: string;
  passport_no: string;
  seaman_book_no: string;
}

interface CrewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formData: CrewFormData;
  onFormDataChange: (data: CrewFormData) => void;
  onSubmit: (e: React.FormEvent) => void;
  isEditing: boolean;
  ranks: Rank[];
}

export default function CrewDialog({
  open,
  onOpenChange,
  formData,
  onFormDataChange,
  onSubmit,
  isEditing,
  ranks,
}: CrewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? '선원 정보 수정' : '선원 등록'}</DialogTitle>
          <DialogDescription>선원의 기본 정보를 입력하세요</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">이름 *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => onFormDataChange({...formData, name: e.target.value})}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nationality">국적 *</Label>
              <Input
                id="nationality"
                value={formData.nationality}
                onChange={(e) => onFormDataChange({...formData, nationality: e.target.value})}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date_of_birth">생년월일 *</Label>
              <Input
                id="date_of_birth"
                type="date"
                value={formData.date_of_birth}
                onChange={(e) => onFormDataChange({...formData, date_of_birth: e.target.value})}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rank">직급 *</Label>
              <select
                id="rank"
                value={formData.rank}
                onChange={(e) => onFormDataChange({...formData, rank: e.target.value})}
                className="w-full h-10 px-3 rounded-md border border-input bg-background"
                required
              >
                <option value="">선택하세요</option>
                {ranks.map(rank => (
                  <option key={rank.id} value={rank.rank_code}>
                    {rank.rank_code} - {rank.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">이메일 *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => onFormDataChange({...formData, email: e.target.value})}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">전화번호 *</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => onFormDataChange({...formData, phone: e.target.value})}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="passport_no">여권번호</Label>
              <Input
                id="passport_no"
                value={formData.passport_no}
                onChange={(e) => onFormDataChange({...formData, passport_no: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="seaman_book_no">선원수첩번호</Label>
              <Input
                id="seaman_book_no"
                value={formData.seaman_book_no}
                onChange={(e) => onFormDataChange({...formData, seaman_book_no: e.target.value})}
              />
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="submit" className="flex-1">
              {isEditing ? '수정' : '등록'}
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