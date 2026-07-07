import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/store';
import type { JobPostingGroup, JobPostingRank, JobPostingGroupWithDetails } from '@/types/models';

interface CreateJobPostingGroupData {
  company_id: string;
  fleet_id?: string;
  ship_id: string;
  embarkation_date: string;
  application_deadline?: string;
  requirements?: string;
  visible_to_agencies: string[];
  status: 'active' | 'filled' | 'cancelled';
  urgency: 'urgent' | 'normal';
  created_by?: string;
  ranks: Array<{
    rank_id: string;
    positions_available: number;
    contract_months: number;
    salary_template_id?: string;
    salary_amount?: number;
    salary_currency: string;
    salary_grade?: string | null;
    salary_components: Array<{
      component_id: string;
      component_name: string;
      amount: number;
    }>;
  }>;
}

interface GroupQueryResult {
  id: string;
  company_id: string;
  fleet_id?: string;
  ship_id: string;
  embarkation_date: string;
  application_deadline?: string;
  requirements?: string;
  visible_to_agencies: string[];
  status: 'active' | 'filled' | 'cancelled';
  urgency: 'urgent' | 'normal';
  created_by?: string;
  created_at: string;
  updated_at: string;
  company?: { name: string };
  fleet?: { name: string };
  ship?: { name: string };
}

interface RankQueryResult {
  id: string;
  group_id: string;
  rank_id: string;
  positions_available: number;
  contract_months: number;
  salary_template_id?: string;
  salary_amount?: number;
  salary_currency: string;
  salary_grade?: string | null;
  salary_components: Array<{
    component_id: string;
    component_name: string;
    amount: number;
  }>;
  created_at: string;
  updated_at: string;
  rank?: {
    name: string;
    rank_code: string;
    rank_category: 'officer' | 'rating';
    department: string;
  };
}

interface DuplicateCheckResult {
  id: string;
  ship_id: string;
  embarkation_date: string;
  status: string;
  ship?: { name: string };
}

interface RankDuplicateResult {
  id: string;
  group_id: string;
  rank_id: string;
  rank?: {
    name: string;
    rank_code: string;
  };
  group_embarkation_date?: string;
  ship_name?: string;
}

