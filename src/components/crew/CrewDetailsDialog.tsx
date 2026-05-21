import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import type { CrewMember } from '@/types/models';

interface CrewDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  crewMember: CrewMember | null;
}

export default function CrewDetailsDialog({
  open,
  onOpenChange,
  crewMember,
}: CrewDetailsDialogProps) {
  if (!crewMember) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>선원 상세 정보</DialogTitle>
          <DialogDescription>{crewMember.name}님의 상세 정보</DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          {/* Basic Info */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">기본 정보</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">이름</p>
                <p className="font-medium">{crewMember.name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">직급</p>
                <Badge variant="outline">{crewMember.rank}</Badge>
              </div>
              <div>
                <p className="text-sm text-gray-500">국적</p>
                <p className="font-medium">{crewMember.nationality}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">생년월일</p>
                <p className="font-medium">{crewMember.date_of_birth}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">이메일</p>
                <p className="font-medium">{crewMember.email}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">전화번호</p>
                <p className="font-medium">{crewMember.phone}</p>
              </div>
              {crewMember.passport_no && (
                <div>
                  <p className="text-sm text-gray-500">여권번호</p>
                  <p className="font-medium">{crewMember.passport_no}</p>
                </div>
              )}
              {crewMember.seaman_book_no && (
                <div>
                  <p className="text-sm text-gray-500">선원수첩번호</p>
                  <p className="font-medium">{crewMember.seaman_book_no}</p>
                </div>
              )}
            </div>
          </div>

          {/* Experience */}
          {crewMember.experience && crewMember.experience.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">승선 경력</h3>
              <div className="space-y-3">
                {crewMember.experience.map((exp, index) => (
                  <div key={index} className="p-4 bg-gray-50 rounded-lg">
                    <p className="font-medium text-gray-900">{exp.ship_name}</p>
                    <p className="text-sm text-gray-600 mt-1">
                      <Badge variant="outline" className="mr-2">{exp.rank}</Badge>
                      {exp.from_date} ~ {exp.to_date}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Certificates */}
          {crewMember.certificates && crewMember.certificates.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">자격증</h3>
              <div className="space-y-3">
                {crewMember.certificates.map((cert, index) => (
                  <div key={index} className="p-4 bg-gray-50 rounded-lg">
                    <p className="font-medium text-gray-900">{cert.name}</p>
                    <p className="text-sm text-gray-600 mt-1">
                      발급일: {cert.issue_date} | 만료일: {cert.expiry_date}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Documents */}
          {crewMember.documents && crewMember.documents.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">서류</h3>
              <div className="space-y-2">
                {crewMember.documents.map((doc, index) => (
                  <div key={index} className="p-3 bg-gray-50 rounded-lg flex justify-between items-center">
                    <div>
                      <p className="font-medium text-gray-900">{doc.type}</p>
                      <p className="text-sm text-gray-600">{doc.file_name}</p>
                    </div>
                    <p className="text-xs text-gray-500">{doc.upload_date}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}