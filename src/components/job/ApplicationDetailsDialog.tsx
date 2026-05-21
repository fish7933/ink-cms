import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import type { JobApplication, CrewMember } from '@/types/models';

interface ApplicationDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  application: JobApplication | null;
  crewMember: CrewMember | null;
}

export default function ApplicationDetailsDialog({
  open,
  onOpenChange,
  application,
  crewMember,
}: ApplicationDetailsDialogProps) {
  if (!application || !crewMember) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>지원자 상세 정보</DialogTitle>
          <DialogDescription>지원자의 상세 정보를 확인하세요</DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-medium text-gray-500">이름</h3>
              <p className="mt-1 text-sm font-semibold">{crewMember.name}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500">국적</h3>
              <p className="mt-1 text-sm">{crewMember.nationality}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500">직급</h3>
              <p className="mt-1 text-sm font-bold">{crewMember.rank}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500">생년월일</h3>
              <p className="mt-1 text-sm">{crewMember.date_of_birth}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500">이메일</h3>
              <p className="mt-1 text-sm">{crewMember.email}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500">전화번호</h3>
              <p className="mt-1 text-sm">{crewMember.phone}</p>
            </div>
          </div>

          {crewMember.experience && crewMember.experience.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">경력</h3>
              <div className="space-y-2">
                {crewMember.experience.map((exp, index) => (
                  <div key={index} className="p-3 bg-gray-50 rounded-md">
                    <p className="font-medium">{exp.ship_name}</p>
                    <p className="text-sm text-gray-600">
                      {exp.rank} | {exp.from_date} ~ {exp.to_date}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {crewMember.certificates && crewMember.certificates.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">자격증</h3>
              <div className="space-y-2">
                {crewMember.certificates.map((cert, index) => (
                  <div key={index} className="p-3 bg-gray-50 rounded-md">
                    <p className="font-medium">{cert.name}</p>
                    <p className="text-sm text-gray-600">
                      발급일: {cert.issue_date} | 만료일: {cert.expiry_date}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {application.comments && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">코멘트</h3>
              <p className="text-sm p-3 bg-gray-50 rounded-md">{application.comments}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}