import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/store';
import { dispatchOrderApprovalService } from '@/services/dispatch-order-approval.service';
import type {
  CrewDispatchOrder,
  CrewDispatchOrderWithDetails,
  CrewDispatchOrderInput,
  DispatchStatus,
} from '@/types/dispatch';
import type { CrewMember } from '@/types/models';

export const dispatchService = {
  // ─────────────────────────────────────────
  // 발령 목록 조회
  // ─────────────────────────────────────────
  async getDispatchOrders(filters?: {
    crew_member_id?: string;
    ship_id?: string;
    status?: DispatchStatus;
    dispatch_type?: 'promotion' | 'demotion';
  }): Promise<CrewDispatchOrderWithDetails[]> {
    let query = supabase
      .from('crew_dispatch_orders')
      .select(`
        *,
        crew:crew_members!crew_dispatch_orders_crew_member_id_fkey(id, name),
        ship:ships!crew_dispatch_orders_ship_id_fkey(id, name),
        previous_rank:ranks!crew_dispatch_orders_previous_rank_id_fkey(id, name, rank_code),
        new_rank:ranks!crew_dispatch_orders_new_rank_id_fkey(id, name, rank_code),
        creator:users!crew_dispatch_orders_created_by_fkey(id, name)
      `)
      .order('created_at', { ascending: false });

    if (filters?.crew_member_id) query = query.eq('crew_member_id', filters.crew_member_id);
    if (filters?.ship_id) query = query.eq('ship_id', filters.ship_id);
    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.dispatch_type) query = query.eq('dispatch_type', filters.dispatch_type);

    const { data, error } = await query;
    if (error) { console.error('Error fetching dispatch orders:', error); return []; }

    return (data || []).map(d => ({
      ...d,
      crew_name: d.crew?.name || '',
      ship_name: d.ship?.name || null,
      previous_rank_name: d.previous_rank?.name || null,
      previous_rank_code: d.previous_rank?.rank_code || null,
      new_rank_name: d.new_rank?.name || null,
      new_rank_code: d.new_rank?.rank_code || null,
      created_by_name: d.creator?.name || '',
    }));
  },

  // ─────────────────────────────────────────
  // 발령 생성 (draft)
  // ─────────────────────────────────────────
  async createDispatchOrder(input: CrewDispatchOrderInput): Promise<CrewDispatchOrder | null> {
    const currentUser = await getCurrentUser();
    if (!currentUser) return null;

    const { data, error } = await supabase
      .from('crew_dispatch_orders')
      .insert([{ ...input, status: 'draft', created_by: currentUser.id }])
      .select()
      .single();

    if (error) { console.error('Error creating dispatch order:', error); return null; }
    return data;
  },

  // ─────────────────────────────────────────
  // 발령 수정
  // ─────────────────────────────────────────
  async updateDispatchOrder(
    id: string,
    updates: Partial<CrewDispatchOrderInput>,
  ): Promise<CrewDispatchOrder | null> {
    const { data, error } = await supabase
      .from('crew_dispatch_orders')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) { console.error('Error updating dispatch order:', error); return null; }
    return data;
  },

  // ─────────────────────────────────────────
  // 결재 상신 — 채용/배승/계약 결재와 동일하게 결재선을 직접 선택
  // ─────────────────────────────────────────
  async submitDispatchOrderForApproval(orderId: string, approvalLineId: string, comment?: string): Promise<{ ok: boolean; message?: string }> {
    const currentUser = await getCurrentUser();
    if (!currentUser) return { ok: false, message: '로그인 정보를 확인할 수 없습니다.' };

    try {
      await dispatchOrderApprovalService.createApproval(orderId, approvalLineId, currentUser.id, comment);

      await supabase
        .from('crew_dispatch_orders')
        .update({ status: 'pending_approval', updated_at: new Date().toISOString() })
        .eq('id', orderId);

      return { ok: true };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : '결재 상신 중 오류가 발생했습니다.' };
    }
  },

  // ─────────────────────────────────────────
  // 발령 실행 (결재 완료 후)
  // ─────────────────────────────────────────
  async executeDispatchOrder(orderId: string): Promise<boolean> {
    const { error } = await supabase.rpc('execute_dispatch_order', { order_id: orderId });
    if (error) { console.error('Error executing dispatch order:', error); return false; }
    return true;
  },

  // ─────────────────────────────────────────
  // 삭제 (draft 상태만)
  // ─────────────────────────────────────────
  async deleteDispatchOrder(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('crew_dispatch_orders')
      .delete()
      .eq('id', id)
      .eq('status', 'draft');

    if (error) { console.error('Error deleting dispatch order:', error); return false; }
    return true;
  },

  // ─────────────────────────────────────────
  // 카테고리별 선원 조회
  // ─────────────────────────────────────────
  async getCrewByCategory(category: 'registered' | 'standby' | 'onboard' | 'disembarked'): Promise<CrewMember[]> {
    let query = supabase.from('crew_members').select('*');

    if (category === 'registered') {
      query = query.in('status', ['registered', 'under_review', 'sent_to_owner', 'owner_approved', 'owner_rejected']);
    } else if (category === 'onboard') {
      query = query.eq('status', 'onboard');
    } else if (category === 'standby') {
      // deployment_decided 또는 교대계획에 포함된 standby
      query = query.in('status', ['deployment_decided', 'standby']);
      // TODO: 교대계획 포함 여부로 필터링 (추후 개선)
    } else if (category === 'disembarked') {
      query = query.eq('status', 'standby');
    }

    const { data, error } = await query.order('name');
    if (error) { console.error('Error fetching crew by category:', error); return []; }
    return data || [];
  },
};
