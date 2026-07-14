import { supabase } from '@/lib/supabase';
import { createApprovalEngine } from './approval-engine';

// 배승(교대계획) 결재 — 채용 결재(approval.service.ts)와 동일한 결재선 기반 다단계 승인 구조.
export const rotationApprovalService = createApprovalEngine({
  requestTable: 'rotation_plan_approvals',
  actionTable: 'rotation_plan_approval_actions',
  targetIdColumn: 'crew_rotation_plan_id',
  domain: 'rotation',
  documentTypeCode: 'rotation_plan',
  async onFinalApproved(planId: string) {
    const { error } = await supabase
      .from('crew_rotation_plans')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('id', planId);
    if (error) throw error;
  },
  async onRejected(planId: string) {
    const { error } = await supabase
      .from('crew_rotation_plans')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', planId);
    if (error) throw error;
  },
});
