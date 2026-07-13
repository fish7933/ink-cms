import { supabase } from '@/lib/supabase';
import { defaultMenuStructure } from '@/lib/default-menu';
import type { MenuCategory } from '@/types/menu';

const CONFIG_KEY = 'main';

interface StoredMenuConfig {
  categories: MenuCategory[];
  // 코드 기본 메뉴(defaultMenuStructure)에 있는 대메뉴를 관리자가 UI에서 삭제한 경우의 id 목록.
  // saved.categories에서 그냥 빼기만 하면 아래 병합 로직이 코드의 defaultCat으로 되살려버리므로 별도로 기억해야 함.
  deletedCategoryIds?: string[];
}

// 관리자가 UI 구성 관리에서 커스터마이즈한 메뉴 구조 원본(그대로). 없으면 null.
// UI 구성 관리 화면 자체(편집기)에서만 쓴다 — 실제 사이드바/헤더는 아래 getEffectiveMenuStructure를 써야 한다.
export async function getMenuConfig(): Promise<StoredMenuConfig | null> {
  const { data, error } = await supabase.from('menu_config').select('structure').eq('key', CONFIG_KEY).maybeSingle();
  if (error) { console.error('Error fetching menu config:', error); return null; }
  return (data?.structure as StoredMenuConfig) || null;
}

// 저장된 커스텀 구조와 코드상의 defaultMenuStructure를 병합한다.
// - 코드에 있는 대메뉴/항목은 항상 코드의 존재(라벨/경로/아이콘/roles)를 기준으로 삼되, 관리자가 저장한
//   라벨/아이콘/순서/활성화 여부가 있으면 그걸 우선한다 — 코드에 새 항목이 추가되면(신규 기능) 저장된
//   옛 구조에 없어도 자동으로 뒤에 붙는다.
// - 코드에 없는(관리자가 UI에서 직접 만든) 커스텀 대메뉴는 그대로 뒤에 추가된다.
// - 관리자가 UI에서 삭제한 코드 기본 대메뉴는 deletedCategoryIds로 기억해뒀다가 제외한다.
export async function getEffectiveMenuStructure(): Promise<MenuCategory[]> {
  const saved = await getMenuConfig();
  if (!saved) return defaultMenuStructure;

  const savedCategoryById = new Map(saved.categories.map(c => [c.id, c]));
  const deletedIds = new Set(saved.deletedCategoryIds || []);

  const mergedFromCode = defaultMenuStructure
    .filter(defaultCat => !deletedIds.has(defaultCat.id))
    .map(defaultCat => {
      const savedCat = savedCategoryById.get(defaultCat.id);
      if (!savedCat) return defaultCat;

      const savedItemById = new Map(savedCat.items.map(i => [i.id, i]));
      const mergedItems = defaultCat.items.map(defaultItem => {
        const savedItem = savedItemById.get(defaultItem.id);
        return savedItem ? { ...defaultItem, order: savedItem.order, is_active: savedItem.is_active } : defaultItem;
      });

      return {
        ...defaultCat,
        label: savedCat.label || defaultCat.label,
        icon: savedCat.icon || defaultCat.icon,
        order: savedCat.order,
        is_active: savedCat.is_active,
        items: mergedItems,
      };
    });

  // 코드에 없는(관리자가 직접 만든) 커스텀 대메뉴는 그대로 추가
  const customCategories = saved.categories.filter(c => !defaultMenuStructure.some(d => d.id === c.id));

  return [...mergedFromCode, ...customCategories].sort((a, b) => a.order - b.order);
}

export async function saveMenuConfig(categories: MenuCategory[], deletedCategoryIds: string[], updatedBy?: string): Promise<void> {
  const structure: StoredMenuConfig = { categories, deletedCategoryIds };
  const { error } = await supabase
    .from('menu_config')
    .upsert({ key: CONFIG_KEY, structure, updated_by: updatedBy || null, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw error;
}

export async function resetMenuConfig(): Promise<void> {
  const { error } = await supabase.from('menu_config').delete().eq('key', CONFIG_KEY);
  if (error) throw error;
}
