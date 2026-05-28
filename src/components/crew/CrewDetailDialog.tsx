import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Edit, Trash2, User, ExternalLink } from 'lucide-react';
import type { CrewWithDetails } from '@/services/crew.service';
import CrewStatusBadge from './CrewStatusBadge';
import { supabase } from '@/lib/supabase';

interface Certificate {
  name: string;
  number?: string;
  issued_date?: string;
  expiry_date?: string;
  issuing_authority?: string;
  no_expiry?: boolean;
  file_path?: string;
  file_name?: string;
}

interface CrewDetailDialogProps {
  open: boolean;
  crew: CrewWithDetails | null;
  onClose: () => void;
  onEdit: (crew: CrewWithDetails) => void;
  onDelete: (crew: CrewWithDetails) => void;
}

export function CrewDetailDialog({ open, crew, onClose, onEdit, onDelete }: CrewDetailDialogProps) {
  if (!crew) return null;

  const row = (label: string, value: string | number | undefined | null) =>
    value !== undefined && value !== null && value !== '' ? (
      <div className="flex py-1.5 border-b last:border-0">
        <span className="text-xs text-gray-500 w-36 shrink-0">{label}</span>
        <span className="text-sm font-medium">{value}</span>
      </div>
    ) : null;

  const parseCertificates = (): Certificate[] => {
    if (!crew.certificates) return [];
    try {
      const c = typeof crew.certificates === 'string' ? JSON.parse(crew.certificates) : crew.certificates;
      return Array.isArray(c) ? c : [];
    } catch { return []; }
  };

  const certificates = parseCertificates();

  const openCertFile = (path: string) => {
    const { data } = supabase.storage.from('documents').getPublicUrl(path);
    if (data?.publicUrl) window.open(data.publicUrl, '_blank');
  };

  const formatDate = (d?: string) => {
    if (!d) return '-';
    try { return new Date(d).toLocaleDateString('ko-KR'); } catch { return d; }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>선원 상세 정보</DialogTitle>
        </DialogHeader>

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

        {/* 탭 */}
        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-4 h-9">
            <TabsTrigger value="basic" className="text-xs">기본 정보</TabsTrigger>
            <TabsTrigger value="biodata" className="text-xs">Bio-Data</TabsTrigger>
            <TabsTrigger value="emergency" className="text-xs">비상 연락처</TabsTrigger>
            <TabsTrigger value="certificates" className="text-xs">
              증서 {certificates.length > 0 && <span className="ml-1 bg-blue-100 text-blue-700 rounded-full px-1.5 text-xs">{certificates.length}</span>}
            </TabsTrigger>
          </TabsList>

          {/* 기본 정보 */}
          <TabsContent value="basic" className="mt-3 space-y-0">
            <div className="mb-3">
              <h4 className="text-xs font-semibold text-gray-500 mb-1">개인 정보</h4>
              <div className="bg-gray-50 rounded-md px-3">
                {row('국적', crew.nationality)}
                {row('생년월일', crew.date_of_birth ? `${crew.date_of_birth} (${crew.age}세)` : undefined)}
                {row('여권번호', crew.passport_number)}
                {row('선원수첩번호', crew.seaman_book_number)}
                {row('연락처', crew.contact_phone)}
                {row('이메일', crew.contact_email)}
              </div>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-gray-500 mb-1">배정 정보</h4>
              <div className="bg-gray-50 rounded-md px-3">
                {row('선주사', crew.owner_name)}
                {row('플릿', crew.fleet_name)}
                {row('선박', crew.ship_name)}
                {row('매닝사', crew.manning_agency_name)}
              </div>
            </div>
          </TabsContent>

          {/* Bio-Data */}
          <TabsContent value="biodata" className="mt-3">
            <div className="bg-gray-50 rounded-md px-3">
              {row('출생지', crew.place_of_birth)}
              {row('혈액형', crew.blood_type)}
              {row('키', crew.height ? `${crew.height} cm` : undefined)}
              {row('몸무게', crew.weight ? `${crew.weight} kg` : undefined)}
              {row('신발 사이즈', crew.shoe_size)}
              {row('작업복 사이즈', crew.coverall_size)}
            </div>
            {!crew.height && !crew.weight && !crew.blood_type && !crew.place_of_birth && (
              <div className="text-center py-6 text-sm text-gray-400">입력된 Bio-Data가 없습니다.</div>
            )}
          </TabsContent>

          {/* 비상 연락처 */}
          <TabsContent value="emergency" className="mt-3">
            <div className="bg-gray-50 rounded-md px-3">
              {row('비상연락처 (본인)', crew.emergency_contact)}
              {row('가족 이름', crew.next_of_kin)}
              {row('가족 관계', crew.next_of_kin_relationship)}
              {row('가족 연락처', crew.next_of_kin_contact)}
            </div>
            {!crew.emergency_contact && !crew.next_of_kin && (
              <div className="text-center py-6 text-sm text-gray-400">입력된 비상 연락처가 없습니다.</div>
            )}
          </TabsContent>

          {/* 증서 */}
          <TabsContent value="certificates" className="mt-3">
            {certificates.length === 0 ? (
              <div className="text-center py-6 text-sm text-gray-400">등록된 증서가 없습니다.</div>
            ) : (
              <div className="space-y-2">
                {certificates.map((cert, idx) => (
                  <div key={idx} className="border rounded-md p-3 bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">{cert.name}</span>
                          {cert.no_expiry && <Badge variant="outline" className="text-xs">만료일 없음</Badge>}
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-gray-600">
                          {cert.number && <div><span className="text-gray-400">번호: </span>{cert.number}</div>}
                          {cert.issuing_authority && <div><span className="text-gray-400">발급기관: </span>{cert.issuing_authority}</div>}
                          {cert.issued_date && <div><span className="text-gray-400">발급일: </span>{formatDate(cert.issued_date)}</div>}
                          {!cert.no_expiry && cert.expiry_date && (
                            <div>
                              <span className="text-gray-400">만료일: </span>
                              <span className={new Date(cert.expiry_date) < new Date() ? 'text-red-500 font-medium' : ''}>
                                {formatDate(cert.expiry_date)}
                                {new Date(cert.expiry_date) < new Date() && ' (만료)'}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      {cert.file_path && (
                        <Button variant="ghost" size="sm" onClick={() => openCertFile(cert.file_path!)} className="h-7 text-xs gap-1 text-blue-600 hover:text-blue-700 shrink-0">
                          <ExternalLink className="h-3.5 w-3.5" />사본
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

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