export interface ShoreLeaveRequest {
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

export interface ShoreLeaveRequestWithDetails extends ShoreLeaveRequest {
  user_name: string;
}

export interface ShoreLeaveAdjustment {
  id: string;
  user_id: string;
  adjustment_type: 'grant' | 'manual_use';
  hours: number;
  reason: string | null;
  created_by: string;
  created_at: string;
}
