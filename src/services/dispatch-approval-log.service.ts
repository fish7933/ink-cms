import { supabase } from '@/lib/supabase';

export interface DispatchApprovalDeletionLog {
  id: string;
  domain: 'rotation' | 'contract' | 'dispatch';
  target_id: string | null;
  subject_label: string;
  requester_id: string | null;
  requester_name: string;
  approval_line_name?: string;
  final_status: string;
  actions: { step_order: number; approver_name: string; action: string; comment?: string; created_at: string }[];
  requested_at?: string;
  completed_at?: string;
  deleted_by: string;
  deleted_by_name: string;
  deleted_at: string;
}

// 발령 결재함(배승/계약/승진강등)의 삭제 이력함: crew_recommendation_approval_log와 별개로,
// 3개 도메인이 공용으로 쓰는 dispatch_approval_deletion_log를 조회/영구삭제한다.
export const dispatchApprovalLogService = {
  async getDeletionLogs(): Promise<DispatchApprovalDeletionLog[]> {
    const { data, error } = await supabase
      .from('dispatch_approval_deletion_log')
      .select('*')
      .order('deleted_at', { ascending: false });
    if (error) throw error;
    return (data || []) as DispatchApprovalDeletionLog[];
  },

  // 시스템관리자 이상 전용
  async deleteDeletionLog(id: string): Promise<void> {
    const { error } = await supabase.from('dispatch_approval_deletion_log').delete().eq('id', id);
    if (error) throw error;
  },
};
