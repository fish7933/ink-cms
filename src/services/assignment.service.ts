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