import { supabase } from '@/lib/supabase';
import type { AccountingCategory, AccountingTransactionType } from '@/types/accounting';

export async function getCategories(type?: AccountingTransactionType): Promise<AccountingCategory[]> {
  let query = supabase.from('accounting_categories').select('*').order('display_order').order('name');
  if (type) query = query.eq('transaction_type', type);
  const { data, error } = await query;
  if (error) { console.error(error); return []; }
  return data || [];
}

export async function addCategory(data: { name: string; transaction_type: AccountingTransactionType; display_order?: number }): Promise<AccountingCategory> {
  const { data: result, error } = await supabase
    .from('accounting_categories')
    .insert({ name: data.name, transaction_type: data.transaction_type, display_order: data.display_order ?? 0 })
    .select()
    .single();
  if (error) throw error;
  return result;
}

export async function updateCategory(id: string, data: { name?: string; display_order?: number }): Promise<void> {
  const { error } = await supabase.from('accounting_categories').update(data).eq('id', id);
  if (error) throw error;
}

export async function deleteCategory(category: AccountingCategory): Promise<void> {
  if (category.is_system) throw new Error('시스템 기본 분류는 삭제할 수 없습니다.');
  const { error } = await supabase.from('accounting_categories').delete().eq('id', category.id);
  if (error) throw error;
}
