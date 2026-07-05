import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/store';
import { supervisorService } from '@/services/supervisor.service';
import { jobPostingGroupService } from '@/services/job-posting-group.service';
import type { Company, Fleet, Ship, Rank, User, JobPostingGroupWithDetails } from '@/types/models';
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
      visible_to_agencies: [],
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

      await Promise.all([
        loadFleets(companyId),
        loadShips(companyId, fleetId),
      ]);

      await loadShipDetails(shipId);
      await checkShipTemplate(shipId);
      await new Promise(resolve => setTimeout(resolve, 500));

      const rankDetails: SelectedRankDetail[] = posting.ranks.map(r => ({
        rank_id: r.rank_id,
        rank_name: r.rank_name,
        rank_code: r.rank_code,
        department: r.department,
        base_salary: r.salary_amount || 0,
        currency: r.salary_currency,
        contract_months: r.contract_months,
        positions_available: r.positions_available,
      }));

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
      
      const [companiesRes, manningRes, ranksRes] = await Promise.all([
        supabase.from('companies').select('*').eq('type', 'owner').order('name'),
        supabase.from('companies').select('*').eq('type', 'manning').order('name'),
        supabase.from('ranks').select('*').order('display_order'),
      ]);

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
        setRanks(ranksRes.data);
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
      const { data: allRanks } = await supabase.from('ranks').select('*').order('display_order');
      const rankList = allRanks || [];

      const { data: ship } = await supabase
        .from('ships')
        .select('fleet_id, owner_id')
        .eq('id', shipId)
        .single();

      if (!ship) {
        setHasTemplate(false);
        setAvailableRanks(rankList.map(rank => ({ ...rank, base_salary: 0, currency: 'USD', template_id: '', has_salary: false })));
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
        setAvailableRanks(rankList.map(rank => ({ ...rank, base_salary: 0, currency: 'USD', template_id: '', has_salary: false })));
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

      const ranksWithSalary: RankWithSalary[] = rankList.map(rank => {
        const rankItems = itemsByRank.get(rank.name) || [];
        // 등급(rank_grade) 구분 없이 공통으로 적용되는 금액만 합산 — 등급별 금액까지
        // 합치면(A/B/C 등) 말이 안 되는 총액이 나오므로 공통 항목만 기본값으로 사용
        const commonItems = rankItems.filter(item => !item.rank_grade);
        const baseSalary = commonItems.reduce((sum, item) => sum + item.amount, 0);

        return {
          ...rank,
          base_salary: baseSalary,
          currency,
          template_id: foundTemplateId as string,
          has_salary: rankItems.length > 0,
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