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
        on_crew_id: assignment.on_crew_id,
        on_rank_id: assignment.on_rank_id,
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
   */
  async executeRotationPlan(planId: string): Promise<boolean> {
    const { error } = await supabase.rpc('execute_rotation_plan', {
      plan_id: planId,
    });

    if (error) {
      console.error('Error executing rotation plan:', error);
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
};