export interface BankAccount {
  id: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  account_holder: string;
  account_type: string | null;
  currency: string;
  opening_balance: number;
  opening_date: string | null;
  display_order: number;
  is_active: boolean;
  memo: string | null;
  created_at: string;
  updated_at: string;
}

export interface BankAccountWithBalance extends BankAccount {
  current_balance: number;
}

export interface Card {
  id: string;
  card_name: string;
  issuer: string;
  card_number_last4: string | null;
  card_type: string | null;
  linked_bank_account_id: string | null;
  holder_user_id: string | null;
  credit_limit: number | null;
  expiry_date: string | null;
  display_order: number;
  is_active: boolean;
  memo: string | null;
  created_at: string;
  updated_at: string;
}

export interface CardWithDetails extends Card {
  linked_bank_account_name: string | null;
  holder_user_name: string | null;
  total_used: number;
}

export interface CashRegister {
  id: string;
  name: string;
  holder_user_id: string | null;
  location: string | null;
  opening_balance: number;
  opening_date: string | null;
  display_order: number;
  is_active: boolean;
  memo: string | null;
  created_at: string;
  updated_at: string;
}

export interface CashRegisterWithBalance extends CashRegister {
  holder_user_name: string | null;
  current_balance: number;
}

export type AccountingTransactionType = 'income' | 'expense';
export type AccountingPaymentMethod = 'bank_account' | 'card' | 'cash';

export interface AccountingCategory {
  id: string;
  name: string;
  transaction_type: AccountingTransactionType;
  is_system: boolean;
  display_order: number;
  created_at: string;
}

export interface CashTransactionAttachment {
  name: string;
  path: string;
  size: number;
  type: string;
}

export interface CashTransaction {
  id: string;
  transaction_date: string;
  payment_method: AccountingPaymentMethod;
  bank_account_id: string | null;
  card_id: string | null;
  cash_register_id: string | null;
  transaction_type: AccountingTransactionType;
  category_id: string | null;
  counterparty: string | null;
  description: string | null;
  amount: number;
  currency: string;
  attachments: CashTransactionAttachment[];
  remarks: string | null;
  // 지출결의서에서 반영된 거래면 그 결재문서/항목을 가리킨다 — 값이 있으면 "반영됨"의 근거.
  source_document_id: string | null;
  source_item_index: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CashTransactionWithDetails extends CashTransaction {
  bank_account_name: string | null;
  card_name: string | null;
  cash_register_name: string | null;
  category_name: string | null;
  created_by_name: string | null;
}

export type AccountingDailyReportStatus = 'draft' | 'pending_approval' | 'confirmed';

// 실제 매일 결재로 올라가는 자금일보 양식(전일이월 → 그날 거래별 잔액 → 합계)을 그대로 따른다.
// 자산 구분은 통장/현금 두 가지만 다룬다 — 카드는 이 회사 실무에서 잔액을 이월하는 자산이 아니라
// 결제수단일 뿐이라 자금일보에는 포함하지 않는다(체크카드처럼 실제 잔액이 도는 카드는 통장으로 등록해서 씀).
export interface DailyCashReportTransactionRow {
  id: string;
  date: string;
  income: number;
  expense: number;
  balance: number;
  counterparty: string;
  description: string;
}

export interface DailyCashReportSnapshotSection {
  kind: 'bank_account' | 'cash_register';
  id: string;
  name: string;
  currency: string;
  opening_balance: number;
  transactions: DailyCashReportTransactionRow[];
  total_income: number;
  total_expense: number;
  closing_balance: number;
}

export interface DailyCashReport {
  id: string;
  report_date: string;
  status: AccountingDailyReportStatus;
  snapshot: DailyCashReportSnapshotSection[] | null;
  approval_document_id: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  last_cancelled_at: string | null;
  last_cancelled_by: string | null;
  last_cancel_reason: string | null;
  remarks: string | null;
  attachments: CashTransactionAttachment[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
