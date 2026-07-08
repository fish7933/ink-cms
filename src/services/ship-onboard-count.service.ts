import { supabase } from '@/lib/supabase';
import { isContractActiveOnDate } from '@/lib/crew-contract-coverage';

export interface OnboardCount {
  officer: number;
  rating: number;
}

// 오늘 기준으로 각 선박에 승선 중인 인원을 사관/부원으로 구분해 집계한다.
// crew_contracts(정식 계약)를 기준으로 하며, 여러 계약(갱신 등)이 겹쳐도 선원당 1명으로만 센다.
export async function getOnboardCountsByShip(): Promise<Map<string, OnboardCount>> {
  const today = new Date().toISOString().slice(0, 10);

  const [ranksRes, contractsRes] = await Promise.all([
    supabase.from('ranks').select('rank_code, rank_category'),
    supabase
      .from('crew_contracts')
      .select('ship_id, crew_member_id, rank, start_date, end_date, terminated_date, status')
      .not('ship_id', 'is', null)
      .neq('status', 'draft'),
  ]);

  const categoryByRankCode = new Map(
    (ranksRes.data || []).map((r: { rank_code: string; rank_category: string }) => [r.rank_code, r.rank_category])
  );

  const counts = new Map<string, OnboardCount>();
  const countedCrewByShip = new Map<string, Set<string>>();

  for (const c of (contractsRes.data || []) as {
    ship_id: string | null; crew_member_id: string; rank: string;
    start_date: string; end_date: string; terminated_date: string | null; status: string;
  }[]) {
    if (!c.ship_id || !isContractActiveOnDate(c, today)) continue;

    const countedCrew = countedCrewByShip.get(c.ship_id) || new Set<string>();
    if (countedCrew.has(c.crew_member_id)) continue; // 갱신 등으로 같은 선원이 중복 계약을 가질 수 있음
    countedCrew.add(c.crew_member_id);
    countedCrewByShip.set(c.ship_id, countedCrew);

    const category = categoryByRankCode.get(c.rank);
    if (category !== 'officer' && category !== 'rating') continue;
    const entry = counts.get(c.ship_id) || { officer: 0, rating: 0 };
    entry[category]++;
    counts.set(c.ship_id, entry);
  }
  return counts;
}
