import { supabase } from '@/lib/supabase';
import type { CrewContract, CrewContractWithDetails } from '@/types/contract';

export async function getContracts(crewId?: string, status?: string): Promise<CrewContractWithDetails[]> {
  let query = supabase
    .from('crew_contracts')
    .select(`*, crew_members!crew_member_id(name, rank_id, ranks:rank_id(name, rank_code)), ships!ship_id(name), owner:companies!owner_id(name), fleet:fleets!fleet_id(name)`)
    .order('start_date', { ascending: false });
  if (crewId) query = query.eq('crew_member_id', crewId);
  if (status && status !== 'all') query = query.eq('status', status);
  const { data, error } = await query;
  if (error) { console.error(error); return []; }
  return (data || []).map((r: Record<string, unknown>) => {
    const crew = r.crew_members as Record<string, unknown> | null;
    const ranks = crew?.ranks as Record<string, unknown> | null;
    const ship = r.ships as Record<string, unknown> | null;
    const owner = r.owner as Record<string, unknown> | null;
    const fleet = r.fleet as Record<string, unknown> | null;
    return {
      ...r,
      crew_name: (crew?.name as string) || '',
      rank_name: (ranks?.name as string) || '',
      rank_code: (ranks?.rank_code as string) || '',
      ship_name: (ship?.name as string) || undefined,
      owner_name: (owner?.name as string) || undefined,
      fleet_name: (fleet?.name as string) || undefined,
    } as CrewContractWithDetails;
  });
}

export async function addContract(data: Omit<CrewContract, 'id' | 'created_at' | 'updated_at'>): Promise<CrewContract> {
  const { data: result, error } = await supabase.from('crew_contracts').insert({ ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).select().single();
  if (error) throw error;
  return result;
}

export async function updateContract(id: string, data: Partial<CrewContract>): Promise<void> {
  const { error } = await supabase.from('crew_contracts').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function deleteContract(id: string): Promise<void> {
  const { error } = await supabase.from('crew_contracts').delete().eq('id', id);
  if (error) throw error;
}
