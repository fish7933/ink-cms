import { supabase } from '@/lib/supabase';
import { createApprovalEngine } from './approval-engine';

// 승진/강등 발령 결재 — 채용/배승/계약 결재와 동일한 결재선 기반 다단계 승인 구조.
// 최종 승인되면 즉시 발효(계약/승선경력/선원 직급 반영)되는 execute_dispatch_order RPC를 그대로 이어서 호출한다.
export const dispatchOrderApprovalService = createApprovalEngine({
  requestTable: 'dispatch_order_approvals',
  actionTable: 'dispatch_order_approval_actions',
  targetIdColumn: 'crew_dispatch_order_id',
  async onFinalApproved(orderId: string) {
    const { error: updateError } = await supabase
      .from('crew_dispatch_orders')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('id', orderId);
    if (updateError) throw updateError;

    const { error: rpcError } = await supabase.rpc('execute_dispatch_order', { order_id: orderId });
    if (rpcError) throw rpcError;
  },
  async onRejected(orderId: string) {
    const { error } = await supabase
      .from('crew_dispatch_orders')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', orderId);
    if (error) throw error;
  },
});
