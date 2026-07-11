import { MENU_STRUCTURE } from '@/types/permissions';

// default-menu.ts의 메뉴 항목 id는 대부분 MENU_STRUCTURE(권한 관리 화면)의 페이지 id와 동일하지만,
// 예외적으로 이름이 다른 것들만 여기서 매핑해준다. 이 목록에도, MENU_STRUCTURE에도 없는 메뉴 항목은
// 아직 권한 관리 대상이 아니라는 뜻이므로 canView 체크 없이 항상 노출한다.
const MENU_ITEM_ID_ALIAS: Record<string, string> = {
  'crew-list': 'crew',
};

const MENU_ID_TO_RESOURCE = new Map(
  MENU_STRUCTURE.flatMap(m => m.children ?? []).map(p => [p.id, p.resource])
);

export function resourceForMenuItemId(itemId: string): string | undefined {
  return MENU_ID_TO_RESOURCE.get(MENU_ITEM_ID_ALIAS[itemId] ?? itemId);
}
