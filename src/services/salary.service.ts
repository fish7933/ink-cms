import { supabase } from '@/lib/supabase';
import type { SalaryTable } from '@/types/models';

export async function getSalaryTables(shipId?: string): Promise<SalaryTable[]> {
  let query = supabase.from('salary_tables').select('*');
  
  if (shipId) {
    query = query.eq('ship_id', shipId);
  }

  const { data, error } = await query.order('rank_id', { ascending: true });

  if (error) {
    console.error('Error fetching salary tables:', error);
    return [];
  }

  return data as SalaryTable[];
}

export async function addSalaryTable(salaryTable: Omit<SalaryTable, 'id'>): Promise<SalaryTable | null> {
  const { data, error } = await supabase
    .from('salary_tables')
    .insert([salaryTable])
    .select()
    .single();

  if (error) {
    console.error('Error adding salary table:', error);
    return null;
  }

  return data as SalaryTable;
}

export async function updateSalaryTable(id: string, updates: Partial<SalaryTable>): Promise<SalaryTable | null> {
  const { data, error } = await supabase
    .from('salary_tables')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating salary table:', error);
    return null;
  }

  return data as SalaryTable;
}

export async function deleteSalaryTable(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('salary_tables')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting salary table:', error);
    return false;
  }

  return true;
}