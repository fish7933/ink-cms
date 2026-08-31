import { supabase } from '@/lib/supabase';
import { getEffectiveTemplateMapForShips, getEffectiveTemplateForShip } from '@/lib/management-fee-store';
import type { ManagementFeeTemplate, ManagementFeeTemplateItem, ManagementFeeItem } from '@/lib/management-fee-store';
import { crewDisplayName } from '@/lib/utils';

function daysInMonth(yearMonth: string): number {
  const [y, m] = yearMonth.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}
function monthRange(yearMonth: string): { start: string; end: string } {
  return { start: `${yearMonth}-01`, end: `${yearMonth}-${String(daysInMonth(yearMonth)).padStart(2, '0')}` };
}
function daysBetweenInclusive(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000) + 1;
}

interface EmbarkRecord {
  id: string;
  ship_id: string;
  crew_member_id: string;
  rank_id: string | null;
  embark_date: string;
  disembark_date: string | null;
}

export interface ManagementFeePeriod {
  id: string;
  ship_id: string;
  year_month: string;
  status: 'draft';
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface ManagementFeePeriodSummary extends ManagementFeePeriod {
  ship_name: string;
  owner_name?: string;
  fleet_name?: string;
  line_count: number;
}

export interface ManagementFeeDashboardRow {
  ship_id: string;
  ship_name: string;
  owner_id?: string;
  owner_name?: string;
  fleet_id?: string;
  fleet_name?: string;
  period_id: string | null;
  status: 'draft' | 'none';
  line_count: number;
}

interface BuiltLine {
  embarkation_record_id: string;
  crew_member_id: string;
  rank_id: string | null;
  fee_item_id: string;
  template_item_id: string;
  billing_basis: 'monthly' | 'monthly_flat' | 'one_time' | 'actual_cost';
  period_start_date: string | null;
  period_end_date: string | null;
  days_served: number | null;
  days_in_month: number | null;
  standard_amount: number | null;
  amount: number | null;
  currency: string;
  ship_cap_amount: number | null;
}

// 템플릿 항목 중, 승선 레코드의 직급구분/국적/선박의 선종과 (NULL이면 조건 무관으로) 맞는 행 중
// 가장 구체적인(NULL 아닌 필드 수가 많은) 행을 채택한다. 동점이면 id로 결정론적으로 정하고
// 경고만 남긴다 — 잘못된 조건 조합이 있어도 배치 계산 전체를 막지 않기 위함이다.
function findBestMatchingItem(
  candidates: ManagementFeeTemplateItem[],
  rankCategory: string | undefined,
  nationality: string | undefined,
  shipType: string | undefined,
): ManagementFeeTemplateItem | null {
  const matches = candidates.filter(c =>
    (c.rank_category == null || c.rank_category === rankCategory) &&
    (c.nationality_code == null || c.nationality_code === nationality) &&
    (c.ship_type == null || c.ship_type === shipType)
  );
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];

  let best = matches[0];
  let bestScore = specificityScore(best);
  let tie = false;
  for (const m of matches.slice(1)) {
    const score = specificityScore(m);
    if (score > bestScore) {
      best = m; bestScore = score; tie = false;
    } else if (score === bestScore) {
      tie = true;
      if (m.id < best.id) best = m;
    }
  }
  if (tie) {
    console.warn(`관리비 템플릿 항목 매칭 동점 발생 — id 낮은 행을 채택합니다 (fee_item_id: ${best.fee_item_id})`);
  }
  return best;
}

function specificityScore(item: ManagementFeeTemplateItem): number {
  return (item.rank_category != null ? 1 : 0) + (item.nationality_code != null ? 1 : 0) + (item.ship_type != null ? 1 : 0);
}

