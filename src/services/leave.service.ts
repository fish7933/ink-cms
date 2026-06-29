import { supabase } from '@/lib/supabase';
import type { LeaveRequest, LeaveRequestWithDetails } from '@/types/leave';

export async function getLeaveRequests(filters?: { crewId?: string; status?: string }): Promise<LeaveRequestWithDetails[]> {
  let query = supabase
    .from('crew_leave_requests')
    .select(`
      *,
      crew_members!crew_member_id(name, rank_id, ranks:rank_id(name, rank_code)),
      ships!ship_id(name)
    `)
    .order('created_at', { ascending: false });

  if (filters?.crewId) query = query.eq('crew_member_id', filters.crewId);
  if (filters?.status && filters.status !== 'all') query = query.eq('status', filters.status);

  const { data, error } = await query;
  if (error) { console.error(error); return []; }

  return (data || []).map((r: Record<string, unknown>) => {
    const crew = r.crew_members as Record<string, unknown> | null;
    const ranks = crew?.ranks as Record<string, unknown> | null;
    const ship = r.ships as Record<string, unknown> | null;
    return {
      ...r,
      crew_name: (crew?.name as string) || '',
      rank_name: (ranks?.name as string) || '',
      rank_code: (ranks?.rank_code as string) || '',
      ship_name: (ship?.name as string) || undefined,
    } as LeaveRequestWithDetails;
  });
}

export async function addLeaveRequest(data: Omit<LeaveRequest, 'id' | 'created_at' | 'updated_at'>): Promise<LeaveRequest> {
  const { data: result, error } = await supabase
    .from('crew_leave_requests')
    .insert({ ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw error;
  return result;
}

export async function updateLeaveRequest(id: string, data: Partial<LeaveRequest>): Promise<void> {
  const { error } = await supabase
    .from('crew_leave_requests')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteLeaveRequest(id: string): Promise<void> {
  const { error } = await supabase.from('crew_leave_requests').delete().eq('id', id);
  if (error) throw error;
}

export async function approveLeaveRequest(id: string, approvedBy: string): Promise<void> {
  await updateLeaveRequest(id, {
    status: 'approved',
    approved_by: approvedBy,
    approved_at: new Date().toISOString(),
  });
}

export async function rejectLeaveRequest(id: string, reason: string): Promise<void> {
  await updateLeaveRequest(id, {
    status: 'rejected',
    rejection_reason: reason,
  });
}
