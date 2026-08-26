import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/store';
import { sickPayService } from '@/services/sick-pay.service';
import { exchangeRateService } from '@/services/exchange-rate.service';

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
  exchange_rate: number; // 발행 시점에 실제 적용된 KRW 환율 스냅샷 (수기 입력 아님)
  usd_bank_account_id: string | null;
  krw_bank_account_id: string | null;
  status: 'draft' | 'issued';
  issued_at?: string | null;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface ManagementFeeInvoiceListRow extends ManagementFeeInvoiceSettings {
  owner_name: string;
}

export interface ManagementFeeInvoiceShipData {
  ship_id: string;
  ship_name: string;
  period_id: string | null; // null = 이 달 관리비 계산이 아직 안 된 선박
  crew_count: number;
  payroll_gross_minus_obp: number;
  sick_pay_total: number;
  reemployment_allowance_total: number;
  fee_item_totals: Record<string, number>; // 청구항목명 -> USD 청구 금액 (monthly/one_time, 상한 반영됨, 비USD는 환산됨)
  actual_cost_totals: Record<string, number>; // 청구항목명 -> USD 청구 금액 (실비 건별 기록 합계)
  usd_total: number;
  krw_total: number;
  warnings: string[]; // 환율 미등록으로 환산하지 못한 항목 등
}

export interface ManagementFeeInvoiceData {
  owner_id: string;
  owner_name: string;
  year_month: string;
  krw_rate_to_usd: number | null; // 이 달 적용된 KRW 환율(없으면 null — 청구서 작성 차단 대상)
  ships: ManagementFeeInvoiceShipData[];
  ships_missing_calc: { ship_id: string; ship_name: string }[]; // 관리비 계산이 아직 없는 선박
  grand_total_usd: number;
  grand_total_krw: number;
}

