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

export const MENU_STRUCTURE: MenuStructure[] = [
  {
    id: 'crew-management',
    name: '선원 관리',
    children: [
      { id: 'crew', name: '선원 목록', resource: 'crew' },
      { id: 'assignments', name: '발령 관리', resource: 'assignments' },
      { id: 'crew-rotation', name: '선원 교대 발령', resource: 'crew_rotation' },
      { id: 'leave-management', name: '휴가 관리', resource: 'leave_management' },
      { id: 'crew-evaluations', name: '선원 평가', resource: 'crew_evaluations' },
      { id: 'contract-management', name: '계약 관리', resource: 'contract_management' },
      { id: 'certificate-expiry', name: '증서 만료 현황', resource: 'certificate_expiry' },
      { id: 'ranks', name: '직급 관리', resource: 'ranks' },
      { id: 'nationalities', name: '선원 국적 관리', resource: 'nationalities' },
      { id: 'certificate-types', name: '증서 유형 관리', resource: 'certificate_types' },
      { id: 'ports', name: '교대지 관리', resource: 'ports' },
    ],
  },
  {
    id: 'ship-management',
    name: '선박 관리',
    children: [
      { id: 'ships', name: '선박 목록', resource: 'ships' },
      { id: 'fleet-management', name: '플릿 관리', resource: 'fleet_management' },
      { id: 'ship-types', name: '선종/분류 관리', resource: 'ship_types' },
      { id: 'ship-flags', name: '선적국 관리', resource: 'ship_flags' },
    ],
  },
  {
    id: 'recruitment',
    name: '구인구직',
    children: [
      { id: 'job-postings', name: '구인 공고', resource: 'job_postings' },
      { id: 'recommendation-review', name: '추천 검토', resource: 'recommendation_review' },
      { id: 'my-recommendations', name: '내 추천 선원', resource: 'my_recommendations' },
    ],
  },
  {
    id: 'approval',
    name: '결재',
    children: [
      { id: 'approval-inbox', name: '내 결재함', resource: 'approval_inbox' },
      { id: 'approval-archive', name: '완료 문서함', resource: 'approval_archive' },
      { id: 'approval-management', name: '결재 캐비넷', resource: 'approval_management' },
      { id: 'document-draft', name: '기안서 작성', resource: 'document_draft' },
      { id: 'my-documents', name: '기안함', resource: 'my_documents' },
    ],
  },
  {
    id: 'salary',
    name: '급여 관리',
    children: [
      { id: 'salary-templates', name: '급여 템플릿', resource: 'salary_templates' },
      { id: 'salary-components', name: '급여 구성항목', resource: 'salary_components' },
      { id: 'allotment-management', name: '송금 관리', resource: 'allotment_management' },
    ],
  },
  {
    id: 'reports',
    name: '보고서/통계',
    children: [
      { id: 'reports-dashboard', name: '통계 대시보드', resource: 'reports' },
    ],
  },
  {
    id: 'settings',
    name: '설정',
    children: [
      { id: 'companies', name: '선주사/매닝사 관리', resource: 'companies' },
      { id: 'user-groups', name: '사용자 그룹 관리', resource: 'user_groups' },
      { id: 'manager-assignments', name: '선주 사용자 관리', resource: 'manager_assignments' },
      { id: 'supervisor-management', name: '우리회사 담당자 관리', resource: 'supervisor_management' },
      { id: 'shore-positions', name: '육상 직원 직급', resource: 'shore_positions' },
      { id: 'org-chart', name: '조직도 관리', resource: 'org_chart' },
      { id: 'approval-lines', name: '결재선 관리', resource: 'approval_lines' },
      { id: 'document-types', name: '문서유형/전결규정 관리', resource: 'document_types' },
      { id: 'menu-configuration', name: 'UI 구성 관리', resource: 'menu_configuration' },
    ],
  },
];

export const RESOURCES = MENU_STRUCTURE.flatMap(m => m.children ?? []).map(p => ({ id: p.resource, name: p.name }));
