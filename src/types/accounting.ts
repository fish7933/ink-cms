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

export interface DailyCashReportSnapshotRow {
  kind: 'bank_account' | 'card' | 'cash_register';
  id: string;
  name: string;
  opening_balance: number;
  income: number;
  expense: number;
  closing_balance: number;
}

export interface DailyCashReport {
  id: string;
  report_date: string;
  status: AccountingDailyReportStatus;
  snapshot: DailyCashReportSnapshotRow[] | null;
  approval_document_id: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