async function getNextDocNumber(yearMonth: string): Promise<string> {
  const { count } = await supabase
    .from('management_fee_invoices')
    .select('id', { count: 'exact', head: true })
    .eq('year_month', yearMonth);
  const seq = (count || 0) + 1;
  return `INK-${yearMonth.replace('-', '')}-${String(seq).padStart(3, '0')}`;
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

  // 그 선주+월 조합의 청구서 임시저장 행을 가져오거나, 없으면 문서번호를 자동 채번해 새로 만든다.
  // 문서번호는 여기서 딱 한 번만 발급되고 이후 절대 재채번하지 않는다.
  async getOrCreateDraftInvoice(ownerId: string, yearMonth: string): Promise<ManagementFeeInvoiceSettings | null> {
    const existing = await this.getInvoiceSettings(ownerId, yearMonth);
    if (existing) return existing;

    const currentUser = await getCurrentUser();
    const docNumber = await getNextDocNumber(yearMonth);
    const { data, error } = await supabase
      .from('management_fee_invoices')
      .insert([{
        owner_id: ownerId,
        year_month: yearMonth,
        doc_number: docNumber,
        exchange_rate: 0,
        usd_bank_account_id: null,
        krw_bank_account_id: null,
        status: 'draft',
        created_by: currentUser?.id,
      }])
      .select()
      .single();
    if (error) { console.error('Error creating draft management fee invoice:', error); return null; }
    return data;
  },

  // 임시저장 — 문서번호/상태는 건드리지 않고 계좌 선택 등 편집 가능한 필드만 갱신한다.
  async updateInvoiceSettings(id: string, updates: { usd_bank_account_id?: string | null; krw_bank_account_id?: string | null }): Promise<ManagementFeeInvoiceSettings | null> {
    const { data, error } = await supabase
      .from('management_fee_invoices')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) { console.error('Error updating management fee invoice settings:', error); return null; }
    return data;
  },

  // 엑셀 다운로드에 성공한 뒤 호출 — 그 시점에 실제 적용된 KRW 환율을 스냅샷으로 남기고 발행 처리한다.
  async markIssued(id: string, appliedKrwRate: number): Promise<void> {
    const { error } = await supabase
      .from('management_fee_invoices')
      .update({ status: 'issued', issued_at: new Date().toISOString(), exchange_rate: appliedKrwRate })
      .eq('id', id);
    if (error) throw error;
  },

  async listInvoices(yearMonth?: string): Promise<ManagementFeeInvoiceListRow[]> {
    let query = supabase.from('management_fee_invoices').select('*, companies!owner_id(name)').order('year_month', { ascending: false }).order('created_at', { ascending: false });
    if (yearMonth) query = query.eq('year_month', yearMonth);
    const { data, error } = await query;
    if (error) { console.error('Error listing management fee invoices:', error); return []; }
    return (data || []).map(row => {
      const owner = row.companies as { name?: string } | null;
      return { ...row, owner_name: owner?.name || '' } as ManagementFeeInvoiceListRow;
    });
  },

  // 선주 소속 전 선박에 걸쳐, 그 달 관리비(대리점비 등)+실비 기록+급여(총급여-OBP)+상병수당+
  // 재고용수당을 모아 청구서 조립에 필요한 형태로 반환한다. 관리비 계산이 아직 안 된 선박은
  // ships_missing_calc로 따로 분리한다(관리비 계산 화면에서 먼저 계산해야 함).
  // 템플릿 항목 통화가 USD가 아닌 경우(예: 미얀마 사회보장기금 MMK) 그 달 환율(없으면 가장 최근
  // 이전 달 환율)로 USD 환산 후 합산한다 — 환율이 전혀 없으면 그 항목은 합계에서 빼고 경고로 남긴다.
  async getInvoiceData(ownerId: string, yearMonth: string): Promise<ManagementFeeInvoiceData | null> {
    const { data: owner } = await supabase.from('companies').select('name').eq('id', ownerId).single();
    if (!owner) return null;

    const savedRates = await exchangeRateService.getExchangeRates(yearMonth);
    const krwRate = savedRates['KRW'] ?? await exchangeRateService.getLatestRate('KRW', yearMonth);

    const { data: shipsRaw } = await supabase.from('ships').select('id, name').eq('owner_id', ownerId).order('name');
    const ships = (shipsRaw || []).map(s => ({ id: String(s.id), name: s.name as string }));
    if (ships.length === 0) {
      return { owner_id: ownerId, owner_name: owner.name, year_month: yearMonth, krw_rate_to_usd: krwRate, ships: [], ships_missing_calc: [], grand_total_usd: 0, grand_total_krw: 0 };
    }

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
      periodIds.length > 0 ? supabase.from('management_fee_ship_item_caps').select('period_id, fee_item_id, currency, billed_total').in('period_id', periodIds) : Promise.resolve({ data: [] as { period_id: string; fee_item_id: string; currency: string; billed_total: number }[] }),
      periodIds.length > 0 ? supabase.from('management_fee_actual_cost_entries').select('period_id, fee_item_id, amount_usd').in('period_id', periodIds) : Promise.resolve({ data: [] as { period_id: string; fee_item_id: string; amount_usd: number }[] }),
      supabase.from('management_fee_items').select('id, name'),
    ]);
    const feeItemNameById = new Map((feeItemsRaw || []).map(f => [String(f.id), f.name as string]));

    // 라인/캡에 등장하는 USD 외 통화를 한 번에 모아 환율을 미리 해결해둔다(루프 안에서 매번 조회하지 않도록)
    const foreignCurrencies = new Set<string>();
    for (const l of linesRaw || []) if (l.currency !== 'USD') foreignCurrencies.add(l.currency);
    for (const c of capsRaw || []) if (c.currency !== 'USD') foreignCurrencies.add(c.currency);
    const rateByCurrency = new Map<string, number | null>();
    await Promise.all([...foreignCurrencies].map(async cur => {
      rateByCurrency.set(cur, savedRates[cur] ?? await exchangeRateService.getLatestRate(cur, yearMonth));
    }));

    const warningsByPeriod = new Map<string, Set<string>>();
    const addWarning = (periodId: string, msg: string) => {
      const set = warningsByPeriod.get(periodId) || new Set<string>();
      set.add(msg);
      warningsByPeriod.set(periodId, set);
    };
    // amount(해당 currency 단위)를 USD로 환산 — USD면 그대로, 아니면 rateByCurrency로 나눔.
    // 환율이 없으면 null을 반환해 호출부에서 합계 제외 + 경고 처리하게 한다.
    const toUsd = (amount: number, currency: string, periodId: string, itemName: string): number | null => {
      if (currency === 'USD') return amount;
      const rate = rateByCurrency.get(currency);
      if (!rate) { addWarning(periodId, `환율 미등록: ${currency} (${itemName})`); return null; }
      return amount / rate;
    };

    // 상한이 걸린 항목은 caps.billed_total을 쓰고, 그 외 항목은 lines.amount 합계를 쓴다
    const cappedKeys = new Set((capsRaw || []).map(c => `${c.period_id}::${c.fee_item_id}`));
    const feeTotalsByPeriod = new Map<string, Record<string, number>>();
    for (const c of capsRaw || []) {
      const name = feeItemNameById.get(String(c.fee_item_id)) || 'Unknown';
      const usdAmount = toUsd(Number(c.billed_total), c.currency, c.period_id, name);
      if (usdAmount == null) continue;
      const rec = feeTotalsByPeriod.get(c.period_id) || {};
      rec[name] = (rec[name] || 0) + usdAmount;
      feeTotalsByPeriod.set(c.period_id, rec);
    }
    for (const l of linesRaw || []) {
      if (l.amount == null) continue;
      if (cappedKeys.has(`${l.period_id}::${l.fee_item_id}`)) continue;
      const name = feeItemNameById.get(String(l.fee_item_id)) || 'Unknown';
      const usdAmount = toUsd(Number(l.amount), l.currency, l.period_id, name);
      if (usdAmount == null) continue;
      const rec = feeTotalsByPeriod.get(l.period_id) || {};
      rec[name] = (rec[name] || 0) + usdAmount;
      feeTotalsByPeriod.set(l.period_id, rec);
    }

    // 실비 기록(management_fee_actual_cost_entries)은 amount_usd가 이미 USD로 직접 입력된
    // 값이라 환산 대상이 아니다.
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
      const warnings = periodId ? [...(warningsByPeriod.get(periodId) || [])] : [];

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
        krw_total: krwRate ? Math.round(usdTotal * krwRate) : 0,
        warnings,
      });
    }

    const grandTotalUsd = resultShips.reduce((s, sh) => s + sh.usd_total, 0);
    const grandTotalKrw = resultShips.reduce((s, sh) => s + sh.krw_total, 0);

    return {
      owner_id: ownerId,
      owner_name: owner.name,
      year_month: yearMonth,
      krw_rate_to_usd: krwRate,
      ships: resultShips,
      ships_missing_calc: missingCalc,
      grand_total_usd: grandTotalUsd,
      grand_total_krw: grandTotalKrw,
    };
  },
};
