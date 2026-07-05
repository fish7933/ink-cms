import { supabase } from '@/lib/supabase';
import type { SignOffReason } from '@/types/sign-off-reason';

export async function getSignOffReasons(): Promise<SignOffReason[]> {
  const { data, error } = await supabase.from('sign_off_reasons').select('*').order('display_order');
  if (error) { console.error(error); return []; }
  return data || [];
}

export async function addSignOffReason(name: string): Promise<SignOffReason> {
  const { data: existing } = await supabase.from('sign_off_reasons').select('display_order').order('display_order', { ascending: false }).limit(1);
  const max = existing && existing.length > 0 ? existing[0].display_order : 0;
  const { data, error } = await supabase.from('sign_off_reasons').insert({ name, is_system: false, display_order: max + 1 }).select().single();
  if (error) throw error;
  return data;
}

export async function updateSignOffReason(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('sign_off_reasons').update({ name }).eq('id', id);
  if (error) throw error;
}

export async function deleteSignOffReason(reason: SignOffReason): Promise<void> {
  if (reason.is_system) throw new Error('시스템 기본 사유는 삭제할 수 없습니다.');
  const { error } = await supabase.from('sign_off_reasons').delete().eq('id', reason.id);
  if (error) throw error;
}
