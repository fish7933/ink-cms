import { supabase } from '@/lib/supabase';
import type { Fleet } from '@/types/models';

export async function getFleets(ownerId?: string): Promise<Fleet[]> {
  let query = supabase
    .from('fleets')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (ownerId) {
    query = query.eq('owner_id', ownerId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching fleets:', error);
    return [];
  }

  return data as Fleet[];
}

export async function getFleet(id: string): Promise<Fleet | null> {
  const { data, error } = await supabase
    .from('fleets')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching fleet:', error);
    return null;
  }

  return data as Fleet;
}

export async function addFleet(fleet: Omit<Fleet, 'id' | 'created_at' | 'updated_at'>): Promise<Fleet | null> {
  const { data, error } = await supabase
    .from('fleets')
    .insert([fleet])
    .select()
    .single();

  if (error) {
    console.error('Error adding fleet:', error);
    return null;
  }

  return data as Fleet;
}

export async function updateFleet(id: string, updates: Partial<Fleet>): Promise<Fleet | null> {
  const { data, error } = await supabase
    .from('fleets')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating fleet:', error);
    return null;
  }

  return data as Fleet;
}

export async function deleteFleet(id: string): Promise<boolean> {
  // Soft delete by setting is_active to false
  const { error } = await supabase
    .from('fleets')
    .update({ is_active: false })
    .eq('id', id);

  if (error) {
    console.error('Error deleting fleet:', error);
    return false;
  }

  return true;
}

export async function getFleetShips(fleetId: string) {
  const { data, error } = await supabase
    .from('ships')
    .select('*')
    .eq('fleet_id', fleetId)
    .eq('is_active', true);

  if (error) {
    console.error('Error fetching fleet ships:', error);
    return [];
  }

  return data;
}