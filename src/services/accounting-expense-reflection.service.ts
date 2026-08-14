import { supabase } from '@/lib/supabase';
import { addCashTransaction, deleteCashTransaction } from '@/services/accounting-cash-transaction.service';
import { getCategories, addCategory } from '@/services/accounting-category.service';
import type { AccountingPaymentMethod, AccountingTransactionType, CashTransactionAttachment } from '@/types/accounting';
import type { LineItemRow, ApprovalDocumentAttachment } from '@/types/approval-document';

export interface ExpenseReflectionItem {
  document_id: string;
  item_index: number;
  document_title: string;
  reference_type: string | null;
  submitted_by_name: string;
  completed_at: string | null;
  expense_date: string | null;
  category: string;
  purpose: string;
  amount: number;
  vendor: string;
  attachments: ApprovalDocumentAttachment[];
  reflected: boolean;
  reflected_transaction_id: string | null;
}

// 지출결의서 항목 하나의 값(문자/숫자만 다룬다 — line_items 컬럼은 select/table 형이 없으므로).
function str(v: LineItemRow[string] | undefined): string {
  return v === null || v === undefined || Array.isArray(v) ? '' : String(v);
}
function num(v: LineItemRow[string] | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function files(v: LineItemRow[string] | undefined): ApprovalDocumentAttachment[] {
  return Array.isArray(v) ? v : [];
}

// 승인된 지출결의서를 전부 가져와 항목(줄) 단위로 펼친다. 지금 스키마는 expense_items 배열이지만,
// 이 구조로 정리되기 전(직원별로 안 쪼개고 통째로 상신하던 시절)에 이미 승인된 문서들은
// expense_category/purpose/amount/vendor가 그냥 최상위에 있다 — 그런 문서는 항목 1개(index 0)로
// 취급해서 목록에서 빠지지 않게 한다.
export async function getReflectableExpenseItems(): Promise<ExpenseReflectionItem[]> {
  const { data: docType, error: docTypeError } = await supabase
    .from('approval_document_types')
    .select('id')
    .eq('code', 'expense_report')
    .maybeSingle();
  if (docTypeError) throw docTypeError;
  if (!docType) return [];

  const { data: docs, error: docsError } = await supabase
    .from('approval_documents')
    .select('id, title, reference_type, created_by, completed_at, form_data')
    .eq('document_type_id', docType.id)
    .eq('status', 'approved')
    .order('completed_at', { ascending: false });
  if (docsError) throw docsError;
  if (!docs || docs.length === 0) return [];

  const creatorIds = [...new Set(docs.map(d => d.created_by).filter((v): v is string => !!v))];
  const { data: creators } = creatorIds.length > 0
    ? await supabase.from('users').select('id, name').in('id', creatorIds)
    : { data: [] as { id: string; name: string }[] };
  const creatorNameById = new Map((creators || []).map(c => [c.id, c.name]));

  const docIds = docs.map(d => d.id);
  const { data: reflectedRows, error: reflectedError } = await supabase
    .from('accounting_cash_transactions')
    .select('id, source_document_id, source_item_index')
    .in('source_document_id', docIds);
  if (reflectedError) throw reflectedError;
  const reflectedMap = new Map((reflectedRows || []).map(r => [`${r.source_document_id}:${r.source_item_index}`, r.id]));

  const items: ExpenseReflectionItem[] = [];
  for (const d of docs) {
    const formData = (d.form_data || {}) as Record<string, unknown>;
    const expenseDate = typeof formData.expense_date === 'string' ? formData.expense_date : null;
    const rawItems = Array.isArray(formData.expense_items) ? (formData.expense_items as LineItemRow[]) : null;
    // 하위호환: expense_items가 없으면 최상위 평평한 필드를 항목 1개로 취급.
    const rows: LineItemRow[] = rawItems ?? (formData.amount !== undefined ? [formData as LineItemRow] : []);

    rows.forEach((row, index) => {
      const key = `${d.id}:${index}`;
      items.push({
        document_id: d.id,
        item_index: index,
        document_title: d.title,
        reference_type: d.reference_type,
        submitted_by_name: (d.created_by && creatorNameById.get(d.created_by)) || '알 수 없음',
        completed_at: d.completed_at,
        expense_date: expenseDate,
        category: str(row.expense_category),
        purpose: str(row.purpose),
        amount: num(row.amount),
        vendor: str(row.vendor),
        attachments: files(row.attachments),
        reflected: reflectedMap.has(key),
        reflected_transaction_id: reflectedMap.get(key) || null,
      });
    });
  }
  return items;
}

// 분류는 금전출납 화면과 동일한 방식 — 이름+거래유형으로 기존 분류를 찾고, 없으면 새로 만든다.
async function resolveCategoryId(name: string, transactionType: AccountingTransactionType): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const categories = await getCategories(transactionType);
  const existing = categories.find(c => c.name.toLowerCase() === trimmed.toLowerCase());
  if (existing) return existing.id;
  const created = await addCategory({ name: trimmed, transaction_type: transactionType, display_order: categories.length + 1 });
  return created.id;
}

