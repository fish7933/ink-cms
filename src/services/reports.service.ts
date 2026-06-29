import { supabase } from '@/lib/supabase';

export interface StatusSummary { status: string; count: number; }
export interface NationalitySummary { nationality: string; count: number; }
export interface RankSummary { rank_name: string; rank_code: string; department: string; count: number; }
export interface ShipCrewSummary { ship_id: string; ship_name: string; crew_count: number; }

export async function getCrewStatusSummary(): Promise<StatusSummary[]> {
  const { data, error } = await supabase.from('crew_members').select('current_status');
  if (error || !data) return [];
  const map: Record<string, number> = {};
  data.forEach((c: { current_status?: string }) => { const s = c.current_status || 'unknown'; map[s] = (map[s] || 0) + 1; });
  return Object.entries(map).map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count);
}

export async function getCrewByNationality(): Promise<NationalitySummary[]> {
  const { data, error } = await supabase.from('crew_members').select('nationality');
  if (error || !data) return [];
  const map: Record<string, number> = {};
  data.forEach((c: { nationality?: string }) => { const n = c.nationality || '미지정'; map[n] = (map[n] || 0) + 1; });
  return Object.entries(map).map(([nationality, count]) => ({ nationality, count })).sort((a, b) => b.count - a.count);
}

export async function getCrewByRank(): Promise<RankSummary[]> {
  const { data, error } = await supabase
    .from('crew_members')
    .select('rank_id, ranks:rank_id(name, rank_code, department)');
  if (error || !data) return [];
  const map: Record<string, { rank_name: string; rank_code: string; department: string; count: number }> = {};
  data.forEach((c: Record<string, unknown>) => {
    const rank = c.ranks as Record<string, string> | null;
    const key = (c.rank_id as string) || 'none';
    if (!map[key]) map[key] = { rank_name: rank?.name || '미지정', rank_code: rank?.rank_code || '', department: rank?.department || '', count: 0 };
    map[key].count++;
  });
  return Object.values(map).sort((a, b) => b.count - a.count);
}

export async function getShipCrewDistribution(): Promise<ShipCrewSummary[]> {
  const { data: ships } = await supabase.from('ships').select('id, name');
  const { data: crew } = await supabase.from('crew_members').select('current_ship_id').not('current_ship_id', 'is', null);
  if (!ships || !crew) return [];
  const countMap: Record<string, number> = {};
  crew.forEach((c: { current_ship_id?: string }) => { if (c.current_ship_id) countMap[c.current_ship_id] = (countMap[c.current_ship_id] || 0) + 1; });
  return ships
    .map((s: { id: string; name: string }) => ({ ship_id: s.id, ship_name: s.name, crew_count: countMap[s.id] || 0 }))
    .filter((s: ShipCrewSummary) => s.crew_count > 0)
    .sort((a: ShipCrewSummary, b: ShipCrewSummary) => b.crew_count - a.crew_count);
}
