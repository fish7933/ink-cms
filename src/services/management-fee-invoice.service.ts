import { supabase } from '@/lib/supabase';
import { sickPayService } from '@/services/sick-pay.service';

function monthRange(yearMonth: string): { start: string; end: string } {
  const [y, m] = yearMonth.split('-').map(Number);
  const end = new Date(y, m, 0).getDate();
  return { start: `${yearMonth}-01`, end: `${yearMonth}-${String(end).padStart(2, '0')}` };
}

export interface ManagementFeeInvoiceSettings {
  id: string;
  owner_id: string;
  year_month: string;
  doc_number: string;
  exchange_rate: number;
  usd_bank_account_id: string | null;
  krw_bank_account_id: string | null;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface ManagementFeeInvoiceShipData {
  ship_id: string;
  ship_name: string;
  period_id: string | null; // null = 이 달 관리비 계산이 아직 안 된 선박
  crew_count: number;
  payroll_gross_minus_obp: number;
  sick_pay_total: number;
  reemployment_allowance_total: number;
  fee_item_totals: Record<string, number>; // 청구항목명 -> USD 청구 금액 (monthly/one_time, 상한 반영됨)
  actual_cost_totals: Record<string, number>; // 청구항목명 -> USD 청구 금액 (실비 건별 기록 합계)
  usd_total: number;
  krw_total: number;
}

export interface ManagementFeeInvoiceData {
  owner_id: string;
  owner_name: string;
  year_month: string;
  ships: ManagementFeeInvoiceShipData[];
  ships_missing_calc: { ship_id: string; ship_name: string }[]; // 관리비 계산이 아직 없는 선박
  grand_total_usd: number;
  grand_total_krw: number;
}

export const managementFeeInvoiceService = {
  async getInvoiceSettings(ownerId: string, yearMonth: string): Promise<ManagementFeeInvoiceSettings | null> {
    const { data, error } = await supabase
      .from('management_fee_invoices')
      .select('*')
      .eq('owner_id', ownerId)
      .eq('year_month', yearMonth)
      .maybeSingle();
    if (error) { console.error('Error fetching management fee invoice settings:', error); return null; }
    return data;
  },

  async saveInvoiceSettings(input: {
    owner_id: string;
    year_month: string;
    doc_number: string;
    exchange_rate: number;
    usd_bank_account_id: string | null;
    krw_bank_account_id: string | null;
    created_by?: string;
  }): Promise<ManagementFeeInvoiceSettings | null> {
    const { data, error } = await supabase
      .from('management_fee_invoices')
      .upsert([input], { onConflict: 'owner_id,year_month' })
      .select()
      .single();
    if (error) { console.error('Error saving management fee invoice settings:', error); return null; }
    return data;
  },

  // 선주 소속 전 선박에 걸쳐, 그 달 관리비(대리점비 등)+실비 기록+급여(총급여-OBP)+상병수당+
  // 재고용수당을 모아 청구서 조립에 필요한 형태로 반환한다. 관리비 계산이 아직 안 된 선박은
  // ships_missing_calc로 따로 분리한다(관리비 계산 화면에서 먼저 계산해야 함).
  async getInvoiceData(ownerId: string, yearMonth: string, exchangeRate: number): Promise<ManagementFeeInvoiceData | null> {
    const { data: owner } = await supabase.from('companies').select('name').eq('id', ownerId).single();
    if (!owner) return null;

    const { data: shipsRaw } = await supabase.from('ships').select('id, name').eq('owner_id', ownerId).order('name');
    const ships = (shipsRaw || []).map(s => ({ id: String(s.id), name: s.name as string }));
    if (ships.length === 0) return { owner_id: ownerId, owner_name: owner.name, year_month: yearMonth, ships: [], ships_missing_calc: [], grand_total_usd: 0, grand_total_krw: 0 };

    const shipIds = ships.map(s => s.id);

    const { data: periodsRaw } = await supabase
      .from('management_fee_periods')
      .select('id, ship_id')
      .eq('year_month', yearMonth)
      .in('ship_id', shipIds);
    const periodByShip = new Map((periodsRaw || []).map(p => [String(p.ship_id), String(p.id)]));

    const periodIds = [...periodByShip.values()];
    const [{ data: linesRaw }, { data: capsRaw }, { data: actualCostRaw }, { data: feeItemsRaw }] = await Promise.all([
      periodIds.length > 0 ? supabase.from('management_fee_lines').select('period_id, fee_item_id, amount, currency').in('period_id', periodIds) : Promise.resolve({ data: [] as { period_id: string; fee_item_id: string; amount: number | null; currency: string }[] }),
      periodIds.length > 0 ? supabase.from('management_fee_ship_item_caps').select('period_id, fee_item_id, billed_total').in('period_id', periodIds) : Promise.resolve({ data: [] as { period_id: string; fee_item_id: string; billed_total: number }[] }),
      periodIds.length > 0 ? supabase.from('management_fee_actual_cost_entries').select('period_id, fee_item_id, amount_usd').in('period_id', periodIds) : Promise.resolve({ data: [] as { period_id: string; fee_item_id: string; amount_usd: number }[] }),
      supabase.from('management_fee_items').select('id, name'),
    ]);
    const feeItemNameById = new Map((feeItemsRaw || []).map(f => [String(f.id), f.name as string]));

    // 상한이 걸린 항목은 caps.billed_total을 쓰고, 그 외 항목은 lines.amount 합계를 쓴다
    const cappedKeys = new Set((capsRaw || []).map(c => `${c.period_id}::${c.fee_item_id}`));
    const feeTotalsByPeriod = new Map<string, Record<string, number>>();
    for (const c of capsRaw || []) {
      const name = feeItemNameById.get(String(c.fee_item_id)) || 'Unknown';
      const rec = feeTotalsByPeriod.get(c.period_id) || {};
      rec[name] = (rec[name] || 0) + Number(c.billed_total);
      feeTotalsByPeriod.set(c.period_id, rec);
    }
    for (const l of linesRaw || []) {
      if (l.amount == null) continue;
      if (cappedKeys.has(`${l.period_id}::${l.fee_item_id}`)) continue;
      const name = feeItemNameById.get(String(l.fee_item_id)) || 'Unknown';
      const rec = feeTotalsByPeriod.get(l.period_id) || {};
      rec[name] = (rec[name] || 0) + Number(l.amount);
      feeTotalsByPeriod.set(l.period_id, rec);
    }

    const actualCostTotalsByPeriod = new Map<string, Record<string, number>>();
    for (const e of actualCostRaw || []) {
      const name = feeItemNameById.get(String(e.fee_item_id)) || 'Unknown';
      const rec = actualCostTotalsByPeriod.get(e.period_id) || {};
      rec[name] = (rec[name] || 0) + Number(e.amount_usd);
      actualCostTotalsByPeriod.set(e.period_id, rec);
    }

    // 급여(총급여-OBP)/재고용수당은 crew_payslip_items에서, 상병수당은 sickPayService에서 집계
    const { data: periods } = await supabase.from('crew_payroll_periods').select('id, ship_id').eq('year_month', yearMonth).in('ship_id', shipIds);
    const payrollPeriodByShip = new Map((periods || []).map(p => [String(p.ship_id), String(p.id)]));
    const payrollPeriodIds = [...payrollPeriodByShip.values()];

    const { data: payslipsRaw } = payrollPeriodIds.length > 0
      ? await supabase.from('crew_payslips').select('id, period_id, crew_member_id, base_amount, total_allowance').in('period_id', payrollPeriodIds)
      : { data: [] as { id: string; period_id: string; crew_member_id: string; base_amount: number; total_allowance: number }[] };
    const payslipIds = (payslipsRaw || []).map(p => p.id);
    const { data: itemsRaw } = payslipIds.length > 0
      ? await supabase.from('crew_payslip_items').select('payslip_id, name, category, amount').in('payslip_id', payslipIds).in('name', ['OBP', '재고용수당'])
      : { data: [] as { payslip_id: string; name: string; category: string; amount: number }[] };
    const obpByPayslip = new Map<string, number>();
    const reemploymentByPayslip = new Map<string, number>();
    for (const it of itemsRaw || []) {
      if (it.name === 'OBP' && it.category === 'deduction') obpByPayslip.set(it.payslip_id, (obpByPayslip.get(it.payslip_id) || 0) + Number(it.amount));
      if (it.name === '재고용수당') reemploymentByPayslip.set(it.payslip_id, (reemploymentByPayslip.get(it.payslip_id) || 0) + Number(it.amount));
    }

    const payrollByShip = new Map<string, { gross: number; reemployment: number; crewCount: number }>();
    for (const [shipId, periodId] of payrollPeriodByShip) {
      const shipPayslips = (payslipsRaw || []).filter(p => p.period_id === periodId);
      let gross = 0;
      let reemployment = 0;
      for (const p of shipPayslips) {
        gross += Number(p.base_amount) + Number(p.total_allowance) - (obpByPayslip.get(p.id) || 0);
        reemployment += reemploymentByPayslip.get(p.id) || 0;
      }
      payrollByShip.set(shipId, { gross, reemployment, crewCount: shipPayslips.length });
    }

    // 상병수당 — 선박별로 그 달 상병 케이스를 조회해 합산 (USD 아닌 경우도 있을 수 있으나
    // sick pay 레코드는 currency 필드가 있고 대부분 USD로 운영되므로 여기서는 USD로 취급)
    const sickPayByShip = new Map<string, number>();
    await Promise.all(shipIds.map(async shipId => {
      const rows = await sickPayService.getSickPayForShipMonth(shipId, yearMonth);
      sickPayByShip.set(shipId, rows.reduce((s, r) => s + r.this_month_amount, 0));
    }));

    const resultShips: ManagementFeeInvoiceShipData[] = [];
    const missingCalc: { ship_id: string; ship_name: string }[] = [];

    for (const ship of ships) {
      const periodId = periodByShip.get(ship.id) || null;
      const payroll = payrollByShip.get(ship.id) || { gross: 0, reemployment: 0, crewCount: 0 };
      const sickPay = sickPayByShip.get(ship.id) || 0;
      const feeTotals = periodId ? (feeTotalsByPeriod.get(periodId) || {}) : {};
      const actualCostTotals = periodId ? (actualCostTotalsByPeriod.get(periodId) || {}) : {};

      const feeSum = Object.values(feeTotals).reduce((s, v) => s + v, 0);
      const actualCostSum = Object.values(actualCostTotals).reduce((s, v) => s + v, 0);
      const usdTotal = payroll.gross + sickPay + payroll.reemployment + feeSum + actualCostSum;

      if (!periodId) missingCalc.push({ ship_id: ship.id, ship_name: ship.name });

      resultShips.push({
        ship_id: ship.id,
        ship_name: ship.name,
        period_id: periodId,
        crew_count: payroll.crewCount,
        payroll_gross_minus_obp: payroll.gross,
        sick_pay_total: sickPay,
        reemployment_allowance_total: payroll.reemployment,
        fee_item_totals: feeTotals,
        actual_cost_totals: actualCostTotals,
        usd_total: usdTotal,
        krw_total: Math.round(usdTotal * exchangeRate),
      });
    }

    const grandTotalUsd = resultShips.reduce((s, sh) => s + sh.usd_total, 0);
    const grandTotalKrw = resultShips.reduce((s, sh) => s + sh.krw_total, 0);

    return {
      owner_id: ownerId,
      owner_name: owner.name,
      year_month: yearMonth,
      ships: resultShips,
      ships_missing_calc: missingCalc,
      grand_total_usd: grandTotalUsd,
      grand_total_krw: grandTotalKrw,
    };
  },
};
