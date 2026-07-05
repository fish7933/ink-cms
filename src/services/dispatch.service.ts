import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/store';
import { approvalDocumentService } from '@/services/approval-document.service';
import type {
  CrewDispatchOrder,
  CrewDispatchOrderWithDetails,
  CrewDispatchOrderInput,
  DispatchStatus,
} from '@/types/dispatch';
import type { CrewMember } from '@/types/models';

const DISPATCH_ORDER_DOCUMENT_TYPE_CODE = 'dispatch_order';

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
  // 결재 상신 (범용 결재 엔진 연동 — 기안자 소속 부서 기준으로 결재라인 자동 구성)
  // ─────────────────────────────────────────
  async submitDispatchOrderForApproval(orderId: string, crewName: string, dispatchType: 'promotion' | 'demotion'): Promise<{ ok: boolean; message?: string }> {
    const currentUser = await getCurrentUser();
    if (!currentUser) return { ok: false, message: '로그인 정보를 확인할 수 없습니다.' };

    const { data: membership } = await supabase
      .from('org_unit_members')
      .select('org_unit_id')
      .eq('user_id', currentUser.id)
      .limit(1)
      .maybeSingle();
    if (!membership) {
      return { ok: false, message: '작성자가 소속된 부서가 없습니다. 조직도에서 소속 부서를 먼저 지정해주세요.' };
    }

    const { data: docType } = await supabase
      .from('approval_document_types')
      .select('id')
      .eq('code', DISPATCH_ORDER_DOCUMENT_TYPE_CODE)
      .single();
    if (!docType) return { ok: false, message: '승진/강등 발령 결재 문서유형이 설정되어 있지 않습니다.' };

    try {
      const doc = await approvalDocumentService.createDocument({
        document_type_id: docType.id,
        title: `${dispatchType === 'promotion' ? '승진' : '강등'} 발령 - ${crewName}`,
        org_unit_id: membership.org_unit_id,
        created_by: currentUser.id,
        reference_type: 'crew_dispatch_order',
        reference_id: orderId,
      });

      await supabase
        .from('crew_dispatch_orders')
        .update({
          approval_document_id: doc.id,
          status: doc.status === 'approved' ? 'approved' : 'pending_approval',
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId);

      if (doc.status === 'approved') {
        await supabase.rpc('execute_dispatch_order', { order_id: orderId });
      }

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
