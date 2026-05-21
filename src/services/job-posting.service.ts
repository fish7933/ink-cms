import { supabase } from '@/lib/supabase';
import type { JobPosting, JobPostingWithDetails } from '@/types/models';
import { supervisorService } from './supervisor.service';

interface JobPostingQueryResult {
  id: string;
  company_id: string;
  fleet_id?: string;
  ship_id: string;
  rank_id: string;
  positions_available: number;
  embarkation_date: string;
  application_deadline?: string;
  contract_months: number;
  salary_template_id?: string;
  salary_amount?: number;
  salary_currency: string;
  salary_components: Array<{ component_id: string; component_name: string; amount: number }>;
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
  rank?: { name: string; rank_code: string; rank_category: 'officer' | 'rating' };
}

export interface DuplicateWarning {
  rank_id: string;
  rank_name: string;
  rank_code: string;
  existing_postings: Array<{
    id: string;
    ship_name: string;
    embarkation_date: string;
    days_difference: number;
  }>;
}

export const jobPostingService = {
  async getAll(): Promise<JobPostingWithDetails[]> {
    const { data, error } = await supabase
      .from('job_postings')
      .select(`
        *,
        company:companies(name),
        fleet:fleets(name),
        ship:ships(name),
        rank:ranks(name, rank_code, rank_category)
      `)
      .order('embarkation_date', { ascending: true });

    if (error) throw error;

    return (data || []).map((item: JobPostingQueryResult) => ({
      ...item,
      company_name: item.company?.name || '',
      fleet_name: item.fleet?.name,
      ship_name: item.ship?.name || '',
      rank_name: item.rank?.name || '',
      rank_code: item.rank?.rank_code || '',
      rank_category: item.rank?.rank_category || 'rating',
    }));
  },

  async getById(id: string): Promise<JobPosting | null> {
    const { data, error } = await supabase
      .from('job_postings')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  async checkDuplicates(
    rankIds: string[],
    embarkationDate: string,
    shipId: string,
    excludePostingId?: string
  ): Promise<DuplicateWarning[]> {
    try {
      // Calculate date range (±30 days from embarkation date)
      const targetDate = new Date(embarkationDate);
      const startDate = new Date(targetDate);
      startDate.setDate(startDate.getDate() - 30);
      const endDate = new Date(targetDate);
      endDate.setDate(endDate.getDate() + 30);

      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      // Query for existing active postings with same ranks, same ship, and similar embarkation dates
      let query = supabase
        .from('job_postings')
        .select(`
          id,
          rank_id,
          ship_id,
          embarkation_date,
          status,
          ship:ships(name),
          rank:ranks(name, rank_code)
        `)
        .in('rank_id', rankIds)
        .eq('ship_id', shipId)  // Only check same ship
        .eq('status', 'active')
        .gte('embarkation_date', startDateStr)
        .lte('embarkation_date', endDateStr);

      // Exclude current posting if editing
      if (excludePostingId) {
        query = query.neq('id', excludePostingId);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Group by rank_id and calculate warnings
      const warnings: DuplicateWarning[] = [];
      const groupedByRank = (data || []).reduce((acc: Record<string, typeof data>, posting: typeof data[0]) => {
        if (!acc[posting.rank_id]) {
          acc[posting.rank_id] = [];
        }
        acc[posting.rank_id].push(posting);
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
            existing_postings: existingPostings.map((p: typeof posting) => {
              const pDate = new Date(p.embarkation_date);
              const daysDiff = Math.abs(Math.floor((pDate.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24)));
              
              return {
                id: p.id,
                ship_name: p.ship?.name || '',
                embarkation_date: p.embarkation_date,
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
        message: '해당 선박의 담당 감독이 아닙니다. 담당 감독만 공고를 등록할 수 있습니다.' 
      };
    }

    return { allowed: true };
  },

  async create(posting: Omit<JobPosting, 'id' | 'created_at' | 'updated_at'>): Promise<JobPosting> {
    // Check supervisor permission if created_by is provided
    if (posting.ship_id && posting.created_by) {
      const permissionCheck = await this.checkSupervisorPermission(
        posting.created_by,
        posting.ship_id
      );

      if (!permissionCheck.allowed) {
        throw new Error(permissionCheck.message || '권한이 없습니다.');
      }
    }

    const { data, error } = await supabase
      .from('job_postings')
      .insert(posting)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async update(id: string, posting: Partial<JobPosting>): Promise<JobPosting> {
    const { data, error } = await supabase
      .from('job_postings')
      .update({ ...posting, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('job_postings')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },
};