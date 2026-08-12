export interface User {
  id: string;
  username?: string;
  email: string;
  name: string;
  role: 'admin' | 'system_admin' | 'ship_owner' | 'ship_manager' | 'manning_agency' | 'crew';
  company_id?: string;
  position_id?: string | null; // shore_positions.id (육상 직원 직급)
  hire_date?: string | null; // 육상 직원 입사일 (연차 산정 기준)
  is_executive?: boolean; // 임원 여부 (직원카드 관리에서 임원/직원 구분)
  is_leave_exempt?: boolean; // 연차 적용 제외자 (임원 등) — true면 연차 현황/관리 대상에서 제외
  resident_registration_number?: string | null; // 육상 직원 주민등록번호 (급여대장/세무 신고용)
  salary_bank_name?: string | null; // 급여 지급계좌 은행명 (지출결의서 적요 자동 생성에 사용)
  salary_bank_account?: string | null; // 급여 지급계좌 계좌번호
  notify_approval_request?: boolean; // 내 차례가 됐을 때 결재 요청 알림을 받을지 (기본 true)
  notify_approval_complete?: boolean; // 내가 상신한 문서가 최종 승인됐을 때 알림을 받을지 (기본 true)
  notify_approval_reference?: boolean; // 수신/참조로 지정된 문서가 최종 승인됐을 때 알림을 받을지 (기본 true)
  created_at: string;
}

export interface Company {
  id: string;
  name: string;
  type: 'owner' | 'manning';
  contact_email?: string;
  contact_phone?: string;
  address?: string;
  default_officer_contract_months?: number;
  default_rating_contract_months?: number;
  created_at: string;
}

export interface Fleet {
  id: string;
  owner_id: string;
  name: string;
  description?: string;
  created_at: string;
}

export interface Ship {
  id: string;
  owner_id: string;
  fleet_id?: string;
  is_active?: boolean;
  name: string;
  imo_number?: string;
  ship_type?: string;
  flag?: string;
  gross_tonnage?: number;
  built_year?: number;
  call_sign?: string;
  mmsi?: string;
  classification_society?: string;
  port_of_registry?: string;
  engine_type?: string;
  engine_power?: number;
  speed_max?: number;
  speed_service?: number;
  fuel_consumption?: number;
  crew_capacity?: number;
  passenger_capacity?: number;
  cargo_capacity?: number;
  length_overall?: number;
  breadth?: number;
  depth?: number;
  draft?: number;
  builder?: string;
  shipyard?: string;
  dwt?: number;
  gt?: number;
  fleet_group?: string;
  route?: string;
  // 교대계획/급여명세서 등을 선박으로 직접 발송할 때 쓰는 연락처
  phone?: string;
  email?: string;
  created_at: string;
}

export interface Rank {
  id: string;
  rank_code: string;
  name: string;
  department: 'deck' | 'engine' | 'catering';
  rank_category: 'officer' | 'rating';
  display_order: number;
  created_at: string;
}

export interface JobPosting {
  id: string;
  company_id: string;
  fleet_id?: string;
  ship_id: string;
  rank_id: string;
  positions_available: number;
  embarkation_date: string;
  contract_months: number;
  salary_amount?: number;
  salary_currency: string;
  requirements?: string;
  status: 'active' | 'filled' | 'cancelled';
  created_by: string;
  created_at: string;
  application_deadline?: string;
  urgency: 'urgent' | 'normal';
  visible_to_agencies: string[];
}

export interface JobPostingWithDetails extends JobPosting {
  company_name: string;
  fleet_name?: string;
  ship_name: string;
  rank_name: string;
  rank_code: string;
  department: string;
}

export interface JobPostingGroup {
  id: string;
  company_id: string;
  fleet_id?: string;
  ship_id?: string | null; // null = 선박 미정(선종/GT/항로로 대체)
  ship_type_id?: string | null;
  estimated_gt?: number | null;
  trade_route?: string | null;
  embarkation_date: string;
  application_deadline?: string;
  requirements?: string;
  status: 'active' | 'filled' | 'cancelled';
  urgency: 'urgent' | 'normal';
  visible_to_agencies: string[];
  preferred_nationalities: string[];
  created_by: string;
  created_at: string;
}

export interface JobPostingGroupRank {
  id: string;
  group_id: string;
  rank_id: string;
  positions_available: number;
  contract_months: number;
  salary_template_id?: string;
  salary_amount?: number;
  salary_currency: string;
  salary_grade?: string | null;
  preferred_nationalities: string[];
  salary_components?: Array<{
    component_id: string;
    component_name: string;
    amount: number;
  }>;
}

