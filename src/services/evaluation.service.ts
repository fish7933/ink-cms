import { supabase } from '@/lib/supabase';
import type { CrewEvaluation, CrewEvaluationWithDetails } from '@/types/evaluation';

// ships -> companies/fleets 중첩 임베드는 PostgREST 스키마 캐시 문제로 실패할 수 있어
// (관측된 오류: "Could not find a relationship between 'ships' and 'fleets'"),
// ship의 owner_id/fleet_id만 평범한 컬럼으로 받아온 뒤 회사/플릿명은 별도 벌크 조회로 채운다.
const EVALUATION_SELECT = `*, crew_members!crew_member_id(name, rank_id, current_grade, ranks:rank_id(name, rank_code)), ships!ship_id(name, owner_id, fleet_id)`;

interface RawShip { name: string; owner_id: string | null; fleet_id: string | null; }

async function mapEvaluationRows(rows: Record<string, unknown>[]): Promise<CrewEvaluationWithDetails[]> {
  const ownerIds = new Set<string>();
  const fleetIds = new Set<string>();
  for (const r of rows) {
    const ship = r.ships as RawShip | null;
    if (ship?.owner_id) ownerIds.add(ship.owner_id);
    if (ship?.fleet_id) fleetIds.add(ship.fleet_id);
  }

  const [ownersRes, fleetsRes] = await Promise.all([
    ownerIds.size > 0 ? supabase.from('companies').select('id, name').in('id', [...ownerIds]) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    fleetIds.size > 0 ? supabase.from('fleets').select('id, name').in('id', [...fleetIds]) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const ownerNameById = new Map((ownersRes.data || []).map(o => [o.id, o.name]));
  const fleetNameById = new Map((fleetsRes.data || []).map(f => [f.id, f.name]));

  return rows.map(r => {
    const crew = r.crew_members as Record<string, unknown> | null;
    const ranks = crew?.ranks as Record<string, unknown> | null;
    const ship = r.ships as RawShip | null;
    return {
      ...r,
      crew_name: (crew?.name as string) || '',
      rank_name: (ranks?.name as string) || '',
      rank_code: (ranks?.rank_code as string) || '',
      rank_grade: (crew?.current_grade as string) || undefined,
      ship_name: ship?.name || undefined,
      owner_name: ship?.owner_id ? ownerNameById.get(ship.owner_id) : undefined,
      fleet_name: ship?.fleet_id ? fleetNameById.get(ship.fleet_id) : undefined,
    } as CrewEvaluationWithDetails;
  });
}

export async function getEvaluations(crewId?: string): Promise<CrewEvaluationWithDetails[]> {
  let query = supabase
    .from('crew_evaluations')
    .select(EVALUATION_SELECT)
    .order('evaluation_period_end', { ascending: false });

  if (crewId) query = query.eq('crew_member_id', crewId);

  const { data, error } = await query;
  if (error) { console.error(error); return []; }

  return mapEvaluationRows(data || []);
}

export async function getEvaluationsBySeaServiceRecord(seaServiceRecordId: string): Promise<CrewEvaluationWithDetails[]> {
  const { data, error } = await supabase
    .from('crew_evaluations')
    .select(EVALUATION_SELECT)
    .eq('sea_service_record_id', seaServiceRecordId)
    .order('evaluation_period_end', { ascending: false });
  if (error) { console.error(error); return []; }

  return mapEvaluationRows(data || []);
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
