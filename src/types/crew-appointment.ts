export interface CrewAppointment {
  id: string;
  crew_id: string;
  ship_id: string;
  rank_id: string;
  appointment_type: 'boarding' | 'disembarking';
  appointment_date: string;
  port_name: string | null;
  port_country: string | null;
  contract_start_date: string | null;
  contract_end_date: string | null;
  salary_amount: number | null;
  status: 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'executed' | 'cancelled';
  approval_line_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  executed_by: string | null;
  executed_at: string | null;
  rejection_reason: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface AppointmentDocument {
  id: string;
  appointment_id: string;
  document_type: 'appointment_letter' | 'contract' | 'travel_order' | 'other';
  file_url: string;
  file_name: string;
  generated_at: string;
  created_at: string;
}