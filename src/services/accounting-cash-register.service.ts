import { supabase } from '@/lib/supabase';
import type { CashRegister, CashRegisterWithBalance } from '@/types/accounting';

// 통장(accounting-bank-account.service.ts)과 동일한 원칙 — 잔액은 개설잔액 + 그 시재로 기록된
// 현금 거래 합산으로 그때그때 계산한다.
export async function getCashRegisters(): Promise<CashRegisterWithBalance[]> {
  const { data: registers, error } = await supabase
    .from('accounting_cash_registers')
    .select('*')
    .order('display_order');
  if (error) { console.error(error); return []; }
  if (!registers || registers.length === 0) return [];

  const holderIds = [...new Set(registers.map(r => r.holder_user_id).filter((id): id is string => !!id))];
  const ids = registers.map(r => r.id);

  // PostgREST 기본 조회 상한(1000행)에 걸리지 않도록 다 받을 때까지 이어붙인다.
  const PAGE_SIZE = 1000;
  const txns: { cash_register_id: string; transaction_type: string; amount: number }[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: page } = await supabase.from('accounting_cash_transactions').select('cash_register_id, transaction_type, amount').in('cash_register_id', ids).range(from, from + PAGE_SIZE - 1);
    if (!page || page.length === 0) break;
    txns.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  const [{ data: holders }] = await Promise.all([
    holderIds.length > 0
      ? supabase.from('users').select('id, name').in('id', holderIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const holderNameById = new Map((holders || []).map(u => [u.id, u.name]));
  const deltaByRegister = new Map<string, number>();
  for (const t of txns) {
    const delta = t.transaction_type === 'income' ? Number(t.amount) : -Number(t.amount);
    deltaByRegister.set(t.cash_register_id, (deltaByRegister.get(t.cash_register_id) || 0) + delta);
  }

  return registers.map(r => ({
    ...r,
    holder_user_name: r.holder_user_id ? holderNameById.get(r.holder_user_id) || null : null,
    current_balance: Number(r.opening_balance) + (deltaByRegister.get(r.id) || 0),
  }));
}

export async function addCashRegister(data: Omit<CashRegister, 'id' | 'created_at' | 'updated_at'>): Promise<CashRegister> {
  const { data: result, error } = await supabase
    .from('accounting_cash_registers')
    .insert({ ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw error;
  return result;
}

export async function updateCashRegister(id: string, data: Partial<CashRegister>): Promise<void> {
  const { error } = await supabase
    .from('accounting_cash_registers')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteCashRegister(id: string): Promise<void> {
  const { error } = await supabase.from('accounting_cash_registers').delete().eq('id', id);
  if (error) throw error;
}
