import { useState } from 'react';
import { msg } from '@/lib/messages';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/store';
import { jobPostingGroupService } from '@/services/job-posting-group.service';
import { JobPostingReadOnlyView } from './JobPostingReadOnlyView';
import { JobPostingForm } from './JobPostingForm';
import { useJobPostingData } from './useJobPostingData';
import type { JobPostingGroupWithDetails } from '@/types/models';
import type { RankWithSalary, SelectedRankDetail, SalaryTemplateItem } from './types';

interface JobPostingDialogProps {
  open: boolean;
  posting: JobPostingGroupWithDetails | null;
  onClose: (saved: boolean) => void;
}

export function JobPostingDialog({ open, posting, onClose }: JobPostingDialogProps) {
  const {
    currentUser,
    filteredCompanies,
    manningAgencies,
    filteredFleets,
    filteredShips,
    availableRanks,
    selectedRankDetails,
    setSelectedRankDetails,
    hasTemplate,
    templateId,
    duplicateWarnings,
    showDuplicateWarning,
    isLoadingExistingData,
    shipDetails,
    formData,
    setFormData,
    selectedCompany,
    setSelectedCompany,
    companies,
    isReadOnly,
    loadFleets,
    loadShips,
    checkShipTemplate,
  } = useJobPostingData(open, posting);

  const [crewRecommendationOpen, setCrewRecommendationOpen] = useState(false);
  const [selectedRankForRecommendation, setSelectedRankForRecommendation] = useState<SelectedRankDetail | null>(null);

  const handleCompanyChange = async (companyId: string) => {
    const cid = String(companyId);
    setFormData(prev => ({ ...prev, company_id: cid, fleet_id: 'none', ship_id: '' }));
    const company = companies.find(c => String(c.id) === cid);
    setSelectedCompany(company || null);
    if (cid) {
      await Promise.all([loadFleets(cid), loadShips(cid)]);
    }
  };

  const handleFleetChange = async (fleetId: string) => {
    const fid = String(fleetId);
    setFormData(prev => ({ ...prev, fleet_id: fid, ship_id: '' }));
    if (formData.company_id) {
      await loadShips(formData.company_id, fid);
    }
  };

  const handleShipChange = async (shipId: string) => {
    const sid = String(shipId);
    setFormData(prev => ({ ...prev, ship_id: sid }));
    if (sid) {
      await checkShipTemplate(sid);
    }
  };

  const handleRankToggle = (rank: RankWithSalary) => {
    setSelectedRankDetails(prev => {
      const exists = prev.find(r => r.rank_id === rank.id);
      if (exists) {
        return prev.filter(r => r.rank_id !== rank.id);
      } else {
        let contractMonths = 0;
        if (selectedCompany) {
          contractMonths = rank.rank_category === 'officer'
            ? (selectedCompany.default_officer_contract_months || 0)
            : (selectedCompany.default_rating_contract_months || 0);
        }
        return [...prev, {
          rank_id: rank.id,
          rank_name: rank.name,
          rank_code: rank.rank_code,
          department: rank.department,
          base_salary: rank.base_salary,
          currency: rank.currency,
          contract_months: contractMonths,
          positions_available: 1,
          preferred_nationalities: [],
        }];
      }
    });
  };

  const handleUpdateRankDetail = (rankId: string, field: keyof SelectedRankDetail, value: number) => {
    setSelectedRankDetails(prev =>
      prev.map(r => r.rank_id === rankId ? { ...r, [field]: value } : r)
    );
  };

  const handleUpdateRankNationalities = (rankId: string, nationalities: string[]) => {
    setSelectedRankDetails(prev =>
      prev.map(r => r.rank_id === rankId ? { ...r, preferred_nationalities: nationalities } : r)
    );
  };

  const handleRemoveRank = (rankId: string) => {
    setSelectedRankDetails(prev => prev.filter(r => r.rank_id !== rankId));
  };

  const handleFormDataChange = (field: string, value: string | string[]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleAgencyToggle = (agencyId: string) => {
    setFormData(prev => {
      const aid = String(agencyId);
      const agencies = prev.visible_to_agencies.includes(aid)
        ? prev.visible_to_agencies.filter(id => id !== aid)
        : [...prev.visible_to_agencies, aid];
      return { ...prev, visible_to_agencies: agencies };
    });
  };

  const handleRecommendCrew = (rankDetail: SelectedRankDetail) => {
    setSelectedRankForRecommendation(rankDetail);
    setCrewRecommendationOpen(true);
  };

  const handleCrewRecommendationClose = (saved: boolean) => {
    setCrewRecommendationOpen(false);
    setSelectedRankForRecommendation(null);
    if (saved) onClose(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.company_id || !formData.ship_id || !formData.embarkation_date) {
      alert('필수 항목을 모두 입력해주세요.');
      return;
    }

    if (hasTemplate && selectedRankDetails.length === 0) {
      alert('구인할 직급을 최소 1개 이상 선택해주세요.');
      return;
    }

    if (formData.visible_to_agencies.length === 0) {
      alert('공개 대상 매닝사를 최소 1개 이상 선택해주세요.');
      return;
    }

    if (duplicateWarnings.length > 0) {
      const warningMessage = duplicateWarnings.map(w =>
        `${w.rank_code}: ${w.existing_postings.length}개의 유사한 공고 존재`
      ).join('\n');
      const confirmed = confirm(
        msg.jobPosting.duplicateWarning(warningMessage)
      );
      if (!confirmed) return;
    }

    try {
      const authUser = await getCurrentUser();

      const ranksData = await Promise.all(
        selectedRankDetails.map(async (rankDetail) => {
          const { data: templateItems } = await supabase
            .from('salary_template_items')
            .select(`*, component:salary_components(*)`)
            .eq('template_id', templateId)
            .eq('rank', rankDetail.rank_name);

          const components = (templateItems || []).map((item: SalaryTemplateItem) => ({
            component_id: item.component_id,
            component_name: item.component?.name || '',
            amount: item.amount,
          }));

          return {
            rank_id: rankDetail.rank_id,
            positions_available: rankDetail.positions_available,
            contract_months: rankDetail.contract_months,
            salary_template_id: templateId,
            salary_amount: rankDetail.base_salary,
            salary_currency: rankDetail.currency,
            salary_components: components,
            preferred_nationalities: rankDetail.preferred_nationalities || [],
          };
        })
      );

      const postingData = {
        company_id: formData.company_id,
        fleet_id: formData.fleet_id === 'none' ? undefined : formData.fleet_id,
        ship_id: formData.ship_id,
        embarkation_date: formData.embarkation_date,
        application_deadline: formData.application_deadline || undefined,
        requirements: formData.remarks,
        visible_to_agencies: formData.visible_to_agencies,
        preferred_nationalities: [],
        status: formData.status,
        urgency: formData.urgency,
        created_by: authUser?.id,
        ranks: ranksData,
      };

      if (posting) {
        await jobPostingGroupService.update(posting.id, postingData);
      } else {
        await jobPostingGroupService.create(postingData);
      }

      onClose(true);
    } catch (error) {
      console.error('Failed to save job posting:', error);
      alert(msg.jobPosting.saveFailed(error instanceof Error ? error.message : '알 수 없는 오류'));
    }
  };

  if (isReadOnly && posting) {
    return (
      <JobPostingReadOnlyView
        open={open}
        posting={posting}
        shipDetails={shipDetails}
        selectedRankDetails={selectedRankDetails}
        manningAgencies={manningAgencies}
        crewRecommendationOpen={crewRecommendationOpen}
        selectedRankForRecommendation={selectedRankForRecommendation}
        onClose={onClose}
        onRecommendCrew={handleRecommendCrew}
        onCrewRecommendationClose={handleCrewRecommendationClose}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={() => onClose(false)}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{posting ? '구인 공고 수정' : '다직급 구인 공고 등록'}</DialogTitle>
        </DialogHeader>

        {isLoadingExistingData && (
          <div className="text-center py-4 text-muted-foreground">
            기존 데이터를 불러오는 중...
          </div>
        )}

        <JobPostingForm
          formData={formData}
          filteredCompanies={filteredCompanies}
          filteredFleets={filteredFleets}
          filteredShips={filteredShips}
          manningAgencies={manningAgencies}
          availableRanks={availableRanks}
          selectedRankDetails={selectedRankDetails}
          hasTemplate={hasTemplate}
          duplicateWarnings={duplicateWarnings}
          showDuplicateWarning={showDuplicateWarning}
          isLoadingExistingData={isLoadingExistingData}
          posting={posting}
          onCompanyChange={handleCompanyChange}
          onFleetChange={handleFleetChange}
          onShipChange={handleShipChange}
          onRankToggle={handleRankToggle}
          onUpdateRankDetail={handleUpdateRankDetail}
          onUpdateRankNationalities={handleUpdateRankNationalities}
          onRemoveRank={handleRemoveRank}
          onFormDataChange={handleFormDataChange}
          onAgencyToggle={handleAgencyToggle}
          onSubmit={handleSubmit}
          onCancel={() => onClose(false)}
        />
      </DialogContent>
    </Dialog>
  );
}