// 순수 함수 — DB 호출 없이, 미리 벌크로 읽어온 데이터에서만 조회해 한 선박의 관리비 라인들을 계산한다.
function buildShipManagementFeeLines(input: {
  yearMonth: string;
  shipType: string | undefined;
  templateItems: ManagementFeeTemplateItem[];
  records: EmbarkRecord[];
  rankCategoryByRankId: Map<string, string>;
  nationalityByCrewMemberId: Map<string, string | undefined>;
}): BuiltLine[] {
  const { yearMonth, shipType, templateItems, records, rankCategoryByRankId, nationalityByCrewMemberId } = input;
  const { start, end } = monthRange(yearMonth);
  const totalDays = daysInMonth(yearMonth);
  const results: BuiltLine[] = [];

  const itemsByFeeItem = new Map<string, ManagementFeeTemplateItem[]>();
  for (const item of templateItems) {
    const arr = itemsByFeeItem.get(item.fee_item_id) || [];
    arr.push(item);
    itemsByFeeItem.set(item.fee_item_id, arr);
  }

  for (const rec of records) {
    const rankCategory = rec.rank_id ? rankCategoryByRankId.get(rec.rank_id) : undefined;
    const nationality = nationalityByCrewMemberId.get(rec.crew_member_id);

    for (const [feeItemId, candidates] of itemsByFeeItem) {
      const matched = findBestMatchingItem(candidates, rankCategory, nationality, shipType);
      if (!matched) continue;

      const rate = Number(matched.amount);

      if (matched.billing_basis === 'monthly') {
        const overlapStart = rec.embark_date > start ? rec.embark_date : start;
        const overlapEnd = rec.disembark_date && rec.disembark_date < end ? rec.disembark_date : end;
        if (overlapStart > overlapEnd) continue;
        const daysServed = Math.max(0, Math.min(daysBetweenInclusive(overlapStart, overlapEnd), totalDays));
        const ratio = totalDays > 0 ? daysServed / totalDays : 0;
        results.push({
          embarkation_record_id: rec.id,
          crew_member_id: rec.crew_member_id,
          rank_id: rec.rank_id,
          fee_item_id: feeItemId,
          template_item_id: matched.id,
          billing_basis: 'monthly',
          period_start_date: overlapStart,
          period_end_date: overlapEnd,
          days_served: daysServed,
          days_in_month: totalDays,
          standard_amount: rate,
          amount: Math.round(rate * ratio * 100) / 100,
          currency: matched.currency,
          ship_cap_amount: matched.ship_cap_amount ?? null,
        });
      } else if (matched.billing_basis === 'monthly_flat') {
        // 일할계산 없이, 그 달에 하루라도 승선 기간과 겹치면 월 기준액 전액을 청구한다.
        const overlapStart = rec.embark_date > start ? rec.embark_date : start;
        const overlapEnd = rec.disembark_date && rec.disembark_date < end ? rec.disembark_date : end;
        if (overlapStart > overlapEnd) continue;
        const daysServed = Math.max(0, Math.min(daysBetweenInclusive(overlapStart, overlapEnd), totalDays));
        results.push({
          embarkation_record_id: rec.id,
          crew_member_id: rec.crew_member_id,
          rank_id: rec.rank_id,
          fee_item_id: feeItemId,
          template_item_id: matched.id,
          billing_basis: 'monthly_flat',
          period_start_date: overlapStart,
          period_end_date: overlapEnd,
          days_served: daysServed,
          days_in_month: totalDays,
          standard_amount: rate,
          amount: rate,
          currency: matched.currency,
          ship_cap_amount: matched.ship_cap_amount ?? null,
        });
      } else if (matched.billing_basis === 'one_time') {
        if (rec.embark_date < start || rec.embark_date > end) continue;
        results.push({
          embarkation_record_id: rec.id,
          crew_member_id: rec.crew_member_id,
          rank_id: rec.rank_id,
          fee_item_id: feeItemId,
          template_item_id: matched.id,
          billing_basis: 'one_time',
          period_start_date: null,
          period_end_date: null,
          days_served: null,
          days_in_month: null,
          standard_amount: rate,
          amount: rate,
          currency: matched.currency,
          ship_cap_amount: matched.ship_cap_amount ?? null,
        });
      }
      // actual_cost(실비) 항목은 승선기록마다 자동으로 라인을 만들지 않는다 — 그 달에 실제로
      // 발생한 건만 관리비 계산 화면의 "실비 항목 기록"에서 건별로 직접 입력한다
      // (management_fee_actual_cost_entries). 어떤 항목이 이 선박에 배정돼 있는지는
      // 템플릿에서 그대로 조회 가능하므로 여기서 빈 라인을 만들 필요가 없다.
    }
  }

  return results;
}

export interface GenerateManagementFeeResult {
  succeeded: { shipId: string; periodId: string; lineCount: number }[];
  skipped: { shipId: string; reason: 'no_crew' | 'already_exists' | 'no_template' }[];
  failed: { shipId: string; error: string }[];
}

export interface ManagementFeeLedgerRow {
  crew_member_id: string;
  crew_name: string;
  rank_code: string;
  nationality?: string;
  embark_date: string;
  disembark_date: string | null;
  item_amounts: Record<string, number | null>; // 청구 항목명 -> 금액 (null = 실비/수기입력 대상)
  total_amount: number;
}

export interface ManagementFeeLedgerItemTotal {
  fee_item_id: string;
  fee_item_name: string;
  currency: string;
  raw_total: number;
  cap_amount: number | null;
  billed_total: number;
  was_capped: boolean;
}

export interface ManagementFeeLedgerActualCostEntry {
  id: string;
  fee_item_id: string;
  fee_item_name: string;
  crew_member_id: string | null;
  crew_name: string | null;
  currency: string;
  unit_price: number | null;
  quantity: number | null;
  amount_usd: number;
  remark: string | null;
}

