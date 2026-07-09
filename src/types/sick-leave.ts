export interface SickLeaveRequest {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  hours: number;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  approval_document_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SickLeaveRequestWithDetails extends SickLeaveRequest {
  user_name: string;
}
