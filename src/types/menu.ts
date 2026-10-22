export interface MenuItem {
  id: string;
  label: string;
  // 관리자가 UI 구성 관리에서 지정한 영문명. 비어있으면 개발자가 관리하는 번역 사전(t(label))으로
  // 대체 번역된다 — 관리자가 커스터마이즈한 메뉴명도 영문 전환이 되도록 하기 위함.
  label_en?: string;
  path?: string;
  icon?: string;
  children?: MenuItem[];
  roles?: string[];
  // true면 admin/system_admin도 roles 배열을 그대로 적용받는다 (기본은 관리자 전체 열람 예외).
  strictRoles?: boolean;
  order: number;
  parent_id?: string | null;
  is_active: boolean;
}

export interface MenuCategory {
  id: string;
  label: string;
  label_en?: string;
  icon?: string;
  order: number;
  is_active: boolean;
  items: MenuItem[];
}

export interface MenuStructure {
  categories: MenuCategory[];
}