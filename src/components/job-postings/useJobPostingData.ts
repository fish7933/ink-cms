import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/store';
import { sortRanksByDisplayOrder } from '@/lib/rank-order';
import { supervisorService } from '@/services/supervisor.service';
import { jobPostingGroupService } from '@/services/job-posting-group.service';
import { getMajorSupplierNationalities } from '@/services/nationality.service';
import type { Company, Fleet, Ship, Rank, User, JobPostingGroupWithDetails } from '@/types/models';
import type { Nationality } from '@/types/nationality';
import type { RankWithSalary, SelectedRankDetail, DuplicateWarning, SalaryTemplateItem } from './types';
import { getDefaultEmbarkationDate, getDefaultApplicationDeadline } from './utils';

export function useJobPostingData(open: boolean, posting: JobPostingGroupWithDetails | null) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [filteredCompanies, setFilteredCompanies] = useState<Company[]>([]);
  const [manningAgencies, setManningAgencies] = useState<Company[]>([]);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [filteredFleets, setFilteredFleets] = useState<Fleet[]>([]);
  const [ships, setShips] = useState<Ship[]>([]);
  const [filteredShips, setFilteredShips] = useState<Ship[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [nationalities, setNationalities] = useState<Nationality[]>([]);
  const [availableRanks, setAvailableRanks] = useState<RankWithSalary[]>([]);
  const [selectedRankDetails, setSelectedRankDetails] = useState<SelectedRankDetail[]>([]);
  const [hasTemplate, setHasTemplate] = useState<boolean | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [duplicateWarnings, setDuplicateWarnings] = useState<DuplicateWarning[]>([]);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [isLoadingExistingData, setIsLoadingExistingData] = useState(false);
  const [shipDetails, setShipDetails] = useState<Ship | null>(null);
  
  // Supervisor assignments
  const [supervisedOwnerIds, setSupervisedOwnerIds] = useState<string[]>([]);
  const [supervisedFleetIds, setSupervisedFleetIds] = useState<string[]>([]);
  const [supervisedShipIds, setSupervisedShipIds] = useState<string[]>([]);
  
  const [formData, setFormData] = useState({
    company_id: '',
    fleet_id: 'none',
    ship_id: '',
    embarkation_date: '',
    application_deadline: '',
    remarks: '',
    visible_to_agencies: [] as string[],
    status: 'active' as 'active' | 'filled' | 'cancelled',
    urgency: 'normal' as 'urgent' | 'normal',
  });

  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);

  const isManningOrCrew = currentUser?.role === 'manning_agency' || currentUser?.role === 'crew';
  const isReadOnly = isManningOrCrew && posting !== null;
  const isShipManager = currentUser?.role === 'ship_manager';

  // Load current user and supervisor assignments
  useEffect(() => {
    if (open) {
      loadCurrentUser();
    }
  }, [open]);

  // Load initial data after supervisor assignments are loaded
  useEffect(() => {
    if (open && currentUser) {
      console.log('🔍 [useJobPostingData] Loading initial data with supervisor IDs:', {
        isShipManager,
        supervisedOwnerIds,
        supervisedFleetIds,
        supervisedShipIds,
      });
      loadInitialData();
    }
  }, [open, currentUser, supervisedOwnerIds.length, supervisedFleetIds.length, supervisedShipIds.length]);

  // Load existing posting or reset form
  useEffect(() => {
    if (open && currentUser && companies.length > 0) {
      if (posting) {
        loadExistingPosting();
      } else {
        resetForm();
      }
    }
  }, [open, posting, currentUser, companies.length]);

  // Check for duplicates when embarkation date or selected ranks change
  useEffect(() => {
    if (!isReadOnly && formData.ship_id && formData.embarkation_date && selectedRankDetails.length > 0) {
      checkForDuplicates();
    } else {
      setDuplicateWarnings([]);
      setShowDuplicateWarning(false);
    }
  }, [formData.embarkation_date, selectedRankDetails, formData.ship_id, isReadOnly]);

  const loadCurrentUser = async () => {
    try {
      console.log('🔍 [useJobPostingData] Loading current user...');
      const user = await getCurrentUser();
      setCurrentUser(user);
      
      if (user?.role === 'ship_manager') {
        console.log('🔍 [useJobPostingData] User is ship_manager, loading supervisor assignments...');
        
        const [ownerIds, fleetIds, shipIds] = await Promise.all([
          supervisorService.getSupervisedOwners(user.id),
          supervisorService.getSupervisedFleets(user.id),
          supervisorService.getSupervisedShips(user.id),
        ]);
        
        console.log('✅ [useJobPostingData] Supervisor assignments loaded:', {
          ownerIds,
          fleetIds,
          shipIds,
        });
        
        setSupervisedOwnerIds(ownerIds.map(String));
        setSupervisedFleetIds(fleetIds.map(String));
        setSupervisedShipIds(shipIds.map(String));
      } else {
        console.log('ℹ️ [useJobPostingData] User is not ship_manager, role:', user?.role);
      }
    } catch (error) {
      console.error('❌ [useJobPostingData] Failed to load current user:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      company_id: '',
      fleet_id: 'none',
      ship_id: '',
      embarkation_date: getDefaultEmbarkationDate(),
      application_deadline: getDefaultApplicationDeadline(),
      remarks: '',
      // 새 공고는 기본적으로 전체 매닝사에 공개되도록 시작한다 (필요하면 해제).
      visible_to_agencies: manningAgencies.map(a => String(a.id)),
      status: 'active',
      urgency: 'normal',
    });
    setSelectedRankDetails([]);
    setAvailableRanks([]);
    setHasTemplate(null);
    setDuplicateWarnings([]);
    setShowDuplicateWarning(false);
    setShipDetails(null);
  };

  const loadExistingPosting = async () => {
    if (!posting) return;
    
    setIsLoadingExistingData(true);
    try {
      // Ensure all IDs are strings for Select component compatibility
      const companyId = String(posting.company_id);
      const fleetId = posting.fleet_id ? String(posting.fleet_id) : 'none';
      const shipId = String(posting.ship_id);
      const visibleAgencies = (posting.visible_to_agencies || []).map(String);

      setFormData({
        company_id: companyId,
        fleet_id: fleetId,
        ship_id: shipId,
        embarkation_date: posting.embarkation_date,
        application_deadline: posting.application_deadline || '',
        remarks: posting.requirements || '',
        visible_to_agencies: visibleAgencies,
        status: posting.status,
        urgency: posting.urgency,
      });

      const company = companies.find(c => String(c.id) === companyId);
      setSelectedCompany(company || null);

      // 기존 공고를 불러올 때는 플릿으로 필터링하지 않고 선주사의 전체 선박을 불러온다 —
      // 공고 등록 이후 선박의 플릿이 재배정된 경우에도 이미 배정된 선박이 선택창에서
      // 안 보여서(=해제된 것처럼 보여서) 실수로 다른 선박으로 덮어써지는 걸 방지한다.
      await Promise.all([
        loadFleets(companyId),
        loadShips(companyId),
      ]);

      // 공고 등록 이후 선박/선대의 소속 선주사가 바뀐 경우, owner_id로 스코프된
      // 위 조회 결과에는 더 이상 나타나지 않아 선택창이 빈 값으로 보인다.
      // 공고에 저장된 값은 소속 변경 여부와 무관하게 id로 직접 조회해 강제로 포함시킨다.
      if (fleetId !== 'none') {
        const { data: fleetById } = await supabase.from('fleets').select('*').eq('id', fleetId).maybeSingle();
        if (fleetById) {
          setFleets(prev => prev.some(f => String(f.id) === fleetId) ? prev : [...prev, fleetById]);
          setFilteredFleets(prev => prev.some(f => String(f.id) === fleetId) ? prev : [...prev, fleetById]);
        }
      }
      const { data: shipById } = await supabase.from('ships').select('*').eq('id', shipId).maybeSingle();
      if (shipById) {
        setShips(prev => prev.some(s => String(s.id) === shipId) ? prev : [...prev, shipById]);
        setFilteredShips(prev => prev.some(s => String(s.id) === shipId) ? prev : [...prev, shipById]);
      }

      await loadShipDetails(shipId);
      await checkShipTemplate(shipId);
      await new Promise(resolve => setTimeout(resolve, 500));

      // "선원 직급 관리" 화면 순서(display_order)와 항상 같은 순서로 보여야 하므로,
      // 이미 그 순서로 정렬돼 있는 ranks 목록에서 인덱스를 가져와 정렬한다.
      const rankOrderIndex = new Map(ranks.map((r, i) => [r.id, i]));
      const rankDetails: SelectedRankDetail[] = posting.ranks
        .map(r => ({
          rank_id: r.rank_id,
          rank_name: r.rank_name,
          rank_code: r.rank_code,
          department: r.department,
          base_salary: r.salary_amount || 0,
          currency: r.salary_currency,
          contract_months: r.contract_months || 0,
          positions_available: r.positions_available,
          salary_grade: r.salary_grade || null,
        }))
        .sort((a, b) => (rankOrderIndex.get(a.rank_id) ?? 0) - (rankOrderIndex.get(b.rank_id) ?? 0));

      setSelectedRankDetails(rankDetails);
    } catch (error) {
      console.error('Failed to load existing posting data:', error);
    } finally {
      setIsLoadingExistingData(false);
    }
  };

  const loadShipDetails = async (shipId: string) => {
    try {
      const { data: ship } = await supabase
        .from('ships')
        .select('*')
        .eq('id', shipId)
        .single();
      
      setShipDetails(ship);
    } catch (error) {
      console.error('Failed to load ship details:', error);
      setShipDetails(null);
    }
  };

  const checkForDuplicates = async () => {
    const rankIds = selectedRankDetails.map(r => r.rank_id);
    const warnings = await jobPostingGroupService.checkDuplicates(
      rankIds,
      formData.embarkation_date,
      formData.ship_id,
      posting?.id
    );
    
    setDuplicateWarnings(warnings);
    setShowDuplicateWarning(warnings.length > 0);
  };

  const loadInitialData = async () => {
    try {
      console.log('🔍 [loadInitialData] Starting to load data...');
      
      const [companiesRes, manningRes, ranksRes, nationalitiesData] = await Promise.all([
        supabase.from('companies').select('*').eq('type', 'owner').order('name'),
        supabase.from('companies').select('*').eq('type', 'manning').order('name'),
        supabase.from('ranks').select('*'),
        getMajorSupplierNationalities(),
      ]);
      setNationalities(nationalitiesData);

      if (companiesRes.data) {
        console.log('📋 [loadInitialData] All companies loaded:', companiesRes.data.length);
        setCompanies(companiesRes.data);
        
        // Apply filtering for ship managers
        if (isShipManager && supervisedOwnerIds.length > 0) {
          console.log('🔍 [loadInitialData] Filtering companies for ship_manager...');
          console.log('📋 [loadInitialData] Supervised owner IDs:', supervisedOwnerIds);

          const filtered = companiesRes.data.filter(c => {
            const cid = String(c.id);
            const isSupervised = supervisedOwnerIds.includes(cid);
            console.log(`  - Company ${c.name} (${cid}): ${isSupervised ? '✅ INCLUDED' : '❌ EXCLUDED'}`);
            return isSupervised;
          });

          // 기존 공고를 수정하는 경우, 감독 대상이 아니어도 이미 등록된 선주사는
          // 목록에서 빠지면 선택창이 빈 값으로 보이므로 항상 포함시킨다.
          if (posting?.company_id && !filtered.some(c => String(c.id) === String(posting.company_id))) {
            const current = companiesRes.data.find(c => String(c.id) === String(posting.company_id));
            if (current) filtered.push(current);
          }

          console.log('✅ [loadInitialData] Filtered companies:', filtered.length);
          setFilteredCompanies(filtered);
        } else {
          console.log('ℹ️ [loadInitialData] No filtering applied, showing all companies');
          setFilteredCompanies(companiesRes.data);
        }
      }
      
      if (manningRes.data) {
        console.log('📋 [loadInitialData] Manning agencies loaded:', manningRes.data.length);
        setManningAgencies(manningRes.data);
      }
      
      if (ranksRes.data) {
        console.log('📋 [loadInitialData] Ranks loaded:', ranksRes.data.length);
        setRanks(sortRanksByDisplayOrder(ranksRes.data));
      }
    } catch (error) {
      console.error('❌ [loadInitialData] Failed to load initial data:', error);
    }
  };

  const loadFleets = async (ownerId: string) => {
    try {
      console.log('🔍 [loadFleets] Loading fleets for owner:', ownerId);
      
      const { data } = await supabase
        .from('fleets')
        .select('*')
        .eq('owner_id', ownerId)
        .order('name');
      
      console.log('📋 [loadFleets] All fleets loaded:', data?.length || 0);
      setFleets(data || []);
      
      // Apply filtering for ship managers
      if (isShipManager && supervisedFleetIds.length > 0) {
        console.log('🔍 [loadFleets] Filtering fleets for ship_manager...');
        console.log('📋 [loadFleets] Supervised fleet IDs:', supervisedFleetIds);

        const filtered = (data || []).filter(f => {
          const fid = String(f.id);
          const isSupervised = supervisedFleetIds.includes(fid);
          console.log(`  - Fleet ${f.name} (${fid}): ${isSupervised ? '✅ INCLUDED' : '❌ EXCLUDED'}`);
          return isSupervised;
        });

        // 기존 공고를 수정하는 경우, 감독 대상이 아니어도 이미 등록된 선대는 항상 포함
        if (posting?.fleet_id && !filtered.some(f => String(f.id) === String(posting.fleet_id))) {
          const current = (data || []).find(f => String(f.id) === String(posting.fleet_id));
          if (current) filtered.push(current);
        }

        console.log('✅ [loadFleets] Filtered fleets:', filtered.length);
        setFilteredFleets(filtered);
      } else {
        console.log('ℹ️ [loadFleets] No filtering applied, showing all fleets');
        setFilteredFleets(data || []);
      }
    } catch (error) {
      console.error('❌ [loadFleets] Failed to load fleets:', error);
    }
  };

  const loadShips = async (ownerId: string, fleetId?: string) => {
    try {
      console.log('🔍 [loadShips] Loading ships for owner:', ownerId, 'fleet:', fleetId);
      
      let query = supabase
        .from('ships')
        .select('*')
        .eq('owner_id', ownerId);
      
      if (fleetId && fleetId !== 'none') {
        query = query.eq('fleet_id', fleetId);
      }
      
      const { data } = await query.order('name');
      console.log('📋 [loadShips] All ships loaded:', data?.length || 0);
      setShips(data || []);
      
      // Apply filtering for ship managers
      if (isShipManager && supervisedShipIds.length > 0) {
        console.log('🔍 [loadShips] Filtering ships for ship_manager...');
        console.log('📋 [loadShips] Supervised ship IDs:', supervisedShipIds);

        const filtered = (data || []).filter(s => {
          const sid = String(s.id);
          const isSupervised = supervisedShipIds.includes(sid);
          console.log(`  - Ship ${s.name} (${sid}): ${isSupervised ? '✅ INCLUDED' : '❌ EXCLUDED'}`);
          return isSupervised;
        });

        // 기존 공고를 수정하는 경우, 감독 대상이 아니어도 이미 등록된 선박은 항상 포함
        if (posting?.ship_id && !filtered.some(s => String(s.id) === String(posting.ship_id))) {
          const current = (data || []).find(s => String(s.id) === String(posting.ship_id));
          if (current) filtered.push(current);
        }

        console.log('✅ [loadShips] Filtered ships:', filtered.length);
        setFilteredShips(filtered);
      } else {
        console.log('ℹ️ [loadShips] No filtering applied, showing all ships');
        setFilteredShips(data || []);
      }
    } catch (error) {
      console.error('❌ [loadShips] Failed to load ships:', error);
    }
  };

  // 급여 템플릿에 값이 없는 직급도 공고 등록 시 선택할 수 있어야 하므로, 여기서는
  // "선원 직급 관리"에 등록된 전체 직급을 기준으로 목록을 만들고, 템플릿에 해당
  // 직급의 급여 항목이 있으면 그 금액을 미리 채워주기만 한다 (없으면 0으로 두고
  // has_salary=false로 표시해서 직접 입력하도록 안내).
  const checkShipTemplate = async (shipId: string) => {
    try {
      const { data: allRanks } = await supabase.from('ranks').select('*');
      const rankList = sortRanksByDisplayOrder(allRanks || []);

      const { data: ship } = await supabase
        .from('ships')
        .select('fleet_id, owner_id')
        .eq('id', shipId)
        .single();

      if (!ship) {
        setHasTemplate(false);
        setAvailableRanks(rankList.map(rank => ({ ...rank, base_salary: 0, currency: 'USD', template_id: '', has_salary: false, grades: [], default_grade: null, salary_by_grade: {} })));
        return;
      }

      let foundTemplateId: string | null = null;

      const { data: shipAssignment } = await supabase
        .from('ship_salary_assignments')
        .select('template_id')
        .eq('ship_id', shipId)
        .limit(1)
        .single();

      if (shipAssignment) {
        foundTemplateId = String(shipAssignment.template_id);
      }

      if (!foundTemplateId && ship.fleet_id) {
        const { data: fleetAssignment } = await supabase
          .from('fleet_salary_assignments')
          .select('template_id')
          .eq('fleet_id', ship.fleet_id)
          .limit(1)
          .single();

        if (fleetAssignment) {
          foundTemplateId = String(fleetAssignment.template_id);
        }
      }

      if (!foundTemplateId && ship.owner_id) {
        const { data: ownerAssignment } = await supabase
          .from('owner_salary_assignments')
          .select('template_id')
          .eq('owner_id', ship.owner_id)
          .limit(1)
          .single();

        if (ownerAssignment) {
          foundTemplateId = String(ownerAssignment.template_id);
        }
      }

      if (!foundTemplateId) {
        setHasTemplate(false);
        setTemplateId(null);
        setAvailableRanks(rankList.map(rank => ({ ...rank, base_salary: 0, currency: 'USD', template_id: '', has_salary: false, grades: [], default_grade: null, salary_by_grade: {} })));
        return;
      }

      setTemplateId(foundTemplateId);

      const { data: template } = await supabase
        .from('salary_templates')
        .select('*')
        .eq('id', foundTemplateId)
        .single();

      const { data: templateItems } = await supabase
        .from('salary_template_items')
        .select(`
          *,
          component:salary_components(*)
        `)
        .eq('template_id', foundTemplateId);

      const currency = template?.currency || 'USD';
      const itemsByRank = new Map<string, SalaryTemplateItem[]>();
      for (const item of (templateItems || []) as SalaryTemplateItem[]) {
        if (!itemsByRank.has(item.rank || '')) itemsByRank.set(item.rank || '', []);
        itemsByRank.get(item.rank || '')!.push(item);
      }

      // 등급(A/B/C 등)별 금액까지 전부 더하면 말이 안 되는 총액이 나오므로, 급여
      // 구성 항목(component)마다 대표값 하나만 골라 특정 등급 기준 총액을 계산한다 —
      // 그 등급에 해당하는 항목이 있으면 그것을, 없으면 공통(등급 없음) 항목을 사용한다.
      const totalForGrade = (rankItems: SalaryTemplateItem[], grade: string | null): number => {
        const itemsByComponent = new Map<string, SalaryTemplateItem[]>();
        for (const item of rankItems) {
          if (!itemsByComponent.has(item.component_id)) itemsByComponent.set(item.component_id, []);
          itemsByComponent.get(item.component_id)!.push(item);
        }
        let total = 0;
        for (const componentItems of itemsByComponent.values()) {
          const forGrade = grade ? componentItems.find(item => item.rank_grade === grade) : undefined;
          const common = componentItems.find(item => !item.rank_grade);
          const representative = forGrade || common || componentItems[0];
          total += representative?.amount || 0;
        }
        return total;
      };

      const ranksWithSalary: RankWithSalary[] = rankList.map(rank => {
        const rankItems = itemsByRank.get(rank.name) || [];
        const grades = [...new Set(rankItems.map(item => item.rank_grade).filter((g): g is string => !!g))].sort();

        let baseSalary = 0;
        let defaultGrade: string | null = null;
        const salaryByGrade: Record<string, number> = {};

        if (grades.length > 0) {
          for (const grade of grades) salaryByGrade[grade] = totalForGrade(rankItems, grade);
          // 공고 등록 시 기본값은 가장 낮은(하위) 등급의 급여로 제시하고, 등록 화면에서
          // 실제 채용 조건에 맞는 등급으로 바꿀 수 있게 한다.
          defaultGrade = grades.reduce((lowest, g) => salaryByGrade[g] < salaryByGrade[lowest] ? g : lowest, grades[0]);
          baseSalary = salaryByGrade[defaultGrade];
        } else {
          baseSalary = totalForGrade(rankItems, null);
        }

        return {
          ...rank,
          base_salary: baseSalary,
          currency,
          template_id: foundTemplateId as string,
          has_salary: rankItems.length > 0,
          grades,
          default_grade: defaultGrade,
          salary_by_grade: salaryByGrade,
        };
      });

      setHasTemplate((templateItems?.length || 0) > 0);
      setAvailableRanks(ranksWithSalary);
    } catch (error) {
      console.error('Failed to check ship template:', error);
      setHasTemplate(false);
      setAvailableRanks([]);
    }
  };

  return {
    currentUser,
    companies,
    filteredCompanies,
    manningAgencies,
    fleets,
    filteredFleets,
    ships,
    filteredShips,
    ranks,
    nationalities,
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
    isManningOrCrew,
    isReadOnly,
    isShipManager,
    loadFleets,
    loadShips,
    checkShipTemplate,
  };
}