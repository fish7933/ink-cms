import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Edit, Trash2, User } from 'lucide-react';
import type { CrewWithDetails } from '@/services/crew.service';
import CrewStatusBadge from './CrewStatusBadge';

interface CrewDetailDialogProps {
  open: boolean;
  crew: CrewWithDetails | null;
  onClose: () => void;
  onEdit: (crew: CrewWithDetails) => void;
  onDelete: (crew: CrewWithDetails) => void;
}

export function CrewDetailDialog({ open, crew, onClose, onEdit, onDelete }: CrewDetailDialogProps) {
  if (!crew) return null;

  const row = (label: string, value: string | undefined | null) => (
    value ? (
      <div className="flex py-1.5 border-b last:border-0">
        <span className="text-xs text-gray-500 w-32 shrink-0">{label}</span>
        <span className="text-sm font-medium">{value}</span>
      </div>
    ) : null
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>선원 상세 정보</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 상단 요약 */}
          <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
            {crew.photo_url ? (
              <img src={crew.photo_url} alt={crew.name} className="w-16 h-16 rounded-full object-cover border-2 border-gray-200" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center">
                <User className="w-8 h-8 text-gray-400" />
              </div>
            )}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg font-bold">{crew.name}</span>
                <Badge variant="outline" className="text-xs">{crew.rank_code}</Badge>
                <CrewStatusBadge status={crew.current_status} />
              </div>
              <div className="text-sm text-gray-500">{crew.rank_name} · {crew.manning_agency_name}</div>
            </div>
          </div>

          {/* 기본 정보 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2 border-b pb-1">기본 정보</h3>
            {row('국적', crew.nationality)}
            {row('생년월일', crew.date_of_birth ? `${crew.date_of_birth} (${crew.age}세)` : undefined)}
            {row('여권번호', crew.passport_number)}
            {row('선원수첩번호', crew.seaman_book_number)}
            {row('연락처', crew.contact_phone)}
            {row('이메일', crew.contact_email)}
          </div>

          {/* 배정 정보 */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2 border-b pb-1">배정 정보</h3>
            {row('선주사', crew.owner_name)}
            {row('플릿', crew.fleet_name)}
            {row('선박', crew.ship_name)}
            {row('매닝사', crew.manning_agency_name)}
          </div>

          {/* Bio-Data */}
          {(crew.height || crew.weight || crew.blood_type || crew.place_of_birth) && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 border-b pb-1">Bio-Data</h3>
              {row('출생지', crew.place_of_birth)}
              {row('혈액형', crew.blood_type)}
              {row('키', crew.height ? `${crew.height} cm` : undefined)}
              {row('몸무게', crew.weight ? `${crew.weight} kg` : undefined)}
              {row('신발 사이즈', crew.shoe_size)}
              {row('작업복 사이즈', crew.coverall_size)}
            </div>
          )}

          {/* 비상 연락처 */}
          {(crew.emergency_contact || crew.next_of_kin) && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 border-b pb-1">비상 연락처</h3>
              {row('비상연락처', crew.emergency_contact)}
              {row('가족 이름', crew.next_of_kin)}
              {row('가족 관계', crew.next_of_kin_relationship)}
              {row('가족 연락처', crew.next_of_kin_contact)}
            </div>
          )}
        </div>

        <div className="flex justify-between pt-4 border-t">
          <Button variant="destructive" size="sm" onClick={() => onDelete(crew)} className="gap-1.5">
            <Trash2 className="w-4 h-4" />삭제
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>닫기</Button>
            <Button size="sm" onClick={() => { onClose(); onEdit(crew); }} className="gap-1.5">
              <Edit className="w-4 h-4" />수정
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default CrewDetailDialog;