export interface ManagementFeeLedgerData {
  period: ManagementFeePeriod;
  ship_name: string;
  owner_name?: string;
  fleet_name?: string;
  template_name?: string;
  currency: string;
  fee_item_columns: string[];
  rows: ManagementFeeLedgerRow[];
  item_totals: ManagementFeeLedgerItemTotal[];
  actual_cost_entries: ManagementFeeLedgerActualCostEntry[];
}

export const managementFeeCalcService = {
  async getPeriods(shipId?: string): Promise<ManagementFeePeriodSummary[]> {
    let query = supabase
      .from('management_fee_periods')
      .select('*, ships!ship_id(name, owner_id, fleet_id)')
      .order('year_month', { ascending: false });
    if (shipId) query = query.eq('ship_id', shipId);
    const { data, error } = await query;
    if (error) { console.error('Error fetching management fee periods:', error); return []; }
    if (!data || data.length === 0) return [];

    const periodIds = data.map(p => p.id);
    const { data: lines } = await supabase.from('management_fee_lines').select('period_id').in('period_id', periodIds);
    const countByPeriod = new Map<string, number>();
    for (const l of lines || []) countByPeriod.set(l.period_id, (countByPeriod.get(l.period_id) || 0) + 1);

    const ownerIds = [...new Set(data.map(p => (p.ships as { owner_id?: string } | null)?.owner_id).filter((v): v is string => !!v))];
    const fleetIds = [...new Set(data.map(p => (p.ships as { fleet_id?: string } | null)?.fleet_id).filter((v): v is string => !!v))];
    const [{ data: owners }, { data: fleets }] = await Promise.all([
      ownerIds.length > 0 ? supabase.from('companies').select('id, name').in('id', ownerIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      fleetIds.length > 0 ? supabase.from('fleets').select('id, name').in('id', fleetIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);
    const ownerNameById = new Map((owners || []).map(o => [o.id, o.name]));
    const fleetNameById = new Map((fleets || []).map(f => [f.id, f.name]));

    return data.map(p => {
      const ship = p.ships as { name?: string; owner_id?: string; fleet_id?: string } | null;
      return {
        ...p,
        ship_name: ship?.name || '',
        owner_name: ship?.owner_id ? ownerNameById.get(ship.owner_id) : undefined,
        fleet_name: ship?.fleet_id ? fleetNameById.get(ship.fleet_id) : undefined,
        line_count: countByPeriod.get(p.id) || 0,
      } as ManagementFeePeriodSummary;
    });
  },

  async getPeriodById(id: string): Promise<ManagementFeePeriod | null> {
    const { data, error } = await supabase.from('management_fee_periods').select('*').eq('id', id).single();
    if (error) { console.error('Error fetching management fee period:', error); return null; }
    return data;
  },

  async getDashboardRows(
    yearMonth: string,
    ships: { id: string; name: string; owner_id?: string; fleet_id?: string }[]
  ): Promise<ManagementFeeDashboardRow[]> {
    if (ships.length === 0) return [];
    const shipIds = ships.map(s => s.id);

    const { data: periods } = await supabase
      .from('management_fee_periods')
      .select('id, ship_id')
      .eq('year_month', yearMonth)
      .in('ship_id', shipIds);
    const periodByShip = new Map((periods || []).map(p => [p.ship_id, p]));

    const periodIds = (periods || []).map(p => p.id);
    const { data: lines } = periodIds.length > 0
      ? await supabase.from('management_fee_lines').select('period_id').in('period_id', periodIds)
      : { data: [] as { period_id: string }[] };
    const countByPeriod = new Map<string, number>();
    for (const l of lines || []) countByPeriod.set(l.period_id, (countByPeriod.get(l.period_id) || 0) + 1);

    const ownerIds = [...new Set(ships.map(s => s.owner_id).filter((v): v is string => !!v))];
    const fleetIds = [...new Set(ships.map(s => s.fleet_id).filter((v): v is string => !!v))];
    const [{ data: owners }, { data: fleets }] = await Promise.all([
      ownerIds.length > 0 ? supabase.from('companies').select('id, name').in('id', ownerIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      fleetIds.length > 0 ? supabase.from('fleets').select('id, name').in('id', fleetIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);
    const ownerNameById = new Map((owners || []).map(o => [o.id, o.name]));
    const fleetNameById = new Map((fleets || []).map(f => [f.id, f.name]));

    const shipIdsWithoutPeriod = ships.map(s => s.id).filter(id => !periodByShip.has(id));
    let shipIdsWithCrewThisMonth: Set<string> | null = null;
    if (shipIdsWithoutPeriod.length > 0) {
      const { start, end } = monthRange(yearMonth);
      const { data: records } = await supabase
        .from('crew_embarkation_records')
        .select('ship_id, crew_member_id')
        .in('ship_id', shipIdsWithoutPeriod)
        .lte('embark_date', end)
        .or(`disembark_date.is.null,disembark_date.gte.${start}`);
      const candidateCrewIds = [...new Set((records || []).map(r => r.crew_member_id))];
      const { data: deletedCrewRaw } = candidateCrewIds.length > 0
        ? await supabase.from('crew_members').select('id').in('id', candidateCrewIds).not('deleted_at', 'is', null)
        : { data: [] as { id: string }[] };
      const deletedCrewIds = new Set((deletedCrewRaw || []).map(c => c.id));
      shipIdsWithCrewThisMonth = new Set((records || []).filter(r => !deletedCrewIds.has(r.crew_member_id)).map(r => r.ship_id));
    }

    return ships
      .filter(s => periodByShip.has(s.id) || shipIdsWithCrewThisMonth?.has(s.id))
      .map(s => {
        const period = periodByShip.get(s.id);
        return {
          ship_id: s.id,
          ship_name: s.name,
          owner_id: s.owner_id,
          owner_name: s.owner_id ? ownerNameById.get(s.owner_id) : undefined,
          fleet_id: s.fleet_id,
          fleet_name: s.fleet_id ? fleetNameById.get(s.fleet_id) : undefined,
          period_id: period?.id ?? null,
          status: period ? 'draft' : 'none',
          line_count: period ? (countByPeriod.get(period.id) || 0) : 0,
        } as ManagementFeeDashboardRow;
      });
  },

  // 여러 선박(최대 200척)을 한 번에 생성 — 급여 계산과 동일한 패턴: 선박 수와 무관하게 고정된
  // 소수 쿼리로 읽고, 쓰기만 청크 단위로 병렬 처리한다. 원자적 성공/실패가 아니라 선박별
  // 결과 리스트를 반환한다.
  async generateForShips(shipIds: string[], yearMonth: string, createdBy: string): Promise<GenerateManagementFeeResult> {
    const result: GenerateManagementFeeResult = { succeeded: [], skipped: [], failed: [] };
    if (shipIds.length === 0) return result;
    const { start, end } = monthRange(yearMonth);

    const { data: shipsRaw, error: shipsError } = await supabase.from('ships').select('id, fleet_id, owner_id, ship_type').in('id', shipIds);
    if (shipsError) { shipIds.forEach(id => result.failed.push({ shipId: id, error: shipsError.message })); return result; }
    const ships = (shipsRaw || []).map(s => ({ id: String(s.id), fleet_id: s.fleet_id ? String(s.fleet_id) : null, owner_id: s.owner_id ? String(s.owner_id) : null, ship_type: s.ship_type as string | undefined }));
    const shipById = new Map(ships.map(s => [s.id, s]));

    const { data: existingPeriods } = await supabase
      .from('management_fee_periods').select('ship_id').eq('year_month', yearMonth).in('ship_id', shipIds);
    const existingShipIds = new Set((existingPeriods || []).map(p => p.ship_id));
    for (const id of existingShipIds) result.skipped.push({ shipId: id, reason: 'already_exists' });
    let targetShipIds = shipIds.filter(id => !existingShipIds.has(id));
    if (targetShipIds.length === 0) return result;

    const templateMap = await getEffectiveTemplateMapForShips(ships.filter(s => targetShipIds.includes(s.id)));
    for (const id of targetShipIds) {
      if (!templateMap[id]) result.skipped.push({ shipId: id, reason: 'no_template' });
    }
    targetShipIds = targetShipIds.filter(id => !!templateMap[id]);
    if (targetShipIds.length === 0) return result;

    const { data: recordsRaw, error: recError } = await supabase
      .from('crew_embarkation_records')
      .select('id, ship_id, crew_member_id, rank_id, embark_date, disembark_date')
      .in('ship_id', targetShipIds)
      .lte('embark_date', end)
      .or(`disembark_date.is.null,disembark_date.gte.${start}`);
    if (recError) { targetShipIds.forEach(id => result.failed.push({ shipId: id, error: recError.message })); return result; }
    // 승선 중이라도 관리자가 선원 목록에서 삭제(소프트삭제)한 선원은 그 이후 생성되는
    // 관리비/급여/청구서 등에 나오면 안 된다.
    const rawRecords = (recordsRaw || []) as EmbarkRecord[];
    const candidateCrewIds = [...new Set(rawRecords.map(r => r.crew_member_id))];
    const { data: deletedCrewRaw } = candidateCrewIds.length > 0
      ? await supabase.from('crew_members').select('id').in('id', candidateCrewIds).not('deleted_at', 'is', null)
      : { data: [] as { id: string }[] };
    const deletedCrewIds = new Set((deletedCrewRaw || []).map(c => c.id));
    const records = rawRecords.filter(r => !deletedCrewIds.has(r.crew_member_id));

    const recordsByShip = new Map<string, EmbarkRecord[]>();
    for (const r of records) {
      const arr = recordsByShip.get(r.ship_id) || [];
      arr.push(r);
      recordsByShip.set(r.ship_id, arr);
    }
    const shipsWithRecords = targetShipIds.filter(id => (recordsByShip.get(id) || []).length > 0);
    for (const id of targetShipIds) {
      if (!recordsByShip.get(id)?.length) result.skipped.push({ shipId: id, reason: 'no_crew' });
    }
    if (shipsWithRecords.length === 0) return result;

    const rankIds = [...new Set(records.map(r => r.rank_id).filter((v): v is string => !!v))];
    const { data: ranks } = rankIds.length > 0 ? await supabase.from('ranks').select('id, rank_category').in('id', rankIds) : { data: [] as { id: string; rank_category: string }[] };
    const rankCategoryByRankId = new Map<string, string>((ranks || []).map(r => [r.id, r.rank_category] as [string, string]));

    const crewMemberIds = [...new Set(records.map(r => r.crew_member_id))];
    const { data: crewMembers } = crewMemberIds.length > 0
      ? await supabase.from('crew_members').select('id, nationality').in('id', crewMemberIds)
      : { data: [] as { id: string; nationality?: string }[] };
    const nationalityByCrewMemberId = new Map<string, string | undefined>((crewMembers || []).map(c => [c.id, c.nationality] as [string, string | undefined]));

    const templateIds = [...new Set(Object.values(templateMap).filter((t): t is ManagementFeeTemplate => !!t).map(t => t.id))];
    const { data: templateItemsRaw } = templateIds.length > 0
      ? await supabase.from('management_fee_template_items').select('*').in('template_id', templateIds)
      : { data: [] as ManagementFeeTemplateItem[] };
    const templateItemsByTemplateId = new Map<string, ManagementFeeTemplateItem[]>();
    for (const item of (templateItemsRaw || []) as ManagementFeeTemplateItem[]) {
      const arr = templateItemsByTemplateId.get(String(item.template_id)) || [];
      arr.push({ ...item, id: String(item.id), template_id: String(item.template_id), fee_item_id: String(item.fee_item_id), amount: Number(item.amount) });
      templateItemsByTemplateId.set(String(item.template_id), arr);
    }

    const CHUNK = 12;
    for (let i = 0; i < shipsWithRecords.length; i += CHUNK) {
      const chunk = shipsWithRecords.slice(i, i + CHUNK);
      await Promise.all(chunk.map(async shipId => {
        try {
          const template = templateMap[shipId];
          const templateItems = template ? (templateItemsByTemplateId.get(template.id) || []) : [];
          const shipRecords = recordsByShip.get(shipId) || [];
          const built = buildShipManagementFeeLines({
            yearMonth,
            shipType: shipById.get(shipId)?.ship_type,
            templateItems,
            records: shipRecords,
            rankCategoryByRankId,
            nationalityByCrewMemberId,
          });

          const { data: period, error: periodError } = await supabase
            .from('management_fee_periods')
            .insert({ ship_id: shipId, year_month: yearMonth, created_by: createdBy })
            .select()
            .single();
          if (periodError || !period) throw periodError || new Error('회차 생성에 실패했습니다.');

          if (built.length > 0) {
            const { error: lineError } = await supabase.from('management_fee_lines').insert(built.map(b => ({
              period_id: period.id,
              embarkation_record_id: b.embarkation_record_id,
              crew_member_id: b.crew_member_id,
              rank_id: b.rank_id,
              fee_item_id: b.fee_item_id,
              template_item_id: b.template_item_id,
              billing_basis: b.billing_basis,
              period_start_date: b.period_start_date,
              period_end_date: b.period_end_date,
              days_served: b.days_served,
              days_in_month: b.days_in_month,
              standard_amount: b.standard_amount,
              amount: b.amount,
              currency: b.currency,
            })));
            if (lineError) throw lineError;
          }

          // 선박×월×항목×통화로 그룹핑 후, 캡이 설정된 항목만 저장 (개별 크루 라인의 amount는 캡과 무관하게 그대로 유지)
          const capGroups = new Map<string, { feeItemId: string; currency: string; cap: number; total: number }>();
          for (const line of built) {
            if (line.amount == null || line.ship_cap_amount == null) continue;
            const key = `${line.fee_item_id}::${line.currency}`;
            const g = capGroups.get(key) || { feeItemId: line.fee_item_id, currency: line.currency, cap: line.ship_cap_amount, total: 0 };
            g.total += line.amount;
            capGroups.set(key, g);
          }
          if (capGroups.size > 0) {
            const { error: capError } = await supabase.from('management_fee_ship_item_caps').insert(
              [...capGroups.values()].map(g => ({
                period_id: period.id,
                fee_item_id: g.feeItemId,
                currency: g.currency,
                cap_amount: g.cap,
                raw_total: g.total,
                billed_total: Math.min(g.total, g.cap),
                was_capped: g.total > g.cap,
              }))
            );
            if (capError) throw capError;
          }

          result.succeeded.push({ shipId, periodId: period.id, lineCount: built.length });
        } catch (e) {
          result.failed.push({ shipId, error: e instanceof Error ? e.message : String(e) });
        }
      }));
    }

    return result;
  },

  // 같은 조건으로 라인/상한 캡만 다시 계산한다. period 행 자체는 지우지 않는다 — 지웠다 새로
  // 만들면 management_fee_actual_cost_entries(실비 항목 수기 기록)가 CASCADE로 함께 삭제되어
  // 버리는 결과가 되므로, period_id는 유지한 채 라인/캡만 삭제 후 재계산한다.
  async regeneratePeriod(periodId: string): Promise<void> {
    const period = await this.getPeriodById(periodId);
    if (!period) throw new Error('회차를 찾을 수 없습니다.');
    const shipId = period.ship_id;
    const yearMonth = period.year_month;
    const { start, end } = monthRange(yearMonth);

    const { data: shipRaw, error: shipError } = await supabase.from('ships').select('id, fleet_id, owner_id, ship_type').eq('id', shipId).single();
    if (shipError || !shipRaw) throw shipError || new Error('선박을 찾을 수 없습니다.');
    const shipType = shipRaw.ship_type as string | undefined;

    const template = await getEffectiveTemplateForShip(shipId);

    const { data: recordsRaw, error: recError } = await supabase
      .from('crew_embarkation_records')
      .select('id, ship_id, crew_member_id, rank_id, embark_date, disembark_date')
      .eq('ship_id', shipId)
      .lte('embark_date', end)
      .or(`disembark_date.is.null,disembark_date.gte.${start}`);
    if (recError) throw recError;
    // 승선 중이라도 관리자가 선원 목록에서 삭제(소프트삭제)한 선원은 재계산 결과에도 빠져야 한다.
    const rawRecords = (recordsRaw || []) as EmbarkRecord[];
    const candidateCrewIds = [...new Set(rawRecords.map(r => r.crew_member_id))];
    const { data: deletedCrewRaw } = candidateCrewIds.length > 0
      ? await supabase.from('crew_members').select('id').in('id', candidateCrewIds).not('deleted_at', 'is', null)
      : { data: [] as { id: string }[] };
    const deletedCrewIds = new Set((deletedCrewRaw || []).map(c => c.id));
    const records = rawRecords.filter(r => !deletedCrewIds.has(r.crew_member_id));

    const rankIds = [...new Set(records.map(r => r.rank_id).filter((v): v is string => !!v))];
    const { data: ranks } = rankIds.length > 0 ? await supabase.from('ranks').select('id, rank_category').in('id', rankIds) : { data: [] as { id: string; rank_category: string }[] };
    const rankCategoryByRankId = new Map<string, string>((ranks || []).map(r => [r.id, r.rank_category] as [string, string]));

    const crewMemberIds = [...new Set(records.map(r => r.crew_member_id))];
    const { data: crewMembers } = crewMemberIds.length > 0
      ? await supabase.from('crew_members').select('id, nationality').in('id', crewMemberIds)
      : { data: [] as { id: string; nationality?: string }[] };
    const nationalityByCrewMemberId = new Map<string, string | undefined>((crewMembers || []).map(c => [c.id, c.nationality] as [string, string | undefined]));

    let templateItems: ManagementFeeTemplateItem[] = [];
    if (template) {
      const { data: templateItemsRaw } = await supabase.from('management_fee_template_items').select('*').eq('template_id', template.id);
      templateItems = (templateItemsRaw || []).map(item => ({
        ...item, id: String(item.id), template_id: String(item.template_id), fee_item_id: String(item.fee_item_id), amount: Number(item.amount),
      }));
    }

    const built = buildShipManagementFeeLines({
      yearMonth, shipType, templateItems, records, rankCategoryByRankId, nationalityByCrewMemberId,
    });

    await supabase.from('management_fee_lines').delete().eq('period_id', periodId);
    await supabase.from('management_fee_ship_item_caps').delete().eq('period_id', periodId);

    if (built.length > 0) {
      const { error: lineError } = await supabase.from('management_fee_lines').insert(built.map(b => ({
        period_id: periodId,
        embarkation_record_id: b.embarkation_record_id,
        crew_member_id: b.crew_member_id,
        rank_id: b.rank_id,
        fee_item_id: b.fee_item_id,
        template_item_id: b.template_item_id,
        billing_basis: b.billing_basis,
        period_start_date: b.period_start_date,
        period_end_date: b.period_end_date,
        days_served: b.days_served,
        days_in_month: b.days_in_month,
        standard_amount: b.standard_amount,
        amount: b.amount,
        currency: b.currency,
      })));
      if (lineError) throw lineError;
    }

    const capGroups = new Map<string, { feeItemId: string; currency: string; cap: number; total: number }>();
    for (const line of built) {
      if (line.amount == null || line.ship_cap_amount == null) continue;
      const key = `${line.fee_item_id}::${line.currency}`;
      const g = capGroups.get(key) || { feeItemId: line.fee_item_id, currency: line.currency, cap: line.ship_cap_amount, total: 0 };
      g.total += line.amount;
      capGroups.set(key, g);
    }
    if (capGroups.size > 0) {
      const { error: capError } = await supabase.from('management_fee_ship_item_caps').insert(
        [...capGroups.values()].map(g => ({
          period_id: periodId,
          fee_item_id: g.feeItemId,
          currency: g.currency,
          cap_amount: g.cap,
          raw_total: g.total,
          billed_total: Math.min(g.total, g.cap),
          was_capped: g.total > g.cap,
        }))
      );
      if (capError) throw capError;
    }
  },

  async deletePeriod(periodId: string): Promise<void> {
    const { error } = await supabase.from('management_fee_periods').delete().eq('id', periodId);
    if (error) throw error;
  },

  // 크루×청구항목 피벗 스프레드시트 뷰 — 청구서 발행 전 검증/미리보기 화면의 데이터 소스.
  async getLedgerForPeriod(periodId: string): Promise<ManagementFeeLedgerData | null> {
    const period = await this.getPeriodById(periodId);
    if (!period) return null;

    const { data: ship } = await supabase.from('ships').select('name, owner_id, fleet_id').eq('id', period.ship_id).single();
    const [{ data: owner }, { data: fleet }, template] = await Promise.all([
      ship?.owner_id ? supabase.from('companies').select('name').eq('id', ship.owner_id).single() : Promise.resolve({ data: null as { name: string } | null }),
      ship?.fleet_id ? supabase.from('fleets').select('name').eq('id', ship.fleet_id).single() : Promise.resolve({ data: null as { name: string } | null }),
      getEffectiveTemplateForShip(period.ship_id),
    ]);

    const { data: lines, error: linesError } = await supabase
      .from('management_fee_lines')
      .select('*')
      .eq('period_id', periodId);
    if (linesError) { console.error('Error fetching management fee lines:', linesError); return null; }

    const { data: caps } = await supabase.from('management_fee_ship_item_caps').select('*').eq('period_id', periodId);
    const { data: actualCostEntriesRaw } = await supabase.from('management_fee_actual_cost_entries').select('*').eq('period_id', periodId).order('created_at', { ascending: false });

    const crewMemberIds = [...new Set([
      ...(lines || []).map(l => l.crew_member_id),
      ...(actualCostEntriesRaw || []).map(e => e.crew_member_id).filter((v): v is string => !!v),
    ])];
    const embarkationRecordIds = [...new Set((lines || []).map(l => l.embarkation_record_id))];
    const rankIds = [...new Set((lines || []).map(l => l.rank_id).filter((v): v is string => !!v))];
    const feeItemIds = [...new Set([
      ...(lines || []).map(l => l.fee_item_id),
      ...(actualCostEntriesRaw || []).map(e => e.fee_item_id),
    ])];

    const [{ data: crewMembers }, { data: embarkRecords }, { data: ranks }, { data: feeItems }] = await Promise.all([
      crewMemberIds.length > 0 ? supabase.from('crew_members').select('id, name, name_english, nationality').in('id', crewMemberIds) : Promise.resolve({ data: [] as { id: string; name: string; name_english?: string; nationality?: string }[] }),
      embarkationRecordIds.length > 0 ? supabase.from('crew_embarkation_records').select('id, embark_date, disembark_date').in('id', embarkationRecordIds) : Promise.resolve({ data: [] as { id: string; embark_date: string; disembark_date: string | null }[] }),
      rankIds.length > 0 ? supabase.from('ranks').select('id, rank_code').in('id', rankIds) : Promise.resolve({ data: [] as { id: string; rank_code: string }[] }),
      feeItemIds.length > 0 ? supabase.from('management_fee_items').select('*').in('id', feeItemIds) : Promise.resolve({ data: [] as ManagementFeeItem[] }),
    ]);
    const crewById = new Map<string, { id: string; name: string; name_english?: string; nationality?: string }>((crewMembers || []).map(c => [c.id, c] as [string, typeof c]));
    const embarkById = new Map((embarkRecords || []).map(r => [r.id, r]));
    const rankCodeById = new Map((ranks || []).map(r => [r.id, r.rank_code]));
    const feeItemById = new Map((feeItems || []).map(f => [String(f.id), f as ManagementFeeItem]));

    const actualCostEntries: ManagementFeeLedgerActualCostEntry[] = (actualCostEntriesRaw || []).map(e => {
      const crew = e.crew_member_id ? crewById.get(e.crew_member_id) : undefined;
      return {
        id: String(e.id),
        fee_item_id: String(e.fee_item_id),
        fee_item_name: feeItemById.get(String(e.fee_item_id))?.name || 'Unknown',
        crew_member_id: e.crew_member_id ? String(e.crew_member_id) : null,
        crew_name: crew ? crewDisplayName(crew) : null,
        currency: e.currency,
        unit_price: e.unit_price == null ? null : Number(e.unit_price),
        quantity: e.quantity == null ? null : Number(e.quantity),
        amount_usd: Number(e.amount_usd),
        remark: e.remark,
      };
    });

    const feeItemColumns = [...feeItemIds]
      .sort((a, b) => (feeItemById.get(a)?.display_order ?? 0) - (feeItemById.get(b)?.display_order ?? 0))
      .map(id => feeItemById.get(id)?.name || 'Unknown');

    const rowsByCrewRecord = new Map<string, ManagementFeeLedgerRow>();
    for (const line of lines || []) {
      const key = line.embarkation_record_id;
      const crew = crewById.get(line.crew_member_id);
      const embark = embarkById.get(line.embarkation_record_id);
      const feeItemName = feeItemById.get(line.fee_item_id)?.name || 'Unknown';
      const row = rowsByCrewRecord.get(key) || {
        crew_member_id: line.crew_member_id,
        crew_name: crew ? crewDisplayName(crew) : '',
        rank_code: line.rank_id ? (rankCodeById.get(line.rank_id) || '') : '',
        nationality: crew?.nationality,
        embark_date: embark?.embark_date || '',
        disembark_date: embark?.disembark_date ?? null,
        item_amounts: {},
        total_amount: 0,
      };
      row.item_amounts[feeItemName] = line.amount == null ? null : Number(line.amount);
      if (line.amount != null) row.total_amount += Number(line.amount);
      rowsByCrewRecord.set(key, row);
    }

    const itemTotals: ManagementFeeLedgerItemTotal[] = (caps || []).map(c => ({
      fee_item_id: c.fee_item_id,
      fee_item_name: feeItemById.get(c.fee_item_id)?.name || 'Unknown',
      currency: c.currency,
      raw_total: Number(c.raw_total),
      cap_amount: Number(c.cap_amount),
      billed_total: Number(c.billed_total),
      was_capped: c.was_capped,
    }));
    // 캡이 없는 항목도 합계 참고용으로 함께 보여준다 (raw_total == billed_total, was_capped=false)
    const cappedFeeItemIds = new Set(itemTotals.map(t => t.fee_item_id));
    const uncappedTotals = new Map<string, { currency: string; total: number }>();
    for (const line of lines || []) {
      if (line.amount == null || cappedFeeItemIds.has(line.fee_item_id)) continue;
      const key = `${line.fee_item_id}::${line.currency}`;
      const g = uncappedTotals.get(key) || { currency: line.currency, total: 0 };
      g.total += Number(line.amount);
      uncappedTotals.set(key, g);
    }
    for (const [key, g] of uncappedTotals) {
      const feeItemId = key.split('::')[0];
      itemTotals.push({
        fee_item_id: feeItemId,
        fee_item_name: feeItemById.get(feeItemId)?.name || 'Unknown',
        currency: g.currency,
        raw_total: g.total,
        cap_amount: null,
        billed_total: g.total,
        was_capped: false,
      });
    }

    // 실비 항목 기록도 항목별 합계에 반영 (전부 USD 환산 금액이라 상한 개념 없이 그대로 합산)
    const actualCostTotalsByFeeItem = new Map<string, number>();
    for (const e of actualCostEntries) {
      actualCostTotalsByFeeItem.set(e.fee_item_id, (actualCostTotalsByFeeItem.get(e.fee_item_id) || 0) + e.amount_usd);
    }
    for (const [feeItemId, total] of actualCostTotalsByFeeItem) {
      itemTotals.push({
        fee_item_id: feeItemId,
        fee_item_name: feeItemById.get(feeItemId)?.name || 'Unknown',
        currency: 'USD',
        raw_total: total,
        cap_amount: null,
        billed_total: total,
        was_capped: false,
      });
    }

    itemTotals.sort((a, b) => (feeItemById.get(a.fee_item_id)?.display_order ?? 0) - (feeItemById.get(b.fee_item_id)?.display_order ?? 0));

    return {
      period,
      ship_name: ship?.name || '',
      owner_name: owner?.name,
      fleet_name: fleet?.name,
      template_name: template?.name,
      currency: template?.currency || 'USD',
      fee_item_columns: feeItemColumns,
      rows: [...rowsByCrewRecord.values()],
      item_totals: itemTotals,
      actual_cost_entries: actualCostEntries,
    };
  },
};
