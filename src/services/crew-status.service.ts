import { supabase } from '@/lib/supabase';
import type { CrewStatus, CrewStatusHistory } from '@/types/crew-status';

interface AdditionalStatusData {
  reviewer_id?: string;
  current_ship_id?: string;
  onboard_date?: string;
  offboard_date?: string;
}

export async function updateCrewStatus(
  crewMemberId: string,
  status: CrewStatus,
  userId: string,
  notes?: string,
  additionalData?: AdditionalStatusData
): Promise<void> {
  const updateData: Record<string, unknown> = {
    status,
    status_notes: notes,
    updated_at: new Date().toISOString(),
  };

  // Set timestamps based on status
  switch (status) {
    case 'under_review':
      updateData.reviewer_id = additionalData?.reviewer_id || userId;
      updateData.review_started_at = new Date().toISOString();
      break;
    case 'sent_to_owner':
      updateData.sent_to_owner_at = new Date().toISOString();
      break;
    case 'owner_approved':
    case 'owner_rejected':
      updateData.owner_decision_at = new Date().toISOString();
      updateData.owner_decision_by = userId;
      break;
    case 'onboard':
      updateData.current_ship_id = additionalData?.current_ship_id;
      updateData.onboard_date = additionalData?.onboard_date || new Date().toISOString().split('T')[0];
      break;
    case 'standby':
      updateData.offboard_date = additionalData?.offboard_date || new Date().toISOString().split('T')[0];
      break;
  }

  const { error } = await supabase
    .from('crew_members')
    .update(updateData)
    .eq('id', crewMemberId);

  if (error) {
    console.error('Error updating crew status:', error);
    throw error;
  }
}

export async function getCrewStatusHistory(crewMemberId: string): Promise<CrewStatusHistory[]> {
  const { data, error } = await supabase
    .from('crew_status_history')
    .select(`
      *,
      changed_by_user:users!crew_status_history_changed_by_fkey(name)
    `)
    .eq('crew_member_id', crewMemberId)
    .order('changed_at', { ascending: false });

  if (error) {
    console.error('Error fetching crew status history:', error);
    throw error;
  }

  return data || [];
}

export async function getCrewMembersByStatus(status: CrewStatus): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('crew_members')
    .select(`
      *,
      reviewer:users!crew_members_reviewer_id_fkey(id, name),
      owner_decision_user:users!crew_members_owner_decision_by_fkey(id, name),
      current_ship:ships!crew_members_current_ship_id_fkey(id, name)
    `)
    .eq('status', status)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching crew members by status:', error);
    throw error;
  }

  return data || [];
}

export async function assignReviewer(
  crewMemberId: string,
  reviewerId: string
): Promise<void> {
  const { error } = await supabase
    .from('crew_members')
    .update({
      status: 'under_review',
      reviewer_id: reviewerId,
      review_started_at: new Date().toISOString(),
    })
    .eq('id', crewMemberId);

  if (error) {
    console.error('Error assigning reviewer:', error);
    throw error;
  }
}