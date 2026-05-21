import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, X, AlertTriangle } from 'lucide-react';
import type { Company, Fleet, Ship, JobPostingGroupWithDetails } from '@/types/models';
import type { RankWithSalary, SelectedRankDetail, DuplicateWarning } from './types';
import { departmentLabels, departmentColors } from './utils';

interface JobPostingFormProps {
  formData: {
    company_id: string;
    fleet_id: string;
    ship_id: string;
    embarkation_date: string;
    application_deadline: string;
    remarks: string;
    visible_to_agencies: string[];
    urgency: 'urgent' | 'normal';
  };
  filteredCompanies: Company[];
  filteredFleets: Fleet[];
  filteredShips: Ship[];
  manningAgencies: Company[];
  availableRanks: RankWithSalary[];
  selectedRankDetails: SelectedRankDetail[];
  hasTemplate: boolean | null;
  duplicateWarnings: DuplicateWarning[];
  showDuplicateWarning: boolean;
  isLoadingExistingData: boolean;
  posting: JobPostingGroupWithDetails | null;
  onCompanyChange: (companyId: string) => void;
  onFleetChange: (fleetId: string) => void;
  onShipChange: (shipId: string) => void;
  onRankToggle: (rank: RankWithSalary) => void;
  onUpdateRankDetail: (rankId: string, field: keyof SelectedRankDetail, value: number) => void;
  onRemoveRank: (rankId: string) => void;
  onFormDataChange: (field: string, value: string | string[]) => void;
  onAgencyToggle: (agencyId: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}

export function JobPostingForm({
  formData,
  filteredCompanies,
  filteredFleets,
  filteredShips,
  manningAgencies,
  availableRanks,
  selectedRankDetails,
  hasTemplate,
  duplicateWarnings,
  showDuplicateWarning,
  isLoadingExistingData,
  posting,
  onCompanyChange,
  onFleetChange,
  onShipChange,
  onRankToggle,
  onUpdateRankDetail,
  onRemoveRank,
  onFormDataChange,
  onAgencyToggle,
  onSubmit,
  onCancel,
}: JobPostingFormProps) {
  const groupedRanks = availableRanks.reduce((acc, rank) => {
    if (!acc[rank.department]) {
      acc[rank.department] = [];
    }
    acc[rank.department].push(rank);
    return acc;
  }, {} as Record<string, RankWithSalary[]>);

  // Ensure all IDs are strings for Select component matching
  const companyValue = formData.company_id ? String(formData.company_id) : '';
  const fleetValue = formData.fleet_id ? String(formData.fleet_id) : 'none';
  const shipValue = formData.ship_id ? String(formData.ship_id) : '';

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label>선주사 *</Label>
          <Select value={companyValue} onValueChange={onCompanyChange}>
            <SelectTrigger>
              <SelectValue placeholder="선주사 선택" />
            </SelectTrigger>
            <SelectContent>
              {filteredCompanies.map(company => (
                <SelectItem key={String(company.id)} value={String(company.id)}>
                  {company.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>선대</Label>
          <Select 
            value={fleetValue} 
            onValueChange={onFleetChange} 
            disabled={!formData.company_id || filteredFleets.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder="선대 선택 (선택사항)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">선대 없음</SelectItem>
              {filteredFleets.map(fleet => (
                <SelectItem key={String(fleet.id)} value={String(fleet.id)}>
                  {fleet.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>선박 *</Label>
          <Select 
            value={shipValue} 
            onValueChange={onShipChange} 
            disabled={!formData.company_id || filteredShips.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder="선박 선택" />
            </SelectTrigger>
            <SelectContent>
              {filteredShips.map(ship => (
                <SelectItem key={String(ship.id)} value={String(ship.id)}>
                  {ship.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {hasTemplate === false && formData.ship_id && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            선택한 선박에 할당된 급여 템플릿이 없습니다.
          </AlertDescription>
        </Alert>
      )}

      {showDuplicateWarning && duplicateWarnings.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>중복 공고 경고 (동일 선박)</AlertTitle>
          <AlertDescription>
            <div className="space-y-2 mt-2">
              {duplicateWarnings.map((warning) => (
                <div key={warning.rank_id} className="text-sm">
                  <div className="font-semibold">{warning.rank_code}</div>
                  <ul className="list-disc list-inside ml-2 mt-1">
                    {warning.existing_postings.map((existing) => (
                      <li key={existing.id}>
                        {new Date(existing.embarkation_date).toLocaleDateString('ko-KR')}
                        {' '}({existing.days_difference}일 차이)
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {hasTemplate === true && availableRanks.length > 0 && (
        <div>
          <Label>구인 직급 선택 * (여러 직급 선택 가능)</Label>
          <div className="border rounded-md p-3 space-y-3">
            {Object.entries(groupedRanks).map(([department, departmentRanks]) => (
              <div key={department}>
                <h4 className="text-xs font-semibold mb-2 text-gray-600">
                  {departmentLabels[department as keyof typeof departmentLabels]}
                </h4>
                <div className="flex flex-wrap gap-2">
                  {departmentRanks.map(rank => (
                    <Badge
                      key={rank.id}
                      variant={selectedRankDetails.some(r => r.rank_id === rank.id) ? "default" : "outline"}
                      className={`cursor-pointer px-3 py-1.5 text-sm ${
                        selectedRankDetails.some(r => r.rank_id === rank.id) 
                          ? '' 
                          : departmentColors[department as keyof typeof departmentColors]
                      }`}
                      onClick={() => onRankToggle(rank)}
                    >
                      {rank.rank_code}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            여러 직급을 선택하여 하나의 공고로 등록할 수 있습니다.
          </p>
        </div>
      )}

      {selectedRankDetails.length > 0 && (
        <div>
          <Label>선택된 직급 상세 ({selectedRankDetails.length}개 직급)</Label>
          <div className="border rounded-md divide-y">
            {selectedRankDetails.map((detail) => (
              <div key={detail.rank_id} className="p-2 flex items-center gap-3">
                <Badge className={`${departmentColors[detail.department as keyof typeof departmentColors]} shrink-0`}>
                  {detail.rank_code}
                </Badge>
                <div className="flex-1 grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">급여</Label>
                    <Input
                      type="number"
                      value={detail.base_salary}
                      onChange={(e) => onUpdateRankDetail(detail.rank_id, 'base_salary', parseFloat(e.target.value) || 0)}
                      className="h-7 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">계약(월)</Label>
                    <Input
                      type="number"
                      min="1"
                      value={detail.contract_months}
                      onChange={(e) => onUpdateRankDetail(detail.rank_id, 'contract_months', parseInt(e.target.value) || 0)}
                      className="h-7 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">인원</Label>
                    <Input
                      type="number"
                      min="1"
                      value={detail.positions_available}
                      onChange={(e) => onUpdateRankDetail(detail.rank_id, 'positions_available', parseInt(e.target.value) || 1)}
                      className="h-7 text-xs"
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemoveRank(detail.rank_id)}
                  className="h-7 w-7 p-0 shrink-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label>승선예정일 *</Label>
          <Input
            type="date"
            value={formData.embarkation_date}
            onChange={(e) => onFormDataChange('embarkation_date', e.target.value)}
          />
        </div>

        <div>
          <Label>공고마감일</Label>
          <Input
            type="date"
            value={formData.application_deadline}
            onChange={(e) => onFormDataChange('application_deadline', e.target.value)}
          />
        </div>

        <div>
          <Label>긴급 여부</Label>
          <div className="flex items-center space-x-2 h-10">
            <Checkbox
              id="urgency"
              checked={formData.urgency === 'urgent'}
              onCheckedChange={(checked) => onFormDataChange('urgency', checked ? 'urgent' : 'normal')}
            />
            <label
              htmlFor="urgency"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              긴급 구인
            </label>
          </div>
        </div>
      </div>

      <div>
        <Label>비고</Label>
        <Textarea
          value={formData.remarks}
          onChange={(e) => onFormDataChange('remarks', e.target.value)}
          placeholder="자격증, 경력, 특이사항 등"
          rows={3}
        />
      </div>

      <div>
        <Label>공개 대상 매닝사 * (필수)</Label>
        <div className="border rounded-md p-3">
          <div className="flex flex-wrap gap-2">
            {manningAgencies.map(agency => {
              const aid = String(agency.id);
              return (
                <Badge
                  key={aid}
                  variant={formData.visible_to_agencies.map(String).includes(aid) ? "default" : "outline"}
                  className="cursor-pointer px-3 py-1.5"
                  onClick={() => onAgencyToggle(aid)}
                >
                  {agency.name}
                </Badge>
              );
            })}
          </div>
          {manningAgencies.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-2">
              등록된 매닝사가 없습니다.
            </p>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          최소 1개 이상의 매닝사를 선택해야 합니다. 선택한 매닝사에만 공개됩니다.
        </p>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          취소
        </Button>
        <Button type="submit" disabled={selectedRankDetails.length === 0 || isLoadingExistingData}>
          {posting ? '수정' : `${selectedRankDetails.length}개 직급 공고 등록`}
        </Button>
      </div>
    </form>
  );
}