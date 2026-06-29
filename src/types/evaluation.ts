export interface CrewEvaluation {
  id: string;
  crew_member_id: string;
  evaluation_period_start: string;
  evaluation_period_end: string;
  ship_id?: string;
  evaluator_name?: string;
  evaluator_rank?: string;
  professional_knowledge?: number;
  work_performance?: number;
  safety_awareness?: number;
  teamwork?: number;
  leadership?: number;
  communication?: number;
  discipline?: number;
  reliability?: number;
  overall_rating?: number;
  strengths?: string;
  areas_for_improvement?: string;
  recommendation?: 'highly_recommend' | 'recommend' | 'neutral' | 'not_recommend';
  comments?: string;
  status: 'draft' | 'submitted' | 'acknowledged';
  acknowledged_by_crew?: boolean;
  acknowledged_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CrewEvaluationWithDetails extends CrewEvaluation {
  crew_name: string;
  rank_name: string;
  rank_code: string;
  ship_name?: string;
}
