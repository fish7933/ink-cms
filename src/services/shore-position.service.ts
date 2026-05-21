import { supabase } from '@/lib/supabase';
import type { ShorePosition } from '@/types/models';

export async function getShorePositions(): Promise<ShorePosition[]> {
  const { data, error } = await supabase
    .from('shore_positions')
    .select('*')
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Error fetching shore positions:', error);
    return [];
  }

  return data as ShorePosition[];
}

export async function addShorePosition(position: Omit<ShorePosition, 'id' | 'created_at' | 'updated_at'>): Promise<ShorePosition | null> {
  const { data, error } = await supabase
    .from('shore_positions')
    .insert([position])
    .select()
    .single();

  if (error) {
    console.error('Error adding shore position:', error);
    return null;
  }

  return data as ShorePosition;
}

export async function updateShorePosition(id: string, updates: Partial<ShorePosition>): Promise<ShorePosition | null> {
  const { data, error } = await supabase
    .from('shore_positions')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating shore position:', error);
    return null;
  }

  return data as ShorePosition;
}

export async function deleteShorePosition(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('shore_positions')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting shore position:', error);
    return false;
  }

  return true;
}