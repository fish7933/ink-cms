import { supabase } from '@/lib/supabase';
import type { BankAccount, BankAccountWithBalance } from '@/types/accounting';

// 잔액은 별도 컬럼에 저장하지 않고 개설잔액 + 해당 계좌 거래 합산으로 그때그때 계산한다
// (shore-leave.service.ts의 getLeaveBalance와 동일한 원칙).
export async function getBankAccounts(): Promise<BankAccountWithBalance[]> {
  const { data: accounts, error } = await supabase
    .from('accounting_bank_accounts')
    .select('*')
    .order('display_order');
  if (error) { console.error(error); return []; }
  if (!accounts || accounts.length === 0) return [];

  const ids = accounts.map(a => a.id);
  // PostgREST 기본 조회 상한(1000행)에 걸리지 않도록 다 받을 때까지 이어붙인다 — 거래가
  // 많이 쌓인 계좌는 그렇지 않으면 잔액 계산에서 뒤쪽 거래가 조용히 빠진다.
  const PAGE_SIZE = 1000;
  const txns: { bank_account_id: string; transaction_type: string; amount: number }[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: page } = await supabase
      .from('accounting_cash_transactions')
      .select('bank_account_id, transaction_type, amount')
      .in('bank_account_id', ids)
      .range(from, from + PAGE_SIZE - 1);
    if (!page || page.length === 0) break;
    txns.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  const deltaByAccount = new Map<string, number>();
  for (const t of txns) {
    const delta = t.transaction_type === 'income' ? Number(t.amount) : -Number(t.amount);
    deltaByAccount.set(t.bank_account_id, (deltaByAccount.get(t.bank_account_id) || 0) + delta);
  }

  return accounts.map(a => ({ ...a, current_balance: Number(a.opening_balance) + (deltaByAccount.get(a.id) || 0) }));
}

export async function addBankAccount(data: Omit<BankAccount, 'id' | 'created_at' | 'updated_at'>): Promise<BankAccount> {
  const { data: result, error } = await supabase
    .from('accounting_bank_accounts')
    .insert({ ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw error;
  return result;
}

export async function updateBankAccount(id: string, data: Partial<BankAccount>): Promise<void> {
  const { error } = await supabase
    .from('accounting_bank_accounts')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteBankAccount(id: string): Promise<void> {
  const { error } = await supabase.from('accounting_bank_accounts').delete().eq('id', id);
  if (error) throw error;
}
