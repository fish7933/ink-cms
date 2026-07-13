import { supabase } from '@/lib/supabase';
import { createApprovalEngine } from './approval-engine';

// 계약 결재 — 채용 결재(approval.service.ts)와 동일한 결재선 기반 다단계 승인 구조.
// 배승 실행 시 crew_contracts가 draft로 자동 생성되고, 이 결재가 최종 승인되어야 active로 전환된다.
export const contractApprovalService = createApprovalEngine({
  requestTable: 'crew_contract_approvals',
  actionTable: 'crew_contract_approval_actions',
  targetIdColumn: 'crew_contract_id',
  async onFinalApproved(contractId: string) {
    const { error } = await supabase
      .from('crew_contracts')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', contractId);
    if (error) throw error;
  },
  async onRejected(contractId: string) {
    // 결재 반려 시에도 계약 자체를 삭제하지 않고 draft로 남겨 재상신할 수 있게 한다.
    const { error } = await supabase
      .from('crew_contracts')
      .update({ status: 'draft', updated_at: new Date().toISOString() })
      .eq('id', contractId);
    if (error) throw error;
  },
});
