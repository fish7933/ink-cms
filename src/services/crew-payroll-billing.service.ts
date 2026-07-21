import { supabase } from '@/lib/supabase';
import { getEffectiveTemplateMapForShips, getSalaryTemplateWithItems, getSalaryComponents } from '@/lib/salary-store';
import { getRanks } from '@/services/rank.service';
import { buildSalaryTemplateMatrix } from '@/lib/salary-template-matrix';
import { crewDisplayName } from '@/lib/utils';
import type {
  CrewPayrollBillingData,
  CrewPayrollBillingGroupLevel,
  CrewPayrollBillingShipSection,
  CrewPayrollLedgerRow,
} from '@/types/crew-payroll';

// 선주/플릿/선박 단위로 여러 선박分 급여명세를 한 번에 모아 청구서를 만든다 — 선박마다
// getPayrollLedgerForPeriod를 반복 호출하지 않고, 대상 기간들을 한 번에 조회해 N+1을 피한다.
export const crewPayrollBillingService = {
  async getBillingClaimData(
    yearMonth: string,
    groupLevel: CrewPayrollBillingGroupLevel,
    groupLabel: string,
    ships: { id: string; name: string; owner_name?: string; fleet_name?: string; owner_id?: string; fleet_id?: string }[]
  ): Promise<CrewPayrollBillingData> {
    const shipIds = ships.map(s => s.id);
    if (shipIds.length === 0) {
      return { year_month: yearMonth, group_level: groupLevel, group_label: groupLabel, ships: [], grand_total_net: 0, grand_total_owner_billed: 0 };
    }

    const templateMap = await getEffectiveTemplateMapForShips(
      ships.map(s => ({ id: s.id, fleet_id: s.fleet_id ?? null, owner_id: s.owner_id ?? null }))
    );

    // 청구서에도 급여대장과 동일하게 선박별 적용 템플릿 전체 내용을 붙인다 — 여러 선박이
    // 같은 템플릿을 공유하는 경우가 많아, 템플릿 id별로 한 번씩만 조회한다.
    const templateIds = [...new Set(Object.values(templateMap).filter((t): t is NonNullable<typeof t> => !!t).map(t => t.id))];
    const [components, ranks, templatesWithItems] = await Promise.all([
      getSalaryComponents(),
      getRanks(),
      Promise.all(templateIds.map(id => getSalaryTemplateWithItems(id))),
    ]);
    const matrixByTemplateId = new Map<string, ReturnType<typeof buildSalaryTemplateMatrix>>();
    templateIds.forEach((id, idx) => {
      const t = templatesWithItems[idx];
      if (t) matrixByTemplateId.set(id, buildSalaryTemplateMatrix(t, components, ranks));
    });

    const { data: periods } = await supabase
      .from('crew_payroll_periods')
      .select('id, ship_id')
      .eq('year_month', yearMonth)
      .in('ship_id', shipIds);
    const periodByShip = new Map((periods || []).map(p => [p.ship_id, p.id]));
    const periodIds = (periods || []).map(p => p.id);
    if (periodIds.length === 0) {
      return { year_month: yearMonth, group_level: groupLevel, group_label: groupLabel, ships: [], grand_total_net: 0, grand_total_owner_billed: 0 };
    }

    const { data: payslips } = await supabase
      .from('crew_payslips')
      .select('*, crew_members!crew_member_id(name, name_english), ranks:rank_id(rank_code)')
      .in('period_id', periodIds)
      .order('created_at');
    const payslipIds = (payslips || []).map(p => p.id);
    const { data: items } = payslipIds.length > 0
      ? await supabase.from('crew_payslip_items').select('*').in('payslip_id', payslipIds).order('display_order')
      : { data: [] as { payslip_id: string; category: string; source: string; name: string; amount: number; payment_type: string }[] };
    const itemsByPayslip = new Map<string, { category: string; source: string; name: string; amount: number; payment_type: string }[]>();
    for (const it of items || []) {
      const arr = itemsByPayslip.get(it.payslip_id) || [];
      arr.push(it);
      itemsByPayslip.set(it.payslip_id, arr);
    }

    const payslipsByPeriod = new Map<string, typeof payslips>();
    for (const p of payslips || []) {
      const arr = payslipsByPeriod.get(p.period_id) || [];
      arr.push(p);
      payslipsByPeriod.set(p.period_id, arr);
    }

    const shipSections: CrewPayrollBillingShipSection[] = [];
    for (const ship of ships) {
      const periodId = periodByShip.get(ship.id);
      if (!periodId) continue;
      const shipPayslips = payslipsByPeriod.get(periodId) || [];
      if (shipPayslips.length === 0) continue;

      const allowanceColumns: string[] = [];
      const deductionColumns: string[] = [];
      const rows: CrewPayrollLedgerRow[] = shipPayslips.map(p => {
        const crew = p.crew_members as { name?: string; name_english?: string } | null;
        const rank = p.ranks as { rank_code?: string } | null;
        const pItems = itemsByPayslip.get(p.id) || [];
        const allowanceByName: Record<string, number> = {};
        const deductionByName: Record<string, number> = {};
        for (const item of pItems) {
          // 하선월 일괄지급(Lump Sum)은 누적 적립액과 같은 값이라 청구서 열에서도 뺀다
          // (net_amount/owner_billed_amount 계산에는 그대로 포함되어 있음).
          if (item.payment_type === 'deferred_payout') continue;
          if (item.category === 'earning') {
            allowanceByName[item.name] = (allowanceByName[item.name] || 0) + item.amount;
            if (!allowanceColumns.includes(item.name)) allowanceColumns.push(item.name);
          }
          if (item.category === 'deduction') {
            deductionByName[item.name] = (deductionByName[item.name] || 0) + item.amount;
            if (!deductionColumns.includes(item.name)) deductionColumns.push(item.name);
          }
        }
        return {
          crew_member_id: p.crew_member_id,
          crew_name: crew ? crewDisplayName(crew) : '',
          rank_code: rank?.rank_code || '',
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

      shipSections.push({
        ship_id: ship.id,
        ship_name: ship.name,
        owner_name: ship.owner_name,
        fleet_name: ship.fleet_name,
        template_name: templateMap[ship.id]?.name,
        template_matrix: templateMap[ship.id] ? matrixByTemplateId.get(templateMap[ship.id]!.id) : undefined,
        period_year_month: yearMonth,
        allowance_columns: allowanceColumns,
        deduction_columns: deductionColumns,
        rows,
        subtotal_net: rows.reduce((s, r) => s + r.net_amount, 0),
        subtotal_owner_billed: rows.reduce((s, r) => s + r.owner_billed_amount, 0),
      });
    }

    return {
      year_month: yearMonth,
      group_level: groupLevel,
      group_label: groupLabel,
      ships: shipSections,
      grand_total_net: shipSections.reduce((s, sec) => s + sec.subtotal_net, 0),
      grand_total_owner_billed: shipSections.reduce((s, sec) => s + sec.subtotal_owner_billed, 0),
    };
  },
};
