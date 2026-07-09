import { supabase } from '@/lib/supabase';
import type { CrewEvaluation, CrewEvaluationWithDetails } from '@/types/evaluation';

const EVALUATION_SELECT = `*, crew_members!crew_member_id(name, rank_id, current_grade, ranks:rank_id(name, rank_code)), ships!ship_id(name, owner:owner_id(name), fleet:fleet_id(name))`;

function mapEvaluationRow(r: Record<string, unknown>): CrewEvaluationWithDetails {
  const crew = r.crew_members as Record<string, unknown> | null;
  const ranks = crew?.ranks as Record<string, unknown> | null;
  const ship = r.ships as Record<string, unknown> | null;
  const owner = ship?.owner as Record<string, unknown> | null;
  const fleet = ship?.fleet as Record<string, unknown> | null;
  return {
    ...r,
    crew_name: (crew?.name as string) || '',
    rank_name: (ranks?.name as string) || '',
    rank_code: (ranks?.rank_code as string) || '',
    rank_grade: (crew?.current_grade as string) || undefined,
    ship_name: (ship?.name as string) || undefined,
    owner_name: (owner?.name as string) || undefined,
    fleet_name: (fleet?.name as string) || undefined,
  } as CrewEvaluationWithDetails;
}

export async function getEvaluations(crewId?: string): Promise<CrewEvaluationWithDetails[]> {
  let query = supabase
    .from('crew_evaluations')
    .select(EVALUATION_SELECT)
    .order('evaluation_period_end', { ascending: false });

  if (crewId) query = query.eq('crew_member_id', crewId);

  const { data, error } = await query;
  if (error) { console.error(error); return []; }

  return (data || []).map((r: Record<string, unknown>) => mapEvaluationRow(r));
}

export async function getEvaluationsBySeaServiceRecord(seaServiceRecordId: string): Promise<CrewEvaluationWithDetails[]> {
  const { data, error } = await supabase
    .from('crew_evaluations')
    .select(EVALUATION_SELECT)
    .eq('sea_service_record_id', seaServiceRecordId)
    .order('evaluation_period_end', { ascending: false });
  if (error) { console.error(error); return []; }

  return (data || []).map((r: Record<string, unknown>) => mapEvaluationRow(r));
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
