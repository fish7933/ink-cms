import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { UserPlus } from 'lucide-react';
import { CrewRecommendationDialog } from '@/components/crew/CrewRecommendationDialog';
import type { JobPostingGroupWithDetails, Ship, Company } from '@/types/models';
import type { SelectedRankDetail } from './types';
import { departmentColors } from './utils';

interface JobPostingReadOnlyViewProps {
  open: boolean;
  posting: JobPostingGroupWithDetails;
  shipDetails: Ship | null;
  selectedRankDetails: SelectedRankDetail[];
  manningAgencies: Company[];
  crewRecommendationOpen: boolean;
  selectedRankForRecommendation: SelectedRankDetail | null;
  onClose: (saved: boolean) => void;
  onRecommendCrew: (rankDetail: SelectedRankDetail) => void;
  onCrewRecommendationClose: (saved: boolean) => void;
}

export function JobPostingReadOnlyView({
  open,
  posting,
  shipDetails,
  selectedRankDetails,
  manningAgencies,
  crewRecommendationOpen,
  selectedRankForRecommendation,
  onClose,
  onRecommendCrew,
  onCrewRecommendationClose,
}: JobPostingReadOnlyViewProps) {
  const getAgencyNames = (agencyIds: string[]) => {
    if (!agencyIds || agencyIds.length === 0) return '전체 매닝사';
    
    const agencies = manningAgencies.filter(a => agencyIds.includes(a.id));
    if (agencies.length === 0) return '전체 매닝사';
    return agencies.map(a => a.name).join(', ');
  };

  return (
    <>
      <Dialog open={open} onOpenChange={() => onClose(false)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>구인 공고 및 선원 추천</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Company and Ship Basic Info */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-500">선주사</Label>
                <p className="text-sm font-medium mt-0.5">{posting.company_name}</p>
              </div>
              <div>
                <Label className="text-xs text-gray-500">선박명</Label>
                <p className="text-sm font-medium mt-0.5">{posting.ship_name}</p>
              </div>
            </div>

            {/* Detailed Ship Information */}
            {shipDetails && (
              <div className="border rounded-lg p-4 bg-gray-50 space-y-3">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">선박 상세 정보</h3>
                
                {/* Basic Ship Specs */}
                <div className="grid grid-cols-3 gap-3">
                  {shipDetails.imo_number && (
                    <div>
                      <Label className="text-xs text-gray-500">IMO 번호</Label>
                      <p className="text-sm mt-0.5">{shipDetails.imo_number}</p>
                    </div>
                  )}
                  {shipDetails.ship_type && (
                    <div>
                      <Label className="text-xs text-gray-500">선종</Label>
                      <p className="text-sm mt-0.5">{shipDetails.ship_type}</p>
                    </div>
                  )}
                  {shipDetails.flag && (
                    <div>
                      <Label className="text-xs text-gray-500">선적국</Label>
                      <p className="text-sm mt-0.5">{shipDetails.flag}</p>
                    </div>
                  )}
                </div>

                {/* Tonnage and Dimensions */}
                <div className="grid grid-cols-4 gap-3">
                  {shipDetails.gross_tonnage && (
                    <div>
                      <Label className="text-xs text-gray-500">총톤수 (GT)</Label>
                      <p className="text-sm mt-0.5">{shipDetails.gross_tonnage.toLocaleString()}</p>
                    </div>
                  )}
                  {shipDetails.dwt && (
                    <div>
                      <Label className="text-xs text-gray-500">재화중량톤 (DWT)</Label>
                      <p className="text-sm mt-0.5">{shipDetails.dwt.toLocaleString()}</p>
                    </div>
                  )}
                  {shipDetails.length_overall && (
                    <div>
                      <Label className="text-xs text-gray-500">전장 (m)</Label>
                      <p className="text-sm mt-0.5">{shipDetails.length_overall}</p>
                    </div>
                  )}
                  {shipDetails.breadth && (
                    <div>
                      <Label className="text-xs text-gray-500">선폭 (m)</Label>
                      <p className="text-sm mt-0.5">{shipDetails.breadth}</p>
                    </div>
                  )}
                </div>

                {/* Build Info and Classification */}
                <div className="grid grid-cols-3 gap-3">
                  {shipDetails.built_year && (
                    <div>
                      <Label className="text-xs text-gray-500">건조년도</Label>
                      <p className="text-sm mt-0.5">{shipDetails.built_year}</p>
                    </div>
                  )}
                  {shipDetails.builder && (
                    <div>
                      <Label className="text-xs text-gray-500">건조사</Label>
                      <p className="text-sm mt-0.5">{shipDetails.builder}</p>
                    </div>
                  )}
                  {shipDetails.classification_society && (
                    <div>
                      <Label className="text-xs text-gray-500">선급</Label>
                      <p className="text-sm mt-0.5">{shipDetails.classification_society}</p>
                    </div>
                  )}
                </div>

                {/* Engine and Speed */}
                <div className="grid grid-cols-3 gap-3">
                  {shipDetails.engine_type && (
                    <div>
                      <Label className="text-xs text-gray-500">엔진 타입</Label>
                      <p className="text-sm mt-0.5">{shipDetails.engine_type}</p>
                    </div>
                  )}
                  {shipDetails.engine_power && (
                    <div>
                      <Label className="text-xs text-gray-500">엔진 출력 (kW)</Label>
                      <p className="text-sm mt-0.5">{shipDetails.engine_power.toLocaleString()}</p>
                    </div>
                  )}
                  {shipDetails.speed_service && (
                    <div>
                      <Label className="text-xs text-gray-500">항해속력 (knots)</Label>
                      <p className="text-sm mt-0.5">{shipDetails.speed_service}</p>
                    </div>
                  )}
                </div>

                {/* Additional Info */}
                <div className="grid grid-cols-3 gap-3">
                  {shipDetails.call_sign && (
                    <div>
                      <Label className="text-xs text-gray-500">호출부호</Label>
                      <p className="text-sm mt-0.5">{shipDetails.call_sign}</p>
                    </div>
                  )}
                  {shipDetails.port_of_registry && (
                    <div>
                      <Label className="text-xs text-gray-500">선적항</Label>
                      <p className="text-sm mt-0.5">{shipDetails.port_of_registry}</p>
                    </div>
                  )}
                  {shipDetails.crew_capacity && (
                    <div>
                      <Label className="text-xs text-gray-500">선원 정원</Label>
                      <p className="text-sm mt-0.5">{shipDetails.crew_capacity}명</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Rank Details */}
            <div>
              <Label className="text-xs text-gray-500 mb-2 block">구인 직급 상세</Label>
              <div className="space-y-1.5">
                {selectedRankDetails.map((detail) => (
                  <div key={detail.rank_id} className="flex items-center justify-between p-2 bg-gray-50 rounded-md border">
                    <div className="flex items-center gap-3 flex-1">
                      <Badge className={`${departmentColors[detail.department as keyof typeof departmentColors]} text-xs`}>
                        {detail.rank_code}
                      </Badge>
                      <span className="text-xs text-gray-600">
                        {detail.currency} {detail.base_salary.toLocaleString()}
                      </span>
                      <span className="text-xs text-gray-600">
                        {detail.contract_months}개월
                      </span>
                      <span className="text-xs text-gray-600">
                        {detail.positions_available}명
                      </span>
                    </div>
                    <Button
                      onClick={() => onRecommendCrew(detail)}
                      size="sm"
                      className="h-7 px-2 text-xs"
                    >
                      <UserPlus className="w-3 h-3 mr-1" />
                      추천
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Dates, Urgency, Agencies */}
            <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-md">
              <div>
                <Label className="text-xs text-gray-500">승선예정일</Label>
                <p className="text-sm mt-0.5">
                  {new Date(posting.embarkation_date).toLocaleDateString('ko-KR', {
                    year: '2-digit',
                    month: '2-digit',
                    day: '2-digit',
                  })}
                </p>
              </div>
              <div>
                <Label className="text-xs text-gray-500">공고마감일</Label>
                <p className="text-sm mt-0.5">
                  {posting.application_deadline ? (
                    new Date(posting.application_deadline).toLocaleDateString('ko-KR', {
                      year: '2-digit',
                      month: '2-digit',
                      day: '2-digit',
                    })
                  ) : (
                    '-'
                  )}
                </p>
              </div>
              <div>
                <Label className="text-xs text-gray-500">긴급여부</Label>
                <div className="mt-0.5">
                  {posting.urgency === 'urgent' ? (
                    <Badge variant="destructive" className="text-xs">긴급</Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs">일반</Badge>
                  )}
                </div>
              </div>
              <div>
                <Label className="text-xs text-gray-500">공개 대상</Label>
                <p className="text-sm mt-0.5 truncate" title={getAgencyNames(posting.visible_to_agencies)}>
                  {getAgencyNames(posting.visible_to_agencies)}
                </p>
              </div>
            </div>

            {/* Remarks */}
            {posting.requirements && (
              <div>
                <Label className="text-xs text-gray-500">비고</Label>
                <p className="text-sm mt-1 whitespace-pre-wrap p-2 bg-gray-50 rounded-md">{posting.requirements}</p>
              </div>
            )}

            {/* Close Button */}
            <div className="flex justify-end pt-2">
              <Button onClick={() => onClose(false)} size="sm">
                닫기
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Crew Recommendation Dialog */}
      {selectedRankForRecommendation && (
        <CrewRecommendationDialog
          open={crewRecommendationOpen}
          onClose={onCrewRecommendationClose}
          jobPostingGroupId={posting.id}
          companyId={posting.company_id}
          companyName={posting.company_name}
          fleetId={posting.fleet_id}
          fleetName={posting.fleet_name}
          shipId={posting.ship_id}
          shipName={posting.ship_name}
          rankId={selectedRankForRecommendation.rank_id}
          rankCode={selectedRankForRecommendation.rank_code}
          rankName={selectedRankForRecommendation.rank_name}
          salary={selectedRankForRecommendation.base_salary}
          currency={selectedRankForRecommendation.currency}
          contractMonths={selectedRankForRecommendation.contract_months}
        />
      )}
    </>
  );
}