import { supabase } from '@/lib/supabase';
import type { CrewRecommendation, CrewRecommendationWithDetails } from '@/types/models';
import { supervisorService } from './supervisor.service';
import { crewService } from './crew.service';

const TABLE_NAME = 'crew_recommendations';

// resume_files는 DB에 JSON 문자열로 저장되어 있어(jsonb 아님), 매번 파싱해서 내려준다.
function parseResumeFiles(raw: unknown): { name: string; path: string; size: number; type: string }[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
  }
  return [];
}

class CrewRecommendationService {
  async getAll(): Promise<CrewRecommendationWithDetails[]> {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Return data with empty strings for joined fields
    return (data || []).map(item => ({
      ...item,
      resume_files: parseResumeFiles(item.resume_files),
      manning_agency_name: '',
      rank_name: '',
      rank_code: '',
      department: '',
      company_name: '',
      fleet_name: '',
      ship_name: '',
    }));
  }

  async getById(id: string): Promise<CrewRecommendationWithDetails | null> {
    const { data: rec, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('id', id)
      .single();

    if (error || !rec) return null;

    const [rankRes, companyRes, fleetRes, shipRes, agencyRes] = await Promise.all([
      supabase.from('ranks').select('id, name, rank_code, department').eq('id', rec.rank_id).single(),
      rec.company_id ? supabase.from('companies').select('id, name').eq('id', rec.company_id).single() : Promise.resolve({ data: null }),
      rec.fleet_id ? supabase.from('fleets').select('id, name').eq('id', rec.fleet_id).single() : Promise.resolve({ data: null }),
      rec.ship_id ? supabase.from('ships').select('id, name').eq('id', rec.ship_id).single() : Promise.resolve({ data: null }),
      supabase.from('companies').select('id, name').eq('id', rec.manning_agency_id).single(),
    ]);

    return {
      ...rec,
      resume_files: parseResumeFiles(rec.resume_files),
      rank_name: rankRes.data?.name || '',
      rank_code: rankRes.data?.rank_code || '',
      department: rankRes.data?.department || '',
      company_name: companyRes.data?.name || '',
      fleet_name: fleetRes.data?.name || '',
      ship_name: shipRes.data?.name || '',
      manning_agency_name: agencyRes.data?.name || '',
    };
  }

  async getRecommendationsByCompany(companyId: string): Promise<CrewRecommendationWithDetails[]> {
    // First, get all recommendations for this company
    const { data: recommendations, error: recError } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (recError) throw recError;
    if (!recommendations || recommendations.length === 0) return [];

    // Get unique IDs for batch fetching
    const rankIds = [...new Set(recommendations.map(r => r.rank_id))];
    const companyIds = [...new Set(recommendations.map(r => r.company_id))];
    const fleetIds = [...new Set(recommendations.map(r => r.fleet_id).filter(Boolean))];
    const shipIds = [...new Set(recommendations.map(r => r.ship_id))];
    const agencyIds = [...new Set(recommendations.map(r => r.manning_agency_id))];

    // Batch fetch all related data
    const [ranksRes, companiesRes, fleetsRes, shipsRes, agenciesRes] = await Promise.all([
      supabase.from('ranks').select('id, name, rank_code, department').in('id', rankIds),
      supabase.from('companies').select('id, name').in('id', companyIds),
      fleetIds.length > 0 ? supabase.from('fleets').select('id, name').in('id', fleetIds) : { data: [] },
      supabase.from('ships').select('id, name').in('id', shipIds),
      supabase.from('companies').select('id, name').in('id', agencyIds),
    ]);

    // Create lookup maps
    const ranksMap = new Map((ranksRes.data || []).map(r => [r.id, r]));
    const companiesMap = new Map((companiesRes.data || []).map(c => [c.id, c]));
    const fleetsMap = new Map((fleetsRes.data || []).map(f => [f.id, f]));
    const shipsMap = new Map((shipsRes.data || []).map(s => [s.id, s]));
    const agenciesMap = new Map((agenciesRes.data || []).map(a => [a.id, a]));

    // Map recommendations with joined data
    return recommendations.map(rec => {
      const rank = ranksMap.get(rec.rank_id);
      const company = companiesMap.get(rec.company_id);
      const fleet = rec.fleet_id ? fleetsMap.get(rec.fleet_id) : null;
      const ship = shipsMap.get(rec.ship_id);
      const agency = agenciesMap.get(rec.manning_agency_id);

      return {
        ...rec,
        resume_files: parseResumeFiles(rec.resume_files),
        manning_agency_name: agency?.name || '',
        rank_name: rank?.name || '',
        rank_code: rank?.rank_code || '',
        department: rank?.department || '',
        company_name: company?.name || '',
        fleet_name: fleet?.name || '',
        ship_name: ship?.name || '',
      };
    });
  }

  async getByJobPostingGroup(groupId: string): Promise<CrewRecommendationWithDetails[]> {
    // First, get all recommendations for this job posting group
    const { data: recommendations, error: recError } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('job_posting_group_id', groupId)
      .order('created_at', { ascending: false });

    if (recError) throw recError;
    if (!recommendations || recommendations.length === 0) return [];

    // Get unique IDs for batch fetching
    const rankIds = [...new Set(recommendations.map(r => r.rank_id))];
    const companyIds = [...new Set(recommendations.map(r => r.company_id))];
    const fleetIds = [...new Set(recommendations.map(r => r.fleet_id).filter(Boolean))];
    const shipIds = [...new Set(recommendations.map(r => r.ship_id))];
    const agencyIds = [...new Set(recommendations.map(r => r.manning_agency_id))];

    // Batch fetch all related data
    const [ranksRes, companiesRes, fleetsRes, shipsRes, agenciesRes] = await Promise.all([
      supabase.from('ranks').select('id, name, rank_code, department').in('id', rankIds),
      supabase.from('companies').select('id, name').in('id', companyIds),
      fleetIds.length > 0 ? supabase.from('fleets').select('id, name').in('id', fleetIds) : { data: [] },
      supabase.from('ships').select('id, name').in('id', shipIds),
      supabase.from('companies').select('id, name').in('id', agencyIds),
    ]);

    // Create lookup maps
    const ranksMap = new Map((ranksRes.data || []).map(r => [r.id, r]));
    const companiesMap = new Map((companiesRes.data || []).map(c => [c.id, c]));
    const fleetsMap = new Map((fleetsRes.data || []).map(f => [f.id, f]));
    const shipsMap = new Map((shipsRes.data || []).map(s => [s.id, s]));
    const agenciesMap = new Map((agenciesRes.data || []).map(a => [a.id, a]));

    // Map recommendations with joined data
    return recommendations.map(rec => {
      const rank = ranksMap.get(rec.rank_id);
      const company = companiesMap.get(rec.company_id);
      const fleet = rec.fleet_id ? fleetsMap.get(rec.fleet_id) : null;
      const ship = shipsMap.get(rec.ship_id);
      const agency = agenciesMap.get(rec.manning_agency_id);

      return {
        ...rec,
        resume_files: parseResumeFiles(rec.resume_files),
        manning_agency_name: agency?.name || '',
        rank_name: rank?.name || '',
        rank_code: rank?.rank_code || '',
        department: rank?.department || '',
        company_name: company?.name || '',
        fleet_name: fleet?.name || '',
        ship_name: ship?.name || '',
      };
    });
  }

  async getByJobPostingGroupAndAgency(groupId: string, agencyId: string): Promise<CrewRecommendationWithDetails[]> {
    // First, get all recommendations for this job posting group and agency
    const { data: recommendations, error: recError } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('job_posting_group_id', groupId)
      .eq('manning_agency_id', agencyId)
      .order('created_at', { ascending: false });

    if (recError) throw recError;
    if (!recommendations || recommendations.length === 0) return [];

    // Get unique IDs for batch fetching
    const rankIds = [...new Set(recommendations.map(r => r.rank_id))];
    const companyIds = [...new Set(recommendations.map(r => r.company_id))];
    const fleetIds = [...new Set(recommendations.map(r => r.fleet_id).filter(Boolean))];
    const shipIds = [...new Set(recommendations.map(r => r.ship_id))];
    const agencyIds = [...new Set(recommendations.map(r => r.manning_agency_id))];

    // Batch fetch all related data
    const [ranksRes, companiesRes, fleetsRes, shipsRes, agenciesRes] = await Promise.all([
      supabase.from('ranks').select('id, name, rank_code, department').in('id', rankIds),
      supabase.from('companies').select('id, name').in('id', companyIds),
      fleetIds.length > 0 ? supabase.from('fleets').select('id, name').in('id', fleetIds) : { data: [] },
      supabase.from('ships').select('id, name').in('id', shipIds),
      supabase.from('companies').select('id, name').in('id', agencyIds),
    ]);

    // Create lookup maps
    const ranksMap = new Map((ranksRes.data || []).map(r => [r.id, r]));
    const companiesMap = new Map((companiesRes.data || []).map(c => [c.id, c]));
    const fleetsMap = new Map((fleetsRes.data || []).map(f => [f.id, f]));
    const shipsMap = new Map((shipsRes.data || []).map(s => [s.id, s]));
    const agenciesMap = new Map((agenciesRes.data || []).map(a => [a.id, a]));

    // Map recommendations with joined data
    return recommendations.map(rec => {
      const rank = ranksMap.get(rec.rank_id);
      const company = companiesMap.get(rec.company_id);
      const fleet = rec.fleet_id ? fleetsMap.get(rec.fleet_id) : null;
      const ship = shipsMap.get(rec.ship_id);
      const agency = agenciesMap.get(rec.manning_agency_id);

      return {
        ...rec,
        resume_files: parseResumeFiles(rec.resume_files),
        manning_agency_name: agency?.name || '',
        rank_name: rank?.name || '',
        rank_code: rank?.rank_code || '',
        department: rank?.department || '',
        company_name: company?.name || '',
        fleet_name: fleet?.name || '',
        ship_name: ship?.name || '',
      };
    });
  }

  async getByManningAgency(agencyId: string): Promise<CrewRecommendationWithDetails[]> {
    // First, get all recommendations for this agency
    const { data: recommendations, error: recError } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('manning_agency_id', agencyId)
      .order('created_at', { ascending: false });

    if (recError) throw recError;
    if (!recommendations || recommendations.length === 0) return [];

    // Get unique IDs for batch fetching
    const rankIds = [...new Set(recommendations.map(r => r.rank_id))];
    const companyIds = [...new Set(recommendations.map(r => r.company_id))];
    const fleetIds = [...new Set(recommendations.map(r => r.fleet_id).filter(Boolean))];
    const shipIds = [...new Set(recommendations.map(r => r.ship_id))];
    const agencyIds = [...new Set(recommendations.map(r => r.manning_agency_id))];

    // Batch fetch all related data
    const [ranksRes, companiesRes, fleetsRes, shipsRes, agenciesRes] = await Promise.all([
      supabase.from('ranks').select('id, name, rank_code, department').in('id', rankIds),
      supabase.from('companies').select('id, name').in('id', companyIds),
      fleetIds.length > 0 ? supabase.from('fleets').select('id, name').in('id', fleetIds) : { data: [] },
      supabase.from('ships').select('id, name').in('id', shipIds),
      supabase.from('companies').select('id, name').in('id', agencyIds),
    ]);

    // Create lookup maps
    const ranksMap = new Map((ranksRes.data || []).map(r => [r.id, r]));
    const companiesMap = new Map((companiesRes.data || []).map(c => [c.id, c]));
    const fleetsMap = new Map((fleetsRes.data || []).map(f => [f.id, f]));
    const shipsMap = new Map((shipsRes.data || []).map(s => [s.id, s]));
    const agenciesMap = new Map((agenciesRes.data || []).map(a => [a.id, a]));

    // Map recommendations with joined data
    return recommendations.map(rec => {
      const rank = ranksMap.get(rec.rank_id);
      const company = companiesMap.get(rec.company_id);
      const fleet = rec.fleet_id ? fleetsMap.get(rec.fleet_id) : null;
      const ship = shipsMap.get(rec.ship_id);
      const agency = agenciesMap.get(rec.manning_agency_id);

      return {
        ...rec,
        resume_files: parseResumeFiles(rec.resume_files),
        manning_agency_name: agency?.name || '',
        rank_name: rank?.name || '',
        rank_code: rank?.rank_code || '',
        department: rank?.department || '',
        company_name: company?.name || '',
        fleet_name: fleet?.name || '',
        ship_name: ship?.name || '',
      };
    });
  }

  async getByShip(shipId: string): Promise<CrewRecommendationWithDetails[]> {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('ship_id', shipId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map(item => ({
      ...item,
      resume_files: parseResumeFiles(item.resume_files),
      manning_agency_name: '',
      rank_name: '',
      rank_code: '',
      department: '',
      company_name: '',
      fleet_name: '',
      ship_name: '',
    }));
  }

  /**
   * Check if current user has supervisor permission for a ship
   */
  async checkSupervisorPermission(userId: string, shipId: string): Promise<{ allowed: boolean; message?: string }> {
    // Get user role
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();

    if (userError || !userData) {
      return { allowed: false, message: '사용자 정보를 찾을 수 없습니다.' };
    }

    // Only ship_manager role needs supervisor check
    if (userData.role !== 'ship_manager') {
      return { allowed: true }; // Other roles don't need supervisor permission
    }

    // Check supervisor assignment
    const supervisorCheck = await supervisorService.isSupervisorForShip(userId, shipId);
    
    if (!supervisorCheck.is_supervisor) {
      return { 
        allowed: false, 
        message: '해당 선박의 담당 감독이 아닙니다. 담당 감독만 선원 추천을 생성할 수 있습니다.' 
      };
    }

    return { allowed: true };
  }

  async create(recommendation: Partial<CrewRecommendation>): Promise<CrewRecommendation> {
    // Check supervisor permission if ship_id is provided
    if (recommendation.ship_id && recommendation.created_by) {
      const permissionCheck = await this.checkSupervisorPermission(
        recommendation.created_by,
        recommendation.ship_id
      );

      if (!permissionCheck.allowed) {
        throw new Error(permissionCheck.message || '권한이 없습니다.');
      }
    }

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .insert(recommendation)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateStatus(id: string, status: CrewRecommendation['status']): Promise<void> {
    const { error } = await supabase
      .from(TABLE_NAME)
      .update({ status })
      .eq('id', id);

    if (error) throw error;
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from(TABLE_NAME)
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  async getRecommendationCountByJobPostingGroup(groupId: string): Promise<number> {
    const { count, error } = await supabase
      .from(TABLE_NAME)
      .select('*', { count: 'exact', head: true })
      .eq('job_posting_group_id', groupId)
      .neq('status', 'withdrawn');

    if (error) throw error;
    return count || 0;
  }

  /**
   * 결재 승인(accepted)된 추천 건을 등록 선원 목록에 자동으로 반영한다.
   * 이미 crew_member_id가 있으면 건드리지 않음(중복 등록 방지).
   * 여권/승선증서 등 세부 정보는 여전히 "선원 등록" 화면에서 보완 입력한다.
   */
  async registerCrewFromRecommendation(recommendationId: string): Promise<string | null> {
    const { data: rec, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('id', recommendationId)
      .single();

    if (error || !rec) return null;
    if (rec.crew_member_id) return rec.crew_member_id;

    const newCrew = await crewService.create({
      name: rec.crew_name,
      rank_id: rec.rank_id,
      nationality: rec.nationality || undefined,
      date_of_birth: rec.crew_birth_date,
      owner_id: rec.company_id || undefined,
      fleet_id: rec.fleet_id || undefined,
      current_ship_id: rec.ship_id || undefined,
      manning_agency_id: rec.manning_agency_id,
      current_status: 'registered',
    });

    if (!newCrew?.id) return null;

    await supabase
      .from(TABLE_NAME)
      .update({ crew_member_id: newCrew.id, updated_at: new Date().toISOString() })
      .eq('id', recommendationId);

    return newCrew.id;
  }

  async getRecommendationCountByJobPostingGroupAndAgency(groupId: string, agencyId: string): Promise<number> {
    const { count, error } = await supabase
      .from(TABLE_NAME)
      .select('*', { count: 'exact', head: true })
      .eq('job_posting_group_id', groupId)
      .eq('manning_agency_id', agencyId)
      .neq('status', 'withdrawn');

    if (error) throw error;
    return count || 0;
  }
}

export const crewRecommendationService = new CrewRecommendationService();