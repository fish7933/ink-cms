export interface CrewBioData {
  // Physical
  height?: number;
  weight?: number;
  blood_type?: string;
  shoe_size?: string;
  coverall_size?: string;
  clothing_size?: string;
  eye_color?: string;
  place_of_birth?: string;
  // Personal
  religion?: string;
  smoking?: boolean;
  drinking?: boolean;
  marital_status?: 'single' | 'married' | 'divorced' | 'widowed';
  children_count?: number;
  // Language
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
  next_of_kin?: string;
  next_of_kin_relationship?: string;
  next_of_kin_contact?: string;
  emergency_contact?: string;
  emergency_contact_relationship?: string;
  emergency_contact_phone?: string;
  join_company_date?: string;
  status?: 'active' | 'on_leave' | 'resigned' | 'terminated';
}

export interface CrewCertificate {
  id: string;
  crew_member_id: string;
  certificate_type: 'stcw_national' | 'stcw_flag' | 'bbchp_korea' | 'medical' | 'ism' | 'passport' | 'seaman_book' | 'other';
  certificate_name: string;
  certificate_number?: string;
  issue_date?: string;
  expiry_date?: string;
  issuing_authority?: string;
  document_url?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface SeaServiceRecord {
  id: string;
  crew_member_id: string;
  record_type: 'pre_company' | 'company_assignment';
  ship_name: string;
  ship_type?: string;
  flag?: string;
  gross_tonnage?: number;
  engine_power?: number;
  rank: string;
  rank_grade?: string | null;
  sign_on_date: string;
  sign_off_date?: string;
  sign_off_reason?: string;
  sign_off_reason_id?: string | null;
  sign_off_reason_name?: string;
  port_of_sign_on?: string;
  port_of_sign_off?: string;
  // 입사 전 경력(pre_company)인 경우의 선주사/선박관리사/매닝사 (외부 회사일 수 있어 자유 텍스트)
  owner_company_name?: string;
  ship_manager_name?: string;
  manning_agency_name?: string;
  assignment_id?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface TrainingRecord {
  id: string;
  crew_member_id: string;
  training_name: string;
  training_type?: 'safety' | 'technical' | 'management' | 'certification' | 'other';
  training_provider?: string;
  training_location?: string;
  start_date: string;
  end_date?: string;
  duration_hours?: number;
  certificate_issued?: boolean;
  certificate_number?: string;
  certificate_expiry?: string;
  result?: 'passed' | 'failed' | 'in_progress';
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface MedicalRecord {
  id: string;
  crew_member_id: string;
  record_date: string;
  record_type: 'injury' | 'illness' | 'checkup' | 'vaccination' | 'other';
  diagnosis: string;
  treatment?: string;
  doctor_name?: string;
  hospital_clinic?: string;
  location?: string;
  ship_name?: string;
  days_off_duty?: number;
  fitness_status?: 'fit' | 'fit_with_restrictions' | 'unfit' | 'pending';
  follow_up_required?: boolean;
  follow_up_date?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface CrewSalaryRecord {
  id: string;
  crew_member_id: string;
  payment_period_start: string;
  payment_period_end: string;
  payment_date: string;
  basic_salary: number;
  overtime_pay?: number;
  allowances?: number;
  bonuses?: number;
  deductions?: number;
  tax?: number;
  net_salary: number;
  currency: string;
  payment_method?: 'bank_transfer' | 'cash' | 'check' | 'other';
  bank_name?: string;
  account_number?: string;
  payment_status: 'pending' | 'paid' | 'cancelled';
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface CrewAssignment {
  id: string;
  crew_member_id: string;
  ship_id: string;
  rank: string;
  assignment_type: 'sign_on' | 'sign_off' | 'transfer';
  assignment_date: string;
  effective_date: string;
  port?: string;
  reason?: string;
  contract_start_date?: string;
  contract_end_date?: string;
  salary_amount?: number;
  salary_currency?: string;
  approved_by?: string;
  approval_date?: string;
  status: 'draft' | 'pending_approval' | 'approved' | 'cancelled';
  notes?: string;
  created_at: string;
  updated_at: string;
}