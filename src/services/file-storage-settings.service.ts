import { supabase } from '@/lib/supabase';
import type { FileStorageSettings } from '@/types/file-storage';

// 단일 행 설정 — 여러 개 만들 필요 없이 항상 하나만 유지한다(다른 설정류 테이블과 동일 규칙은
// 아니지만, 외부 저장소는 회사 전체에 하나면 충분하다는 판단).
export async function getFileStorageSettings(): Promise<FileStorageSettings | null> {
  const { data, error } = await supabase.from('file_storage_settings').select('*').order('created_at').limit(1).maybeSingle();
  if (error) { console.error(error); return null; }
  return data;
}

export async function saveFileStorageSettings(
  data: Omit<FileStorageSettings, 'id' | 'created_at' | 'updated_at'>
): Promise<FileStorageSettings> {
  const existing = await getFileStorageSettings();
  const now = new Date().toISOString();
  if (existing) {
    const { data: result, error } = await supabase
      .from('file_storage_settings')
      .update({ ...data, updated_at: now })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    return result;
  }
  const { data: result, error } = await supabase
    .from('file_storage_settings')
    .insert({ ...data, created_at: now, updated_at: now })
    .select()
    .single();
  if (error) throw error;
  return result;
}
