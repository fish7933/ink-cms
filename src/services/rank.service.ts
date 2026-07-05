import { supabase } from '@/lib/supabase';
import { sortRanksByDisplayOrder } from '@/lib/rank-order';
import type { Rank } from '@/types/models';

export async function getRanks(): Promise<Rank[]> {
  const { data, error } = await supabase
    .from('ranks')
    .select('*');

  if (error) {
    console.error('Error fetching ranks:', error);
    return [];
  }

  return sortRanksByDisplayOrder(data as Rank[]);
}

export async function addRank(rank: Omit<Rank, 'id'>): Promise<Rank | null> {
  const { data, error } = await supabase
    .from('ranks')
    .insert([rank])
    .select()
    .single();

  if (error) {
    console.error('Error adding rank:', error);
    return null;
  }

  return data as Rank;
}

export async function updateRank(id: string, updates: Partial<Rank>): Promise<Rank | null> {
  const { data, error } = await supabase
    .from('ranks')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating rank:', error);
    return null;
  }

  return data as Rank;
}

export async function deleteRank(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('ranks')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting rank:', error);
    return false;
  }

  return true;
}