export const jobPostingGroupService = {
  async getAll(): Promise<JobPostingGroupWithDetails[]> {
    // Get current user to filter based on role
    const currentUser = await getCurrentUser();
    
    let query = supabase
      .from('job_posting_groups')
      .select(`
        *,
        company:companies(name),
        fleet:fleets(name),
        ship:ships(name)
      `);

    // Filter based on user role
    if (currentUser) {
      if (currentUser.role === 'manning_agency') {
        // Manning agency users: only see postings where their company_id is in visible_to_agencies
        if (currentUser.company_id) {
          query = query.contains('visible_to_agencies', [currentUser.company_id]);
        } else {
          // If manning agency user has no company_id, return empty array
          return [];
        }
      } else if (currentUser.role === 'ship_owner') {
        // Ship owner users: only see postings from their own company
        if (currentUser.company_id) {
          query = query.eq('company_id', currentUser.company_id);
        } else {
          return [];
        }
      }
      // ship_manager role: see all postings (no filter)
    }

    const { data: groups, error: groupsError } = await query.order('embarkation_date', { ascending: true });

    if (groupsError) throw groupsError;

    if (!groups || groups.length === 0) return [];

    // Get all ranks for these groups
    const groupIds = groups.map((g: GroupQueryResult) => g.id);
    const { data: ranks, error: ranksError } = await supabase
      .from('job_posting_ranks')
      .select(`
        *,
        rank:ranks(name, rank_code, rank_category, department)
      `)
      .in('group_id', groupIds);

    if (ranksError) throw ranksError;

    // Combine groups with their ranks
    return groups.map((group: GroupQueryResult) => ({
      ...group,
      company_name: group.company?.name || '',
      fleet_name: group.fleet?.name,
      ship_name: group.ship?.name || '',
      ranks: (ranks || [])
        .filter((r: RankQueryResult) => r.group_id === group.id)
        .map((r: RankQueryResult) => ({
          ...r,
          rank_name: r.rank?.name || '',
          rank_code: r.rank?.rank_code || '',
          rank_category: r.rank?.rank_category || 'rating',
          department: r.rank?.department || '',
        })),
    }));
  },

  async getById(id: string): Promise<JobPostingGroupWithDetails | null> {
    const { data: group, error: groupError } = await supabase
      .from('job_posting_groups')
      .select(`
        *,
        company:companies(name),
        fleet:fleets(name),
        ship:ships(name)
      `)
      .eq('id', id)
      .single();

    if (groupError) throw groupError;
    if (!group) return null;

    const { data: ranks, error: ranksError } = await supabase
      .from('job_posting_ranks')
      .select(`
        *,
        rank:ranks(name, rank_code, rank_category, department)
      `)
      .eq('group_id', id);

    if (ranksError) throw ranksError;

    const groupResult = group as GroupQueryResult;

    return {
      ...groupResult,
      company_name: groupResult.company?.name || '',
      fleet_name: groupResult.fleet?.name,
      ship_name: groupResult.ship?.name || '',
      ranks: (ranks || []).map((r: RankQueryResult) => ({
        ...r,
        rank_name: r.rank?.name || '',
        rank_code: r.rank?.rank_code || '',
        rank_category: r.rank?.rank_category || 'rating',
        department: r.rank?.department || '',
      })),
    };
  },

  async create(data: CreateJobPostingGroupData): Promise<JobPostingGroup> {
    const { ranks, ...groupData } = data;

    // Create the group
    const { data: group, error: groupError } = await supabase
      .from('job_posting_groups')
      .insert(groupData)
      .select()
      .single();

    if (groupError) throw groupError;

    // Create the ranks
    const ranksToInsert = ranks.map(rank => ({
      group_id: group.id,
      ...rank,
    }));

    const { error: ranksError } = await supabase
      .from('job_posting_ranks')
      .insert(ranksToInsert);

    if (ranksError) {
      // Rollback: delete the group if ranks insertion fails
      await supabase.from('job_posting_groups').delete().eq('id', group.id);
      throw ranksError;
    }

    return group;
  },

  async update(id: string, data: Partial<CreateJobPostingGroupData>): Promise<JobPostingGroup> {
    const { ranks, ...groupData } = data;

    // Update the group
    const { data: group, error: groupError } = await supabase
      .from('job_posting_groups')
      .update({ ...groupData, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (groupError) throw groupError;

    // If ranks are provided, update them
    if (ranks) {
      // Delete existing ranks
      await supabase.from('job_posting_ranks').delete().eq('group_id', id);

      // Insert new ranks
      const ranksToInsert = ranks.map(rank => ({
        group_id: id,
        ...rank,
      }));

      const { error: ranksError } = await supabase
        .from('job_posting_ranks')
        .insert(ranksToInsert);

      if (ranksError) throw ranksError;
    }

    return group;
  },

  async delete(id: string): Promise<void> {
    // Ranks will be deleted automatically due to CASCADE
    const { error } = await supabase
      .from('job_posting_groups')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async checkDuplicates(
    rankIds: string[],
    embarkationDate: string,
    shipId: string,
    excludeGroupId?: string
  ): Promise<Array<{
    rank_id: string;
    rank_name: string;
    rank_code: string;
    existing_postings: Array<{
      id: string;
      ship_name: string;
      embarkation_date: string;
      days_difference: number;
    }>;
  }>> {
    try {
      // Calculate date range (±30 days)
      const targetDate = new Date(embarkationDate);
      const startDate = new Date(targetDate);
      startDate.setDate(startDate.getDate() - 30);
      const endDate = new Date(targetDate);
      endDate.setDate(endDate.getDate() + 30);

      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      // Query for existing groups
      let groupQuery = supabase
        .from('job_posting_groups')
        .select(`
          id,
          ship_id,
          embarkation_date,
          status,
          ship:ships(name)
        `)
        .eq('ship_id', shipId)
        .eq('status', 'active')
        .gte('embarkation_date', startDateStr)
        .lte('embarkation_date', endDateStr);

      if (excludeGroupId) {
        groupQuery = groupQuery.neq('id', excludeGroupId);
      }

      const { data: groups, error: groupsError } = await groupQuery;
      if (groupsError) throw groupsError;

      if (!groups || groups.length === 0) return [];

      // Get ranks for these groups
      const groupIds = groups.map((g: DuplicateCheckResult) => g.id);
      const { data: ranks, error: ranksError } = await supabase
        .from('job_posting_ranks')
        .select(`
          *,
          rank:ranks(name, rank_code)
        `)
        .in('group_id', groupIds)
        .in('rank_id', rankIds);

      if (ranksError) throw ranksError;

      // Group by rank_id
      const warnings: Array<{
        rank_id: string;
        rank_name: string;
        rank_code: string;
        existing_postings: Array<{
          id: string;
          ship_name: string;
          embarkation_date: string;
          days_difference: number;
        }>;
      }> = [];
      
      const groupedByRank = (ranks || []).reduce((acc: Record<string, RankDuplicateResult[]>, rank: RankQueryResult) => {
        if (!acc[rank.rank_id]) {
          acc[rank.rank_id] = [];
        }
        const group = groups.find((g: DuplicateCheckResult) => g.id === rank.group_id);
        if (group) {
          const rankWithGroup: RankDuplicateResult = {
            ...rank,
            group_embarkation_date: group.embarkation_date,
            ship_name: group.ship?.name || '',
          };
          acc[rank.rank_id].push(rankWithGroup);
        }
        return acc;
      }, {});

      for (const rankId of rankIds) {
        const existingPostings = groupedByRank[rankId] || [];
        
        if (existingPostings.length > 0) {
          const posting = existingPostings[0];
          warnings.push({
            rank_id: rankId,
            rank_name: posting.rank?.name || '',
            rank_code: posting.rank?.rank_code || '',
            existing_postings: existingPostings.map((p: RankDuplicateResult) => {
              const pDate = new Date(p.group_embarkation_date || '');
              const daysDiff = Math.abs(Math.floor((pDate.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24)));
              
              return {
                id: p.group_id,
                ship_name: p.ship_name || '',
                embarkation_date: p.group_embarkation_date || '',
                days_difference: daysDiff,
              };
            }),
          });
        }
      }

      return warnings;
    } catch (error) {
      console.error('Failed to check duplicates:', error);
      return [];
    }
  },
};