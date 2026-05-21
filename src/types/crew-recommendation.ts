export interface CrewRecommendation {
  id: string;
  job_application_id: string;
  crew_id: string;
  ship_id: string;
  rank_id: string;
  recommended_by: string;
  recommendation_date: string;
  proposed_salary: number | null;
  proposed_join_date: string | null;
  status: 'pending' | 'internal_review' | 'owner_review' | 'approved' | 'rejected' | 'cancelled';
  internal_approval_status: 'pending' | 'approved' | 'rejected' | null;
  owner_approval_status: 'pending' | 'approved' | 'rejected' | null;
  rejection_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecommendationApproval {
  id: string;
  recommendation_id: string;
  approver_id: string;
  approver_type: 'internal' | 'owner';
  action: 'approved' | 'rejected' | 'pending';
  comments: string | null;
  acted_at: string;
  created_at: string;
}