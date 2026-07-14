export interface MenuItem {
  id: string;
  label: string;
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
  icon?: string;
  order: number;
  is_active: boolean;
  items: MenuItem[];
}

export interface MenuStructure {
  categories: MenuCategory[];
}