export interface ReflectExpenseItemInput {
  documentId: string;
  itemIndex: number;
  transactionDate: string;
  paymentMethod: AccountingPaymentMethod;
  bankAccountId?: string;
  cardId?: string;
  cashRegisterId?: string;
  categoryName: string;
  counterparty: string;
  description: string;
  amount: number;
  currency: string;
  attachments?: CashTransactionAttachment[];
  createdBy: string | null;
}

// 지출결의서 항목 하나를 실제 금전출납 거래로 반영한다 — 지출결의서는 항상 지출(expense)이다.
export async function reflectExpenseItem(input: ReflectExpenseItemInput): Promise<void> {
  const categoryId = await resolveCategoryId(input.categoryName, 'expense');
  await addCashTransaction({
    transaction_date: input.transactionDate,
    payment_method: input.paymentMethod,
    bank_account_id: input.paymentMethod === 'bank_account' ? input.bankAccountId || null : null,
    card_id: input.paymentMethod === 'card' ? input.cardId || null : null,
    cash_register_id: input.paymentMethod === 'cash' ? input.cashRegisterId || null : null,
    transaction_type: 'expense',
    category_id: categoryId,
    counterparty: input.counterparty.trim() || null,
    description: input.description.trim() || null,
    amount: input.amount,
    currency: input.currency,
    attachments: input.attachments || [],
    remarks: null,
    source_document_id: input.documentId,
    source_item_index: input.itemIndex,
    created_by: input.createdBy,
  });
}

// 같은 결재문서 안의 여러 항목을 한 번에(같은 거래일·자산으로) 반영한다 — 항목별 분류/지급처/
// 적요/금액/증빙서류는 각자의 것을 그대로 쓴다. 순서대로 하나씩 반영하며, 중간에 실패하면
// 그 항목에서 멈추고(부분 반영된 상태) 에러를 그대로 던진다 — 어디까지 반영됐는지는
// getReflectableExpenseItems를 다시 불러서 확인할 수 있다.
export async function reflectExpenseItemsBatch(inputs: ReflectExpenseItemInput[]): Promise<void> {
  for (const input of inputs) await reflectExpenseItem(input);
}

// 반영 취소 = 그때 만들어진 금전출납 거래를 지운다(금전출납 화면의 삭제와 동일한 규칙 —
// 이미 상신/확정된 자금일보 날짜면 assertDateEditable에서 막힌다). 이미 반영된 건은
// 시스템관리자만 강제취소할 수 있다 — 호출하는 화면(AccountingExpenseReflectionPage)에서
// role 체크로 버튼 자체를 막아두지만, 서비스 레이어에서도 최종 방어선으로 한 번 더 확인한다.
export async function unreflectExpenseItem(transactionId: string, isSystemAdmin: boolean): Promise<void> {
  if (!isSystemAdmin) throw new Error('반영 취소는 시스템관리자만 할 수 있습니다.');
  await deleteCashTransaction(transactionId);
}

// 지출결의 반영 목록에서 미반영 문서를 숨긴다(문서 자체는 그대로 유지).
export async function getHiddenExpenseDocumentIds(): Promise<Set<string>> {
  const { data, error } = await supabase.from('accounting_expense_reflection_hides').select('document_id');
  if (error) throw error;
  return new Set((data || []).map(r => r.document_id));
}

export async function hideExpenseDocument(documentId: string, userId: string | null): Promise<void> {
  const { error } = await supabase
    .from('accounting_expense_reflection_hides')
    .upsert({ document_id: documentId, hidden_by: userId }, { onConflict: 'document_id' });
  if (error) throw error;
}

export async function unhideExpenseDocument(documentId: string): Promise<void> {
  const { error } = await supabase.from('accounting_expense_reflection_hides').delete().eq('document_id', documentId);
  if (error) throw error;
}
