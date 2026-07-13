import { supabase } from '@/lib/supabase';
import { createApprovalEngine } from './approval-engine';

// 두 날짜 사이의 개월수(연*12+월 차이) — ContractManagementPage의 계약기간 자동계산과 동일한 방식
function monthsBetween(start: string, end: string): number {
  const s = new Date(start), e = new Date(end);
  return (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
}

// 계약 결재 — 채용 결재(approval.service.ts)와 동일한 결재선 기반 다단계 승인 구조.
// 배승 실행 시 crew_contracts가 draft로 자동 생성되고, 이 결재가 최종 승인되어야 active로 전환된다.
export const contractApprovalService = createApprovalEngine({
  requestTable: 'crew_contract_approvals',
  actionTable: 'crew_contract_approval_actions',
  targetIdColumn: 'crew_contract_id',
  domain: 'contract',
  async onFinalApproved(contractId: string) {
    const { data: contract, error: fetchError } = await supabase
      .from('crew_contracts')
      .select('crew_member_id, ship_id, start_date, end_date')
      .eq('id', contractId)
      .single();
    if (fetchError) throw fetchError;

    const { error } = await supabase
      .from('crew_contracts')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', contractId);
    if (error) throw error;

    // 계약 결재가 승인되면 실제 급여 기준일인 계약 시작일/만료일을 승선 중 기록(승선일/계약개월)에
    // 반영해, 선원 목록에 표시되는 승선일/하선예정일이 배승 당시 계획값이 아니라 계약값으로 고정되게 한다.
    if (contract?.crew_member_id && contract.start_date && contract.end_date) {
      const now = new Date().toISOString();
      let embarkQuery = supabase
        .from('crew_embarkation_records')
        .update({ embark_date: contract.start_date, contract_months: monthsBetween(contract.start_date, contract.end_date), updated_at: now })
        .eq('crew_member_id', contract.crew_member_id)
        .eq('status', 'active');
      if (contract.ship_id) embarkQuery = embarkQuery.eq('ship_id', contract.ship_id);
      await embarkQuery;

      await supabase
        .from('sea_service_records')
        .update({ sign_on_date: contract.start_date, updated_at: now })
        .eq('crew_member_id', contract.crew_member_id)
        .eq('record_type', 'company_assignment')
        .is('sign_off_date', null);
    }
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
