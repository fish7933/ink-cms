import { supabase } from '@/lib/supabase';
import { getEffectiveTemplateForShip } from '@/lib/salary-store';
import { allowanceService } from '@/services/allowance.service';
import { approvalDocumentService } from '@/services/approval-document.service';
import { orgChartService } from '@/services/org-chart.service';
import { getCompanyInfo } from '@/services/company-info.service';
import { buildCrewPayrollLedgerWorkbook } from '@/utils/crew-payroll-export';
import * as XLSX from 'xlsx-js-style';
import type {
  CrewPayrollPeriod,
  CrewPayrollPeriodSummary,
  CrewPayslip,
  CrewPayslipItem,
  CrewPayslipWithDetails,
  CrewPayrollLedgerData,
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

interface GeneratedItem {
  source: 'template' | 'contract';
  category: 'earning' | 'deduction';
  name: string;
  payment_method: 'ship_direct' | 'owner_billed' | null;
  standard_amount: number;
  amount: number;
  display_order: number;
}

// 승선/하선일 기준 일할계산 비율을 적용해, 선박 급여 템플릿(직급+등급 기준)과 그 시점에
// 유효했던 선원 계약의 수당/공제(crew_contract_allowances)를 합쳐 한 선원의 명세서 항목을 만든다.
async function buildPayslipItems(
  shipId: string,
  yearMonth: string,
  record: { crew_member_id: string; rank_id: string | null; rank_grade: string | null; embark_date: string },
  ratio: number,
  template: Awaited<ReturnType<typeof getEffectiveTemplateForShip>>,
  rankNameById: Map<string, string>
): Promise<GeneratedItem[]> {
  const items: GeneratedItem[] = [];

  const rankName = record.rank_id ? rankNameById.get(record.rank_id) : undefined;
  if (template && rankName) {
    const rankItems = template.items.filter(i => i.rank === rankName);
    const gradeSpecific = rankItems.filter(i => (i.rank_grade || null) === (record.rank_grade || null));
    const matched = gradeSpecific.length > 0 ? gradeSpecific : rankItems.filter(i => !i.rank_grade);
    matched.forEach((i, idx) => {
      const standard = Number(i.amount);
      items.push({
        source: 'template',
        category: i.component.component_type === 'deduction' ? 'deduction' : 'earning',
        name: i.component.name,
        payment_method: null,
        standard_amount: standard,
        amount: Math.round(standard * ratio),
        display_order: idx,
      });
    });
  }

  // 그 승선 시점(embark_date)에 유효했던 계약을 찾는다 — 현재 status가 아니라 계약기간으로
  // 판단해야, 이미 하선/계약종료로 status가 바뀐 뒤에 명세서를 생성해도 정확히 찾을 수 있다.
  const { data: contract } = await supabase
    .from('crew_contracts')
    .select('id')
    .eq('crew_member_id', record.crew_member_id)
    .eq('ship_id', shipId)
    .lte('start_date', record.embark_date)
    .gte('end_date', record.embark_date)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (contract) {
    const contractItems = await allowanceService.getContractAllowances(contract.id);
    contractItems.forEach((a, idx) => {
      const standard = Number(a.amount);
      items.push({
        source: 'contract',
        category: a.kind === 'deduction' ? 'deduction' : 'earning',
        name: a.allowance_type_name,
        payment_method: a.kind === 'allowance' ? a.payment_method : null,
        standard_amount: standard,
        amount: Math.round(standard * ratio),
        display_order: 100 + idx,
      });
    });
  }

  return items;
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

  // 그 선박의 그 달 승선 기록(그 달과 겹치는 기간)을 대상으로 명세서를 자동 생성한다.
  // 이미 회차가 있으면 실패(중복 방지) — 다시 만들려면 회차를 지우고 새로 생성해야 한다(draft만 가능).
  async createPayrollPeriod(shipId: string, yearMonth: string, createdBy: string): Promise<CrewPayrollPeriod> {
    const { start, end } = monthRange(yearMonth);
    const totalDays = daysInMonth(yearMonth);

    const template = await getEffectiveTemplateForShip(shipId);

    const { data: records, error: recError } = await supabase
      .from('crew_embarkation_records')
      .select('id, crew_member_id, rank_id, rank_grade, embark_date, disembark_date')
      .eq('ship_id', shipId)
      .lte('embark_date', end)
      .or(`disembark_date.is.null,disembark_date.gte.${start}`);
    if (recError) throw recError;
    if (!records || records.length === 0) throw new Error('그 달에 이 선박에 승선 기록이 있는 선원이 없습니다.');

    const rankIds = [...new Set(records.map(r => r.rank_id).filter((v): v is string => !!v))];
    const { data: ranks } = rankIds.length > 0 ? await supabase.from('ranks').select('id, name').in('id', rankIds) : { data: [] as { id: string; name: string }[] };
    const rankNameById = new Map((ranks || []).map(r => [r.id, r.name]));

    const { data: period, error: periodError } = await supabase
      .from('crew_payroll_periods')
      .insert({ ship_id: shipId, year_month: yearMonth, currency: template?.currency || 'USD', created_by: createdBy })
      .select()
      .single();
    if (periodError || !period) throw periodError || new Error('회차 생성에 실패했습니다.');

    for (const rec of records) {
      const overlapStart = rec.embark_date > start ? rec.embark_date : start;
      const overlapEnd = rec.disembark_date && rec.disembark_date < end ? rec.disembark_date : end;
      const daysServed = Math.max(0, Math.min(daysBetweenInclusive(overlapStart, overlapEnd), totalDays));
      const ratio = totalDays > 0 ? daysServed / totalDays : 0;

      const items = await buildPayslipItems(shipId, yearMonth, rec, ratio, template, rankNameById);

      const baseAmount = items.filter(i => i.source === 'template' && i.category === 'earning').reduce((s, i) => s + i.amount, 0);
      const allowanceAmount = items.filter(i => i.category === 'earning' && i.source === 'contract' && i.payment_method !== 'owner_billed').reduce((s, i) => s + i.amount, 0);
      const deductionAmount = items.filter(i => i.category === 'deduction').reduce((s, i) => s + i.amount, 0);
      const netAmount = baseAmount + allowanceAmount - deductionAmount;

      const { data: payslip, error: payslipError } = await supabase
        .from('crew_payslips')
        .insert({
          period_id: period.id,
          crew_member_id: rec.crew_member_id,
          embarkation_record_id: rec.id,
          rank_id: rec.rank_id,
          rank_grade: rec.rank_grade,
          days_served: daysServed,
          days_in_month: totalDays,
          base_amount: baseAmount,
          total_allowance: allowanceAmount,
          total_deduction: deductionAmount,
          net_amount: netAmount,
          currency: template?.currency || 'USD',
        })
        .select()
        .single();
      if (payslipError || !payslip) { console.error('Error creating payslip:', payslipError); continue; }

      if (items.length > 0) {
        await supabase.from('crew_payslip_items').insert(items.map(i => ({ ...i, payslip_id: payslip.id })));
      }
    }

    return period;
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

  async getPayslipsForPeriod(periodId: string): Promise<CrewPayslipWithDetails[]> {
    const { data, error } = await supabase
      .from('crew_payslips')
      .select('*, crew_members!crew_member_id(name, nationality), ranks:rank_id(name, rank_code)')
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
      const crew = p.crew_members as { name?: string; nationality?: string } | null;
      const rank = p.ranks as { name?: string; rank_code?: string } | null;
      return {
        ...p,
        crew_name: crew?.name || '',
        nationality: crew?.nationality,
        rank_name: rank?.name || '',
        rank_code: rank?.rank_code || '',
        items: itemsByPayslip.get(p.id) || [],
      } as CrewPayslipWithDetails;
    });
  },

  // 명세서 항목 하나를 수동으로 조정(draft 상태에서만) — 조정 후 그 명세서의 합계도 다시 계산한다.
  async updatePayslipItemAmount(itemId: string, amount: number): Promise<void> {
    const { data: item, error: itemError } = await supabase.from('crew_payslip_items').select('*').eq('id', itemId).single();
    if (itemError || !item) throw itemError || new Error('항목을 찾을 수 없습니다.');

    const { error: updateError } = await supabase.from('crew_payslip_items').update({ amount }).eq('id', itemId);
    if (updateError) throw updateError;

    const { data: allItems, error: allItemsError } = await supabase.from('crew_payslip_items').select('*').eq('payslip_id', item.payslip_id);
    if (allItemsError || !allItems) throw allItemsError || new Error('항목 조회 실패');

    const baseAmount = allItems.filter(i => i.source === 'template' && i.category === 'earning').reduce((s, i) => s + Number(i.amount), 0);
    const allowanceAmount = allItems.filter(i => i.category === 'earning' && i.source === 'contract' && i.payment_method !== 'owner_billed').reduce((s, i) => s + Number(i.amount), 0);
    const deductionAmount = allItems.filter(i => i.category === 'deduction').reduce((s, i) => s + Number(i.amount), 0);
    const netAmount = baseAmount + allowanceAmount - deductionAmount;

    const { error: payslipError } = await supabase
      .from('crew_payslips')
      .update({ base_amount: baseAmount, total_allowance: allowanceAmount, total_deduction: deductionAmount, net_amount: netAmount, updated_at: new Date().toISOString() })
      .eq('id', item.payslip_id);
    if (payslipError) throw payslipError;
  },

  async getPayrollLedgerForPeriod(periodId: string): Promise<CrewPayrollLedgerData | null> {
    const period = await this.getPayrollPeriodById(periodId);
    if (!period) return null;

    const { data: ship } = await supabase.from('ships').select('name, owner_id, fleet_id').eq('id', period.ship_id).single();
    const [{ data: owner }, { data: fleet }] = await Promise.all([
      ship?.owner_id ? supabase.from('companies').select('name').eq('id', ship.owner_id).single() : Promise.resolve({ data: null as { name: string } | null }),
      ship?.fleet_id ? supabase.from('fleets').select('name').eq('id', ship.fleet_id).single() : Promise.resolve({ data: null as { name: string } | null }),
    ]);

    const payslips: CrewPayslipWithDetails[] = await this.getPayslipsForPeriod(periodId);
    const allowanceColumns: string[] = [];
    const deductionColumns: string[] = [];
    for (const p of payslips) {
      for (const item of p.items) {
        if (item.category === 'earning' && item.source === 'contract' && !allowanceColumns.includes(item.name)) allowanceColumns.push(item.name);
        if (item.category === 'deduction' && !deductionColumns.includes(item.name)) deductionColumns.push(item.name);
      }
    }

    const rows = payslips.map(p => {
      const allowanceByName: Record<string, number> = {};
      const deductionByName: Record<string, number> = {};
      for (const item of p.items) {
        if (item.category === 'earning' && item.source === 'contract') allowanceByName[item.name] = (allowanceByName[item.name] || 0) + item.amount;
        if (item.category === 'deduction') deductionByName[item.name] = (deductionByName[item.name] || 0) + item.amount;
      }
      return {
        crew_member_id: p.crew_member_id,
        crew_name: p.crew_name,
        rank_code: p.rank_code,
        rank_grade: p.rank_grade,
        days_served: p.days_served,
        days_in_month: p.days_in_month,
        base_amount: p.base_amount,
        allowance_by_name: allowanceByName,
        gross_amount: p.base_amount + p.total_allowance,
        deduction_by_name: deductionByName,
        total_deduction: p.total_deduction,
        net_amount: p.net_amount,
      };
    });

    return {
      period,
      ship_name: ship?.name || '',
      owner_name: owner?.name,
      fleet_name: fleet?.name,
      allowance_columns: allowanceColumns,
      deduction_columns: deductionColumns,
      rows,
    };
  },

  // 직원 급여관리의 submitPayrollExpenseReport와 동일한 패턴 — 급여명세표 엑셀을 첨부해
  // 지출결의서로 상신하고, 승인/반려 결과는 approval-document.service.ts의
  // applyReferenceSideEffect(reference_type='crew_payroll_period')가 회차 상태에 반영한다.
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
      '상세 내역은 첨부된 급여명세표를 참고해주세요.',
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
      attachments: [{ name: `${ledger.ship_name}_${period.year_month}_급여명세표.xlsx`, path, size: blob.size, type: blob.type }],
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
