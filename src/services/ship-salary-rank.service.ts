import { supabase } from '@/lib/supabase';
import { sortRanksByDisplayOrder } from '@/lib/rank-order';
import type { Rank } from '@/types/models';

export interface ShipRankOption {
  rank: Rank;
  templateId: string;
}

export interface ShipSalaryRankMaps {
  rankOptionsByShip: Map<string, ShipRankOption[]>;
  gradesByTemplate: Map<string, string[]>;
}

// 선박 → 배정된 급여템플릿 → 그 템플릿에 등록된 직급/등급 매핑을 한 번에 로드.
// 직급/등급 선택은 항상 이 데이터를 기준으로만 허용해야 한다(급여템플릿 미배정 시 선택 불가).
export async function loadShipSalaryRankMaps(): Promise<ShipSalaryRankMaps> {
  const [ranksRes, shipAssignRes, templatesRes, itemsRes] = await Promise.all([
    supabase.from('ranks').select('*'),
    supabase.from('ship_salary_assignments').select('ship_id, template_id'),
    supabase.from('salary_templates').select('id, rank'),
    supabase.from('salary_template_items').select('template_id, rank_grade').not('rank_grade', 'is', null),
  ]);

  const sortedRanks = sortRanksByDisplayOrder(ranksRes.data || []);
  const ranksByName = new Map(sortedRanks.map(r => [r.name, r]));
  const templateRankName = new Map((templatesRes.data || []).map(t => [t.id, t.rank]));

  const rankOptionsByShip = new Map<string, ShipRankOption[]>();
  for (const a of (shipAssignRes.data || []) as { ship_id: string; template_id: string }[]) {
    const rankName = templateRankName.get(a.template_id);
    const rank = rankName ? ranksByName.get(rankName) : undefined;
    if (!rank) continue;
    const list = rankOptionsByShip.get(a.ship_id) || [];
    list.push({ rank, templateId: a.template_id });
    rankOptionsByShip.set(a.ship_id, list);
  }

  const gradeSetMap = new Map<string, Set<string>>();
  for (const item of (itemsRes.data || []) as { template_id: string; rank_grade: string | null }[]) {
    if (!item.rank_grade) continue;
    const set = gradeSetMap.get(item.template_id) || new Set<string>();
    set.add(item.rank_grade);
    gradeSetMap.set(item.template_id, set);
  }
  const gradesByTemplate = new Map([...gradeSetMap.entries()].map(([k, v]) => [k, [...v].sort()]));

  return { rankOptionsByShip, gradesByTemplate };
}

// 변경/배치 후 직급 선택지 — 해당 선박에 배정된 급여템플릿에 등록된 직급만 (템플릿 미배정 선박은 선택 불가)
export function getRankOptionsForShip(maps: ShipSalaryRankMaps, shipId: string | null): Rank[] {
  const opts = shipId ? maps.rankOptionsByShip.get(shipId) : undefined;
  if (!opts || opts.length === 0) return [];
  return sortRanksByDisplayOrder(opts.map(o => o.rank));
}

// 변경/배치 후 Grade 선택지 — 선택한 직급이 속한 템플릿에 등록된 Grade만 (등록된 Grade가 없으면 선택 불가)
export function getGradeOptionsForShipRank(maps: ShipSalaryRankMaps, shipId: string | null, rankId: string): string[] {
  const opts = shipId ? maps.rankOptionsByShip.get(shipId) : undefined;
  const match = opts?.find(o => o.rank.id === rankId);
  if (!match) return [];
  return maps.gradesByTemplate.get(match.templateId) || [];
}
