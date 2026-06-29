export interface LeaveRequest {
  id: string;
  crew_member_id: string;
  leave_type: 'annual' | 'sick' | 'special' | 'unpaid' | 'compensatory' | 'maternity';
  start_date: string;
  end_date: string;
  total_days: number;
  reason?: string;
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'cancelled';
  approved_by?: string;
  approved_at?: string;
  rejection_reason?: string;
  ship_id?: string;
  return_date?: string;
  actual_return_date?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface LeaveRequestWithDetails extends LeaveRequest {
  crew_name: string;
  rank_name: string;
  rank_code: string;
  ship_name?: string;
  approver_name?: string;
}
