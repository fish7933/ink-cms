import { supabase } from '@/lib/supabase';
import { calculateLeaveBalance, type LeaveBalance } from '@/lib/leave-calc';
import type { ShoreLeaveRequest, ShoreLeaveRequestWithDetails } from '@/types/shore-leave';

export async function getMyLeaveRequests(userId: string): Promise<ShoreLeaveRequest[]> {
  const { data, error } = await supabase
    .from('shore_leave_requests')
    .select('*')
    .eq('user_id', userId)
    .order('start_date', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getAllLeaveRequests(): Promise<ShoreLeaveRequestWithDetails[]> {
  const { data, error } = await supabase
    .from('shore_leave_requests')
    .select('*, users!user_id(name)')
    .order('start_date', { ascending: false });
  if (error) throw error;
  return (data || []).map((r: Record<string, unknown>) => {
    const user = r.users as { name: string } | null;
    return { ...r, user_name: user?.name || '알 수 없음' } as ShoreLeaveRequestWithDetails;
  });
}

// 승인된 연차 신청 일수의 합 (해당 사용자 기준, 전체 기간 — 연도 구분 없이 입사일 기준 누적)
export async function getUsedLeaveDays(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('shore_leave_requests')
    .select('days')
    .eq('user_id', userId)
    .eq('status', 'approved');
  if (error) throw error;
  return (data || []).reduce((sum, r) => sum + Number(r.days), 0);
}

export async function getLeaveBalance(userId: string, hireDate: string | null): Promise<LeaveBalance> {
  if (!hireDate) return { accrued: 0, used: 0, remaining: 0 };
  const used = await getUsedLeaveDays(userId);
  return calculateLeaveBalance(hireDate, used);
}

export async function addLeaveRequest(input: {
  user_id: string;
  start_date: string;
  end_date: string;
  days: number;
  reason?: string;
  approval_document_id?: string;
}): Promise<ShoreLeaveRequest> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('shore_leave_requests')
    .insert({
      user_id: input.user_id,
      start_date: input.start_date,
      end_date: input.end_date,
      days: input.days,
      reason: input.reason || null,
      approval_document_id: input.approval_document_id || null,
      status: 'pending',
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function cancelLeaveRequest(id: string): Promise<void> {
  const { error } = await supabase
    .from('shore_leave_requests')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteLeaveRequest(id: string): Promise<void> {
  const { error } = await supabase.from('shore_leave_requests').delete().eq('id', id);
  if (error) throw error;
}

export async function linkLeaveRequestDocument(leaveRequestId: string, documentId: string): Promise<void> {
  const { error } = await supabase
    .from('shore_leave_requests')
    .update({ approval_document_id: documentId, updated_at: new Date().toISOString() })
    .eq('id', leaveRequestId);
  if (error) throw error;
}
