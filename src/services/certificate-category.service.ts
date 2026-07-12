import { supabase } from '@/lib/supabase';
import type { CertificateCategory } from '@/types/certificate-category';

export async function getCertificateCategories(activeOnly: boolean = false): Promise<CertificateCategory[]> {
  let query = supabase.from('certificate_categories').select('*').order('display_order', { ascending: true });
  if (activeOnly) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) { console.error('Error fetching certificate categories:', error); throw error; }
  return data || [];
}

export async function addCertificateCategory(input: { code: string; name: string }): Promise<CertificateCategory> {
  const { data: maxRow } = await supabase.from('certificate_categories').select('display_order').order('display_order', { ascending: false }).limit(1).maybeSingle();
  const nextOrder = (maxRow?.display_order || 0) + 1;
  const { data, error } = await supabase
    .from('certificate_categories')
    .insert({ code: input.code, name: input.name, display_order: nextOrder })
    .select()
    .single();
  if (error) { console.error('Error adding certificate category:', error); throw error; }
  return data;
}

export async function updateCertificateCategory(id: string, updates: Partial<Pick<CertificateCategory, 'code' | 'name' | 'is_active' | 'display_order'>>): Promise<CertificateCategory> {
  const { data, error } = await supabase
    .from('certificate_categories')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) { console.error('Error updating certificate category:', error); throw error; }
  return data;
}

// 이 카테고리를 사용하는 증서 유형이 있으면 DB 제약(ON DELETE RESTRICT는 없지만 애플리케이션에서
// 사전 체크)으로 삭제를 막아야 하므로, 호출부에서 certificate_types 사용 여부를 먼저 확인한다.
export async function deleteCertificateCategory(id: string): Promise<void> {
  const { error } = await supabase.from('certificate_categories').delete().eq('id', id);
  if (error) { console.error('Error deleting certificate category:', error); throw error; }
}

export async function reorderCertificateCategories(orderedIds: string[]): Promise<void> {
  await Promise.all(orderedIds.map((id, i) => supabase.from('certificate_categories').update({ display_order: i + 1 }).eq('id', id)));
}
