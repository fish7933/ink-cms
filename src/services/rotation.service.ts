import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/store';
import type {
  CrewRotationPlan,
  CrewRotationPlanWithDetails,
  CrewRotationAssignment,
  CrewRotationAssignmentWithDetails,
  CrewEmbarkationRecord,
  CrewEmbarkationRecordWithDetails,
  RotationPlanFormData,
  RotationPlanStatus,
} from '@/types/rotation';
import type { CrewMember } from '@/types/models';

export const rotationService = {
  /**
   * Get all rotation plans with filters
   */
  async getRotationPlans(filters?: {
    ship_id?: string;
    owner_id?: string;
    fleet_id?: string;
    status?: RotationPlanStatus;
  }): Promise<CrewRotationPlanWithDetails[]> {
    const currentUser = await getCurrentUser();
    if (!currentUser) return [];

    let query = supabase
      .from('crew_rotation_plans')
      .select(`
        *,
        ship:ships!crew_rotation_plans_ship_id_fkey(id, name),
        owner:companies!crew_rotation_plans_owner_id_fkey(id, name),
        fleet:fleets!crew_rotation_plans_fleet_id_fkey(id, name),
        creator:users!crew_rotation_plans_created_by_fkey(id, name)
      `)
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters?.ship_id) {
      query = query.eq('ship_id', filters.ship_id);
    }
    if (filters?.owner_id) {
      query = query.eq('owner_id', filters.owner_id);
    }
    if (filters?.fleet_id) {
      query = query.eq('fleet_id', filters.fleet_id);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    // Filter by user role
    if (currentUser.role === 'ship_manager' && currentUser.company_id) {
      query = query.eq('owner_id', currentUser.company_id);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching rotation plans:', error);
      return [];
    }

    // Fetch assignments for each plan
    const plansWithAssignments = await Promise.all(
      (data || []).map(async (plan) => {
        const assignments = await this.getRotationAssignments(plan.id);
        return {
          ...plan,
          ship_name: plan.ship?.name || '',
          owner_name: plan.owner?.name || '',
          fleet_name: plan.fleet?.name,
          creator_name: plan.creator?.name || '',
          assignments,
        };
      })
    );

    return plansWithAssignments;
  },

  /**
   * Get rotation plan by ID
   */
  async getRotationPlanById(id: string): Promise<CrewRotationPlanWithDetails | null> {
    const { data, error } = await supabase
      .from('crew_rotation_plans')
      .select(`
        *,
        ship:ships!crew_rotation_plans_ship_id_fkey(id, name),
        owner:companies!crew_rotation_plans_owner_id_fkey(id, name),
        fleet:fleets!crew_rotation_plans_fleet_id_fkey(id, name),
        creator:users!crew_rotation_plans_created_by_fkey(id, name)
      `)
      .eq('id', id)
      .single();

    if (error || !data) {
      console.error('Error fetching rotation plan:', error);
      return null;
    }

    const assignments = await this.getRotationAssignments(id);

    return {
      ...data,
      ship_name: data.ship?.name || '',
      owner_name: data.owner?.name || '',
      fleet_name: data.fleet?.name,
      creator_name: data.creator?.name || '',
      assignments,
    };
  },

  /**
   * Get rotation assignments for a plan
   */
  async getRotationAssignments(planId: string): Promise<CrewRotationAssignmentWithDetails[]> {
    const { data, error } = await supabase
      .from('crew_rotation_assignments')
      .select(`
        *,
        off_crew:crew_members!crew_rotation_assignments_off_crew_id_fkey(id, name, rank),
        off_rank:ranks!crew_rotation_assignments_off_rank_id_fkey(id, name, rank_code),
        on_crew:crew_members!crew_rotation_assignments_on_crew_id_fkey(id, name, rank),
        on_rank:ranks!crew_rotation_assignments_on_rank_id_fkey(id, name, rank_code)
      `)
      .eq('rotation_plan_id', planId);

    if (error) {
      console.error('Error fetching rotation assignments:', error);
      return [];
    }

    return (data || []).map((assignment) => ({
      ...assignment,
      off_crew_name: assignment.off_crew?.name,
      off_rank_name: assignment.off_rank?.name,
      off_rank_code: assignment.off_rank?.rank_code,
      on_crew_name: assignment.on_crew?.name || '',
      on_rank_name: assignment.on_rank?.name || '',
      on_rank_code: assignment.on_rank?.rank_code || '',
    }));
  },

  /**
   * 아직 반려되지 않은(임시저장/결재대기/승인) 교대 계획에 승선자 또는 하선자로 이미 배정된
   * 선원 id 목록. 새 교대 계획 작성 시 같은 선원이 다른 계획에 중복으로 들어가지 않도록
   * 후보 목록에서 제외하는 데 사용. (반려된 계획은 무효이므로 제외 대상 아님. 실행완료된
   * 계획은 crew_members.status가 이미 실제 상태로 바뀌어 자연히 걸러지므로 별도 제외 불필요.)
   */
  async getActivelyReservedCrewIds(): Promise<Set<string>> {
    const { data, error } = await supabase
      .from('crew_rotation_assignments')
      .select('on_crew_id, off_crew_id, plan:crew_rotation_plans!inner(status)')
      .in('plan.status', ['draft', 'pending_approval', 'approved']);

    if (error) {
      console.error('Error fetching reserved crew ids:', error);
      return new Set();
    }

    const ids = new Set<string>();
    for (const row of data || []) {
      if (row.on_crew_id) ids.add(row.on_crew_id as string);
      if (row.off_crew_id) ids.add(row.off_crew_id as string);
    }
    return ids;
  },

  /**
   * Create a new rotation plan
   */
  async createRotationPlan(formData: RotationPlanFormData): Promise<CrewRotationPlan | null> {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      console.error('No current user');
      return null;
    }

    // Create the plan
    const { data: plan, error: planError } = await supabase
      .from('crew_rotation_plans')
      .insert([
        {
          ship_id: formData.ship_id,
          owner_id: formData.owner_id,
          fleet_id: formData.fleet_id,
          plan_name: formData.plan_name,
          rotation_date: formData.rotation_date,
          status: 'draft',
          created_by: currentUser.id,
          notes: formData.notes,
          base_departure_date: formData.base_departure_date,
          port_id: formData.port_id,
        },
      ])
      .select()
      .single();

    if (planError || !plan) {
      console.error('Error creating rotation plan:', planError);
      return null;
    }

    // Create assignments
    if (formData.assignments.length > 0) {
      const assignments = formData.assignments.map((assignment) => ({
        rotation_plan_id: plan.id,
        off_crew_id: assignment.off_crew_id,
        off_rank_id: assignment.off_rank_id,
        off_rank_grade: assignment.off_rank_grade,
        off_disembark_date: assignment.off_disembark_date,
        off_return_date: assignment.off_return_date,
        on_crew_id: assignment.on_crew_id,
        on_rank_id: assignment.on_rank_id,
        on_rank_grade: assignment.on_rank_grade,
        on_departure_date: assignment.on_departure_date,
        contract_months: assignment.contract_months,
        salary_template_id: assignment.salary_template_id,
        salary_amount: assignment.salary_amount,
        salary_currency: assignment.salary_currency || 'USD',
        embark_date: assignment.embark_date,
        notes: assignment.notes,
      }));

      const { error: assignmentsError } = await supabase
        .from('crew_rotation_assignments')
        .insert(assignments);

      if (assignmentsError) {
        console.error('Error creating rotation assignments:', assignmentsError);
        // Rollback: delete the plan
        await supabase.from('crew_rotation_plans').delete().eq('id', plan.id);
        return null;
      }

      // 승선 후보에 추가된 "등록" 상태 선원 → "대기(standby)" 로 변경
      const boardingIds = formData.assignments
        .map(a => a.on_crew_id)
        .filter((id): id is string => Boolean(id));
      if (boardingIds.length > 0) {
        await supabase
          .from('crew_members')
          .update({ status: 'standby', updated_at: new Date().toISOString() })
          .in('id', boardingIds)
          .in('status', ['registered', 'under_review', 'sent_to_owner', 'owner_approved', 'owner_rejected']);
      }
    }

    return plan;
  },

  /**
   * Update rotation plan
   */
  async updateRotationPlan(
    id: string,
    updates: Partial<RotationPlanFormData>
  ): Promise<CrewRotationPlan | null> {
    const updateData: Record<string, unknown> = {};

    if (updates.plan_name) updateData.plan_name = updates.plan_name;
    if (updates.rotation_date) updateData.rotation_date = updates.rotation_date;
    if (updates.notes !== undefined) updateData.notes = updates.notes;
    if (updates.base_departure_date !== undefined) updateData.base_departure_date = updates.base_departure_date;
    if (updates.port_id !== undefined) updateData.port_id = updates.port_id;
    updateData.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('crew_rotation_plans')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating rotation plan:', error);
      return null;
    }

    return data;
  },

  /**
   * Delete rotation plan
   */
  async deleteRotationPlan(id: string): Promise<boolean> {
    const { error } = await supabase.from('crew_rotation_plans').delete().eq('id', id);

    if (error) {
      console.error('Error deleting rotation plan:', error);
      return false;
    }

    return true;
  },

  /**
   * Submit rotation plan for approval
   */
  async submitForApproval(planId: string, approvalLineId: string): Promise<boolean> {
    // This will be integrated with the approval system
    // For now, just update the status
    const { error } = await supabase
      .from('crew_rotation_plans')
      .update({
        status: 'pending_approval',
        updated_at: new Date().toISOString(),
      })
      .eq('id', planId);

    if (error) {
      console.error('Error submitting rotation plan for approval:', error);
      return false;
    }

    return true;
  },

  /**
   * Execute approved rotation plan
   * 승선자 → onboard, 하선자 → standby, 계획 → executed
   */
  async executeRotationPlan(planId: string): Promise<boolean> {
    // 계획 + 전체 배정 상세 조회
    const [{ data: plan }, { data: assignments, error: fetchErr }] = await Promise.all([
      supabase.from('crew_rotation_plans').select('*').eq('id', planId).single(),
      supabase.from('crew_rotation_assignments').select('*').eq('rotation_plan_id', planId),
    ]);

    if (!plan || fetchErr) {
      console.error('발령 실행 실패: 계획/배정 조회 오류', fetchErr);
      return false;
    }

    const now = new Date().toISOString();

    for (const a of (assignments || [])) {
      // ── 하선자: 기존 승선 기록 완료 처리 + crew_members 초기화 ──
      if (a.off_crew_id) {
        await supabase
          .from('crew_embarkation_records')
          .update({
            disembark_date: a.off_disembark_date || a.embark_date,
            return_date: a.off_return_date || null,
            status: 'completed',
            updated_at: now,
          })
          .eq('crew_member_id', a.off_crew_id)
          .eq('ship_id', plan.ship_id)
          .eq('status', 'active');

        await supabase
          .from('crew_members')
          .update({ status: 'standby', current_ship_id: null, current_grade: null, updated_at: now })
          .eq('id', a.off_crew_id);
      }

      // ── 승선자: 새 승선 기록 생성 + crew_members 갱신 ──
      if (a.on_crew_id) {
        await supabase.from('crew_embarkation_records').insert({
          crew_member_id: a.on_crew_id,
          ship_id: plan.ship_id,
          rank_id: a.on_rank_id,
          rank_grade: a.on_rank_grade,
          departure_date: a.on_departure_date || null,
          embark_date: a.embark_date,
          contract_months: a.contract_months,
          salary_template_id: a.salary_template_id,
          salary_amount: a.salary_amount,
          salary_currency: a.salary_currency || 'USD',
          status: 'active',
          notes: a.notes,
        });

        await supabase
          .from('crew_members')
          .update({
            status: 'onboard',
            current_ship_id: plan.ship_id,
            owner_id: plan.owner_id,
            fleet_id: plan.fleet_id || null,
            rank_id: a.on_rank_id || null,     // 발령 직급으로 갱신
            current_grade: a.on_rank_grade || null,
            updated_at: now,
          })
          .eq('id', a.on_crew_id);
      }
    }

    // 계획 상태 → executed
    const { error: planErr } = await supabase
      .from('crew_rotation_plans')
      .update({ status: 'executed', executed_at: now, updated_at: now })
      .eq('id', planId);

    if (planErr) {
      console.error('Error updating plan status to executed:', planErr);
      return false;
    }

    return true;
  },

  /**
   * Get crew members currently on board a ship
   */
  async getOnboardCrew(shipId: string): Promise<CrewMember[]> {
    const { data, error } = await supabase
      .from('crew_members')
      .select('*')
      .eq('current_ship_id', shipId)
      .eq('status', 'on_board');

    if (error) {
      console.error('Error fetching onboard crew:', error);
      return [];
    }

    return data || [];
  },

  /**
   * Get available crew for embarkation (standby + owner_approved)
   */
  async getAvailableCrew(filters?: {
    owner_id?: string;
    rank_id?: string;
  }): Promise<CrewMember[]> {
    let query = supabase
      .from('crew_members')
      .select('*')
      .in('status', ['standby', 'owner_approved']);

    if (filters?.owner_id) {
      query = query.eq('owner_id', filters.owner_id);
    }

    if (filters?.rank_id) {
      query = query.eq('rank_id', filters.rank_id);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching available crew:', error);
      return [];
    }

    return data || [];
  },

  /**
   * Get embarkation history for a crew member
   */
  async getCrewEmbarkationHistory(crewMemberId: string): Promise<CrewEmbarkationRecordWithDetails[]> {
    const { data, error } = await supabase
      .from('crew_embarkation_records')
      .select(`
        *,
        crew:crew_members!crew_embarkation_records_crew_member_id_fkey(id, name),
        ship:ships!crew_embarkation_records_ship_id_fkey(id, name, owner_id, fleet_id),
        rank:ranks!crew_embarkation_records_rank_id_fkey(id, name, rank_code)
      `)
      .eq('crew_member_id', crewMemberId)
      .order('embark_date', { ascending: false });

    if (error) {
      console.error('Error fetching embarkation history:', error);
      return [];
    }

    // Fetch owner and fleet names
    const records = await Promise.all(
      (data || []).map(async (record) => {
        let owner_name = '';
        let fleet_name = '';

        if (record.ship?.owner_id) {
          const { data: owner } = await supabase
            .from('companies')
            .select('name')
            .eq('id', record.ship.owner_id)
            .single();
          owner_name = owner?.name || '';
        }

        if (record.ship?.fleet_id) {
          const { data: fleet } = await supabase
            .from('fleets')
            .select('name')
            .eq('id', record.ship.fleet_id)
            .single();
          fleet_name = fleet?.name || '';
        }

        return {
          ...record,
          crew_name: record.crew?.name || '',
          ship_name: record.ship?.name || '',
          rank_name: record.rank?.name || '',
          rank_code: record.rank?.rank_code || '',
          owner_name,
          fleet_name,
        };
      })
    );

    return records;
  },

  /**
   * Get embarkation history for a ship
   */
  async getShipEmbarkationHistory(shipId: string): Promise<CrewEmbarkationRecordWithDetails[]> {
    const { data, error } = await supabase
      .from('crew_embarkation_records')
      .select(`
        *,
        crew:crew_members!crew_embarkation_records_crew_member_id_fkey(id, name),
        ship:ships!crew_embarkation_records_ship_id_fkey(id, name, owner_id, fleet_id),
        rank:ranks!crew_embarkation_records_rank_id_fkey(id, name, rank_code)
      `)
      .eq('ship_id', shipId)
      .order('embark_date', { ascending: false });

    if (error) {
      console.error('Error fetching ship embarkation history:', error);
      return [];
    }

    // Fetch owner and fleet names
    const records = await Promise.all(
      (data || []).map(async (record) => {
        let owner_name = '';
        let fleet_name = '';

        if (record.ship?.owner_id) {
          const { data: owner } = await supabase
            .from('companies')
            .select('name')
            .eq('id', record.ship.owner_id)
            .single();
          owner_name = owner?.name || '';
        }

        if (record.ship?.fleet_id) {
          const { data: fleet } = await supabase
            .from('fleets')
            .select('name')
            .eq('id', record.ship.fleet_id)
            .single();
          fleet_name = fleet?.name || '';
        }

        return {
          ...record,
          crew_name: record.crew?.name || '',
          ship_name: record.ship?.name || '',
          rank_name: record.rank?.name || '',
          rank_code: record.rank?.rank_code || '',
          owner_name,
          fleet_name,
        };
      })
    );

    return records;
  },

  /**
   * 현재 승선 중인 선원의 계약만료 정보 조회
   * crew_rotation_assignments 에서 executed 계획의 승선 기록을 토대로 만료일 계산
   */
  async getOnboardContractExpiry(): Promise<ContractExpiryInfo[]> {
    // onboard 선원 목록
    const { data: onboardCrew, error: crewErr } = await supabase
      .from('crew_members')
      .select('id, name, rank_id, current_ship_id, owner_id, fleet_id')
      .eq('status', 'onboard');
    if (crewErr || !onboardCrew || onboardCrew.length === 0) return [];

    const crewIds = onboardCrew.map(c => c.id);

    // executed 계획의 승선 배정 가져오기 (on_crew_id 기준)
    const { data: assignments, error: aErr } = await supabase
      .from('crew_rotation_assignments')
      .select('on_crew_id, embark_date, contract_months, rotation_plan_id')
      .in('on_crew_id', crewIds)
      .not('embark_date', 'is', null)
      .not('contract_months', 'is', null);
    if (aErr || !assignments) return [];

    // executed 계획 ID 필터
    const planIds = [...new Set(assignments.map(a => a.rotation_plan_id))];
    const { data: executedPlans } = await supabase
      .from('crew_rotation_plans')
      .select('id')
      .in('id', planIds)
      .eq('status', 'executed');
    const executedIds = new Set((executedPlans || []).map(p => p.id));

    // 선원별 최신 executed 배정 선택 (embark_date 내림차순)
    const latestByCrewId = new Map<string, typeof assignments[number]>();
    for (const a of assignments) {
      if (!a.on_crew_id || !executedIds.has(a.rotation_plan_id)) continue;
      const prev = latestByCrewId.get(a.on_crew_id);
      if (!prev || a.embark_date > prev.embark_date) latestByCrewId.set(a.on_crew_id, a);
    }

    // 선박 정보
    const shipIds = [...new Set(onboardCrew.map(c => c.current_ship_id).filter(Boolean))];
    const { data: ships } = await supabase.from('ships').select('id, name').in('id', shipIds);
    const shipMap = new Map((ships || []).map(s => [s.id, s.name]));

    const today = new Date();
    const results: ContractExpiryInfo[] = [];

    for (const crew of onboardCrew) {
      const asgn = latestByCrewId.get(crew.id);
      if (!asgn || !asgn.embark_date || !asgn.contract_months) continue;

      const [ey, em, ed] = asgn.embark_date.split('-').map(Number);
      const expiry = new Date(ey, em - 1 + asgn.contract_months, ed);
      const expiryStr = `${expiry.getFullYear()}-${String(expiry.getMonth()+1).padStart(2,'0')}-${String(expiry.getDate()).padStart(2,'0')}`;
      const daysUntil = Math.ceil((expiry.getTime() - today.getTime()) / 86400000);

      results.push({
        crew_id: crew.id,
        crew_name: crew.name,
        rank_id: crew.rank_id,
        embark_date: asgn.embark_date,
        contract_months: asgn.contract_months,
        expiry_date: expiryStr,
        days_until_expiry: daysUntil,
        ship_id: crew.current_ship_id || '',
        ship_name: shipMap.get(crew.current_ship_id || '') || '-',
        owner_id: crew.owner_id || '',
        fleet_id: crew.fleet_id || undefined,
      });
    }

    return results.sort((a, b) => a.days_until_expiry - b.days_until_expiry);
  },
};

export interface ContractExpiryInfo {
  crew_id: string;
  crew_name: string;
  rank_id: string;
  embark_date: string;
  contract_months: number;
  expiry_date: string;
  days_until_expiry: number;
  ship_id: string;
  ship_name: string;
  owner_id: string;
  fleet_id?: string;
}