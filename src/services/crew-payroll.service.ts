import { supabase } from '@/lib/supabase';
import { getEffectiveTemplateMapForShips, getEffectiveTemplateForShip, getSalaryComponents } from '@/lib/salary-store';
import { getRanks } from '@/services/rank.service';
import { buildSalaryTemplateMatrix } from '@/lib/salary-template-matrix';
import { approvalDocumentService } from '@/services/approval-document.service';
import { orgChartService } from '@/services/org-chart.service';
import { getCompanyInfo } from '@/services/company-info.service';
import { crewDisplayName } from '@/lib/utils';
import { buildCrewPayrollLedgerWorkbook } from '@/utils/crew-payroll-export';
import * as XLSX from 'xlsx-js-style';
import type { SalaryTemplate } from '@/lib/salary-store';
import type { CrewContractAllowanceWithDetails } from '@/types/allowance';
import type {
  CrewPayrollPeriod,
  CrewPayrollPeriodSummary,
  CrewPayslip,
  CrewPayslipItem,
  CrewPayslipWithDetails,
  CrewPayrollLedgerData,
  CrewPayrollDashboardRow,
  CrewDeferredPayRow,
  CrewDeferredPayHistoryRow,
  CrewPayrollHistoryRow,
  CrewPayrollPeriodStatus,
} from '@/types/crew-payroll';

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

// 후불성(payment_type='deferred') 급여항목은 매월 지급되지 않고 누적만 되다가 하선월에
// 일괄 지급된다 — 승선일부터 throughDate(보통 그 달 말, 하선월이면 하선일)까지 걸친 모든
// 달을 실제 달력 기준으로 훑어, 각 달의 일할계산(기존 월별 계산과 동일한 공식)을 더한 게
// 그 시점까지의 누적액이다. 등급/직급이 계약 기간 중 안 바뀐다는 전제(승선기록 1건=고정
// rank_grade)로, 현재 유효한 월 기준액(monthlyRate)을 전 기간에 동일 적용한다.
function sumDeferredAccrualThroughDate(embarkDate: string, throughDate: string, monthlyRate: number): number {
  let total = 0;
  let cursor = embarkDate.slice(0, 7);
  const lastMonth = throughDate.slice(0, 7);
  while (cursor <= lastMonth) {
    const { start, end } = monthRange(cursor);
    const totalDays = daysInMonth(cursor);
    const overlapStart = embarkDate > start ? embarkDate : start;
    const overlapEnd = throughDate < end ? throughDate : end;
    if (overlapStart <= overlapEnd) {
      const daysServed = daysBetweenInclusive(overlapStart, overlapEnd);
      total += Math.round(monthlyRate * daysServed / totalDays);
    }
    const [y, m] = cursor.split('-').map(Number);
    const next = new Date(y, m, 1); // m은 1-indexed 월이라 그대로 넘기면 다음 달 1일
    cursor = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
  }
  return total;
}

interface GeneratedItem {
  source: 'template' | 'contract';
  category: 'earning' | 'deduction';
  name: string;
  payment_method: 'ship_direct' | 'owner_billed' | null;
  payment_type: 'immediate' | 'deferred_accrual' | 'deferred_payout';
  standard_amount: number;
  amount: number;
  accrued_to_date: number | null;
  description: string | null;
  display_order: number;
}

interface TemplateItemWithComponent {
  rank?: string;
  rank_grade?: string | null;
  amount: number;
  component: { name: string; component_type: 'earning' | 'deduction'; payment_type: 'monthly' | 'deferred'; description?: string | null };
}

interface EmbarkRecord {
  id: string;
  ship_id: string;
  crew_member_id: string;
  rank_id: string | null;
  rank_grade: string | null;
  embark_date: string;
  disembark_date: string | null;
}

interface ContractRow {
  id: string;
  crew_member_id: string;
  ship_id: string;
  start_date: string;
  end_date: string;
}

interface BuiltPayslip {
  embarkation_record_id: string;
  crew_member_id: string;
  rank_id: string | null;
  rank_grade: string | null;
  period_start_date: string;
  period_end_date: string;
  days_served: number;
  days_in_month: number;
  base_amount: number;
  total_allowance: number;
  total_deduction: number;
  total_owner_billed: number;
  net_amount: number;
  currency: string;
  items: GeneratedItem[];
}

