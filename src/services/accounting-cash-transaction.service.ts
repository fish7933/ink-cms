import { supabase } from '@/lib/supabase';
import type { CashTransaction, CashTransactionWithDetails, AccountingTransactionType, AccountingPaymentMethod } from '@/types/accounting';

export interface CashTransactionFilters {
  bankAccountId?: string;
  cardId?: string;
  cashRegisterId?: string;
  dateFrom?: string;
  dateTo?: string;
  transactionType?: AccountingTransactionType;
  paymentMethod?: AccountingPaymentMethod;
}

export async function getCashTransactions(filters: CashTransactionFilters = {}): Promise<CashTransactionWithDetails[]> {
  let query = supabase.from('accounting_cash_transactions').select('*').order('transaction_date', { ascending: false }).order('created_at', { ascending: false });
  if (filters.bankAccountId) query = query.eq('bank_account_id', filters.bankAccountId);
  if (filters.cardId) query = query.eq('card_id', filters.cardId);
  if (filters.cashRegisterId) query = query.eq('cash_register_id', filters.cashRegisterId);
  if (filters.dateFrom) query = query.gte('transaction_date', filters.dateFrom);
  if (filters.dateTo) query = query.lte('transaction_date', filters.dateTo);
  if (filters.transactionType) query = query.eq('transaction_type', filters.transactionType);
  if (filters.paymentMethod) query = query.eq('payment_method', filters.paymentMethod);

  const { data: rows, error } = await query;
  if (error) { console.error(error); return []; }
  if (!rows || rows.length === 0) return [];

  const bankAccountIds = [...new Set(rows.map(r => r.bank_account_id).filter((id): id is string => !!id))];
  const cardIds = [...new Set(rows.map(r => r.card_id).filter((id): id is string => !!id))];
  const cashRegisterIds = [...new Set(rows.map(r => r.cash_register_id).filter((id): id is string => !!id))];
  const categoryIds = [...new Set(rows.map(r => r.category_id).filter((id): id is string => !!id))];
  const creatorIds = [...new Set(rows.map(r => r.created_by).filter((id): id is string => !!id))];

  const [{ data: accounts }, { data: cards }, { data: registers }, { data: categories }, { data: users }] = await Promise.all([
    bankAccountIds.length > 0 ? supabase.from('accounting_bank_accounts').select('id, account_name').in('id', bankAccountIds) : Promise.resolve({ data: [] as { id: string; account_name: string }[] }),
    cardIds.length > 0 ? supabase.from('accounting_cards').select('id, card_name').in('id', cardIds) : Promise.resolve({ data: [] as { id: string; card_name: string }[] }),
    cashRegisterIds.length > 0 ? supabase.from('accounting_cash_registers').select('id, name').in('id', cashRegisterIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    categoryIds.length > 0 ? supabase.from('accounting_categories').select('id, name').in('id', categoryIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    creatorIds.length > 0 ? supabase.from('users').select('id, name').in('id', creatorIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const accountNameById = new Map((accounts || []).map(a => [a.id, a.account_name]));
  const cardNameById = new Map((cards || []).map(c => [c.id, c.card_name]));
  const registerNameById = new Map((registers || []).map(r => [r.id, r.name]));
  const categoryNameById = new Map((categories || []).map(c => [c.id, c.name]));
  const userNameById = new Map((users || []).map(u => [u.id, u.name]));

  return rows.map(r => ({
    ...r,
    bank_account_name: r.bank_account_id ? accountNameById.get(r.bank_account_id) || null : null,
    card_name: r.card_id ? cardNameById.get(r.card_id) || null : null,
    cash_register_name: r.cash_register_id ? registerNameById.get(r.cash_register_id) || null : null,
    category_name: r.category_id ? categoryNameById.get(r.category_id) || null : null,
    created_by_name: r.created_by ? userNameById.get(r.created_by) || null : null,
  }));
}

export async function addCashTransaction(data: Omit<CashTransaction, 'id' | 'created_at' | 'updated_at'>): Promise<CashTransaction> {
  const { data: result, error } = await supabase
    .from('accounting_cash_transactions')
    .insert({ ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw error;
  return result;
}

export async function updateCashTransaction(id: string, data: Partial<CashTransaction>): Promise<void> {
  const { error } = await supabase
    .from('accounting_cash_transactions')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteCashTransaction(id: string): Promise<void> {
  const { error } = await supabase.from('accounting_cash_transactions').delete().eq('id', id);
  if (error) throw error;
}
