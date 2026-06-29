import { supabase } from '@/lib/supabase';
import type { CrewEvaluation, CrewEvaluationWithDetails } from '@/types/evaluation';

export async function getEvaluations(crewId?: string): Promise<CrewEvaluationWithDetails[]> {
  let query = supabase
    .from('crew_evaluations')
    .select(`*, crew_members!crew_member_id(name, rank_id, ranks:rank_id(name, rank_code)), ships!ship_id(name)`)
    .order('evaluation_period_end', { ascending: false });

  if (crewId) query = query.eq('crew_member_id', crewId);

  const { data, error } = await query;
  if (error) { console.error(error); return []; }

  return (data || []).map((r: Record<string, unknown>) => {
    const crew = r.crew_members as Record<string, unknown> | null;
    const ranks = crew?.ranks as Record<string, unknown> | null;
    const ship = r.ships as Record<string, unknown> | null;
    return {
      ...r,
      crew_name: (crew?.name as string) || '',
      rank_name: (ranks?.name as string) || '',
      rank_code: (ranks?.rank_code as string) || '',
      ship_name: (ship?.name as string) || undefined,
    } as CrewEvaluationWithDetails;
  });
}

export async function addEvaluation(data: Omit<CrewEvaluation, 'id' | 'created_at' | 'updated_at'>): Promise<CrewEvaluation> {
  const { data: result, error } = await supabase
    .from('crew_evaluations')
    .insert({ ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .select().single();
  if (error) throw error;
  return result;
}

export async function updateEvaluation(id: string, data: Partial<CrewEvaluation>): Promise<void> {
  const { error } = await supabase.from('crew_evaluations').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function deleteEvaluation(id: string): Promise<void> {
  const { error } = await supabase.from('crew_evaluations').delete().eq('id', id);
  if (error) throw error;
}
