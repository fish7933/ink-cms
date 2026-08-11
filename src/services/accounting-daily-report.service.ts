import { supabase } from '@/lib/supabase';
import { orgChartService } from '@/services/org-chart.service';
import { approvalDocumentService } from '@/services/approval-document.service';
import type { DailyCashReport, DailyCashReportSnapshotSection, DailyCashReportTransactionRow } from '@/types/accounting';

interface RawTxn {
  bank_account_id: string | null;
  cash_register_id: string | null;
  transaction_date: string;
  transaction_type: 'income' | 'expense';
  amount: number;
  counterparty: string | null;
  description: string | null;
  created_at: string;
}

// 실제 매일 결재로 올라가는 자금일보(엑셀 붙여넣기) 양식을 그대로 따른다 — 계좌별로
// "전일이월" 한 줄 + 그날 거래를 시간순으로 늘어놓으며 매 거래마다 누적잔액을 보여주고
// 마지막에 합계를 낸다. 카드는 이 회사 실무에서 잔액이 도는 자산이 아니라 결제수단일
// 뿐이라 다루지 않는다(체크카드처럼 실제 잔액이 도는 카드는 통장으로 등록해서 씀).
function buildSection(
  kind: 'bank_account' | 'cash_register',
  id: string,
  name: string,
  currency: string,
  openingBalance: number,
  relatedTxns: RawTxn[],
  date: string
): DailyCashReportSnapshotSection {
  const prior = relatedTxns.filter(t => t.transaction_date < date);
  const priorIncome = prior.filter(t => t.transaction_type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const priorExpense = prior.filter(t => t.transaction_type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
  const opening = openingBalance + priorIncome - priorExpense;

  const today = relatedTxns
    .filter(t => t.transaction_date === date)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  let running = opening;
  const transactions: DailyCashReportTransactionRow[] = today.map(t => {
    const income = t.transaction_type === 'income' ? Number(t.amount) : 0;
    const expense = t.transaction_type === 'expense' ? Number(t.amount) : 0;
    running += income - expense;
    return { date: t.transaction_date, income, expense, balance: running, counterparty: t.counterparty || '', description: t.description || '' };
  });

  const totalIncome = transactions.reduce((s, t) => s + t.income, 0);
  const totalExpense = transactions.reduce((s, t) => s + t.expense, 0);

  return { kind, id, name, currency, opening_balance: opening, transactions, total_income: totalIncome, total_expense: totalExpense, closing_balance: opening + totalIncome - totalExpense };
}

async function buildSnapshot(date: string): Promise<DailyCashReportSnapshotSection[]> {
  const [{ data: accounts }, { data: registers }] = await Promise.all([
    supabase.from('accounting_bank_accounts').select('*').eq('is_active', true).order('display_order'),
    supabase.from('accounting_cash_registers').select('*').eq('is_active', true).order('display_order'),
  ]);

  const { data: txns } = await supabase
    .from('accounting_cash_transactions')
    .select('bank_account_id, cash_register_id, transaction_date, transaction_type, amount, counterparty, description, created_at')
    .lte('transaction_date', date);
  const allTxns = (txns || []) as RawTxn[];

  const sections: DailyCashReportSnapshotSection[] = [];
  for (const a of accounts || []) {
    sections.push(buildSection('bank_account', a.id, a.account_name, a.currency, Number(a.opening_balance), allTxns.filter(t => t.bank_account_id === a.id), date));
  }
  for (const r of registers || []) {
    // 시재금(현금)은 통화 구분 없이 원화(KRW)만 다룬다.
    sections.push(buildSection('cash_register', r.id, r.name, 'KRW', Number(r.opening_balance), allTxns.filter(t => t.cash_register_id === r.id), date));
  }
  return sections;
}

// 자금일보 커버 페이지(달력 + 목록)용 — 무거운 snapshot은 빼고 날짜별 결재 현황만 가져온다.
export async function getDailyReports(): Promise<DailyCashReport[]> {
  const { data, error } = await supabase
    .from('accounting_daily_reports')
    .select('id, report_date, status, approval_document_id, confirmed_at, confirmed_by, last_cancelled_at, last_cancelled_by, last_cancel_reason, created_by, created_at, updated_at')
    .order('report_date', { ascending: false });
  if (error) throw error;
  return (data || []).map(r => ({ ...r, snapshot: null }));
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

// 관리자가 이미 확정된 자금일보를 결재 절차 없이 즉시 취소하고 작성중 상태로 되돌린다 —
// 확정 당시 결재문서(approval_documents)는 지나간 기록으로 그대로 남겨두고 건드리지 않는다.
// 다시 상신하면 prepareDailyReportDraft가 이 문서가 draft 상태가 아님을 확인하고 새 초안을
// 만들므로, 이전 확정 이력과 이번 상신이 섞이지 않는다.
export async function forceCancelConfirmedReport(input: { reportId: string; reason: string; performedBy: string }): Promise<void> {
  const { data: report, error: fetchError } = await supabase
    .from('accounting_daily_reports')
    .select('status')
    .eq('id', input.reportId)
    .single();
  if (fetchError) throw fetchError;
  if (report.status !== 'confirmed') throw new Error('확정된 자금일보만 취소할 수 있습니다.');

  const { error } = await supabase
    .from('accounting_daily_reports')
    .update({
      status: 'draft',
      confirmed_at: null,
      confirmed_by: null,
      last_cancelled_at: new Date().toISOString(),
      last_cancelled_by: input.performedBy,
      last_cancel_reason: input.reason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.reportId);
  if (error) throw error;
}

// 바로 결재를 넣지 않고, 기안문 작성 페이지에서 최종 검토 후 상신하도록 임시저장 초안만
// 만들어 그 초안 id를 돌려준다 — 실제 상신(및 리포트 잠금)은 그 페이지에서 정식 제출할 때
// approval-document.service.ts의 createDocument가 처리한다(daily_cash_report 케이스 참고).
export async function prepareDailyReportDraft(date: string, userId: string): Promise<{ draftId: string }> {
  const report = await regenerateDraftReport(date, userId);

  const documentTypes = await approvalDocumentService.getDocumentTypes();
  const docType = documentTypes.find(t => t.code === 'DAILY_CASH_REPORT');
  if (!docType) throw new Error('자금일보 문서유형이 등록되어 있지 않습니다.');

  const members = await orgChartService.getOrgMembers();
  const me = members.find(m => m.id === userId);
  const orgUnitId = me?.org_unit_ids[0];
  if (!orgUnitId) throw new Error('소속 부서가 조직도에 등록되어 있지 않습니다. 관리자에게 문의하세요.');

  const sections = report.snapshot || [];
  const lines = [`기준일: ${date}`, ...sections.map(s => `${s.name}: ${s.closing_balance.toLocaleString()} ${s.currency}`)];
  // 통화가 다르면 그냥 더하는 게 의미가 없으므로 통화별로 따로 합산한다.
  const totalsByCurrency = new Map<string, number>();
  for (const s of sections) totalsByCurrency.set(s.currency, (totalsByCurrency.get(s.currency) || 0) + s.closing_balance);
  for (const [currency, total] of totalsByCurrency) lines.push(`금일 잔액 합계(${currency}): ${total.toLocaleString()}`);
  const content = lines.join('\n');

  // 이미 만들어둔 초안이 작성중 상태 그대로 남아있으면 새로 만들지 않고 그 초안을 최신 표로 갱신한다.
  let existingDraftId: string | undefined;
  if (report.approval_document_id) {
    const [existingDoc] = await approvalDocumentService.getDocumentDetails([report.approval_document_id]);
    if (existingDoc && existingDoc.status === 'draft') existingDraftId = existingDoc.id;
  }

  const draft = await approvalDocumentService.saveDraft({
    draftId: existingDraftId,
    document_type_id: docType.id,
    title: `${date} 자금일보`,
    content,
    org_unit_id: orgUnitId,
    created_by: userId,
    reference_type: 'daily_cash_report',
    reference_id: report.id,
  });

  if (report.approval_document_id !== draft.id) {
    const { error } = await supabase
      .from('accounting_daily_reports')
      .update({ approval_document_id: draft.id, updated_at: new Date().toISOString() })
      .eq('id', report.id);
    if (error) throw error;
  }

  return { draftId: draft.id };
}
