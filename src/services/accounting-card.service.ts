import { supabase } from '@/lib/supabase';
import type { Card, CardWithDetails } from '@/types/accounting';

export async function getCards(): Promise<CardWithDetails[]> {
  const { data: cards, error } = await supabase
    .from('accounting_cards')
    .select('*')
    .order('display_order');
  if (error) { console.error(error); return []; }
  if (!cards || cards.length === 0) return [];

  const bankAccountIds = [...new Set(cards.map(c => c.linked_bank_account_id).filter((id): id is string => !!id))];
  const holderIds = [...new Set(cards.map(c => c.holder_user_id).filter((id): id is string => !!id))];
  const cardIds = cards.map(c => c.id);

  // PostgREST 기본 조회 상한(1000행)에 걸리지 않도록 다 받을 때까지 이어붙인다.
  const PAGE_SIZE = 1000;
  const txns: { card_id: string; amount: number }[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: page } = await supabase.from('accounting_cash_transactions').select('card_id, amount').in('card_id', cardIds).eq('transaction_type', 'expense').range(from, from + PAGE_SIZE - 1);
    if (!page || page.length === 0) break;
    txns.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  const [{ data: accounts }, { data: holders }] = await Promise.all([
    bankAccountIds.length > 0
      ? supabase.from('accounting_bank_accounts').select('id, account_name').in('id', bankAccountIds)
      : Promise.resolve({ data: [] as { id: string; account_name: string }[] }),
    holderIds.length > 0
      ? supabase.from('users').select('id, name').in('id', holderIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const accountNameById = new Map((accounts || []).map(a => [a.id, a.account_name]));
  const holderNameById = new Map((holders || []).map(u => [u.id, u.name]));
  const usedByCard = new Map<string, number>();
  for (const t of txns) {
    usedByCard.set(t.card_id, (usedByCard.get(t.card_id) || 0) + Number(t.amount));
  }

  return cards.map(c => ({
    ...c,
    linked_bank_account_name: c.linked_bank_account_id ? accountNameById.get(c.linked_bank_account_id) || null : null,
    holder_user_name: c.holder_user_id ? holderNameById.get(c.holder_user_id) || null : null,
    total_used: usedByCard.get(c.id) || 0,
  }));
}

export async function addCard(data: Omit<Card, 'id' | 'created_at' | 'updated_at'>): Promise<Card> {
  const { data: result, error } = await supabase
    .from('accounting_cards')
    .insert({ ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw error;
  return result;
}

export async function updateCard(id: string, data: Partial<Card>): Promise<void> {
  const { error } = await supabase
    .from('accounting_cards')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteCard(id: string): Promise<void> {
  const { error } = await supabase.from('accounting_cards').delete().eq('id', id);
  if (error) throw error;
}
