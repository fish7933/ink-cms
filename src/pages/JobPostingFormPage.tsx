import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { msg } from '@/lib/messages';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/store';
import { useTabContext } from '@/contexts/TabContext';
import { jobPostingGroupService } from '@/services/job-posting-group.service';
import { JobPostingReadOnlyView } from '@/components/job-postings/JobPostingReadOnlyView';
import { JobPostingForm } from '@/components/job-postings/JobPostingForm';
import { useJobPostingData } from '@/components/job-postings/useJobPostingData';
import type { JobPostingGroupWithDetails } from '@/types/models';
import type { RankWithSalary, SelectedRankDetail, SalaryTemplateItem } from '@/components/job-postings/types';

export default function JobPostingFormPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { closeTab, activeTabId, updateTab } = useTabContext();

  const [posting, setPosting] = useState<JobPostingGroupWithDetails | null>(null);
  const [loadingPosting, setLoadingPosting] = useState(Boolean(id));

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoadingPosting(true);
      const data = await jobPostingGroupService.getById(id);
      setPosting(data);
      if (data && activeTabId) {
        updateTab(activeTabId, { title: `공고 수정: ${data.ship_name}` });
      }
      setLoadingPosting(false);
    })();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

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
  } = useJobPostingData(true, posting);

  const [crewRecommendationOpen, setCrewRecommendationOpen] = useState(false);
  const [selectedRankForRecommendation, setSelectedRankForRecommendation] = useState<SelectedRankDetail | null>(null);

  const finish = (saved: boolean) => {
    if (saved) {
      window.dispatchEvent(new CustomEvent('job-posting-data-changed'));
    }
    if (activeTabId) closeTab(activeTabId);
    else navigate('/job-postings');
  };

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

  const buildRankDetail = (rank: RankWithSalary): SelectedRankDetail => {
    let contractMonths = 0;
    if (selectedCompany) {
      contractMonths = rank.rank_category === 'officer'
        ? (selectedCompany.default_officer_contract_months || 0)
        : (selectedCompany.default_rating_contract_months || 0);
    }
    return {
      rank_id: rank.id,
      rank_name: rank.name,
      rank_code: rank.rank_code,
      department: rank.department,
      base_salary: rank.base_salary,
      currency: rank.currency,
      contract_months: contractMonths,
      positions_available: 1,
      preferred_nationalities: [],
    };
  };

  const handleSelectAllRanks = (ranks: RankWithSalary[]) => {
    setSelectedRankDetails(prev => {
      const existingIds = new Set(prev.map(r => r.rank_id));
      const additions = ranks.filter(r => !existingIds.has(r.id)).map(buildRankDetail);
      return [...prev, ...additions];
    });
  };

  const handleClearRanks = (rankIds: string[]) => {
    const idsToClear = new Set(rankIds);
    setSelectedRankDetails(prev => prev.filter(r => !idsToClear.has(r.rank_id)));
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
    if (saved) finish(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.company_id || !formData.ship_id || !formData.embarkation_date) {
      alert('필수 항목을 모두 입력해주세요.');
      return;
    }

    if (selectedRankDetails.length === 0) {
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
      const confirmed = confirm(msg.jobPosting.duplicateWarning(warningMessage));
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

      finish(true);
    } catch (error) {
      console.error('Failed to save job posting:', error);
      alert(msg.jobPosting.saveFailed(error instanceof Error ? error.message : '알 수 없는 오류'));
    }
  };

  if (loadingPosting || !currentUser) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3" />
          <p className="text-sm text-gray-600">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (isReadOnly && posting) {
    return (
      <div className="max-w-5xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
        <div className="mb-3">
          <Button variant="ghost" size="sm" className="h-8 px-2 gap-1" onClick={() => finish(false)}>
            <ArrowLeft className="w-4 h-4" />목록
          </Button>
        </div>
        <JobPostingReadOnlyView
          posting={posting}
          shipDetails={shipDetails}
          selectedRankDetails={selectedRankDetails}
          manningAgencies={manningAgencies}
          crewRecommendationOpen={crewRecommendationOpen}
          selectedRankForRecommendation={selectedRankForRecommendation}
          onClose={finish}
          onRecommendCrew={handleRecommendCrew}
          onCrewRecommendationClose={handleCrewRecommendationClose}
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
      <div className="mb-3">
        <Button variant="ghost" size="sm" className="h-8 px-2 gap-1" onClick={() => finish(false)}>
          <ArrowLeft className="w-4 h-4" />목록
        </Button>
      </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{posting ? '구인 공고 수정' : '다직급 구인 공고 등록'}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingExistingData && (
            <div className="text-center py-4 text-muted-foreground">기존 데이터를 불러오는 중...</div>
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
            onSelectAllRanks={handleSelectAllRanks}
            onClearRanks={handleClearRanks}
            onUpdateRankDetail={handleUpdateRankDetail}
            onUpdateRankNationalities={handleUpdateRankNationalities}
            onRemoveRank={handleRemoveRank}
            onFormDataChange={handleFormDataChange}
            onAgencyToggle={handleAgencyToggle}
            onSubmit={handleSubmit}
            onCancel={() => finish(false)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
