export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'ship_owner' | 'ship_manager' | 'manning_agency' | 'crew';
  company_id?: string;
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
  ship_id: string;
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
  date_of_birth: string;
  nationality?: string;
  rank_id?: string;
  rank?: string;
  email?: string;
  phone?: string;
  passport_number?: string;
  seaman_book_number?: string;
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
  place_of_birth?: string;
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
  desired_salary: number;
  desired_currency: string;
  desired_contract_months: number;
  available_date: string;
  remarks?: string;
  resume_files: string[];
  status: 'pending' | 'reviewed' | 'accepted' | 'rejected';
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