export interface MenuItem {
  id: string;
  label: string;
  path?: string;
  icon?: string;
  children?: MenuItem[];
  roles?: string[];
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