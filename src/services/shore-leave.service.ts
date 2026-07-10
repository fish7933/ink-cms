import { supabase } from '@/lib/supabase';
import { calculateAccruedLeaveHours, type LeaveBalance } from '@/lib/leave-calc';
import type { ShoreLeaveRequest, ShoreLeaveRequestWithDetails, ShoreLeaveAdjustment, ShoreLeaveReset } from '@/types/shore-leave';

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

// 연차 적용 제외자(임원 등) 지정/해제. 직급이 아니라 사람 단위 예외라 users.is_leave_exempt를 직접 갱신한다.
export async function setLeaveExempt(userId: string, exempt: boolean): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ is_leave_exempt: exempt, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw error;
}

// 가장 최근 초기화 시점 (없으면 null) — 이 시점 이전에 생성된 신청/수동사용 조정은 잔여 계산에서 제외한다.
// shore_leave_resets 테이블은 마이그레이션(20260709000007_shore_leave_reset.sql) 적용 전에는 존재하지 않을 수 있으므로,
// 조회 실패 시 "초기화 이력 없음"으로 취급해 연차 잔여 계산 전체가 깨지지 않도록 한다.
async function getLatestResetAt(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('shore_leave_resets')
    .select('reset_at')
    .eq('user_id', userId)
    .order('reset_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) { console.error('shore_leave_resets 조회 실패 (마이그레이션 미적용 가능성)', error); return null; }
  return data?.reset_at || null;
}

export async function getLeaveResets(userId: string): Promise<ShoreLeaveReset[]> {
  const { data, error } = await supabase
    .from('shore_leave_resets')
    .select('*')
    .eq('user_id', userId)
    .order('reset_at', { ascending: false });
  if (error) { console.error('shore_leave_resets 조회 실패 (마이그레이션 미적용 가능성)', error); return []; }
  return data || [];
}

// 승인된 연차 신청 시간의 합 (해당 사용자 기준, 전체 기간 — 연도 구분 없이 입사일 기준 누적, 초기화 이후분만)
export async function getUsedLeaveHours(userId: string, resetAt?: string | null): Promise<number> {
  let query = supabase
    .from('shore_leave_requests')
    .select('hours')
    .eq('user_id', userId)
    .eq('status', 'approved');
  if (resetAt) query = query.gt('created_at', resetAt);
  const { data, error } = await query;
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

// 회사 부여(grant)는 초기화 대상이 아니므로 항상 전체 합산하고, 수동 사용 입력(manual_use)만 초기화 이후분으로 제한한다.
async function getAdjustmentTotals(userId: string, resetAt?: string | null): Promise<{ grantHours: number; manualUseHours: number }> {
  const { data, error } = await supabase
    .from('shore_leave_adjustments')
    .select('adjustment_type, hours, created_at')
    .eq('user_id', userId);
  if (error) throw error;
  let grantHours = 0;
  let manualUseHours = 0;
  for (const r of data || []) {
    if (r.adjustment_type === 'grant') grantHours += Number(r.hours);
    else if (!resetAt || r.created_at > resetAt) manualUseHours += Number(r.hours);
  }
  return { grantHours, manualUseHours };
}

// 잔여 연차 = (법정 발생시간 + 회사 부여시간) - (승인된 신청시간 + 수동 사용 입력시간, 초기화 이후분만)
export async function getLeaveBalance(userId: string, hireDate: string | null): Promise<LeaveBalance> {
  const resetAt = await getLatestResetAt(userId);
  const [requestUsedHours, { grantHours, manualUseHours }] = await Promise.all([
    getUsedLeaveHours(userId, resetAt),
    getAdjustmentTotals(userId, resetAt),
  ]);
  const legalAccruedHours = hireDate ? calculateAccruedLeaveHours(hireDate) : 0;
  const companyGrantedHours = grantHours;
  const accruedHours = legalAccruedHours + companyGrantedHours;
  const usedHours = requestUsedHours + manualUseHours;
  return { legalAccruedHours, companyGrantedHours, accruedHours, usedHours, remainingHours: Math.round((accruedHours - usedHours) * 10) / 10 };
}

// 연차 사용/잔여 초기화. deleteHistory=true면 초기화 시점 이전의 신청/수동사용 이력 자체를 삭제하고,
// false면 이력은 남기되(내역 조회에는 계속 노출) 잔여 계산에서만 제외한다. 회사 부여(grant)는 건드리지 않는다.
export async function resetLeaveUsage(input: {
  user_id: string;
  delete_history: boolean;
  reason?: string;
  created_by: string;
}): Promise<ShoreLeaveReset> {
  const resetAt = new Date().toISOString();
  const { data, error } = await supabase
    .from('shore_leave_resets')
    .insert({
      user_id: input.user_id,
      reset_at: resetAt,
      deleted_history: input.delete_history,
      reason: input.reason || null,
      created_by: input.created_by,
    })
    .select()
    .single();
  if (error) throw error;

  if (input.delete_history) {
    const [{ error: reqErr }, { error: adjErr }] = await Promise.all([
      supabase.from('shore_leave_requests').delete().eq('user_id', input.user_id).lte('created_at', resetAt),
      supabase.from('shore_leave_adjustments').delete().eq('user_id', input.user_id).eq('adjustment_type', 'manual_use').lte('created_at', resetAt),
    ]);
    if (reqErr) throw reqErr;
    if (adjErr) throw adjErr;
  }

  return data;
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