export interface JobPostingGroupWithDetails extends JobPostingGroup {
  company_name: string;
  fleet_name?: string;
  ship_name: string;
  ranks: Array<{
    id: string;
    rank_id: string;
    rank_name: string;
    rank_code: string;
    department: string;
    positions_available: number;
    contract_months: number;
    salary_amount?: number;
    salary_currency: string;
    preferred_nationalities: string[];
    salary_components?: Array<{
      component_id: string;
      component_name: string;
      amount: number;
    }>;
  }>;
  recommendation_count?: number;
}

export interface SalaryTemplate {
  id: string;
  name: string;
  currency: string;
  description?: string;
  is_active: boolean;
  created_at: string;
}

export interface SalaryComponent {
  id: string;
  name: string;
  description?: string;
  is_taxable: boolean;
  created_at: string;
}

export interface SalaryTemplateItem {
  id: string;
  template_id: string;
  rank: string;
  component_id: string;
  amount: number;
  created_at: string;
}

export interface CrewMember {
  id: string;
  agency_id?: string;
  full_name?: string;
  name?: string;
  name_english?: string;
  name_chinese?: string;
  date_of_birth: string;
  desired_embark_date?: string | null; // 선원 본인이 등록하는 승선 희망일 (로테이션 승선 추천 점수 계산에 사용)
  nationality?: string;
  rank_id?: string;
  rank?: string;
  email?: string;
  phone?: string;
  passport_number?: string;
  passport_expiry?: string;
  seaman_book_number?: string;
  seaman_book_expiry?: string;
  seaman_book_flag_number?: string;
  seaman_book_flag_expiry?: string;
  sid?: string;
  contact_phone?: string;
  contact_email?: string;
  availability_status?: 'available' | 'on_board' | 'on_leave' | 'unavailable';
  current_status?: string;
  created_at: string;
  updated_at?: string;
  // Bio-Data
  photo_url?: string;
  height?: number;
  weight?: number;
  blood_type?: string;
  shoe_size?: string;
  coverall_size?: string;
  clothing_size?: string;
  eye_color?: string;
  religion?: string;
  place_of_birth?: string;
  smoking?: boolean;
  drinking?: boolean;
  marital_status?: 'single' | 'married' | 'divorced' | 'widowed';
  children_count?: number;
  // Language & Evaluation
  english_read_write?: 'beginner' | 'intermediate' | 'advanced' | 'excellent';
  english_speak_listen?: 'beginner' | 'intermediate' | 'advanced' | 'excellent';
  other_languages?: string;
  job_ability?: string;
  motivation?: string;
  // Health
  previous_illness?: string;
  drug_test_date?: string;
  drug_test_result?: 'pass' | 'fail' | 'pending';
  physical_exam_date?: string;
  physical_exam_result?: 'fit' | 'unfit' | 'pending';
  yellow_fever_vaccination?: boolean;
  yellow_fever_date?: string;
  // Contacts
  emergency_contact?: string;
  emergency_contacts?: Array<{ name: string; relationship: string; phone: string; note?: string }>;
  next_of_kin?: string;
  next_of_kin_relationship?: string;
  next_of_kin_contact?: string;
  // Certificates
  certificates?: Array<{
    name: string;
    number?: string;
    issued_date?: string;
    expiry_date?: string;
    issuing_authority?: string;
    no_expiry?: boolean;
    file_path?: string;
    file_name?: string;
  }>;
  // Assignment
  owner_id?: string;
  fleet_id?: string;
  current_ship_id?: string;
  manning_agency_id?: string;
}

export interface CrewMemberWithDetails extends CrewMember {
  agency_name: string;
  rank_name: string;
  rank_code: string;
  department: string;
}

export interface CrewRecommendationResumeFile {
  name: string;
  path: string;
  size: number;
  type: string;
}

export interface CrewRecommendation {
  id: string;
  job_posting_group_id?: string;
  manning_agency_id: string;
  crew_name: string;
  crew_birth_date: string;
  rank_id: string;
  company_id?: string;
  fleet_id?: string;
  ship_id?: string;
  ship_type?: string;
  ship_size?: string;
  nationality?: string;
  education?: string;
  desired_salary: number;
  desired_currency: string;
  desired_contract_months: number;
  available_date: string;
  remarks?: string;
  // DB에는 JSON 문자열로 저장되지만, 서비스 계층에서 파싱해 배열로 내려준다
  resume_files: CrewRecommendationResumeFile[];
  certificates?: unknown;
  crew_member_id?: string | null;
  status: 'pending' | 'reviewed' | 'accepted' | 'rejected' | 'withdrawn';
  created_by: string;
  created_at: string;
  updated_at?: string;
}

export interface CrewRecommendationWithDetails extends CrewRecommendation {
  manning_agency_name: string;
  rank_name: string;
  rank_code: string;
  department: string;
  company_name?: string;
  fleet_name?: string;
  ship_name?: string;
}

export interface ShorePosition {
  id: string;
  name: string;
  display_order: number;
  created_at?: string;
  updated_at?: string;
}