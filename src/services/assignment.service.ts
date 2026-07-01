import { supabase } from '@/lib/supabase';
import type { Assignment } from '@/types/assignment-approval';

export async function getAssignments(): Promise<Assignment[]> {
  const { data, error } = await supabase
    .from('assignments')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching assignments:', error);
    throw error;
  }

  return data || [];
}

export async function getAssignmentsByEntity(
  assignmentType: 'owner' | 'fleet' | 'ship',
  entityId: string
): Promise<Assignment[]> {
  const { data, error } = await supabase
    .from('assignments')
    .select('*')
    .eq('assignment_type', assignmentType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching assignments by entity:', error);
    throw error;
  }

  return data || [];
}

export async function getAssignmentsByUser(userId: string): Promise<Assignment[]> {
  const { data, error } = await supabase
    .from('assignments')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching assignments by user:', error);
    throw error;
  }

  return data || [];
}

export async function addAssignment(assignment: Omit<Assignment, 'id' | 'created_at' | 'updated_at'>): Promise<Assignment> {
  const { data, error } = await supabase
    .from('assignments')
    .insert(assignment)
    .select()
    .single();

  if (error) {
    console.error('Error adding assignment:', error);
    throw error;
  }

  return data;
}

export async function deleteAssignment(id: string): Promise<void> {
  const { error } = await supabase
    .from('assignments')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting assignment:', error);
    throw error;
  }
}

/**
 * 선박에 대한 유효 선주 사용자 조회 (상속 포함)
 * 우선순위: 선박 직접 배정 → 플릿 배정 → 선주사 배정
 */
export async function getEffectiveOwnerAssignments(
  shipId: string,
  fleetId: string | null,
  ownerId: string | null
): Promise<Assignment[]> {
  // 1. 선박 레벨
  const shipAsgns = await getAssignmentsByEntity('ship', shipId);
  if (shipAsgns.length > 0) return shipAsgns;

  // 2. 플릿 레벨
  if (fleetId) {
    const fleetAsgns = await getAssignmentsByEntity('fleet', fleetId);
    if (fleetAsgns.length > 0) return fleetAsgns;

    // 플릿의 선주사 (fleetId로 fleet 조회 필요시 별도 처리)
  }

  // 3. 선주사 레벨
  if (ownerId) {
    const ownerAsgns = await getAssignmentsByEntity('owner', ownerId);
    if (ownerAsgns.length > 0) return ownerAsgns;
  }

  return [];
}