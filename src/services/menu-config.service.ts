import { supabase } from '@/lib/supabase';
import { defaultMenuStructure } from '@/lib/default-menu';
import type { MenuCategory } from '@/types/menu';

const CONFIG_KEY = 'main';

// 관리자가 UI 구성 관리에서 커스터마이즈한 메뉴 구조 원본(그대로). 없으면 null.
// UI 구성 관리 화면 자체(편집기)에서만 쓴다 — 실제 사이드바/헤더는 아래 getEffectiveMenuStructure를 써야 한다.
export async function getMenuConfig(): Promise<MenuCategory[] | null> {
  const { data, error } = await supabase.from('menu_config').select('structure').eq('key', CONFIG_KEY).maybeSingle();
  if (error) { console.error('Error fetching menu config:', error); return null; }
  return (data?.structure as MenuCategory[]) || null;
}

// 저장된 커스텀 구조와 코드상의 defaultMenuStructure를 병합한다. 관리자가 순서/활성화만 바꿔둔 뒤에
// 코드에 새 메뉴 항목이 추가되면(이번 "내 문서함"처럼), 저장된 옛 구조가 그대로 우선되어 새 항목이
// 영원히 안 보이는 문제를 막기 위함 — 저장된 항목은 순서/활성화를 유지하되, 코드에만 있는 새 항목은
// 자동으로 뒤에 추가되고, 코드에서 사라진 항목은 무시한다.
export async function getEffectiveMenuStructure(): Promise<MenuCategory[]> {
  const saved = await getMenuConfig();
  if (!saved) return defaultMenuStructure;

  const savedCategoryById = new Map(saved.map(c => [c.id, c]));

  const mergedCategories = defaultMenuStructure.map(defaultCat => {
    const savedCat = savedCategoryById.get(defaultCat.id);
    if (!savedCat) return defaultCat;

    const savedItemById = new Map(savedCat.items.map(i => [i.id, i]));
    const mergedItems = defaultCat.items.map(defaultItem => {
      const savedItem = savedItemById.get(defaultItem.id);
      return savedItem ? { ...defaultItem, order: savedItem.order, is_active: savedItem.is_active } : defaultItem;
    });

    return { ...defaultCat, order: savedCat.order, is_active: savedCat.is_active, items: mergedItems };
  });

  // 코드에서 완전히 사라진 카테고리(더 이상 defaultMenuStructure에 없는 것)는 자연스럽게 제외된다.
  return mergedCategories;
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
