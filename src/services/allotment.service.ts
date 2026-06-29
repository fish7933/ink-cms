import { supabase } from '@/lib/supabase';
import type { Allotment, AllotmentWithDetails, Remittance } from '@/types/allotment';

export async function getAllotments(crewId?: string): Promise<AllotmentWithDetails[]> {
  let query = supabase
    .from('crew_allotments')
    .select(`*, crew_members!crew_member_id(name, rank_id, ranks:rank_id(name)), ships!ship_id(name)`)
    .order('created_at', { ascending: false });
  if (crewId) query = query.eq('crew_member_id', crewId);
  const { data, error } = await query;
  if (error) { console.error(error); return []; }
  return (data || []).map((r: Record<string, unknown>) => {
    const crew = r.crew_members as Record<string, unknown> | null;
    const ranks = crew?.ranks as Record<string, unknown> | null;
    const ship = r.ships as Record<string, unknown> | null;
    return { ...r, crew_name: (crew?.name as string) || '', rank_name: (ranks?.name as string) || '', ship_name: (ship?.name as string) || undefined } as AllotmentWithDetails;
  });
}

export async function addAllotment(data: Omit<Allotment, 'id' | 'created_at' | 'updated_at'>): Promise<Allotment> {
  const { data: result, error } = await supabase.from('crew_allotments').insert({ ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).select().single();
  if (error) throw error;
  return result;
}

export async function updateAllotment(id: string, data: Partial<Allotment>): Promise<void> {
  const { error } = await supabase.from('crew_allotments').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function deleteAllotment(id: string): Promise<void> {
  const { error } = await supabase.from('crew_allotments').delete().eq('id', id);
  if (error) throw error;
}

export async function getRemittances(allotmentId?: string, crewId?: string): Promise<Remittance[]> {
  let query = supabase.from('crew_remittances').select('*').order('remittance_date', { ascending: false });
  if (allotmentId) query = query.eq('allotment_id', allotmentId);
  if (crewId) query = query.eq('crew_member_id', crewId);
  const { data, error } = await query;
  if (error) { console.error(error); return []; }
  return data || [];
}

export async function addRemittance(data: Omit<Remittance, 'id' | 'created_at' | 'updated_at'>): Promise<Remittance> {
  const { data: result, error } = await supabase.from('crew_remittances').insert({ ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).select().single();
  if (error) throw error;
  return result;
}

export async function updateRemittance(id: string, data: Partial<Remittance>): Promise<void> {
  const { error } = await supabase.from('crew_remittances').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}
