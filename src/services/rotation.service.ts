import { addMonths, format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/store';
import { rotationApprovalService } from '@/services/rotation-approval.service';
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
      .is('deleted_at', null)
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

    // 저장 시점에 다시 한번 다른 활성 계획에 이미 배정된 선원이 없는지 확인한다. 화면의 후보
    // 목록은 폼을 열었을 때의 스냅샷이라, 그 사이 다른 계획(다른 탭/사용자)에 먼저 배정됐을 수 있다.
    const requestedCrewIds = [...new Set(
      formData.assignments.flatMap(a => [a.on_crew_id, a.off_crew_id]).filter((id): id is string => !!id)
    )];
    if (requestedCrewIds.length > 0) {
      const { data: conflictRows } = await supabase
        .from('crew_rotation_assignments')
        .select('on_crew_id, off_crew_id, plan:crew_rotation_plans!inner(status)')
        .in('plan.status', ['draft', 'pending_approval', 'approved']);
      const conflictCrewIds = new Set<string>();
      for (const row of conflictRows || []) {
        if (row.on_crew_id && requestedCrewIds.includes(row.on_crew_id)) conflictCrewIds.add(row.on_crew_id as string);
        if (row.off_crew_id && requestedCrewIds.includes(row.off_crew_id)) conflictCrewIds.add(row.off_crew_id as string);
      }
      if (conflictCrewIds.size > 0) {
        const { data: crewRows } = await supabase.from('crew_members').select('id, name').in('id', [...conflictCrewIds]);
        const names = (crewRows || []).map(c => c.name).join(', ') || '선택한 선원';
        throw new Error(`${names} — 이미 다른 진행중인 교대계획에 배정되어 있습니다. 화면을 새로고침한 뒤 다시 시도해주세요.`);
      }
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
   * 임시저장(draft) 상태인 교대계획의 배정 내용을 통째로 수정한다 — 결재 상신 전까지는
   * 교대 계획 작성 화면에서 다시 열어 배정 인원/일정을 바꿀 수 있어야 한다.
   * 기존 배정을 모두 지우고 새로 넣는 방식이라, draft가 아닌 계획에는 사용할 수 없다.
   */
  async updateRotationPlanWithAssignments(planId: string, formData: RotationPlanFormData): Promise<CrewRotationPlan | null> {
    const { data: existingPlan, error: existingError } = await supabase
      .from('crew_rotation_plans')
      .select('id, status')
      .eq('id', planId)
      .single();
    if (existingError || !existingPlan) { console.error('Error fetching plan to update:', existingError); return null; }
    if (existingPlan.status !== 'draft') {
      throw new Error('임시저장 상태의 계획만 수정할 수 있습니다. 이미 결재가 진행중이거나 처리된 계획입니다.');
    }

    // 저장 시점 재검증 — 이 계획 자신에게 이미 배정된 선원은 충돌로 보지 않는다.
    const requestedCrewIds = [...new Set(
      formData.assignments.flatMap(a => [a.on_crew_id, a.off_crew_id]).filter((id): id is string => !!id)
    )];
    if (requestedCrewIds.length > 0) {
      const { data: conflictRows } = await supabase
        .from('crew_rotation_assignments')
        .select('on_crew_id, off_crew_id, rotation_plan_id, plan:crew_rotation_plans!inner(status)')
        .in('plan.status', ['draft', 'pending_approval', 'approved']);
      const conflictCrewIds = new Set<string>();
      for (const row of conflictRows || []) {
        if (row.rotation_plan_id === planId) continue;
        if (row.on_crew_id && requestedCrewIds.includes(row.on_crew_id)) conflictCrewIds.add(row.on_crew_id as string);
        if (row.off_crew_id && requestedCrewIds.includes(row.off_crew_id)) conflictCrewIds.add(row.off_crew_id as string);
      }
      if (conflictCrewIds.size > 0) {
        const { data: crewRows } = await supabase.from('crew_members').select('id, name').in('id', [...conflictCrewIds]);
        const names = (crewRows || []).map(c => c.name).join(', ') || '선택한 선원';
        throw new Error(`${names} — 이미 다른 진행중인 교대계획에 배정되어 있습니다. 화면을 새로고침한 뒤 다시 시도해주세요.`);
      }
    }

    const { data: plan, error: planError } = await supabase
      .from('crew_rotation_plans')
      .update({
        ship_id: formData.ship_id,
        owner_id: formData.owner_id,
        fleet_id: formData.fleet_id,
        plan_name: formData.plan_name,
        rotation_date: formData.rotation_date,
        notes: formData.notes,
        base_departure_date: formData.base_departure_date,
        port_id: formData.port_id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', planId)
      .select()
      .single();
    if (planError || !plan) { console.error('Error updating rotation plan:', planError); return null; }

    const { error: deleteError } = await supabase.from('crew_rotation_assignments').delete().eq('rotation_plan_id', planId);
    if (deleteError) { console.error('Error clearing old assignments:', deleteError); return null; }

    if (formData.assignments.length > 0) {
      const assignments = formData.assignments.map((assignment) => ({
        rotation_plan_id: planId,
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

      const { error: assignmentsError } = await supabase.from('crew_rotation_assignments').insert(assignments);
      if (assignmentsError) { console.error('Error re-creating rotation assignments:', assignmentsError); return null; }

      const boardingIds = formData.assignments.map(a => a.on_crew_id).filter((id): id is string => Boolean(id));
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
   * 교대계획을 발령 결재(rotation_plan_approvals)로 상신한다 — 채용 결재와 동일하게
   * 결재선을 직접 선택하는 방식(조직도 소속 부서 기반 자동 구성은 더 이상 쓰지 않음).
   */
  async submitRotationPlanForApproval(planId: string, approvalLineId: string, comment?: string): Promise<{ ok: boolean; message?: string }> {
    const currentUser = await getCurrentUser();
    if (!currentUser) return { ok: false, message: '로그인 정보를 확인할 수 없습니다.' };

    const { data: plan, error: planError } = await supabase
      .from('crew_rotation_plans')
      .select('id, plan_name, created_by')
      .eq('id', planId)
      .single();
    if (planError || !plan) return { ok: false, message: '교대계획을 찾을 수 없습니다.' };

    try {
      await rotationApprovalService.createApproval(planId, approvalLineId, plan.created_by, comment);

      await supabase
        .from('crew_rotation_plans')
        .update({ status: 'pending_approval', updated_at: new Date().toISOString() })
        .eq('id', planId);

      return { ok: true };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : '결재 상신 중 오류가 발생했습니다.' };
    }
  },

  /**
   * Delete rotation plan (soft delete — 삭제자/삭제일시를 남기고 목록에서만 제외.
   * 실행완료된 발령의 실제 선원 상태/계약/승선경력 등은 별도 데이터라 되돌리지 않음)
   */
  async deleteRotationPlan(id: string, deletedBy: string): Promise<boolean> {
    const { error } = await supabase
      .from('crew_rotation_plans')
      .update({ deleted_by: deletedBy, deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('Error deleting rotation plan:', error);
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

    // 승선경력/계약 자동 생성에 필요한 참조 데이터 일괄 조회
    const rankIds = [...new Set((assignments || []).flatMap(a => [a.on_rank_id, a.off_rank_id]).filter(Boolean))];
    const crewIds = [...new Set((assignments || []).flatMap(a => [a.on_crew_id, a.off_crew_id]).filter(Boolean))];
    const [{ data: ship }, { data: port }, { data: ranksData }, { data: crewData }, { data: ownerCompany }, { data: companyInfo }] = await Promise.all([
      supabase.from('ships').select('name, ship_type, flag, gross_tonnage, engine_power').eq('id', plan.ship_id).single(),
      plan.port_id
        ? supabase.from('ports').select('country_name, city_name').eq('id', plan.port_id).single()
        : Promise.resolve({ data: null }),
      rankIds.length > 0 ? supabase.from('ranks').select('id, rank_code').in('id', rankIds) : Promise.resolve({ data: [] }),
      crewIds.length > 0 ? supabase.from('crew_members').select('id, nationality, manning_agency_id').in('id', crewIds) : Promise.resolve({ data: [] }),
      supabase.from('companies').select('name').eq('id', plan.owner_id).single(),
      supabase.from('company_info').select('name').order('created_at').limit(1).maybeSingle(),
    ]);
    const ranksById = new Map((ranksData || []).map(r => [r.id, r.rank_code]));
    const nationalityById = new Map((crewData || []).map(c => [c.id, c.nationality]));
    const manningAgencyIdByCrew = new Map((crewData || []).map(c => [c.id, c.manning_agency_id]));
    const portLabel = port ? `${port.city_name}, ${port.country_name}` : undefined;
    const ownerCompanyName = ownerCompany?.name;
    const shipManagerCompanyName = companyInfo?.name;

    const manningAgencyIds = [...new Set((crewData || []).map(c => c.manning_agency_id).filter(Boolean))];
    const { data: manningAgencies } = manningAgencyIds.length > 0
      ? await supabase.from('companies').select('id, name').in('id', manningAgencyIds)
      : { data: [] as { id: string; name: string }[] };
    const manningAgencyNameById = new Map((manningAgencies || []).map(c => [c.id, c.name]));

    for (const a of (assignments || [])) {
      // ── 하선자: 기존 승선 기록 완료 처리 + crew_members 초기화 ──
      if (a.off_crew_id) {
        const disembarkDate = a.off_disembark_date || a.embark_date;

        await supabase
          .from('crew_embarkation_records')
          .update({
            disembark_date: disembarkDate,
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

        // 승선 경력의 진행중이던 항목을 하선일로 종결
        const { data: openService } = await supabase
          .from('sea_service_records')
          .select('id')
          .eq('crew_member_id', a.off_crew_id)
          .eq('record_type', 'company_assignment')
          .is('sign_off_date', null)
          .order('sign_on_date', { ascending: false })
          .limit(1);
        if (openService?.[0]) {
          await supabase.from('sea_service_records').update({
            sign_off_date: disembarkDate,
            port_of_sign_off: portLabel,
            updated_at: now,
          }).eq('id', openService[0].id);
        }

        // 진행중이던 계약을 완료 처리 — 계약종료일(end_date)은 승선/하선일과 별개로
        // 계약서에 기입된 값이므로 실제 하선일로 덮어쓰지 않고 상태만 변경한다.
        await supabase
          .from('crew_contracts')
          .update({ status: 'completed', updated_at: now })
          .eq('crew_member_id', a.off_crew_id)
          .eq('status', 'active');
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

        const rankName = (a.on_rank_id && ranksById.get(a.on_rank_id)) || '';
        const forecastEndDate = a.contract_months
          ? format(addMonths(new Date(a.embark_date), a.contract_months), 'yyyy-MM-dd')
          : a.embark_date;

        // 승선 경력에 새 항목 추가 (본선/직급/톤수 등은 발령 당시 선박 기준, 선주사/매닝사도 함께 기록)
        if (ship) {
          const crewManningAgencyId = manningAgencyIdByCrew.get(a.on_crew_id);
          await supabase.from('sea_service_records').insert({
            crew_member_id: a.on_crew_id,
            record_type: 'company_assignment',
            ship_id: plan.ship_id,
            ship_name: ship.name,
            ship_type: ship.ship_type || undefined,
            flag: ship.flag || undefined,
            gross_tonnage: ship.gross_tonnage || undefined,
            engine_power: ship.engine_power || undefined,
            rank: rankName,
            sign_on_date: a.embark_date,
            port_of_sign_on: portLabel,
            owner_company_name: ownerCompanyName,
            ship_manager_name: shipManagerCompanyName,
            manning_agency_name: crewManningAgencyId ? manningAgencyNameById.get(crewManningAgencyId) : undefined,
          });
        }

        // 계약 자동 생성 — 승선/하선(예정)일, 선주/플릿/선박/국적/직급 포함.
        // 결재 전이므로 draft로 생성 — 발령 결재함에서 계약 결재가 승인되어야 active로 전환된다.
        const { data: newContract } = await supabase.from('crew_contracts').insert({
          crew_member_id: a.on_crew_id,
          ship_id: plan.ship_id,
          owner_id: plan.owner_id,
          fleet_id: plan.fleet_id || null,
          nationality: nationalityById.get(a.on_crew_id) || undefined,
          contract_type: 'initial',
          rank: rankName,
          start_date: a.embark_date,
          end_date: forecastEndDate,
          duration_months: a.contract_months,
          salary_amount: a.salary_amount,
          salary_currency: a.salary_currency || 'USD',
          status: 'draft',
        }).select('id').single();

        // 직급별 수당 기준(재고용수당 등)이 있으면 계약에 자동으로 붙여준다
        if (newContract && a.on_rank_id) {
          const { data: rates } = await supabase
            .from('allowance_rank_rates')
            .select('allowance_type_id, amount, currency, default_payment_basis, default_payment_method')
            .eq('rank_id', a.on_rank_id);
          if (rates && rates.length > 0) {
            await supabase.from('crew_contract_allowances').insert(rates.map(r => ({
              contract_id: newContract.id,
              allowance_type_id: r.allowance_type_id,
              amount: r.amount,
              currency: r.currency,
              payment_basis: r.default_payment_basis,
              payment_method: r.default_payment_method,
            })));
          }
        }
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