import { supabase } from '@/lib/supabase';
import { getCurrentUser } from "@/lib/store";
import type { JobPosting, JobPostingPosition, JobApplication } from '@/types/models';
import { checkSupervisorPermission } from './supervisor.service';

// Job Posting functions
export async function getJobPostings(): Promise<JobPosting[]> {
  const { data, error } = await supabase
    .from('job_postings')
    .select(`
      *,
      positions:job_posting_positions(*)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching job postings:', error);
    return [];
  }

  return data as JobPosting[];
}

export async function addJobPosting(
  jobPosting: Omit<JobPosting, 'id' | 'created_at' | 'updated_at'>,
  positions: Array<{ rank_id: string; positions_count: number }>
): Promise<JobPosting | null> {
  try {
    // Get current user
    const user = await getCurrentUser();
    if (!user) {
      console.error('❌ [addJobPosting] No authenticated user');
      throw new Error('인증되지 않은 사용자입니다.');
    }

    // Get user profile
    const { data: profile } = await supabase
      .from('users')
      .select('role, company_id')
      .eq('id', user.id)
      .single();

    if (!profile) {
      console.error('❌ [addJobPosting] User profile not found');
      throw new Error('사용자 프로필을 찾을 수 없습니다.');
    }

    console.log('🔍 [addJobPosting] User:', { id: user.id, role: profile.role });
    console.log('🔍 [addJobPosting] Attempting to create job posting for ship:', jobPosting.ship_id);

    // Permission check for ship_manager
    if (profile.role === 'ship_manager') {
      // Get ship details
      const { data: ship } = await supabase
        .from('ships')
        .select('owner_id, fleet_id')
        .eq('id', jobPosting.ship_id)
        .single();

      if (!ship) {
        console.error('❌ [addJobPosting] Ship not found:', jobPosting.ship_id);
        throw new Error('선박을 찾을 수 없습니다.');
      }

      console.log('🔍 [addJobPosting] Ship details:', ship);

      // Check supervisor permission
      const hasPermission = await checkSupervisorPermission(
        user.id,
        ship.owner_id,
        ship.fleet_id || undefined,
        jobPosting.ship_id
      );

      if (!hasPermission) {
        console.error('❌ [addJobPosting] Permission denied for user:', user.id);
        console.error('❌ [addJobPosting] Ship owner:', ship.owner_id);
        console.error('❌ [addJobPosting] Ship fleet:', ship.fleet_id);
        console.error('❌ [addJobPosting] Ship ID:', jobPosting.ship_id);
        throw new Error('이 선박에 대한 구인 공고를 생성할 권한이 없습니다.');
      }

      console.log('✅ [addJobPosting] Permission granted');
    } else if (profile.role === 'ship_owner') {
      // Check if ship belongs to user's company
      const { data: ship } = await supabase
        .from('ships')
        .select('owner_id')
        .eq('id', jobPosting.ship_id)
        .single();

      if (!ship || ship.owner_id !== profile.company_id) {
        console.error('❌ [addJobPosting] Ship does not belong to user company');
        throw new Error('자신의 회사 소속 선박에만 구인 공고를 생성할 수 있습니다.');
      }

      console.log('✅ [addJobPosting] Ship owner permission granted');
    }

    // Insert job posting
    const { data: posting, error: postingError } = await supabase
      .from('job_postings')
      .insert([jobPosting])
      .select()
      .single();

    if (postingError) {
      console.error('Error adding job posting:', postingError);
      return null;
    }

    // Insert positions
    const positionsData = positions.map(pos => ({
      job_posting_id: posting.id,
      rank_id: pos.rank_id,
      positions_count: pos.positions_count,
    }));

    const { error: positionsError } = await supabase
      .from('job_posting_positions')
      .insert(positionsData);

    if (positionsError) {
      console.error('Error adding job posting positions:', positionsError);
      // Rollback: delete the posting
      await supabase.from('job_postings').delete().eq('id', posting.id);
      return null;
    }

    // Fetch complete data with positions
    const { data: completeData } = await supabase
      .from('job_postings')
      .select(`
        *,
        positions:job_posting_positions(*)
      `)
      .eq('id', posting.id)
      .single();

    console.log('✅ [addJobPosting] Job posting created successfully:', posting.id);
    return completeData as JobPosting;
  } catch (error) {
    console.error('Error in addJobPosting:', error);
    if (error instanceof Error) {
      throw error; // Re-throw to show error message to user
    }
    return null;
  }
}

export async function updateJobPosting(
  id: string,
  updates: Partial<JobPosting>,
  positions?: Array<{ rank_id: string; positions_count: number }>
): Promise<JobPosting | null> {
  try {
    // Update job posting
    const { data, error } = await supabase
      .from('job_postings')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating job posting:', error);
      return null;
    }

    // Update positions if provided
    if (positions) {
      // Delete existing positions
      await supabase
        .from('job_posting_positions')
        .delete()
        .eq('job_posting_id', id);

      // Insert new positions
      const positionsData = positions.map(pos => ({
        job_posting_id: id,
        rank_id: pos.rank_id,
        positions_count: pos.positions_count,
      }));

      await supabase
        .from('job_posting_positions')
        .insert(positionsData);
    }

    // Fetch complete data with positions
    const { data: completeData } = await supabase
      .from('job_postings')
      .select(`
        *,
        positions:job_posting_positions(*)
      `)
      .eq('id', id)
      .single();

    return completeData as JobPosting;
  } catch (error) {
    console.error('Error in updateJobPosting:', error);
    return null;
  }
}

export async function deleteJobPosting(id: string): Promise<boolean> {
  try {
    // Delete positions first (foreign key)
    await supabase
      .from('job_posting_positions')
      .delete()
      .eq('job_posting_id', id);

    // Delete posting
    const { error } = await supabase
      .from('job_postings')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting job posting:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in deleteJobPosting:', error);
    return false;
  }
}

// Job Application functions
export async function getJobApplications(): Promise<JobApplication[]> {
  const { data, error } = await supabase
    .from('job_applications')
    .select('*')
    .order('applied_at', { ascending: false });

  if (error) {
    console.error('Error fetching job applications:', error);
    return [];
  }

  return data as JobApplication[];
}

export async function addJobApplication(jobApplication: Omit<JobApplication, 'id' | 'applied_at'>): Promise<JobApplication | null> {
  const { data, error } = await supabase
    .from('job_applications')
    .insert([jobApplication])
    .select()
    .single();

  if (error) {
    console.error('Error adding job application:', error);
    return null;
  }

  return data as JobApplication;
}

export async function updateJobApplication(id: string, updates: Partial<JobApplication>): Promise<JobApplication | null> {
  const { data, error } = await supabase
    .from('job_applications')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating job application:', error);
    return null;
  }

  return data as JobApplication;
}

export async function updateJobApplicationStatus(
  id: string, 
  status: JobApplication['status'], 
  comments?: string
): Promise<JobApplication | null> {
  const updates: Partial<JobApplication> = { status };
  if (comments) {
    updates.comments = comments;
  }

  return updateJobApplication(id, updates);
}

export async function deleteJobApplication(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('job_applications')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting job application:', error);
    return false;
  }

  return true;
}