// 순수 함수 — DB 호출 없이, 미리 벌크로 읽어온 데이터(Map)에서만 조회해 한 선박의 명세서들을
// 계산한다. 여러 선박을 한 번에 생성할 때도, 선박 1척만 생성할 때도 이 함수 하나로 처리한다.
function buildShipPayslips(input: {
  shipId: string;
  yearMonth: string;
  templateCurrency: string | undefined;
  templateItems: TemplateItemWithComponent[];
  records: EmbarkRecord[];
  rankNameById: Map<string, string>;
  contractsByCrewMember: Map<string, ContractRow[]>;
  allowanceItemsByContractId: Map<string, CrewContractAllowanceWithDetails[]>;
}): BuiltPayslip[] {
  const { shipId, yearMonth, templateCurrency, templateItems, records, rankNameById, contractsByCrewMember, allowanceItemsByContractId } = input;
  const { start, end } = monthRange(yearMonth);
  const totalDays = daysInMonth(yearMonth);
  const results: BuiltPayslip[] = [];

  for (const rec of records) {
    const overlapStart = rec.embark_date > start ? rec.embark_date : start;
    const overlapEnd = rec.disembark_date && rec.disembark_date < end ? rec.disembark_date : end;
    const daysServed = Math.max(0, Math.min(daysBetweenInclusive(overlapStart, overlapEnd), totalDays));
    const ratio = totalDays > 0 ? daysServed / totalDays : 0;

    const items: GeneratedItem[] = [];
    const rankName = rec.rank_id ? rankNameById.get(rec.rank_id) : undefined;
    if (rankName) {
      const rankItems = templateItems.filter(i => i.rank === rankName);
      const gradeSpecific = rankItems.filter(i => (i.rank_grade || null) === (rec.rank_grade || null));
      const matched = gradeSpecific.length > 0 ? gradeSpecific : rankItems.filter(i => !i.rank_grade);
      matched.forEach((i, idx) => {
        const standard = Number(i.amount);
        const isDeduction = i.component.component_type === 'deduction';
        const isDeferred = !isDeduction && i.component.payment_type === 'deferred';

        if (!isDeferred) {
          items.push({
            source: 'template',
            category: isDeduction ? 'deduction' : 'earning',
            name: i.component.name,
            payment_method: null,
            payment_type: 'immediate',
            standard_amount: standard,
            amount: Math.round(standard * ratio),
            accrued_to_date: null,
            description: i.component.description || null,
            display_order: idx,
          });
          return;
        }

        // 후불성 급여 — 이 달분은 누적만 되고(net_amount 제외), 하선월이면 승선일부터 쌓인
        // 전체 누적액을 별도 항목으로 일괄 지급한다(net_amount 포함).
        const cumulativeToDate = sumDeferredAccrualThroughDate(rec.embark_date, overlapEnd, standard);
        items.push({
          source: 'template',
          category: 'earning',
          name: `${i.component.name} (Accrued)`,
          payment_method: null,
          payment_type: 'deferred_accrual',
          standard_amount: standard,
          amount: Math.round(standard * ratio),
          accrued_to_date: cumulativeToDate,
          description: i.component.description || null,
          display_order: idx,
        });

        const isDisembarkMonth = !!rec.disembark_date && rec.disembark_date >= start && rec.disembark_date <= end;
        if (isDisembarkMonth) {
          items.push({
            source: 'template',
            category: 'earning',
            name: `${i.component.name} (Lump Sum)`,
            payment_method: null,
            payment_type: 'deferred_payout',
            standard_amount: standard,
            amount: cumulativeToDate,
            accrued_to_date: cumulativeToDate,
            description: i.component.description || null,
            display_order: idx + 50,
          });
        }
      });
    }

    // 그 승선 시점(embark_date)에 유효했던 계약 — 현재 status가 아니라 계약기간으로 판단
    const candidateContracts = (contractsByCrewMember.get(rec.crew_member_id) || [])
      .filter(c => c.ship_id === shipId && c.start_date <= rec.embark_date && c.end_date >= rec.embark_date)
      .sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
    const contract = candidateContracts[0];
    if (contract) {
      const contractItems = allowanceItemsByContractId.get(contract.id) || [];
      contractItems.forEach((a, idx) => {
        const standard = Number(a.amount);
        items.push({
          source: 'contract',
          category: a.kind === 'deduction' ? 'deduction' : 'earning',
          name: a.allowance_type_name,
          payment_method: a.kind === 'allowance' ? a.payment_method : null,
          payment_type: 'immediate',
          standard_amount: standard,
          amount: Math.round(standard * ratio),
          accrued_to_date: null,
          description: a.allowance_type_description || null,
          display_order: 100 + idx,
        });
      });
    }

    const baseAmount = items.filter(i => i.source === 'template' && i.category === 'earning' && i.payment_type !== 'deferred_accrual').reduce((s, i) => s + i.amount, 0);
    const allowanceAmount = items.filter(i => i.category === 'earning' && i.source === 'contract' && i.payment_method !== 'owner_billed').reduce((s, i) => s + i.amount, 0);
    const ownerBilledAmount = items.filter(i => i.category === 'earning' && i.source === 'contract' && i.payment_method === 'owner_billed').reduce((s, i) => s + i.amount, 0);
    const deductionAmount = items.filter(i => i.category === 'deduction').reduce((s, i) => s + i.amount, 0);
    const netAmount = baseAmount + allowanceAmount - deductionAmount;

    results.push({
      embarkation_record_id: rec.id,
      crew_member_id: rec.crew_member_id,
      rank_id: rec.rank_id,
      rank_grade: rec.rank_grade,
      period_start_date: overlapStart,
      period_end_date: overlapEnd,
      days_served: daysServed,
      days_in_month: totalDays,
      base_amount: baseAmount,
      total_allowance: allowanceAmount,
      total_deduction: deductionAmount,
      total_owner_billed: ownerBilledAmount,
      net_amount: netAmount,
      currency: templateCurrency || 'USD',
      items,
    });
  }

  return results;
}

export interface GeneratePayrollResult {
  succeeded: { shipId: string; periodId: string; payslipCount: number }[];
  skipped: { shipId: string; reason: 'no_crew' | 'already_exists' }[];
  failed: { shipId: string; error: string }[];
}

