import { supabase } from '@/lib/supabase';
import { orgChartService } from '@/services/org-chart.service';
import { approvalDocumentService } from '@/services/approval-document.service';
import type { DailyCashReport, DailyCashReportSnapshotSection, DailyCashReportTransactionRow, CashTransactionAttachment } from '@/types/accounting';

interface RawTxn {
  id: string;
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
    return { id: t.id, date: t.transaction_date, income, expense, balance: running, counterparty: t.counterparty || '', description: t.description || '' };
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

  // PostgREST 기본 조회 상한(1행당 최대 1000건)에 걸리지 않도록 다 받을 때까지 이어붙인다 —
  // 안 그러면 거래가 쌓일수록 일부(특히 정렬 순서상 뒤쪽) 거래가 조용히 누락된다.
  const PAGE_SIZE = 1000;
  const allTxns: RawTxn[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: page, error } = await supabase
      .from('accounting_cash_transactions')
      .select('id, bank_account_id, cash_register_id, transaction_date, transaction_type, amount, counterparty, description, created_at')
      .lte('transaction_date', date)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!page || page.length === 0) break;
    allTxns.push(...(page as RawTxn[]));
    if (page.length < PAGE_SIZE) break;
  }

  const sections: DailyCashReportSnapshotSection[] = [];
  for (const a of accounts || []) {
    sections.push(buildSection('bank_account', a.id, a.account_name, a.currency, Number(a.opening_balance), allTxns.filter(t => t.bank_account_id === a.id), date));
  }
  for (const r of registers || []) {
    sections.push(buildSection('cash_register', r.id, r.name, r.currency || 'KRW', Number(r.opening_balance), allTxns.filter(t => t.cash_register_id === r.id), date));
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
  return (data || []).map(r => ({ ...r, snapshot: null, remarks: null, attachments: [] }));
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

// 아직 지나지 않은 날은 그날의 입출금이 확정되지 않았으므로 자금일보를 만들 수 없다.
// toISOString()은 UTC 기준이라 한국 시간 자정~오전 9시 사이에는 실제 로컬 날짜보다 하루
// 늦게 계산되는 문제가 있었다 — 로컬 달력 날짜를 직접 조합해서 이 어긋남을 없앤다.
function assertNotFutureDate(date: string): void {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (date > today) throw new Error('미래 날짜의 자금일보는 작성할 수 없습니다.');
}

export async function getOrCreateDraftReport(date: string, userId: string): Promise<DailyCashReport> {
  const existing = await getDailyReportByDate(date);
  if (existing) return existing;
  assertNotFutureDate(date);
  const { data, error } = await supabase
    .from('accounting_daily_reports')
    .insert({ report_date: date, status: 'draft', created_by: userId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// 작성중(draft) 상태에서만 비고를 고칠 수 있다 — 상신/확정된 자금일보는 당시 내용 그대로 고정.
export async function updateReportRemarks(reportId: string, remarks: string): Promise<void> {
  const { data: report, error: fetchError } = await supabase.from('accounting_daily_reports').select('status').eq('id', reportId).single();
  if (fetchError) throw fetchError;
  if (report.status !== 'draft') throw new Error('작성중 상태의 자금일보만 비고를 수정할 수 있습니다.');
  const { error } = await supabase
    .from('accounting_daily_reports')
    .update({ remarks: remarks || null, updated_at: new Date().toISOString() })
    .eq('id', reportId);
  if (error) throw error;
}

// 작성중(draft) 상태에서만 자금일보 자체에 직접 붙인 첨부파일을 고칠 수 있다 — 그날 각
// 거래에 달린 증빙서류와는 별개로, 자금일보 전체에 대한 첨부(예: 은행 통장 사본 등)다.
export async function updateReportAttachments(reportId: string, attachments: CashTransactionAttachment[]): Promise<void> {
  const { data: report, error: fetchError } = await supabase.from('accounting_daily_reports').select('status').eq('id', reportId).single();
  if (fetchError) throw fetchError;
  if (report.status !== 'draft') throw new Error('작성중 상태의 자금일보만 첨부파일을 수정할 수 있습니다.');
  const { error } = await supabase
    .from('accounting_daily_reports')
    .update({ attachments, updated_at: new Date().toISOString() })
    .eq('id', reportId);
  if (error) throw error;
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
// "draft 상태의 회차만 수정 가능" 가드와 동일한 원칙. 아직 오지 않은 날짜도 마찬가지로 막는다
// (아직 실제로 일어나지 않은 거래를 미리 입력할 수는 없다).
export async function assertDateEditable(date: string): Promise<void> {
  assertNotFutureDate(date);
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

// 결재상신을 한 번도 하지 않은(작성중 상태) 자금일보를 완전히 삭제한다 — 이력 목록과
// 달력 어디에도 더 이상 나오지 않는다. status가 draft인 자금일보는 딱 두 경우뿐이다:
// (1) 아예 상신을 시작한 적이 없거나, (2) 상신 화면까지만 준비하고 실제로 제출은 안 한
// 경우(prepareDailyReportDraft가 만든 기안 초안이 approval_document_id로 걸려 있음) —
// 실제로 상신됐던 적이 있으면 반려/강제취소 시 approval_document_id가 다시 null로
// 초기화되므로 이 두 경우와 섞이지 않는다. (2)의 경우 딸려 있는 미제출 기안 초안도 같이 정리한다.
export async function deleteDraftDailyReport(reportId: string): Promise<void> {
  const { data: report, error: fetchError } = await supabase
    .from('accounting_daily_reports')
    .select('status, approval_document_id')
    .eq('id', reportId)
    .single();
  if (fetchError) throw fetchError;
  if (report.status !== 'draft') throw new Error('작성중(결재상신 전) 상태의 자금일보만 삭제할 수 있습니다.');

  if (report.approval_document_id) {
    await approvalDocumentService.deleteDraft(report.approval_document_id).catch(() => {});
  }

  const { error } = await supabase.from('accounting_daily_reports').delete().eq('id', reportId);
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

  // 그날 각 거래에 달린 증빙서류 + 자금일보 자체에 직접 붙인 첨부파일을 결재문서 첨부로
  // 한꺼번에 붙인다. 다시 상신 준비를 할 때마다 그날 거래 기준으로 새로 모으므로,
  // 상신 직전까지 영수증을 추가/수정해도 최신 상태로 반영된다.
  const { data: dayTxns } = await supabase
    .from('accounting_cash_transactions')
    .select('attachments')
    .eq('transaction_date', date);
  const txnAttachments = (dayTxns || []).flatMap(t => (t.attachments || []) as CashTransactionAttachment[]);
  const allAttachments = [...(report.attachments || []), ...txnAttachments];
  const attachments = [...new Map(allAttachments.map(a => [a.path, a])).values()];

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
    attachments,
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
