import { defaultMenuStructure } from '@/lib/default-menu';

export interface Permission {
  id: string;
  user_id: string;
  resource: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  created_at: string;
  updated_at: string;
}

export interface PermissionUpdate {
  resource: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

export interface MenuStructure {
  id: string;
  name: string;
  children?: PageStructure[];
}

export interface PageStructure {
  id: string;
  name: string;
  resource: string;
}

// 권한 관리 화면의 메뉴 구조는 실제 사이드바 메뉴(default-menu.ts)를 그대로 따라간다 — 예전엔 이 구조를
// 별도로 손으로 유지해서 실제 메뉴와 어긋나곤 했다(예: 연차 관련 페이지들이 실제로는 "결재"/"설정" 메뉴
// 아래 흩어져 있는데 권한 화면에만 "육상 직원 연차"라는 별도 카테고리로 묶여 있었음). 권한 부여 단위는
// 대메뉴(카테고리) > 소메뉴(항목)까지만 — 소메뉴 화면 내부의 탭(예: 선원 관리 설정의 직급/국적/증서유형
// 탭)은 default-menu에 별도 항목이 없으므로 자동으로 하나의 리소스로 묶인다.
export const MENU_STRUCTURE: MenuStructure[] = defaultMenuStructure.map(category => ({
  id: category.id,
  name: category.label,
  children: category.items.map(item => ({
    id: item.id,
    name: item.label,
    resource: item.id.replace(/-/g, '_'),
  })),
}));

export const RESOURCES = MENU_STRUCTURE.flatMap(m => m.children ?? []).map(p => ({ id: p.resource, name: p.name }));