export const crewPayrollService = {
  async getPayrollPeriods(shipId?: string): Promise<CrewPayrollPeriodSummary[]> {
    let query = supabase
      .from('crew_payroll_periods')
      .select('*, ships!ship_id(name, owner_id, fleet_id)')
      .order('year_month', { ascending: false });
    if (shipId) query = query.eq('ship_id', shipId);
    const { data, error } = await query;
    if (error) { console.error('Error fetching crew payroll periods:', error); return []; }
    if (!data || data.length === 0) return [];

    const periodIds = data.map(p => p.id);
    const { data: payslips } = await supabase.from('crew_payslips').select('period_id, net_amount').in('period_id', periodIds);
    const summaryMap = new Map<string, { count: number; total: number }>();
    for (const p of (payslips || [])) {
      const cur = summaryMap.get(p.period_id) || { count: 0, total: 0 };
      cur.count += 1;
      cur.total += Number(p.net_amount);
      summaryMap.set(p.period_id, cur);
    }

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
      const summary = summaryMap.get(p.id) || { count: 0, total: 0 };
      return {
        ...p,
        ship_name: ship?.name || '',
        owner_name: ship?.owner_id ? ownerNameById.get(ship.owner_id) : undefined,
        fleet_name: ship?.fleet_id ? fleetNameById.get(ship.fleet_id) : undefined,
        payslip_count: summary.count,
        total_net_amount: summary.total,
      } as CrewPayrollPeriodSummary;
    });
  },

  async getPayrollPeriodById(id: string): Promise<CrewPayrollPeriod | null> {
    const { data, error } = await supabase.from('crew_payroll_periods').select('*').eq('id', id).single();
    if (error) { console.error('Error fetching crew payroll period:', error); return null; }
    return data;
  },

  // 월별 전 선박(최대 200척) 대시보드용 집계 — 선박 수와 무관하게 고정된 소수 쿼리로 처리한다.
  // 그 달 회차가 없는 선박도 status='none'으로 한 행씩 포함된다.
  async getDashboardRows(
    yearMonth: string,
    ships: { id: string; name: string; owner_id?: string; fleet_id?: string }[]
  ): Promise<CrewPayrollDashboardRow[]> {
    if (ships.length === 0) return [];
    const shipIds = ships.map(s => s.id);

    const { data: periods } = await supabase
      .from('crew_payroll_periods')
      .select('id, ship_id, status')
      .eq('year_month', yearMonth)
      .in('ship_id', shipIds);
    const periodByShip = new Map((periods || []).map(p => [p.ship_id, p]));

    const periodIds = (periods || []).map(p => p.id);
    const { data: payslips } = periodIds.length > 0
      ? await supabase.from('crew_payslips').select('period_id, net_amount, total_owner_billed').in('period_id', periodIds)
      : { data: [] as { period_id: string; net_amount: number; total_owner_billed: number }[] };
    const summaryByPeriod = new Map<string, { count: number; net: number; ownerBilled: number }>();
    for (const p of payslips || []) {
      const cur = summaryByPeriod.get(p.period_id) || { count: 0, net: 0, ownerBilled: 0 };
      cur.count += 1;
      cur.net += Number(p.net_amount);
      cur.ownerBilled += Number(p.total_owner_billed);
      summaryByPeriod.set(p.period_id, cur);
    }

    const ownerIds = [...new Set(ships.map(s => s.owner_id).filter((v): v is string => !!v))];
    const fleetIds = [...new Set(ships.map(s => s.fleet_id).filter((v): v is string => !!v))];
    const [{ data: owners }, { data: fleets }] = await Promise.all([
      ownerIds.length > 0 ? supabase.from('companies').select('id, name').in('id', ownerIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      fleetIds.length > 0 ? supabase.from('fleets').select('id, name').in('id', fleetIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);
    const ownerNameById = new Map((owners || []).map(o => [o.id, o.name]));
    const fleetNameById = new Map((fleets || []).map(f => [f.id, f.name]));

    // 아직 회차가 없는 선박은, 그 달에 승선 기록이 하나도 없으면 목록에서 아예 뺀다 —
    // 회차가 이미 있는 선박은(하선 등으로 지금은 승선자가 없어졌어도) 계속 보여준다.
    const shipIdsWithoutPeriod = ships.map(s => s.id).filter(id => !periodByShip.has(id));
    let shipIdsWithCrewThisMonth: Set<string> | null = null;
    if (shipIdsWithoutPeriod.length > 0) {
      const { start, end } = monthRange(yearMonth);
      const { data: records } = await supabase
        .from('crew_embarkation_records')
        .select('ship_id')
        .in('ship_id', shipIdsWithoutPeriod)
        .lte('embark_date', end)
        .or(`disembark_date.is.null,disembark_date.gte.${start}`);
      shipIdsWithCrewThisMonth = new Set((records || []).map(r => r.ship_id));
    }

    return ships
      .filter(s => periodByShip.has(s.id) || shipIdsWithCrewThisMonth?.has(s.id))
      .map(s => {
      const period = periodByShip.get(s.id);
      const summary = period ? summaryByPeriod.get(period.id) : undefined;
      return {
        ship_id: s.id,
        ship_name: s.name,
        owner_id: s.owner_id,
        owner_name: s.owner_id ? ownerNameById.get(s.owner_id) : undefined,
        fleet_id: s.fleet_id,
        fleet_name: s.fleet_id ? fleetNameById.get(s.fleet_id) : undefined,
        period_id: period?.id ?? null,
        status: period?.status ?? 'none',
        payslip_count: summary?.count ?? 0,
        total_net_amount: summary?.net ?? 0,
        total_owner_billed: summary?.ownerBilled ?? 0,
      } as CrewPayrollDashboardRow;
    });
  },

  // 선원 개인의 월별 급여 이력 — 급여대장에서 직급/이름을 클릭했을 때, 선박이 바뀌었어도
  // 이 선원의 전체 승선 이력에 걸친 급여를 급여대장과 같은 형태(월별 행 + 상태)로 보여준다.
  // 급여대장과 동일하게 급여 구성항목/계약 수당/공제를 "기본급" 한 칸으로 뭉치지 않고
  // 항목명별로 모두 펼쳐서(allowance_by_name/deduction_by_name) 반환한다.
  async getCrewPayrollHistory(crewMemberId: string): Promise<CrewPayrollHistoryRow[]> {
    const { data, error } = await supabase
      .from('crew_payslips')
      .select('*, crew_payroll_periods!period_id(year_month, status, ships!ship_id(name))')
      .eq('crew_member_id', crewMemberId)
      .order('created_at', { ascending: false });
    if (error) { console.error('Error fetching crew payroll history:', error); return []; }
    if (!data || data.length === 0) return [];

    const payslipIds = data.map(p => p.id);
    const { data: items } = await supabase.from('crew_payslip_items').select('*').in('payslip_id', payslipIds);
    const itemsByPayslip = new Map<string, { category: string; name: string; amount: number }[]>();
    for (const it of items || []) {
      const arr = itemsByPayslip.get(it.payslip_id) || [];
      arr.push(it);
      itemsByPayslip.set(it.payslip_id, arr);
    }

    return data.map(p => {
      const period = p.crew_payroll_periods as { year_month?: string; status?: string; ships?: { name?: string } } | null;
      const pItems = itemsByPayslip.get(p.id) || [];
      const allowanceByName: Record<string, number> = {};
      const deductionByName: Record<string, number> = {};
      for (const item of pItems) {
        if (item.category === 'earning') allowanceByName[item.name] = (allowanceByName[item.name] || 0) + Number(item.amount);
        if (item.category === 'deduction') deductionByName[item.name] = (deductionByName[item.name] || 0) + Number(item.amount);
      }
      return {
        period_id: p.period_id,
        year_month: period?.year_month || '',
        ship_name: period?.ships?.name || '',
        status: (period?.status as CrewPayrollPeriodStatus) || 'draft',
        period_start_date: p.period_start_date,
        period_end_date: p.period_end_date,
        days_served: p.days_served,
        days_in_month: p.days_in_month,
        allowance_by_name: allowanceByName,
        gross_amount: Number(p.base_amount) + Number(p.total_allowance),
        deduction_by_name: deductionByName,
        total_deduction: Number(p.total_deduction),
        total_owner_billed: Number(p.total_owner_billed),
        net_amount: Number(p.net_amount),
      };
    }).sort((a, b) => b.year_month.localeCompare(a.year_month));
  },

  // 후불성(deferred) 급여 항목 현황 — 그 달에 존재한 회차들의 명세서 항목 중
  // payment_type이 deferred_accrual/deferred_payout인 것만 모아, 회사 입장에서 선원별
  // 적립액/누적 잔액/그 달 지급액을 한눈에 본다.
  async getDeferredPayReport(
    yearMonth: string,
    ships: { id: string; name: string; owner_id?: string; owner_name?: string; fleet_id?: string; fleet_name?: string }[]
  ): Promise<CrewDeferredPayRow[]> {
    const shipIds = ships.map(s => s.id);
    if (shipIds.length === 0) return [];
    const shipById = new Map(ships.map(s => [s.id, s]));

    const { data: periods } = await supabase.from('crew_payroll_periods').select('id, ship_id').eq('year_month', yearMonth).in('ship_id', shipIds);
    if (!periods || periods.length === 0) return [];
    const shipByPeriod = new Map(periods.map(p => [p.id, p.ship_id]));
    const periodIds = periods.map(p => p.id);

    const { data: payslips } = await supabase
      .from('crew_payslips')
      .select('id, period_id, crew_member_id, embarkation_record_id, crew_members!crew_member_id(name, name_english), ranks:rank_id(rank_code)')
      .in('period_id', periodIds);
    if (!payslips || payslips.length === 0) return [];
    const payslipMetaById = new Map(payslips.map(p => [p.id, p]));
    const payslipIds = payslips.map(p => p.id);

    const embarkationIds = [...new Set(payslips.map(p => p.embarkation_record_id).filter((v): v is string => !!v))];
    const { data: embarkRecords } = embarkationIds.length > 0
      ? await supabase.from('crew_embarkation_records').select('id, embark_date, disembark_date').in('id', embarkationIds)
      : { data: [] as { id: string; embark_date: string; disembark_date: string | null }[] };
    const embarkById = new Map((embarkRecords || []).map(r => [r.id, r]));

    const { data: items } = await supabase
      .from('crew_payslip_items')
      .select('*')
      .in('payslip_id', payslipIds)
      .in('payment_type', ['deferred_accrual', 'deferred_payout']);
    if (!items || items.length === 0) return [];

    const rowsByKey = new Map<string, CrewDeferredPayRow>();
    for (const item of items) {
      const payslip = payslipMetaById.get(item.payslip_id);
      if (!payslip) continue;
      const shipId = shipByPeriod.get(payslip.period_id) || '';
      const ship = shipById.get(shipId);
      const baseName = item.name.replace(/\s*\([^)]*\)\s*$/, '');
      const key = `${item.payslip_id}::${baseName}`;
      const crew = payslip.crew_members as { name?: string; name_english?: string } | null;
      const rank = payslip.ranks as { rank_code?: string } | null;
      const embark = payslip.embarkation_record_id ? embarkById.get(payslip.embarkation_record_id) : undefined;
      const disembarkThisMonth = embark?.disembark_date && embark.disembark_date.slice(0, 7) === yearMonth ? embark.disembark_date : null;
      const row = rowsByKey.get(key) || {
        crew_member_id: payslip.crew_member_id,
        crew_name: crew ? crewDisplayName(crew) : '',
        rank_code: rank?.rank_code || '',
        owner_id: ship?.owner_id,
        owner_name: ship?.owner_name,
        fleet_id: ship?.fleet_id,
        fleet_name: ship?.fleet_name,
        ship_id: shipId,
        ship_name: ship?.name || '',
        embark_date: embark?.embark_date || '',
        disembark_date: disembarkThisMonth,
        item_name: baseName,
        monthly_accrual: 0,
        accrued_to_date: 0,
        payout_this_month: 0,
      };
      if (item.payment_type === 'deferred_accrual') {
        row.monthly_accrual = Number(item.amount);
        row.accrued_to_date = Number(item.accrued_to_date ?? item.amount);
      } else if (item.payment_type === 'deferred_payout') {
        row.payout_this_month = Number(item.amount);
      }
      rowsByKey.set(key, row);
    }

    return [...rowsByKey.values()].sort((a, b) =>
      (a.owner_name || '').localeCompare(b.owner_name || '') || a.ship_name.localeCompare(b.ship_name) || a.crew_name.localeCompare(b.crew_name)
    );
  },

  // 선원 1명의 후불성 적립 히스토리 — 선박이 바뀐 이력까지 전부 포함해 월별로 모은다.
  // itemName을 지정하면 그 항목(예: "LP") 하나의 적립 이력만 필터링한다.
  async getCrewDeferredPayHistory(crewMemberId: string, itemName?: string): Promise<CrewDeferredPayHistoryRow[]> {
    const { data: payslips } = await supabase
      .from('crew_payslips')
      .select('id, period_id, crew_payroll_periods!period_id(year_month, status, ships!ship_id(name))')
      .eq('crew_member_id', crewMemberId);
    if (!payslips || payslips.length === 0) return [];
    const metaByPayslip = new Map(payslips.map(p => [p.id, p]));
    const payslipIds = payslips.map(p => p.id);

    const { data: items } = await supabase
      .from('crew_payslip_items')
      .select('*')
      .in('payslip_id', payslipIds)
      .in('payment_type', ['deferred_accrual', 'deferred_payout']);
    if (!items || items.length === 0) return [];

    const rowsByKey = new Map<string, CrewDeferredPayHistoryRow>();
    for (const item of items) {
      const baseName = item.name.replace(/\s*\([^)]*\)\s*$/, '');
      if (itemName && baseName !== itemName) continue;
      const payslip = metaByPayslip.get(item.payslip_id);
      if (!payslip) continue;
      const period = payslip.crew_payroll_periods as { year_month?: string; status?: string; ships?: { name?: string } } | null;
      const key = `${item.payslip_id}::${baseName}`;
      const row = rowsByKey.get(key) || {
        period_id: payslip.period_id,
        year_month: period?.year_month || '',
        ship_name: period?.ships?.name || '',
        status: (period?.status as CrewPayrollPeriodStatus) || 'draft',
        item_name: baseName,
        monthly_accrual: 0,
        accrued_to_date: 0,
        payout_this_month: 0,
      };
      if (item.payment_type === 'deferred_accrual') {
        row.monthly_accrual = Number(item.amount);
        row.accrued_to_date = Number(item.accrued_to_date ?? item.amount);
      } else if (item.payment_type === 'deferred_payout') {
        row.payout_this_month = Number(item.amount);
      }
      rowsByKey.set(key, row);
    }

    return [...rowsByKey.values()].sort((a, b) => b.year_month.localeCompare(a.year_month) || a.item_name.localeCompare(b.item_name));
  },

  // 여러 선박(최대 200척)을 한 번에 생성 — 선박 수와 무관하게 고정된 소수 쿼리로 읽고,
  // 쓰기(명세서/항목 insert)만 선박당 2회씩 10~15척 단위로 병렬 처리한다.
  // 원자적 성공/실패가 아니라 선박별 결과 리스트를 반환 — 일부 선박은 그 달 승선자가
  // 없거나 이미 회차가 있어 건너뛰는 게 정상이다.
  async generatePayrollForShips(shipIds: string[], yearMonth: string, createdBy: string): Promise<GeneratePayrollResult> {
    const result: GeneratePayrollResult = { succeeded: [], skipped: [], failed: [] };
    if (shipIds.length === 0) return result;
    const { start, end } = monthRange(yearMonth);

    const { data: shipsRaw, error: shipsError } = await supabase.from('ships').select('id, fleet_id, owner_id').in('id', shipIds);
    if (shipsError) { shipIds.forEach(id => result.failed.push({ shipId: id, error: shipsError.message })); return result; }
    const ships = (shipsRaw || []).map(s => ({ id: String(s.id), fleet_id: s.fleet_id ? String(s.fleet_id) : null, owner_id: s.owner_id ? String(s.owner_id) : null }));

    const { data: existingPeriods } = await supabase
      .from('crew_payroll_periods').select('ship_id').eq('year_month', yearMonth).in('ship_id', shipIds);
    const existingShipIds = new Set((existingPeriods || []).map(p => p.ship_id));
    for (const id of existingShipIds) result.skipped.push({ shipId: id, reason: 'already_exists' });
    const targetShipIds = shipIds.filter(id => !existingShipIds.has(id));
    if (targetShipIds.length === 0) return result;

    const templateMap = await getEffectiveTemplateMapForShips(ships.filter(s => targetShipIds.includes(s.id)));

    const { data: recordsRaw, error: recError } = await supabase
      .from('crew_embarkation_records')
      .select('id, ship_id, crew_member_id, rank_id, rank_grade, embark_date, disembark_date')
      .in('ship_id', targetShipIds)
      .lte('embark_date', end)
      .or(`disembark_date.is.null,disembark_date.gte.${start}`);
    if (recError) { targetShipIds.forEach(id => result.failed.push({ shipId: id, error: recError.message })); return result; }
    const records = (recordsRaw || []) as EmbarkRecord[];

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
    const { data: ranks } = rankIds.length > 0 ? await supabase.from('ranks').select('id, name').in('id', rankIds) : { data: [] as { id: string; name: string }[] };
    const rankNameById = new Map((ranks || []).map(r => [r.id, r.name]));

    const crewMemberIds = [...new Set(records.map(r => r.crew_member_id))];
    const { data: contractsRaw } = crewMemberIds.length > 0
      ? await supabase.from('crew_contracts').select('id, crew_member_id, ship_id, start_date, end_date').in('crew_member_id', crewMemberIds)
      : { data: [] as ContractRow[] };
    const contracts = (contractsRaw || []) as ContractRow[];
    const contractsByCrewMember = new Map<string, ContractRow[]>();
    for (const c of contracts) {
      const arr = contractsByCrewMember.get(c.crew_member_id) || [];
      arr.push(c);
      contractsByCrewMember.set(c.crew_member_id, arr);
    }

    const contractIds = [...new Set(contracts.map(c => c.id))];
    const { data: contractAllowancesRaw } = contractIds.length > 0
      ? await supabase.from('crew_contract_allowances').select('*').in('contract_id', contractIds)
      : { data: [] as (CrewContractAllowanceWithDetails & { allowance_type_id: string; contract_id: string })[] };
    const allowanceTypeIds = [...new Set((contractAllowancesRaw || []).map(a => a.allowance_type_id))];
    const { data: allowanceTypes } = allowanceTypeIds.length > 0
      ? await supabase.from('allowance_types').select('id, name, description').in('id', allowanceTypeIds)
      : { data: [] as { id: string; name: string; description?: string | null }[] };
    const allowanceTypeList: { id: string; name: string; description?: string | null }[] = allowanceTypes || [];
    const allowanceTypeNameById = new Map(allowanceTypeList.map(t => [t.id, t.name] as [string, string]));
    const allowanceTypeDescById = new Map(allowanceTypeList.map(t => [t.id, t.description] as [string, string | null | undefined]));
    const allowanceItemsByContractId = new Map<string, CrewContractAllowanceWithDetails[]>();
    for (const a of contractAllowancesRaw || []) {
      const arr = allowanceItemsByContractId.get(a.contract_id) || [];
      arr.push({ ...a, allowance_type_name: allowanceTypeNameById.get(a.allowance_type_id) || '', allowance_type_description: allowanceTypeDescById.get(a.allowance_type_id) || undefined });
      allowanceItemsByContractId.set(a.contract_id, arr);
    }

    const templateIds = [...new Set(Object.values(templateMap).filter((t): t is SalaryTemplate => !!t).map(t => t.id))];
    const { data: templateItemsRaw } = templateIds.length > 0
      ? await supabase.from('salary_template_items').select('*').in('template_id', templateIds)
      : { data: [] as { template_id: string; component_id: string; rank?: string; rank_grade?: string | null; amount: number }[] };
    const { data: allComponents } = await supabase.from('salary_components').select('*');
    const componentById = new Map((allComponents || []).map(c => [String(c.id), c as { name: string; component_type: 'earning' | 'deduction'; payment_type: 'monthly' | 'deferred'; is_active: boolean; description?: string | null }]));
    const templateItemsByTemplateId = new Map<string, TemplateItemWithComponent[]>();
    for (const item of templateItemsRaw || []) {
      const component = componentById.get(String(item.component_id));
      // 급여 구성항목이 개명/통합되며 예전 항목이 비활성화된 뒤에도 salary_template_items에는
      // 예전 component_id를 참조하는 행이 남아있을 수 있다 — 비활성 항목은 대체된 것이므로
      // 새 항목과 중복 계산되지 않도록 제외한다.
      if (!component || component.is_active === false) continue;
      const arr = templateItemsByTemplateId.get(String(item.template_id)) || [];
      arr.push({ rank: item.rank, rank_grade: item.rank_grade, amount: Number(item.amount), component });
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
          const built = buildShipPayslips({
            shipId, yearMonth, templateCurrency: template?.currency, templateItems,
            records: shipRecords, rankNameById, contractsByCrewMember, allowanceItemsByContractId,
          });

          const { data: period, error: periodError } = await supabase
            .from('crew_payroll_periods')
            .insert({ ship_id: shipId, year_month: yearMonth, currency: template?.currency || 'USD', created_by: createdBy })
            .select()
            .single();
          if (periodError || !period) throw periodError || new Error('회차 생성에 실패했습니다.');

          const { data: insertedPayslips, error: payslipError } = await supabase
            .from('crew_payslips')
            .insert(built.map(b => ({
              period_id: period.id,
              crew_member_id: b.crew_member_id,
              embarkation_record_id: b.embarkation_record_id,
              rank_id: b.rank_id,
              rank_grade: b.rank_grade,
              period_start_date: b.period_start_date,
              period_end_date: b.period_end_date,
              days_served: b.days_served,
              days_in_month: b.days_in_month,
              base_amount: b.base_amount,
              total_allowance: b.total_allowance,
              total_deduction: b.total_deduction,
              total_owner_billed: b.total_owner_billed,
              net_amount: b.net_amount,
              currency: b.currency,
            })))
            .select('id');
          if (payslipError || !insertedPayslips) throw payslipError || new Error('명세서 생성에 실패했습니다.');

          const itemRows = insertedPayslips.flatMap((p, idx) => built[idx].items.map(it => ({ ...it, payslip_id: p.id })));
          if (itemRows.length > 0) {
            const { error: itemError } = await supabase.from('crew_payslip_items').insert(itemRows);
            if (itemError) throw itemError;
          }

          result.succeeded.push({ shipId, periodId: period.id, payslipCount: built.length });
        } catch (e) {
          result.failed.push({ shipId, error: e instanceof Error ? e.message : String(e) });
        }
      }));
    }

    return result;
  },

  // 선박 1척 생성 — generatePayrollForShips([shipId])의 얇은 래퍼. 기존 단일 선박 UI가
  // 그대로 쓸 수 있도록 예외를 던지는 기존 동작을 유지한다.
  async createPayrollPeriod(shipId: string, yearMonth: string, createdBy: string): Promise<CrewPayrollPeriod> {
    const result: GeneratePayrollResult = await this.generatePayrollForShips([shipId], yearMonth, createdBy);
    if (result.succeeded.length > 0) {
      const period = await this.getPayrollPeriodById(result.succeeded[0].periodId);
      if (!period) throw new Error('회차 생성에 실패했습니다.');
      return period;
    }
    if (result.failed.length > 0) throw new Error(result.failed[0].error);
    if (result.skipped[0]?.reason === 'already_exists') throw new Error('이미 그 달 회차가 존재합니다.');
    throw new Error('그 달에 이 선박에 승선 기록이 있는 선원이 없습니다.');
  },

  // draft 회차를 지우고(명세서/항목은 CASCADE로 함께 삭제) 같은 조건으로 다시 생성한다.
  async regeneratePayrollPeriod(periodId: string, createdBy: string): Promise<CrewPayrollPeriod> {
    const period = await this.getPayrollPeriodById(periodId);
    if (!period) throw new Error('회차를 찾을 수 없습니다.');
    if (period.status !== 'draft') throw new Error('임시저장 상태의 회차만 다시 생성할 수 있습니다.');
    const { error } = await supabase.from('crew_payroll_periods').delete().eq('id', periodId);
    if (error) throw error;
    return this.createPayrollPeriod(period.ship_id, period.year_month, createdBy);
  },

  async deletePayrollPeriod(periodId: string): Promise<void> {
    const period = await this.getPayrollPeriodById(periodId);
    if (!period) return;
    if (period.status !== 'draft') throw new Error('임시저장 상태의 회차만 삭제할 수 있습니다.');
    const { error } = await supabase.from('crew_payroll_periods').delete().eq('id', periodId);
    if (error) throw error;
  },

  // 대시보드의 선박 다건 선택 "무효화" 전용 — 상태(draft/pending_approval/confirmed)를
  // 가리지 않고 강제로 삭제한다. 확정 회차가 섞여 있어도 여기까지 왔다는 건 화면에서
  // 이미 사용자에게 경고/확인을 받았다는 뜻이라 별도 상태 체크를 하지 않는다.
  async invalidatePayrollPeriods(periodIds: string[]): Promise<void> {
    if (periodIds.length === 0) return;
    const { error } = await supabase.from('crew_payroll_periods').delete().in('id', periodIds);
    if (error) throw error;
  },

  // 결재 없이 draft 회차를 바로 확정 처리한다 — 지출결의서 상신(submitPayrollForApproval)은
  // 선택적 부가 기능일 뿐, 실사용에서는 청구서 발송 후 이 함수로 월을 마감한다.
  async confirmPayrollPeriod(periodId: string, confirmedBy: string): Promise<void> {
    const period = await this.getPayrollPeriodById(periodId);
    if (!period) throw new Error('회차를 찾을 수 없습니다.');
    if (period.status !== 'draft') throw new Error('임시저장 상태의 회차만 확정할 수 있습니다.');
    const { error } = await supabase
      .from('crew_payroll_periods')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString(), confirmed_by: confirmedBy, updated_at: new Date().toISOString() })
      .eq('id', periodId);
    if (error) throw error;
  },

  async getPayslipsForPeriod(periodId: string): Promise<CrewPayslipWithDetails[]> {
    const { data, error } = await supabase
      .from('crew_payslips')
      .select('*, crew_members!crew_member_id(name, name_english, nationality), ranks:rank_id(name, rank_code)')
      .eq('period_id', periodId)
      .order('created_at');
    if (error) { console.error('Error fetching crew payslips:', error); return []; }
    if (!data || data.length === 0) return [];

    const payslipIds = data.map(p => p.id);
    const { data: items } = await supabase.from('crew_payslip_items').select('*').in('payslip_id', payslipIds).order('display_order');
    const itemsByPayslip = new Map<string, CrewPayslipItem[]>();
    for (const it of (items || [])) {
      const arr = itemsByPayslip.get(it.payslip_id) || [];
      arr.push(it);
      itemsByPayslip.set(it.payslip_id, arr);
    }

    return data.map(p => {
      const crew = p.crew_members as { name?: string; name_english?: string; nationality?: string } | null;
      const rank = p.ranks as { name?: string; rank_code?: string } | null;
      return {
        ...p,
        crew_name: crew ? crewDisplayName(crew) : '',
        nationality: crew?.nationality,
        rank_name: rank?.name || '',
        rank_code: rank?.rank_code || '',
        items: itemsByPayslip.get(p.id) || [],
      } as CrewPayslipWithDetails;
    });
  },

  async getPayslipById(id: string): Promise<(CrewPayslipWithDetails & { ship_name: string }) | null> {
    const { data, error } = await supabase
      .from('crew_payslips')
      .select('*, crew_members!crew_member_id(name, name_english, nationality), ranks:rank_id(name, rank_code), crew_payroll_periods!period_id(year_month, status, ships!ship_id(name))')
      .eq('id', id)
      .single();
    if (error || !data) { console.error('Error fetching crew payslip:', error); return null; }

    const { data: items } = await supabase.from('crew_payslip_items').select('*').eq('payslip_id', id).order('display_order');

    const crew = data.crew_members as { name?: string; name_english?: string; nationality?: string } | null;
    const rank = data.ranks as { name?: string; rank_code?: string } | null;
    const period = data.crew_payroll_periods as { year_month?: string; status?: string; ships?: { name?: string } } | null;

    return {
      ...data,
      crew_name: crew ? crewDisplayName(crew) : '',
      nationality: crew?.nationality,
      rank_name: rank?.name || '',
      rank_code: rank?.rank_code || '',
      items: items || [],
      period_year_month: period?.year_month,
      period_status: period?.status as CrewPayslipWithDetails['period_status'],
      ship_name: period?.ships?.name || '',
    } as CrewPayslipWithDetails & { ship_name: string };
  },

  // 명세서 항목 하나를 수동으로 조정(draft 상태에서만) — 조정 후 그 명세서의 합계도 다시 계산한다.
  async updatePayslipItemAmount(itemId: string, amount: number): Promise<void> {
    const { data: item, error: itemError } = await supabase.from('crew_payslip_items').select('*').eq('id', itemId).single();
    if (itemError || !item) throw itemError || new Error('항목을 찾을 수 없습니다.');

    const { error: updateError } = await supabase.from('crew_payslip_items').update({ amount }).eq('id', itemId);
    if (updateError) throw updateError;

    const { data: allItems, error: allItemsError } = await supabase.from('crew_payslip_items').select('*').eq('payslip_id', item.payslip_id);
    if (allItemsError || !allItems) throw allItemsError || new Error('항목 조회 실패');

    const baseAmount = allItems.filter(i => i.source === 'template' && i.category === 'earning' && i.payment_type !== 'deferred_accrual').reduce((s, i) => s + Number(i.amount), 0);
    const allowanceAmount = allItems.filter(i => i.category === 'earning' && i.source === 'contract' && i.payment_method !== 'owner_billed').reduce((s, i) => s + Number(i.amount), 0);
    const ownerBilledAmount = allItems.filter(i => i.category === 'earning' && i.source === 'contract' && i.payment_method === 'owner_billed').reduce((s, i) => s + Number(i.amount), 0);
    const deductionAmount = allItems.filter(i => i.category === 'deduction').reduce((s, i) => s + Number(i.amount), 0);
    const netAmount = baseAmount + allowanceAmount - deductionAmount;

    const { error: payslipError } = await supabase
      .from('crew_payslips')
      .update({ base_amount: baseAmount, total_allowance: allowanceAmount, total_deduction: deductionAmount, total_owner_billed: ownerBilledAmount, net_amount: netAmount, updated_at: new Date().toISOString() })
      .eq('id', item.payslip_id);
    if (payslipError) throw payslipError;
  },

  async getPayrollLedgerForPeriod(periodId: string): Promise<CrewPayrollLedgerData | null> {
    const period = await this.getPayrollPeriodById(periodId);
    if (!period) return null;

    const { data: ship } = await supabase.from('ships').select('name, owner_id, fleet_id').eq('id', period.ship_id).single();
    const [{ data: owner }, { data: fleet }, template, components, ranks] = await Promise.all([
      ship?.owner_id ? supabase.from('companies').select('name').eq('id', ship.owner_id).single() : Promise.resolve({ data: null as { name: string } | null }),
      ship?.fleet_id ? supabase.from('fleets').select('name').eq('id', ship.fleet_id).single() : Promise.resolve({ data: null as { name: string } | null }),
      getEffectiveTemplateForShip(period.ship_id),
      getSalaryComponents(),
      getRanks(),
    ]);
    const templateMatrix = template ? buildSalaryTemplateMatrix(template, components, ranks) : undefined;

    // 급여대장은 선박에 승선한 선원 전원의 급여세목(BW/OT/OA/LP 등 급여 구성항목 +
    // 계약별 수당)을 항목명별 열로 모두 펼쳐 보여준다 — 급여 구성항목을 "기본급" 한 칸으로
    // 뭉치지 않고, 계약 수당과 동일하게 항목별로 나열한다(items는 display_order로 정렬되어
    // 있어 급여 구성항목이 계약 수당보다 항상 앞선 열에 온다).
    const payslips: CrewPayslipWithDetails[] = await this.getPayslipsForPeriod(periodId);
    const allowanceColumns: string[] = [];
    const deductionColumns: string[] = [];
    // 후불성 항목도 당월 발생분(amount)은 다른 항목과 동일하게 열로 보여준다 — 누적
    // 적립액(accrued_to_date)만 급여대장에는 표기하지 않는다(개인 급여명세서에서만 확인).
    for (const p of payslips) {
      for (const item of p.items) {
        if (item.category === 'earning' && !allowanceColumns.includes(item.name)) allowanceColumns.push(item.name);
        if (item.category === 'deduction' && !deductionColumns.includes(item.name)) deductionColumns.push(item.name);
      }
    }

    const rows = payslips.map(p => {
      const allowanceByName: Record<string, number> = {};
      const deductionByName: Record<string, number> = {};
      for (const item of p.items) {
        if (item.category === 'earning') allowanceByName[item.name] = (allowanceByName[item.name] || 0) + item.amount;
        if (item.category === 'deduction') deductionByName[item.name] = (deductionByName[item.name] || 0) + item.amount;
      }
      return {
        crew_member_id: p.crew_member_id,
        crew_name: p.crew_name,
        rank_code: p.rank_code,
        rank_grade: p.rank_grade,
        period_start_date: p.period_start_date,
        period_end_date: p.period_end_date,
        days_served: p.days_served,
        days_in_month: p.days_in_month,
        base_amount: p.base_amount,
        allowance_by_name: allowanceByName,
        gross_amount: p.base_amount + p.total_allowance,
        deduction_by_name: deductionByName,
        total_deduction: p.total_deduction,
        net_amount: p.net_amount,
        owner_billed_amount: p.total_owner_billed,
      };
    });

    return {
      period,
      ship_name: ship?.name || '',
      owner_name: owner?.name,
      fleet_name: fleet?.name,
      template_name: template?.name,
      template_matrix: templateMatrix,
      allowance_columns: allowanceColumns,
      deduction_columns: deductionColumns,
      rows,
    };
  },

  // 직원 급여관리의 submitPayrollExpenseReport와 동일한 패턴 — 급여대장 엑셀을 첨부해
  // 지출결의서로 상신하고, 승인/반려 결과는 approval-document.service.ts의
  // applyReferenceSideEffect(reference_type='crew_payroll_period')가 회차 상태에 반영한다.
  // 실사용에서는 결재 없이 confirmPayrollPeriod로 바로 확정하는 게 주 흐름이고, 이 상신은
  // 내부 결재 기록이 필요한 경우를 위한 부가 기능이다.
  async submitPayrollForApproval(periodId: string, submittedByUserId: string): Promise<void> {
    const period = await this.getPayrollPeriodById(periodId);
    if (!period) throw new Error('회차를 찾을 수 없습니다.');
    if (period.status !== 'draft') throw new Error('임시저장 상태의 회차만 상신할 수 있습니다.');

    const ledger = await this.getPayrollLedgerForPeriod(periodId);
    if (!ledger || ledger.rows.length === 0) throw new Error('명세서가 없습니다.');

    const [{ data: docType, error: docTypeError }, company, members] = await Promise.all([
      supabase.from('approval_document_types').select('id').eq('code', 'expense_report').maybeSingle(),
      getCompanyInfo().catch(() => null),
      orgChartService.getOrgMembers(),
    ]);
    if (docTypeError) throw docTypeError;
    if (!docType) throw new Error('지출결의서 문서유형을 찾을 수 없습니다. 문서유형 관리에서 확인해주세요.');

    const submitter = members.find(m => m.id === submittedByUserId);
    const orgUnitId = submitter?.org_unit_ids?.[0];
    if (!orgUnitId) throw new Error('소속 부서가 없어 결재라인을 구성할 수 없습니다.');

    const totalGross = ledger.rows.reduce((s, r) => s + r.gross_amount, 0);
    const totalDeduction = ledger.rows.reduce((s, r) => s + r.total_deduction, 0);
    const totalNet = ledger.rows.reduce((s, r) => s + r.net_amount, 0);
    const titleParts = [ledger.owner_name, ledger.fleet_name, ledger.ship_name].filter(Boolean).join(' > ');
    const content = [
      `${titleParts} ${period.year_month} 선원 급여 지출결의서`,
      `대상 인원: ${ledger.rows.length}명`,
      `급여 합계: ${totalGross.toLocaleString('ko-KR')} ${period.currency}`,
      `공제 합계: ${totalDeduction.toLocaleString('ko-KR')} ${period.currency}`,
      `실지급액 합계: ${totalNet.toLocaleString('ko-KR')} ${period.currency}`,
      '',
      '상세 내역은 첨부된 급여대장을 참고해주세요.',
    ].join('\n');

    const workbook = buildCrewPayrollLedgerWorkbook(ledger);
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const path = `approval-documents/${Date.now()}_${Math.random().toString(36).substring(7)}.xlsx`;
    const { error: uploadError } = await supabase.storage.from('documents').upload(path, blob);
    if (uploadError) throw uploadError;

    const doc = await approvalDocumentService.createDocument({
      document_type_id: docType.id,
      title: `${titleParts} ${period.year_month} 선원 급여 지출결의서`,
      content,
      form_data: {
        expense_date: period.payment_date || new Date().toISOString().split('T')[0],
        expense_category: '선원 급여',
        purpose: `${titleParts} ${period.year_month} 선원 급여 지급 (${ledger.rows.length}명)`,
        amount: totalGross,
        vendor: `${ledger.ship_name} 선원 급여계좌 일괄이체`,
        notes: content,
      },
      attachments: [{ name: `${ledger.ship_name}_${period.year_month}_급여대장.xlsx`, path, size: blob.size, type: blob.type }],
      org_unit_id: orgUnitId,
      created_by: submittedByUserId,
      reference_type: 'crew_payroll_period',
      reference_id: periodId,
    });

    const { error: updateError } = await supabase
      .from('crew_payroll_periods')
      .update({ status: 'pending_approval', approval_document_id: doc.id, updated_at: new Date().toISOString() })
      .eq('id', periodId);
    if (updateError) throw updateError;
  },
};
