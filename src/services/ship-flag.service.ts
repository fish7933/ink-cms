import { supabase } from '@/lib/supabase';
import type { ShipFlag } from '@/types/ship-flag';

const TABLE_NAME = 'ship_flags';

export async function getShipFlags(): Promise<ShipFlag[]> {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Error fetching ship flags:', error);
    return [];
  }

  return data as ShipFlag[];
}

export async function getActiveShipFlags(): Promise<ShipFlag[]> {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Error fetching active ship flags:', error);
    return [];
  }

  return data as ShipFlag[];
}

export async function addShipFlag(flag: Omit<ShipFlag, 'id' | 'created_at' | 'updated_at'>): Promise<ShipFlag | null> {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .insert([flag])
    .select()
    .single();

  if (error) {
    console.error('Error adding ship flag:', error);
    throw error;
  }

  return data as ShipFlag;
}

export async function updateShipFlag(id: string, updates: Partial<Omit<ShipFlag, 'id' | 'created_at' | 'updated_at'>>): Promise<ShipFlag | null> {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating ship flag:', error);
    throw error;
  }

  return data as ShipFlag;
}

export async function deleteShipFlag(id: string): Promise<boolean> {
  const { error } = await supabase
    .from(TABLE_NAME)
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting ship flag:', error);
    throw error;
  }

  return true;
}