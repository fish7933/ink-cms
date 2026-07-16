import { addMonths, format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/store';
import type { CrewMember, CrewStatus, CrewExperience } from '@/types/models';

interface CrewFilterOptions {
  searchTerm?: string;
  rank?: string;
  nationality?: string;
  status?: string;
  owner_id?: string;
  fleet_id?: string;
  current_ship_id?: string;
  manning_agency_id?: string;
  rank_category?: 'officer' | 'rating';
  ship_type?: string;
  minAge?: number;
  maxAge?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface CrewStatusHistoryItem {
  id: string;
  crew_member_id: string;
  status: string;
  changed_at: string;
  changed_by: string;
  notes?: string;
  changed_by_user?: { name: string };
}

export interface CrewWithDetails extends CrewMember {
  rank_name: string;
  rank_code: string;
  rank_category: 'officer' | 'rating';
  ship_name?: string;
  current_ship_name?: string;
  owner_name?: string;
  fleet_name?: string;
  manning_agency_name?: string;
  age?: number;
  photo_url?: string;
  height?: number;
  weight?: number;
  blood_type?: string;
  shoe_size?: string;
  coverall_size?: string;
  place_of_birth?: string;
  emergency_contacts?: Array<{ name: string; relationship: string; phone: string; note?: string }>;
  certificates?: Array<{
    name: string;
    number?: string;
    issued_date?: string;
    expiry_date?: string;
    issuing_authority?: string;
    no_expiry?: boolean;
    file_path?: string;
    file_name?: string;
  }>;
  // 승선 이력 (발령 기록 기준)
  latest_embark_date?: string;
  latest_disembark_date?: string | null;
  is_active_onboard?: boolean;   // 현재 활성 승선 기록 존재 여부
  // 급여표 할당 여부 (활성 승선 기록의 salary_template_id 존재 여부)
  has_salary_template?: boolean;
  // 만료된 증서 여부
  has_expired_certificate?: boolean;
  // 교대 계획 예정 정보 (비승선 선원용 - 결재 중/승인 상태 계획 기준)
  has_pending_plan?: boolean;
  pending_ship_name?: string;
  pending_owner_name?: string;
  pending_fleet_name?: string;
  pending_rank_code?: string;
  pending_rank_grade?: string | null;
  pending_embark_date?: string;
  pending_ship_id?: string;
  pending_owner_id?: string;
  pending_fleet_id?: string;
  pending_rank_id?: string;
  pending_plan_name?: string;
  pending_salary_amount?: number | null;
  pending_salary_currency?: string;
  // 승선(예정)일 + 계약 개월수로 계산한 하선예정일 (대기/승선중 공통 — 승선 시점 값이 그대로 이어짐)
  disembark_forecast_date?: string;
  // 매닝사 추천 시 입력한 승선가능일 (crew_recommendations.available_date, 등록/하선 선원용)
  recommended_available_date?: string;
  // 매닝사 추천 시 입력한 희망 급여 (crew_recommendations.desired_salary/desired_currency, 등록 선원용 —
  // 아직 승선 전이라 선박 급여표가 아닌 추천 당시 입력된 금액을 그대로 보여준다)
  recommended_salary_amount?: number;
  recommended_salary_currency?: string;
  // 채용 공고에 제시된 급여 (job_posting_ranks.salary_amount/salary_currency, 등록 선원용)
  offered_salary_amount?: number;
  offered_salary_currency?: string;
}

export interface DeletedCrewMember {
  id: string;
  name: string;
  rank_name: string;
  rank_code: string;
  nationality: string;
  date_of_birth: string;
  deleted_at: string;
  deleted_by_name: string;
}

interface CrewMemberRow {
  id: string;
  name: string;
  name_english?: string;
  name_chinese?: string;
  rank: string;
  rank_id?: string;
  nationality: string;
  date_of_birth: string;
  passport_no?: string;
  seaman_book_no?: string;
  phone: string;
  email: string;
  status: string;
  current_status?: string;
  manning_agency_id?: string;
  owner_id?: string;
  fleet_id?: string;
  current_ship_id?: string;
  experience?: CrewExperience[];
  created_at: string;
  updated_at: string;
  photo_url?: string;
  height?: number;
  weight?: number;
  blood_type?: string;
  shoe_size?: string;
  coverall_size?: string;
  place_of_birth?: string;
  emergency_contacts?: unknown;
  certificates?: unknown;
  registration_source?: string;
  current_grade?: string;
}

const calculateAge = (dateOfBirth: string): number => {
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
  return age;
};

export const crewService = {
  async getAllWithDetails(filterOptions?: CrewFilterOptions): Promise<CrewWithDetails[]> {
    const currentUser = await getCurrentUser();

    let query = supabase.from('crew_members').select('*').is('deleted_at', null);

    if (currentUser && currentUser.role === 'manning_agency') {
      if (currentUser.company_id) {
        query = query.eq('manning_agency_id', currentUser.company_id);
      } else {
        return [];
      }
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching crew members:', error);
      return [];
    }

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    const [
      { data: ranksData },
      { data: companiesData },
      { data: fleetsData },
      { data: shipsData },
      // 현재 승선 중인 기록: rank_id, rank_grade, salary_template_id, ship_id, contract_months 포함
      { data: activeEmbarkData },
      // 전체 이력: 최신 승선일/하선일 파악용
      { data: allEmbarkData },
      { data: expiredCertData },
      // 미실행 교대 계획 배정: 대기 선원의 예정 선박/직급/계약개월 표시용
      { data: pendingAssignData },
      // 급여 템플릿 보유 선박 목록
      { data: shipTemplateData },
      // 매닝사 추천 시 입력한 승선가능일 (등록된 선원과 연결된 것만, 최신순)
      { data: recommendationData },
    ] = await Promise.all([
      supabase.from('ranks').select('*'),
      supabase.from('companies').select('*'),
      supabase.from('fleets').select('*'),
      supabase.from('ships').select('*'),
      supabase.from('crew_embarkation_records')
        .select('crew_member_id, embark_date, rank_id, rank_grade, salary_template_id, ship_id, contract_months')
        .eq('status', 'active'),
      supabase.from('crew_embarkation_records')
        .select('crew_member_id, embark_date, disembark_date')
        .order('embark_date', { ascending: false }),
      supabase.from('crew_certificates')
        .select('crew_id')
        .lt('expiry_date', todayStr)
        .not('expiry_date', 'is', null),
      supabase.from('crew_rotation_assignments')
        .select('on_crew_id, on_rank_id, on_rank_grade, embark_date, salary_template_id, salary_amount, salary_currency, contract_months, crew_rotation_plans!inner(ship_id, owner_id, fleet_id, status, plan_name)')
        .not('on_crew_id', 'is', null),
      supabase.from('salary_templates')
        .select('ship_id')
        .eq('is_active', true)
        .not('ship_id', 'is', null),
      supabase.from('crew_recommendations')
        .select('crew_member_id, available_date, desired_salary, desired_currency, job_posting_group_id, rank_id')
        .not('crew_member_id', 'is', null)
        .order('created_at', { ascending: false }),
    ]);

    const ranksById = new Map(ranksData?.map(r => [r.id, r]) || []);
    const ranksByName = new Map(ranksData?.map(r => [r.name, r]) || []);
    const companiesMap = new Map(companiesData?.map(c => [c.id, c]) || []);
    const fleetsMap = new Map(fleetsData?.map(f => [f.id, f]) || []);
    const shipsMap = new Map(shipsData?.map(s => [s.id, s]) || []);

    // 현재 승선 중인 기록 맵 (crew_member_id → active record)
    // → 발령 당시의 rank, grade, salary_template, ship 정보를 정확히 반영
    const activeEmbarkMap = new Map(
      (activeEmbarkData || []).map(r => [r.crew_member_id, r])
    );

    // 최신 이력 맵 (embark_date 내림차순 첫 번째가 최신)
    const latestHistoryMap = new Map<string, { embark_date: string; disembark_date: string | null }>();
    for (const rec of (allEmbarkData || [])) {
      if (!latestHistoryMap.has(rec.crew_member_id)) {
        latestHistoryMap.set(rec.crew_member_id, { embark_date: rec.embark_date, disembark_date: rec.disembark_date });
      }
    }

    const expiredCertCrewIds = new Set((expiredCertData || []).map(c => c.crew_id).filter(Boolean));

    // 미실행 교대 계획에서 대기 선원용 예정 배정 맵
    const PENDING_PLAN_STATUSES = new Set(['draft', 'pending_approval', 'approved']);
    const pendingAssignMap = new Map<string, {
      ship_id: string; owner_id?: string; fleet_id?: string;
      on_rank_id?: string; on_rank_grade?: string | null;
      embark_date?: string; salary_template_id?: string | null;
      contract_months?: number | null;
      plan_name?: string; salary_amount?: number | null; salary_currency?: string;
    }>();
    for (const a of (pendingAssignData || [])) {
      if (!a.on_crew_id) continue;
      const plan = (a as any).crew_rotation_plans;
      if (!plan || !PENDING_PLAN_STATUSES.has(plan.status)) continue;
      if (!pendingAssignMap.has(a.on_crew_id)) {
        pendingAssignMap.set(a.on_crew_id, {
          ship_id: plan.ship_id,
          owner_id: plan.owner_id,
          fleet_id: plan.fleet_id,
          on_rank_id: a.on_rank_id,
          on_rank_grade: a.on_rank_grade,
          embark_date: a.embark_date,
          salary_template_id: a.salary_template_id,
          contract_months: a.contract_months,
          plan_name: plan.plan_name,
          salary_amount: a.salary_amount,
          salary_currency: a.salary_currency,
        });
      }
    }

    // 매닝사 추천 시 입력한 승선가능일 맵 (등록된 선원 기준, 최신 추천이 우선)
    const recommendationAvailableMap = new Map<string, string>();
    // 매닝사 추천 시 입력한 희망급여 맵 (등록된 선원 기준, 최신 추천이 우선)
    const recommendationSalaryMap = new Map<string, { amount: number; currency: string }>();
    for (const r of (recommendationData || [])) {
      if (!r.crew_member_id) continue;
      if (r.available_date && !recommendationAvailableMap.has(r.crew_member_id)) {
        recommendationAvailableMap.set(r.crew_member_id, r.available_date);
      }
      if (r.desired_salary != null && !recommendationSalaryMap.has(r.crew_member_id)) {
        recommendationSalaryMap.set(r.crew_member_id, { amount: r.desired_salary, currency: r.desired_currency || 'USD' });
      }
    }

    // 추천 건에 연결된 공고의 제시급여(직급별) 조회
    const recommendedGroupIds = [...new Set((recommendationData || []).map(r => r.job_posting_group_id).filter(Boolean))];
    const { data: offeredRanksData } = recommendedGroupIds.length > 0
      ? await supabase.from('job_posting_ranks')
          .select('group_id, rank_id, salary_amount, salary_currency')
          .in('group_id', recommendedGroupIds)
      : { data: [] as { group_id: string; rank_id: string; salary_amount: number | null; salary_currency: string }[] };
    const offeredSalaryMap = new Map<string, { amount: number; currency: string }>();
    for (const o of (offeredRanksData || [])) {
      if (o.salary_amount == null) continue;
      offeredSalaryMap.set(`${o.group_id}_${o.rank_id}`, { amount: o.salary_amount, currency: o.salary_currency || 'USD' });
    }
    // crew_member_id → 제시급여 (해당 선원 추천 건의 공고+직급 기준)
    const crewOfferedSalaryMap = new Map<string, { amount: number; currency: string }>();
    for (const r of (recommendationData || [])) {
      if (!r.crew_member_id || !r.job_posting_group_id) continue;
      if (crewOfferedSalaryMap.has(r.crew_member_id)) continue;
      const offered = offeredSalaryMap.get(`${r.job_posting_group_id}_${r.rank_id}`);
      if (offered) crewOfferedSalaryMap.set(r.crew_member_id, offered);
    }

    // 승선(예정)일 + 계약 개월수로 하선예정일을 계산 — 대기 시절 계산값이 승선 후에도 그대로 이어짐
    const calcDisembarkForecast = (embarkDate?: string, contractMonths?: number | null): string | undefined => {
      if (!embarkDate || !contractMonths) return undefined;
      return format(addMonths(new Date(embarkDate), contractMonths), 'yyyy-MM-dd');
    };

    // 활성 급여 템플릿이 있는 선박 ID 집합
    const shipsWithTemplate = new Set((shipTemplateData || []).map((t: any) => t.ship_id).filter(Boolean));

    let crewList = (data || []).map((item: CrewMemberRow) => {
      // 현재 승선 중인 기록이 있으면 발령 당시의 rank/grade/ship 우선 사용
      const activeEmbark = activeEmbarkMap.get(item.id);

      // 직급: 발령 기록 rank_id → crew_members rank_id → rank 이름 순으로 조회
      const rankIdToUse = activeEmbark?.rank_id || item.rank_id;
      const rank = rankIdToUse
        ? ranksById.get(rankIdToUse)
        : ranksByName.get(item.rank);

      // 선박/선주/플릿: 승선 기록의 ship_id → ship 테이블에서 owner_id/fleet_id 역참조
      const shipIdToUse = activeEmbark?.ship_id || item.current_ship_id;
      const ship = shipIdToUse ? shipsMap.get(shipIdToUse) : undefined;
      const ownerIdToUse = ship?.owner_id || item.owner_id;
      const fleetIdToUse = ship?.fleet_id || item.fleet_id;
      const owner = ownerIdToUse ? companiesMap.get(ownerIdToUse) : undefined;
      const fleet = fleetIdToUse ? fleetsMap.get(fleetIdToUse) : undefined;
      const manningAgency = item.manning_agency_id ? companiesMap.get(item.manning_agency_id) : undefined;

      // 등급: 발령 기록 rank_grade 우선 → crew_members.current_grade
      const currentGrade = activeEmbark?.rank_grade || item.current_grade || null;

      // 승선일 / 하선일: 승선 중이면 active record, 아니면 최신 이력
      const latestHistory = latestHistoryMap.get(item.id);
      const latestEmbarkDate = activeEmbark?.embark_date || latestHistory?.embark_date;
      // 하선일: 현재 승선 중이면 null (UI에서 "승선중" 표시), 하선 완료면 날짜
      const latestDisembarkDate = activeEmbark ? null : (latestHistory?.disembark_date ?? null);
      const isActiveOnboard = Boolean(activeEmbark);

      // 비승선 선원의 교대 계획 예정 배정 조회
      const pendingAssign = !isActiveOnboard ? pendingAssignMap.get(item.id) : undefined;
      let pendingShipName: string | undefined;
      let pendingOwnerName: string | undefined;
      let pendingFleetName: string | undefined;
      let pendingRankCode: string | undefined;
      let pendingRankGrade: string | null = null;
      let pendingShipId: string | undefined;
      let pendingOwnerId: string | undefined;
      let pendingFleetId: string | undefined;
      let pendingRankId: string | undefined;
      let pendingPlanName: string | undefined;
      let pendingSalaryAmount: number | null | undefined;
      let pendingSalaryCurrency: string | undefined;
      if (pendingAssign) {
        const pShip = pendingAssign.ship_id ? shipsMap.get(pendingAssign.ship_id) : undefined;
        const pOwnerId = pendingAssign.owner_id || pShip?.owner_id;
        const pFleetId = pendingAssign.fleet_id || pShip?.fleet_id;
        pendingShipName = pShip?.name;
        pendingOwnerName = pOwnerId ? companiesMap.get(pOwnerId)?.name : undefined;
        pendingFleetName = pFleetId ? fleetsMap.get(pFleetId)?.name : undefined;
        pendingRankCode = pendingAssign.on_rank_id ? ranksById.get(pendingAssign.on_rank_id)?.rank_code : undefined;
        pendingRankGrade = pendingAssign.on_rank_grade || null;
        pendingShipId = pendingAssign.ship_id;
        pendingOwnerId = pOwnerId;
        pendingFleetId = pFleetId;
        pendingRankId = pendingAssign.on_rank_id;
        pendingPlanName = pendingAssign.plan_name;
        pendingSalaryAmount = pendingAssign.salary_amount;
        pendingSalaryCurrency = pendingAssign.salary_currency;
      }

      // 하선예정일: 승선 중이면 활성 승선기록의 승선일+계약개월, 대기 중이면 예정 배정의 승선예정일+계약개월
      const disembarkForecastDate = isActiveOnboard
        ? calcDisembarkForecast(activeEmbark?.embark_date, activeEmbark?.contract_months)
        : (pendingAssign ? calcDisembarkForecast(pendingAssign.embark_date, pendingAssign.contract_months) : undefined);

      // 급여 템플릿: 승선 중이면 활성 기록 기준, 대기 중이면 교대 계획 또는 선박 보유 여부,
      // 등록(아직 배정 전) 상태는 선박 급여표가 아니라 추천 당시 입력된 희망급여 존재 여부로 판단
      const hasSalaryTemplate = isActiveOnboard
        ? Boolean(activeEmbark?.salary_template_id)
        : pendingAssign
          ? Boolean(pendingAssign.salary_template_id) || shipsWithTemplate.has(pendingAssign.ship_id)
          : recommendationSalaryMap.has(item.id);

      const recommendedSalary = recommendationSalaryMap.get(item.id);
      const offeredSalary = crewOfferedSalaryMap.get(item.id);

      let emergencyContacts = item.emergency_contacts;
      if (typeof emergencyContacts === 'string') {
        try { emergencyContacts = JSON.parse(emergencyContacts); } catch { emergencyContacts = []; }
      }

      let certificates = item.certificates;
      if (typeof certificates === 'string') {
        try { certificates = JSON.parse(certificates); } catch { certificates = []; }
      }

      return {
        id: item.id,
        name: item.name,
        name_english: item.name_english,
        name_chinese: item.name_chinese,
        rank_id: item.rank_id || rank?.id || '',
        nationality: item.nationality,
        date_of_birth: item.date_of_birth,
        passport_number: item.passport_no,
        seaman_book_number: item.seaman_book_no,
        contact_phone: item.phone,
        contact_email: item.email,
        emergency_contact: '',
        status: item.status,
        current_status: (item.current_status || item.status) as CrewStatus,
        registration_source: item.registration_source,
        current_grade: currentGrade,
        manning_agency_id: item.manning_agency_id,
        owner_id: ownerIdToUse || item.owner_id,
        fleet_id: fleetIdToUse || item.fleet_id,
        current_ship_id: shipIdToUse || item.current_ship_id,
        experience: item.experience,
        created_at: item.created_at,
        updated_at: item.updated_at,
        rank_name: rank?.name || item.rank || '',
        rank_code: rank?.rank_code || '',
        rank_category: rank?.rank_category || 'rating',
        ship_name: ship?.name,
        current_ship_name: ship?.name,
        owner_name: owner?.name,
        fleet_name: fleet?.name,
        manning_agency_name: manningAgency?.name,
        age: item.date_of_birth ? calculateAge(item.date_of_birth) : undefined,
        photo_url: item.photo_url || '',
        height: item.height,
        weight: item.weight,
        blood_type: item.blood_type || '',
        shoe_size: item.shoe_size || '',
        coverall_size: item.coverall_size || '',
        place_of_birth: item.place_of_birth || '',
        emergency_contacts: Array.isArray(emergencyContacts) ? emergencyContacts : [],
        certificates: Array.isArray(certificates) ? certificates : [],
        latest_embark_date: latestEmbarkDate,
        latest_disembark_date: latestDisembarkDate,
        is_active_onboard: isActiveOnboard,
        has_salary_template: hasSalaryTemplate,
        has_expired_certificate: expiredCertCrewIds.has(item.id),
        has_pending_plan: Boolean(pendingAssign),
        pending_ship_name: pendingShipName,
        pending_owner_name: pendingOwnerName,
        pending_fleet_name: pendingFleetName,
        pending_rank_code: pendingRankCode,
        pending_rank_grade: pendingRankGrade,
        pending_embark_date: pendingAssign?.embark_date,
        pending_ship_id: pendingShipId,
        pending_owner_id: pendingOwnerId,
        pending_fleet_id: pendingFleetId,
        pending_rank_id: pendingRankId,
        pending_plan_name: pendingPlanName,
        pending_salary_amount: pendingSalaryAmount,
        pending_salary_currency: pendingSalaryCurrency,
        disembark_forecast_date: disembarkForecastDate,
        recommended_available_date: recommendationAvailableMap.get(item.id),
        recommended_salary_amount: recommendedSalary?.amount,
        recommended_salary_currency: recommendedSalary?.currency,
        offered_salary_amount: offeredSalary?.amount,
        offered_salary_currency: offeredSalary?.currency,
      };
    });

    if (filterOptions) {
      if (filterOptions.searchTerm) {
        const term = filterOptions.searchTerm.toLowerCase();
        crewList = crewList.filter(c =>
          c.name.toLowerCase().includes(term) ||
          c.rank_name.toLowerCase().includes(term) ||
          c.rank_code.toLowerCase().includes(term) ||
          c.passport_number?.toLowerCase().includes(term) ||
          c.seaman_book_number?.toLowerCase().includes(term)
        );
      }
      if (filterOptions.owner_id) crewList = crewList.filter(c => c.owner_id === filterOptions.owner_id);
      if (filterOptions.fleet_id) crewList = crewList.filter(c => c.fleet_id === filterOptions.fleet_id);
      if (filterOptions.current_ship_id) crewList = crewList.filter(c => c.current_ship_id === filterOptions.current_ship_id);
      if (filterOptions.manning_agency_id) crewList = crewList.filter(c => c.manning_agency_id === filterOptions.manning_agency_id);
      if (filterOptions.rank) crewList = crewList.filter(c => c.rank_id === filterOptions.rank);
      if (filterOptions.rank_category) crewList = crewList.filter(c => c.rank_category === filterOptions.rank_category);
      if (filterOptions.status) crewList = crewList.filter(c => c.current_status === filterOptions.status);
      if (filterOptions.minAge !== undefined || filterOptions.maxAge !== undefined) {
        crewList = crewList.filter(c => {
          if (!c.age) return false;
          if (filterOptions.minAge !== undefined && c.age < filterOptions.minAge) return false;
          if (filterOptions.maxAge !== undefined && c.age > filterOptions.maxAge) return false;
          return true;
        });
      }
    }

    return crewList;
  },

  async getById(id: string): Promise<CrewMember | null> {
    const { data, error } = await supabase.from('crew_members').select('*').eq('id', id).single();
    if (error) { console.error('Error fetching crew member:', error); return null; }
    return data as CrewMember;
  },

  async create(crewMember: Omit<CrewMember, 'id' | 'created_at' | 'updated_at'>): Promise<CrewWithDetails | null> {
    const { data: rankData } = await supabase.from('ranks').select('name').eq('id', crewMember.rank_id).single();

    const { data, error } = await supabase.from('crew_members').insert([{
      name: crewMember.name,
      rank: rankData?.name || '',
      rank_id: crewMember.rank_id,
      nationality: crewMember.nationality || '',
      date_of_birth: crewMember.date_of_birth || '',
      passport_no: crewMember.passport_number || '',
      seaman_book_no: crewMember.seaman_book_number || '',
      phone: crewMember.contact_phone || '',
      email: crewMember.contact_email || '',
      status: crewMember.current_status || 'registered',
      current_status: crewMember.current_status || 'registered',
      manning_agency_id: crewMember.manning_agency_id,
      owner_id: crewMember.owner_id,
      fleet_id: crewMember.fleet_id,
      current_ship_id: crewMember.current_ship_id,
      experience: crewMember.experience || [],
    }]).select().single();

    if (error) { console.error('Error adding crew member:', error); return null; }
    return data as unknown as CrewWithDetails;
  },

  async update(id: string, updates: Partial<CrewMember>): Promise<CrewMember | null> {
    const updateData: Record<string, unknown> = {};

    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.nationality !== undefined) updateData.nationality = updates.nationality;
    if (updates.date_of_birth !== undefined) updateData.date_of_birth = updates.date_of_birth;
    if (updates.passport_number !== undefined) updateData.passport_no = updates.passport_number;
    if (updates.seaman_book_number !== undefined) updateData.seaman_book_no = updates.seaman_book_number;
    if (updates.contact_phone !== undefined) updateData.phone = updates.contact_phone;
    if (updates.contact_email !== undefined) updateData.email = updates.contact_email;
    if (updates.manning_agency_id !== undefined) updateData.manning_agency_id = updates.manning_agency_id;
    if (updates.owner_id !== undefined) updateData.owner_id = updates.owner_id;
    if (updates.fleet_id !== undefined) updateData.fleet_id = updates.fleet_id;
    if (updates.current_ship_id !== undefined) updateData.current_ship_id = updates.current_ship_id;
    if (updates.experience !== undefined) updateData.experience = updates.experience;
    if (updates.rank_id !== undefined) {
      updateData.rank_id = updates.rank_id;
      const { data: rd } = await supabase.from('ranks').select('name').eq('id', updates.rank_id).single();
      if (rd) updateData.rank = rd.name;
    }
    if (updates.current_status !== undefined) { updateData.current_status = updates.current_status; updateData.status = updates.current_status; }

    const { data, error } = await supabase.from('crew_members').update(updateData).eq('id', id).select().single();
    if (error) { console.error('Error updating crew member:', error); return null; }
    return data as CrewMember;
  },

  async delete(id: string): Promise<boolean> {
    const { error } = await supabase.from('crew_members').delete().eq('id', id);
    if (error) { console.error('Error deleting crew member:', error); return false; }
    return true;
  },

  // 선원 목록에서의 "삭제" — 실제로는 삭제 선원 리스트로 이동(소프트 삭제)
  async softDelete(ids: string[], deletedBy: string): Promise<{ error?: string }> {
    const { error } = await supabase
      .from('crew_members')
      .update({ deleted_at: new Date().toISOString(), deleted_by: deletedBy })
      .in('id', ids);
    if (error) { console.error('Error soft-deleting crew members:', error); return { error: error.message }; }
    return {};
  },

  async restore(ids: string[]): Promise<{ error?: string }> {
    const { error } = await supabase
      .from('crew_members')
      .update({ deleted_at: null, deleted_by: null })
      .in('id', ids);
    if (error) { console.error('Error restoring crew members:', error); return { error: error.message }; }
    return {};
  },

  // 삭제 선원 리스트 조회 (시스템관리자 이상 전용 화면에서 사용)
  async getDeleted(): Promise<DeletedCrewMember[]> {
    const { data, error } = await supabase
      .from('crew_members')
      .select('*')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });
    if (error) { console.error('Error fetching deleted crew members:', error); return []; }
    if (!data || data.length === 0) return [];

    const rankIds = [...new Set(data.map(c => c.rank_id).filter(Boolean))];
    const userIds = [...new Set(data.map(c => c.deleted_by).filter(Boolean))];
    const [{ data: ranksData }, { data: usersData }] = await Promise.all([
      rankIds.length > 0 ? supabase.from('ranks').select('id, name, rank_code').in('id', rankIds) : Promise.resolve({ data: [] as { id: string; name: string; rank_code: string }[] }),
      userIds.length > 0 ? supabase.from('users').select('id, name').in('id', userIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);
    const rankMap = new Map((ranksData || []).map(r => [r.id, r]));
    const userMap = new Map((usersData || []).map(u => [u.id, u.name]));

    return data.map(c => ({
      id: c.id,
      name: c.name,
      rank_name: rankMap.get(c.rank_id)?.name || c.rank || '-',
      rank_code: rankMap.get(c.rank_id)?.rank_code || '',
      nationality: c.nationality,
      date_of_birth: c.date_of_birth,
      deleted_at: c.deleted_at,
      deleted_by_name: c.deleted_by ? (userMap.get(c.deleted_by) || '알 수 없음') : '알 수 없음',
    }));
  },

  // 삭제 선원 리스트에서의 영구 삭제 — 관련 테이블 먼저 정리(FK 제약 해제) 후 crew_members 삭제.
  // 시스템관리자 이상만 호출할 수 있도록 화면에서 제한해야 한다.
  async permanentlyDelete(ids: string[]): Promise<{ error?: string }> {
    await supabase.from('crew_rotation_assignments').delete().in('on_crew_id', ids);
    await supabase.from('crew_rotation_assignments').delete().in('off_crew_id', ids);
    await supabase.from('crew_status_history').delete().in('crew_member_id', ids);
    await supabase.from('crew_embarkation_records').delete().in('crew_member_id', ids);
    await supabase.from('crew_certificates').delete().in('crew_id', ids);
    await supabase.from('crew_appointments').delete().in('crew_id', ids);
    await supabase.from('allotments').delete().in('crew_member_id', ids);
    await supabase.from('contracts').delete().in('crew_member_id', ids);

    const { error } = await supabase.from('crew_members').delete().in('id', ids);
    if (error) { console.error('Error permanently deleting crew members:', error); return { error: error.message }; }
    return {};
  },

  async updateStatus(
    crewMemberId: string,
    status: CrewStatus,
    userId: string,
    notes?: string,
    additionalData?: {
      current_ship_id?: string;
      owner_id?: string;
      fleet_id?: string;
      onboard_date?: string;
      offboard_date?: string;
    }
  ): Promise<void> {
    const updateData: Record<string, unknown> = {
      status,
      current_status: status,
      status_notes: notes,
      updated_at: new Date().toISOString(),
    };
    if (status === 'on_board') {
      if (additionalData?.current_ship_id) updateData.current_ship_id = additionalData.current_ship_id;
      updateData.onboard_date = additionalData?.onboard_date || new Date().toISOString().split('T')[0];
    }
    if (status === 'available') {
      updateData.offboard_date = additionalData?.offboard_date || new Date().toISOString().split('T')[0];
    }
    const { error } = await supabase.from('crew_members').update(updateData).eq('id', crewMemberId);
    if (error) { console.error('Error updating crew status:', error); throw error; }
  },

  async getStatusHistory(crewMemberId: string): Promise<CrewStatusHistoryItem[]> {
    const { data, error } = await supabase
      .from('crew_status_history')
      .select('*, changed_by_user:users!crew_status_history_changed_by_fkey(name)')
      .eq('crew_member_id', crewMemberId)
      .order('created_at', { ascending: false });
    if (error) { console.error('Error fetching crew status history:', error); return []; }
    return data as CrewStatusHistoryItem[];
  },
};

export const getCrewMembers = crewService.getAllWithDetails;
export const getCrewMemberById = crewService.getById;
export const addCrewMember = crewService.create;
export const updateCrewMember = crewService.update;
export const deleteCrewMember = crewService.delete;
export const updateCrewStatus = crewService.updateStatus;
export const getCrewStatusHistory = crewService.getStatusHistory;