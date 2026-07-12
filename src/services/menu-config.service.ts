import { supabase } from '@/lib/supabase';
import type { MenuCategory } from '@/types/menu';

const CONFIG_KEY = 'main';

// 관리자가 UI 구성 관리에서 커스터마이즈한 메뉴 구조. 없으면 null(=defaultMenuStructure를 그대로 쓴다는 뜻).
export async function getMenuConfig(): Promise<MenuCategory[] | null> {
  const { data, error } = await supabase.from('menu_config').select('structure').eq('key', CONFIG_KEY).maybeSingle();
  if (error) { console.error('Error fetching menu config:', error); return null; }
  return (data?.structure as MenuCategory[]) || null;
}

export async function saveMenuConfig(structure: MenuCategory[], updatedBy?: string): Promise<void> {
  const { error } = await supabase
    .from('menu_config')
    .upsert({ key: CONFIG_KEY, structure, updated_by: updatedBy || null, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw error;
}

export async function resetMenuConfig(): Promise<void> {
  const { error } = await supabase.from('menu_config').delete().eq('key', CONFIG_KEY);
  if (error) throw error;
}
