import { supabase } from '@/lib/supabase';
import { orgChartService } from '@/services/org-chart.service';
import { approvalDocumentService } from '@/services/approval-document.service';
import type { DailyCashReport, DailyCashReportSnapshotRow } from '@/types/accounting';

interface RawTxn {
  bank_account_id: string | null;
  card_id: string | null;
  cash_register_id: string | null;
  transaction_date: string;
  transaction_type: 'income' | 'expense';
  amount: number;
}

const sum = (rows: RawTxn[]) => rows.reduce((s, r) => s + Number(r.amount), 0);

// 통장/현금은 실제 현금성 잔액을 이월(개설잔액 + 그 이전 모든 거래)해서 계산한다.
// 카드는 잔액 개념이 없어(자산이 아니라 결제수단) 그날 하루의 사용액만 보여주고
// 누적시키지 않는다 — 총계(현금성자산 합계)에도 카드는 포함하지 않는다.
async function buildSnapshot(date: string): Promise<DailyCashReportSnapshotRow[]> {
  const [{ data: accounts }, { data: cards }, { data: registers }] = await Promise.all([
    supabase.from('accounting_bank_accounts').select('*').eq('is_active', true).order('display_order'),
    supabase.from('accounting_cards').select('*').eq('is_active', true).order('display_order'),
    supabase.from('accounting_cash_registers').select('*').eq('is_active', true).order('display_order'),
  ]);

  const { data: txns } = await supabase
    .from('accounting_cash_transactions')
    .select('bank_account_id, card_id, cash_register_id, transaction_date, transaction_type, amount')
    .lte('transaction_date', date);
  const allTxns = (txns || []) as RawTxn[];

  const rows: DailyCashReportSnapshotRow[] = [];

  for (const a of accounts || []) {
    const related = allTxns.filter(t => t.bank_account_id === a.id);
    const prior = related.filter(t => t.transaction_date < date);
    const today = related.filter(t => t.transaction_date === date);
    const opening = Number(a.opening_balance) + sum(prior.filter(t => t.transaction_type === 'income')) - sum(prior.filter(t => t.transaction_type === 'expense'));
    const income = sum(today.filter(t => t.transaction_type === 'income'));
    const expense = sum(today.filter(t => t.transaction_type === 'expense'));
    rows.push({ kind: 'bank_account', id: a.id, name: `${a.bank_name} ${a.account_name}`, opening_balance: opening, income, expense, closing_balance: opening + income - expense });
  }

  for (const r of registers || []) {
    const related = allTxns.filter(t => t.cash_register_id === r.id);
    const prior = related.filter(t => t.transaction_date < date);
    const today = related.filter(t => t.transaction_date === date);
    const opening = Number(r.opening_balance) + sum(prior.filter(t => t.transaction_type === 'income')) - sum(prior.filter(t => t.transaction_type === 'expense'));
    const income = sum(today.filter(t => t.transaction_type === 'income'));
    const expense = sum(today.filter(t => t.transaction_type === 'expense'));
    rows.push({ kind: 'cash_register', id: r.id, name: r.name, opening_balance: opening, income, expense, closing_balance: opening + income - expense });
  }

  for (const c of cards || []) {
    const today = allTxns.filter(t => t.card_id === c.id && t.transaction_date === date);
    const income = sum(today.filter(t => t.transaction_type === 'income'));
    const expense = sum(today.filter(t => t.transaction_type === 'expense'));
    rows.push({ kind: 'card', id: c.id, name: c.card_name, opening_balance: 0, income, expense, closing_balance: expense - income });
  }

  return rows;
}

export async function getDailyReportByDate(date: string): Promise<DailyCashReport | null> {
  const { data, error } = await supabase.from('accounting_daily_reports').select('*').eq('report_date', date).maybeSingle();
  if (error) { console.error(error); return null; }
  return data;
}

export async function getDailyReportById(id: string): Promise<DailyCashReport | null> {
  const { data, error } = await supabase.from('accounting_daily_reports').select('*').eq('id', id).maybeSingle();
  if (error) { console.error(error); return null; }
  return data;
}

export async function getOrCreateDraftReport(date: string, userId: string): Promise<DailyCashReport> {
  const existing = await getDailyReportByDate(date);
  if (existing) return existing;
  const { data, error } = await supabase
    .from('accounting_daily_reports')
    .insert({ report_date: date, status: 'draft', created_by: userId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// 작성중(draft) 상태의 리포트만 재계산할 수 있다 — 상신/확정된 날짜는 스냅샷이 그대로 고정된다.
export async function regenerateDraftReport(date: string, userId: string): Promise<DailyCashReport> {
  const report = await getOrCreateDraftReport(date, userId);
  if (report.status !== 'draft') throw new Error('작성중 상태의 자금일보만 다시 계산할 수 있습니다.');
  const snapshot = await buildSnapshot(date);
  const { data, error } = await supabase
    .from('accounting_daily_reports')
    .update({ snapshot, updated_at: new Date().toISOString() })
    .eq('id', report.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// 해당 날짜에 상신/확정된 자금일보가 있으면 금전출납 거래를 잠근다 — 급여 지출결의서의
// "draft 상태의 회차만 수정 가능" 가드와 동일한 원칙.
export async function assertDateEditable(date: string): Promise<void> {
  const report = await getDailyReportByDate(date);
  if (report && report.status !== 'draft') {
    throw new Error('이 날짜는 이미 자금일보가 상신/확정되어 거래를 수정할 수 없습니다.');
  }
}

export async function submitDailyReportForApproval(date: string, userId: string): Promise<void> {
  const report = await regenerateDraftReport(date, userId);

  const documentTypes = await approvalDocumentService.getDocumentTypes();
  const docType = documentTypes.find(t => t.code === 'DAILY_CASH_REPORT');
  if (!docType) throw new Error('자금일보 문서유형이 등록되어 있지 않습니다.');

  const members = await orgChartService.getOrgMembers();
  const me = members.find(m => m.id === userId);
  const orgUnitId = me?.org_unit_ids[0];
  if (!orgUnitId) throw new Error('소속 부서가 조직도에 등록되어 있지 않습니다. 관리자에게 문의하세요.');

  const snapshot = report.snapshot || [];
  const cashRows = snapshot.filter(r => r.kind !== 'card');
  const totalOpening = cashRows.reduce((s, r) => s + r.opening_balance, 0);
  const totalIncome = cashRows.reduce((s, r) => s + r.income, 0);
  const totalExpense = cashRows.reduce((s, r) => s + r.expense, 0);
  const totalClosing = cashRows.reduce((s, r) => s + r.closing_balance, 0);
  const content = [
    `기준일: ${date}`,
    `전일 잔액 합계: ${totalOpening.toLocaleString()}`,
    `금일 입금 합계: ${totalIncome.toLocaleString()}`,
    `금일 출금 합계: ${totalExpense.toLocaleString()}`,
    `금일 잔액 합계: ${totalClosing.toLocaleString()}`,
  ].join('\n');

  const doc = await approvalDocumentService.createDocument({
    document_type_id: docType.id,
    title: `${date} 자금일보`,
    content,
    org_unit_id: orgUnitId,
    created_by: userId,
    reference_type: 'daily_cash_report',
    reference_id: report.id,
  });

  const { error } = await supabase
    .from('accounting_daily_reports')
    .update({ status: 'pending_approval', approval_document_id: doc.id, updated_at: new Date().toISOString() })
    .eq('id', report.id);
  if (error) throw error;
}
