export interface Permission {
  id: string;
  user_id: string;
  resource: string; // 'companies', 'ships', 'crew', 'ranks', 'salary', 'jobs'
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
  icon?: string;
  children?: PageStructure[];
}

export interface PageStructure {
  id: string;
  name: string;
  resource: string;
}

export const MENU_STRUCTURE: MenuStructure[] = [
  {
    id: 'basic-settings',
    name: '기본환경 설정',
    children: [
      { id: 'companies', name: '회사 관리', resource: 'companies' },
      { id: 'ranks', name: '직급 관리', resource: 'ranks' },
    ],
  },
  {
    id: 'salary-management',
    name: '급여 관리',
    children: [
      { id: 'salary-components', name: '급여 구성 항목', resource: 'salary_components' },
      { id: 'salary-templates', name: '급여 템플릿', resource: 'salary_templates' },
      { id: 'salary-mappings', name: '선박별 급여 매칭', resource: 'salary_mappings' },
    ],
  },
  {
    id: 'operations',
    name: '운영 관리',
    children: [
      { id: 'ships', name: '선박 관리', resource: 'ships' },
      { id: 'crew', name: '선원 관리', resource: 'crew' },
      { id: 'jobs', name: '구인/구직', resource: 'jobs' },
    ],
  },
];

export const RESOURCES = [
  { id: 'companies', name: '회사 관리' },
  { id: 'ranks', name: '직급 관리' },
  { id: 'salary_components', name: '급여 구성 항목' },
  { id: 'salary_templates', name: '급여 템플릿' },
  { id: 'salary_mappings', name: '선박별 급여 매칭' },
  { id: 'ships', name: '선박 관리' },
  { id: 'crew', name: '선원 관리' },
  { id: 'jobs', name: '구인/구직' },
] as const;