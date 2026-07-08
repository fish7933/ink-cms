import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, X, AlertTriangle, Search, Check, CheckCheck, CircleSlash } from 'lucide-react';
import type { Company, Fleet, Ship, JobPostingGroupWithDetails } from '@/types/models';
import type { Nationality } from '@/types/nationality';
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
  nationalities: Nationality[];
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
  onSelectAllRanks: (ranks: RankWithSalary[]) => void;
  onClearRanks: (rankIds: string[]) => void;
  onUpdateRankDetail: (rankId: string, field: keyof SelectedRankDetail, value: number) => void;
  onUpdateRankGrade: (rankId: string, grade: string) => void;
  onUpdateRankNationalities: (rankId: string, nationalities: string[]) => void;
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
  nationalities,
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
  onSelectAllRanks,
  onClearRanks,
  onUpdateRankDetail,
  onUpdateRankGrade,
  onUpdateRankNationalities,
  onRemoveRank,
  onFormDataChange,
  onAgencyToggle,
  onSubmit,
  onCancel,
}: JobPostingFormProps) {
  const [rankSearch, setRankSearch] = useState('');

  const filteredRanks = useMemo(() => {
    const q = rankSearch.trim().toLowerCase();
    if (!q) return availableRanks;
    return availableRanks.filter(r =>
      r.rank_code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)
    );
  }, [availableRanks, rankSearch]);

  const groupedRanks = useMemo(() => filteredRanks.reduce((acc, rank) => {
    if (!acc[rank.department]) acc[rank.department] = [];
    acc[rank.department].push(rank);
    return acc;
  }, {} as Record<string, RankWithSalary[]>), [filteredRanks]);

  const selectedRankIds = useMemo(() => new Set(selectedRankDetails.map(r => r.rank_id)), [selectedRankDetails]);
  const rankById = useMemo(() => new Map(availableRanks.map(r => [r.id, r])), [availableRanks]);

  // "선원 직급 관리" 순서(availableRanks가 이미 이 순서)와 항상 같게 보이도록,
  // 선택 순서와 무관하게 렌더링 직전에 다시 정렬한다.
  const sortedRankDetails = useMemo(() => {
    const orderIndex = new Map(availableRanks.map((r, i) => [r.id, i]));
    return [...selectedRankDetails].sort((a, b) =>
      (orderIndex.get(a.rank_id) ?? 0) - (orderIndex.get(b.rank_id) ?? 0)
    );
  }, [selectedRankDetails, availableRanks]);

  const companyValue = formData.company_id ? String(formData.company_id) : '';
  const fleetValue = formData.fleet_id ? String(formData.fleet_id) : 'none';
  const shipValue = formData.ship_id ? String(formData.ship_id) : '';

  const toggleNationality = (rankId: string, current: string[], nat: string) => {
    const next = current.includes(nat)
      ? current.filter(n => n !== nat)
      : [...current, nat];
    onUpdateRankNationalities(rankId, next);
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label>선주사 *</Label>
          <Select value={companyValue} onValueChange={onCompanyChange}>
            <SelectTrigger><SelectValue placeholder="선주사 선택" /></SelectTrigger>
            <SelectContent>
              {filteredCompanies.map(company => (
                <SelectItem key={String(company.id)} value={String(company.id)}>{company.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>선대</Label>
          <Select value={fleetValue} onValueChange={onFleetChange} disabled={!formData.company_id || filteredFleets.length === 0}>
            <SelectTrigger><SelectValue placeholder="선대 선택 (선택사항)" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">선대 없음</SelectItem>
              {filteredFleets.map(fleet => (
                <SelectItem key={String(fleet.id)} value={String(fleet.id)}>{fleet.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>선박 *</Label>
          <Select value={shipValue} onValueChange={onShipChange} disabled={!formData.company_id || filteredShips.length === 0}>
            <SelectTrigger><SelectValue placeholder="선박 선택" /></SelectTrigger>
            <SelectContent>
              {filteredShips.map(ship => (
                <SelectItem key={String(ship.id)} value={String(ship.id)}>{ship.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {hasTemplate === false && formData.ship_id && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>선택한 선박에 할당된 급여 템플릿이 없습니다. 직급별 급여는 직접 입력해주세요.</AlertDescription>
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

      {availableRanks.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Label className="mb-0">
              구인 직급 선택 * <span className="text-xs font-normal text-muted-foreground">(여러 직급 선택 가능)</span>
            </Label>
            <div className="flex items-center gap-1.5">
              {selectedRankDetails.length > 0 && (
                <Badge variant="secondary" className="text-xs font-medium">{selectedRankDetails.length}개 선택됨</Badge>
              )}
              <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" onClick={() => onSelectAllRanks(filteredRanks)}>
                <CheckCheck className="h-3.5 w-3.5" />전체 선택
              </Button>
              <Button
                type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1 text-muted-foreground"
                onClick={() => onClearRanks(filteredRanks.map(r => r.id))}
                disabled={selectedRankDetails.length === 0}
              >
                <CircleSlash className="h-3.5 w-3.5" />전체 해제
              </Button>
            </div>
          </div>

          <div className="border rounded-md p-2.5 space-y-2.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={rankSearch}
                onChange={(e) => setRankSearch(e.target.value)}
                placeholder="직급 코드/이름 검색..."
                className="h-8 pl-8 text-xs"
              />
            </div>

            {Object.keys(groupedRanks).length === 0 ? (
              <p className="text-xs text-center text-muted-foreground py-3">검색 결과가 없습니다.</p>
            ) : (
              Object.entries(groupedRanks).map(([department, departmentRanks]) => {
                const deptSelectedCount = departmentRanks.filter(r => selectedRankIds.has(r.id)).length;
                return (
                  <div key={department}>
                    <div className="flex items-center justify-between mb-1.5">
                      <h4 className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                        {departmentLabels[department as keyof typeof departmentLabels]}
                        <span className="text-gray-400 font-normal">{deptSelectedCount}/{departmentRanks.length}</span>
                      </h4>
                      <button
                        type="button"
                        className="text-xs text-blue-600 hover:underline"
                        onClick={() => deptSelectedCount === departmentRanks.length
                          ? onClearRanks(departmentRanks.map(r => r.id))
                          : onSelectAllRanks(departmentRanks)}
                      >
                        {deptSelectedCount === departmentRanks.length ? '부서 해제' : '부서 전체'}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {departmentRanks.map(rank => {
                        const isSelected = selectedRankIds.has(rank.id);
                        return (
                          <button
                            type="button"
                            key={rank.id}
                            onClick={() => onRankToggle(rank)}
                            title={rank.has_salary ? `${rank.name} · 템플릿 급여 적용됨` : `${rank.name} · 급여 직접 입력 필요`}
                            className={`group relative flex items-center gap-1 pl-2.5 pr-2 py-1 rounded-full text-xs font-medium border transition-all ${
                              isSelected
                                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                : `${departmentColors[department as keyof typeof departmentColors]} hover:brightness-95`
                            }`}
                          >
                            {isSelected && <Check className="h-3 w-3" />}
                            {rank.rank_code}
                            <span
                              className={`inline-block w-1.5 h-1.5 rounded-full ${
                                rank.has_salary ? (isSelected ? 'bg-white' : 'bg-green-500') : (isSelected ? 'bg-white/50' : 'bg-gray-300')
                              }`}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500" />급여 템플릿 적용됨
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-300 ml-2" />직접 입력 필요
          </p>
        </div>
      )}

      {selectedRankDetails.length > 0 && (
        <div>
          <Label>선택된 직급 상세 ({selectedRankDetails.length}개 직급)</Label>
          <div className="border rounded-md divide-y">
            {sortedRankDetails.map((detail) => {
              const grades = rankById.get(detail.rank_id)?.grades || [];
              return (
              <div key={detail.rank_id} className="p-3">
                <div className="flex items-center gap-3 mb-3">
                  <Badge className={`${departmentColors[detail.department as keyof typeof departmentColors]} shrink-0`}>
                    {detail.rank_code}
                  </Badge>
                  <div className={`flex-1 grid gap-2 ${grades.length > 0 ? 'grid-cols-4' : 'grid-cols-3'}`}>
                    {grades.length > 0 && (
                      <div>
                        <Label className="text-xs">등급</Label>
                        <Select value={detail.salary_grade || ''} onValueChange={(g) => onUpdateRankGrade(detail.rank_id, g)}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="등급" /></SelectTrigger>
                          <SelectContent>
                            {grades.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
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

                {/* 선호 국적 선택 — 한 줄에 다 들어가도록 세로로 안 늘어나고 가로 스크롤 */}
                <div className="flex items-center gap-2 min-w-0">
                  <Label className="text-xs text-gray-500 shrink-0 whitespace-nowrap">선호 국적</Label>
                  <div className="flex items-center gap-1.5 overflow-x-auto flex-nowrap py-0.5 min-w-0">
                    {nationalities.length === 0 && (
                      <p className="text-xs text-muted-foreground whitespace-nowrap">등록된 주요 송출국이 없습니다. "선원 국적 관리"에서 등록해주세요.</p>
                    )}
                    {nationalities.map(nat => {
                      const selected = (detail.preferred_nationalities || []).includes(nat.country_name_ko);
                      return (
                        <button
                          key={nat.id}
                          type="button"
                          onClick={() => toggleNationality(detail.rank_id, detail.preferred_nationalities || [], nat.country_name_ko)}
                          className={`shrink-0 px-2.5 py-1 rounded-md text-xs border transition-colors font-medium whitespace-nowrap ${
                            selected
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          {nat.country_name_ko}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              );
            })}
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
            <label htmlFor="urgency" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
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
        <div className="flex items-center justify-between mb-1.5">
          <Label className="mb-0">공개 대상 매닝사 * (필수)</Label>
          {manningAgencies.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Badge variant="secondary" className="text-xs font-medium">{formData.visible_to_agencies.length}개 선택됨</Badge>
              <Button
                type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1"
                onClick={() => onFormDataChange('visible_to_agencies', manningAgencies.map(a => String(a.id)))}
              >
                <CheckCheck className="h-3.5 w-3.5" />전체 선택
              </Button>
              <Button
                type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1 text-muted-foreground"
                onClick={() => onFormDataChange('visible_to_agencies', [])}
                disabled={formData.visible_to_agencies.length === 0}
              >
                <CircleSlash className="h-3.5 w-3.5" />전체 해제
              </Button>
            </div>
          )}
        </div>
        <div className="border rounded-md p-3">
          <div className="flex flex-wrap gap-2">
            {manningAgencies.map(agency => {
              const aid = String(agency.id);
              const isSelected = formData.visible_to_agencies.map(String).includes(aid);
              return (
                <Badge
                  key={aid}
                  variant={isSelected ? "default" : "outline"}
                  className="cursor-pointer px-3 py-1.5 gap-1"
                  onClick={() => onAgencyToggle(aid)}
                >
                  {isSelected && <Check className="h-3 w-3" />}
                  {agency.name}
                </Badge>
              );
            })}
          </div>
          {manningAgencies.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-2">등록된 매닝사가 없습니다.</p>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          최소 1개 이상의 매닝사를 선택해야 합니다. 선택한 매닝사에만 공개됩니다.
        </p>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>취소</Button>
        <Button type="submit" disabled={selectedRankDetails.length === 0 || isLoadingExistingData}>
          {posting ? '수정' : `${selectedRankDetails.length}개 직급 공고 등록`}
        </Button>
      </div>
    </form>
  );
}