import { supabase } from '@/lib/supabase';
import { calculateAccruedLeaveHours, type LeaveBalance } from '@/lib/leave-calc';
import type { ShoreLeaveRequest, ShoreLeaveRequestWithDetails, ShoreLeaveAdjustment } from '@/types/shore-leave';

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

export async function getLeaveRequestsByUser(userId: string): Promise<ShoreLeaveRequest[]> {
  return getMyLeaveRequests(userId);
}

// 승인된 연차 신청 시간의 합 (해당 사용자 기준, 전체 기간 — 연도 구분 없이 입사일 기준 누적)
export async function getUsedLeaveHours(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('shore_leave_requests')
    .select('hours')
    .eq('user_id', userId)
    .eq('status', 'approved');
  if (error) throw error;
  return (data || []).reduce((sum, r) => sum + Number(r.hours), 0);
}

export async function getLeaveAdjustments(userId: string): Promise<ShoreLeaveAdjustment[]> {
  const { data, error } = await supabase
    .from('shore_leave_adjustments')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function addLeaveAdjustment(input: {
  user_id: string;
  adjustment_type: 'grant' | 'manual_use';
  hours: number;
  reason?: string;
  created_by: string;
}): Promise<ShoreLeaveAdjustment> {
  const { data, error } = await supabase
    .from('shore_leave_adjustments')
    .insert({
      user_id: input.user_id,
      adjustment_type: input.adjustment_type,
      hours: input.hours,
      reason: input.reason || null,
      created_by: input.created_by,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteLeaveAdjustment(id: string): Promise<void> {
  const { error } = await supabase.from('shore_leave_adjustments').delete().eq('id', id);
  if (error) throw error;
}

async function getAdjustmentTotals(userId: string): Promise<{ grantHours: number; manualUseHours: number }> {
  const { data, error } = await supabase
    .from('shore_leave_adjustments')
    .select('adjustment_type, hours')
    .eq('user_id', userId);
  if (error) throw error;
  let grantHours = 0;
  let manualUseHours = 0;
  for (const r of data || []) {
    if (r.adjustment_type === 'grant') grantHours += Number(r.hours);
    else manualUseHours += Number(r.hours);
  }
  return { grantHours, manualUseHours };
}

// 잔여 연차 = (법정 발생시간 + 수동 부여시간) - (승인된 신청시간 + 수동 사용 입력시간)
export async function getLeaveBalance(userId: string, hireDate: string | null): Promise<LeaveBalance> {
  const [requestUsedHours, { grantHours, manualUseHours }] = await Promise.all([
    getUsedLeaveHours(userId),
    getAdjustmentTotals(userId),
  ]);
  const accruedHours = (hireDate ? calculateAccruedLeaveHours(hireDate) : 0) + grantHours;
  const usedHours = requestUsedHours + manualUseHours;
  return { accruedHours, usedHours, remainingHours: Math.round((accruedHours - usedHours) * 10) / 10 };
}

export async function addLeaveRequest(input: {
  user_id: string;
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  hours: number;
  reason?: string;
  approval_document_id?: string;
}): Promise<ShoreLeaveRequest> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('shore_leave_requests')
    .insert({
      user_id: input.user_id,
      start_date: input.start_date,
      start_time: input.start_time,
      end_date: input.end_date,
      end_time: input.end_time,
      hours: input.hours,
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
