export interface SickLeaveAttachment {
  name: string;
  path: string;
  size: number;
  type: string;
}

export interface SickLeaveRequest {
  id: string;
  user_id: string;
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  hours: number;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  approval_document_id: string | null;
  cancellation_document_id: string | null;
  cancellation_reason: string | null;
  attachments: SickLeaveAttachment[];
  created_at: string;
  updated_at: string;
}

export interface SickLeaveRequestWithDetails extends SickLeaveRequest {
  user_name: string;
}
