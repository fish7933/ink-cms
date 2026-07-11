// MENU_STRUCTURE(types/permissions.ts)가 default-menu.ts에서 그대로 파생되므로, 메뉴 항목 id와
// 권한 리소스 키는 항상 1:1 로 대응한다(케밥표기 id -> 스네이크표기 resource).
export function resourceForMenuItemId(itemId: string): string {
  return itemId.replace(/-/g, '_');
}
