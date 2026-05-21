export type CrewStatus = 
  | 'registered'           // 등록됨
  | 'under_review'        // 검토중
  | 'sent_to_owner'       // 선주 송부
  | 'owner_approved'      // 선주 승인
  | 'owner_rejected'      // 선주 거절
  | 'onboard'            // 승선중
  | 'standby'            // 하선 후 대기중
  | 'deployment_decided'; // 승선 결정

export interface CrewStatusHistory {
  id: string;
  crew_member_id: string;
  from_status?: string;
  to_status: string;
  changed_by?: string;
  changed_at: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export interface CrewStatusInfo {
  status: CrewStatus;
  reviewer_id?: string;
  reviewer_name?: string;
  review_started_at?: string;
  sent_to_owner_at?: string;
  owner_decision_at?: string;
  owner_decision_by?: string;
  owner_decision_by_name?: string;
  current_ship_id?: string;
  current_ship_name?: string;
  onboard_date?: string;
  offboard_date?: string;
  status_notes?: string;
}

export const CREW_STATUS_LABELS: Record<CrewStatus, string> = {
  registered: '등록됨',
  under_review: '검토중',
  sent_to_owner: '선주 송부',
  owner_approved: '선주 승인',
  owner_rejected: '선주 거절',
  onboard: '승선중',
  standby: '하선 후 대기중',
  deployment_decided: '승선 결정',
};

export const CREW_STATUS_COLORS: Record<CrewStatus, string> = {
  registered: 'bg-gray-500',
  under_review: 'bg-blue-500',
  sent_to_owner: 'bg-purple-500',
  owner_approved: 'bg-green-500',
  owner_rejected: 'bg-red-500',
  onboard: 'bg-cyan-600',
  standby: 'bg-yellow-500',
  deployment_decided: 'bg-emerald-500',
};