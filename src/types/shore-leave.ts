export interface ShoreLeaveRequest {
  id: string;
  user_id: string;
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  hours: number;
  reason: string | null;
  // 신청 시점 스냅샷 — 신청 후 다른 신청이 추가/취소되며 "현재" 잔여 연차가 계속 바뀌므로,
  // 결재문서(시행문)에는 신청 당시의 값을 그대로 보여줘야 한다.
  remaining_hours_after: number | null;
  leave_year_start_date: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  approval_document_id: string | null;
  cancellation_document_id: string | null;
  cancellation_reason: string | null;
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

export interface ShoreLeaveReset {
  id: string;
  user_id: string;
  reset_at: string;
  deleted_history: boolean;
  reset_grants: boolean;
  reason: string | null;
  created_by: string;
  created_at: string;
}

export interface ShoreLeaveAdminLog {
  id: string;
  user_id: string;
  action_type: 'grant' | 'manual_use' | 'reset' | 'exempt_on' | 'exempt_off' | 'cancel_annual' | 'cancel_sick';
  hours: number | null;
  reason: string | null;
  performed_by: string;
  created_at: string;
}

export interface ShoreLeaveAdminLogWithNames extends ShoreLeaveAdminLog {
  user_name: string;
  performed_by_name: string;
}
