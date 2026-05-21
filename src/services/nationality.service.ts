import { supabase } from '@/lib/supabase';
import type { Nationality } from '@/types/nationality';

export async function getNationalities(activeOnly: boolean = true): Promise<Nationality[]> {
  let query = supabase
    .from('nationalities')
    .select('*')
    .order('display_order', { ascending: true });

  if (activeOnly) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching nationalities:', error);
    throw error;
  }

  return data || [];
}

export async function getMajorSupplierNationalities(): Promise<Nationality[]> {
  const { data, error } = await supabase
    .from('nationalities')
    .select('*')
    .eq('is_major_supplier', true)
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Error fetching major supplier nationalities:', error);
    throw error;
  }

  return data || [];
}

export async function addNationality(nationality: Omit<Nationality, 'id' | 'created_at' | 'updated_at'>): Promise<Nationality> {
  const { data, error } = await supabase
    .from('nationalities')
    .insert(nationality)
    .select()
    .single();

  if (error) {
    console.error('Error adding nationality:', error);
    throw error;
  }

  return data;
}

export async function updateNationality(id: string, updates: Partial<Nationality>): Promise<Nationality> {
  const { data, error } = await supabase
    .from('nationalities')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating nationality:', error);
    throw error;
  }

  return data;
}

export async function deleteNationality(id: string): Promise<void> {
  const { error } = await supabase
    .from('nationalities')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting nationality:', error);
    throw error;
  }
}