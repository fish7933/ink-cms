import { supabase } from '@/lib/supabase';
import { calculateAccruedLeaveHours, getCurrentLeaveYearStart, type LeaveBalance } from '@/lib/leave-calc';
import type { ShoreLeaveRequest, ShoreLeaveRequestWithDetails, ShoreLeaveAdjustment, ShoreLeaveReset, ShoreLeaveAdminLogWithNames } from '@/types/shore-leave';

// 관리자 전용 메뉴(육상 직원 휴가 관리)에서 발생하는 부여/차감/초기화/제외 지정-해제/강제취소를 감사
// 로그로 남긴다. UI에서 삭제 기능을 제공하지 않는 append-only 로그다. 질병휴가 강제취소도 같은
// 테이블을 함께 쓰므로 sick-leave.service.ts에서도 이 함수를 그대로 가져다 쓴다.
export async function logAdminAction(input: {
  user_id: string;
  action_type: 'grant' | 'manual_use' | 'reset' | 'exempt_on' | 'exempt_off' | 'cancel_annual' | 'cancel_sick';
  hours?: number | null;
  reason?: string | null;
  performed_by: string;
}): Promise<void> {
  const { error } = await supabase.from('shore_leave_admin_log').insert({
    user_id: input.user_id,
    action_type: input.action_type,
    hours: input.hours ?? null,
    reason: input.reason || null,
    performed_by: input.performed_by,
  });
  if (error) console.error('shore_leave_admin_log 기록 실패 (마이그레이션 미적용 가능성)', error);
}

// 관리자 작업 로그 전체 조회 (전 직원 대상, 최신순) — 육상 직원 연차 관리 화면에 표시한다.
export async function getAdminActionLog(): Promise<ShoreLeaveAdminLogWithNames[]> {
  const { data, error } = await supabase
    .from('shore_leave_admin_log')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { console.error('shore_leave_admin_log 조회 실패 (마이그레이션 미적용 가능성)', error); return []; }
  const rows = data || [];
  if (rows.length === 0) return [];

  const userIds = [...new Set([...rows.map(r => r.user_id), ...rows.map(r => r.performed_by)])];
  const { data: users, error: userError } = await supabase.from('users').select('id, name').in('id', userIds);
  if (userError) throw userError;
  const nameMap = new Map((users || []).map(u => [u.id, u.name]));

  return rows.map(r => ({
    ...r,
    user_name: nameMap.get(r.user_id) || '알 수 없음',
    performed_by_name: nameMap.get(r.performed_by) || '알 수 없음',
  }));
}

// 슈퍼관리자(admin) 전용 — 화면에서도 admin 역할로 접근을 제한해야 한다.
export async function deleteAdminActionLog(logId: string): Promise<void> {
  const { error } = await supabase.from('shore_leave_admin_log').delete().eq('id', logId);
  if (error) throw error;
}

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
// 누가 지정/해제했는지 관리자 작업 로그에 남긴다.
export async function setLeaveExempt(userId: string, exempt: boolean, performedBy: string): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ is_leave_exempt: exempt, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw error;
  await logAdminAction({ user_id: userId, action_type: exempt ? 'exempt_on' : 'exempt_off', performed_by: performedBy });
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

// 회사 부여(grant)까지 초기화하도록 지정된 가장 최근 초기화 시점 (없으면 null).
async function getLatestGrantResetAt(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('shore_leave_resets')
    .select('reset_at')
    .eq('user_id', userId)
    .eq('reset_grants', true)
    .order('reset_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) { console.error('shore_leave_resets 조회 실패 (마이그레이션 미적용 가능성)', error); return null; }
  return data?.reset_at || null;
}

// 승인된 연차 신청 시간의 합. 수동 초기화 이후분(resetAt) + 이번 연차년도(leaveYearStart, 휴가 실사용일 기준) 것만 카운트한다.
export async function getUsedLeaveHours(userId: string, resetAt?: string | null, leaveYearStart?: string | null): Promise<number> {
  let query = supabase
    .from('shore_leave_requests')
    .select('hours')
    .eq('user_id', userId)
    .eq('status', 'approved');
  if (resetAt) query = query.gt('created_at', resetAt);
  if (leaveYearStart) query = query.gte('start_date', leaveYearStart);
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
  await logAdminAction({ user_id: input.user_id, action_type: input.adjustment_type, hours: input.hours, reason: input.reason, performed_by: input.created_by });
  return data;
}

export async function deleteLeaveAdjustment(id: string): Promise<void> {
  const { error } = await supabase.from('shore_leave_adjustments').delete().eq('id', id);
  if (error) throw error;
}

// 수동 사용 입력(manual_use)은 usageResetAt 이후분만, 회사 부여(grant)는 grantResetAt이 지정된 경우에만 그 이후분으로 제한한다.
// leaveYearStart가 있으면 두 종류 모두 이번 연차년도(가장 최근 발생일 이후) 것만 추가로 걸러낸다.
async function getAdjustmentTotals(
  userId: string,
  usageResetAt?: string | null,
  grantResetAt?: string | null,
  leaveYearStart?: string | null,
): Promise<{ grantHours: number; manualUseHours: number }> {
  const { data, error } = await supabase
    .from('shore_leave_adjustments')
    .select('adjustment_type, hours, created_at')
    .eq('user_id', userId);
  if (error) throw error;
  let grantHours = 0;
  let manualUseHours = 0;
  for (const r of data || []) {
    const withinLeaveYear = !leaveYearStart || r.created_at.slice(0, 10) >= leaveYearStart;
    if (!withinLeaveYear) continue;
    if (r.adjustment_type === 'grant') {
      if (!grantResetAt || r.created_at > grantResetAt) grantHours += Number(r.hours);
    } else if (!usageResetAt || r.created_at > usageResetAt) {
      manualUseHours += Number(r.hours);
    }
  }
  return { grantHours, manualUseHours };
}

// 잔여 연차 = (법정 발생시간 + 회사 부여시간) - (승인된 신청시간 + 수동 사용 입력시간).
// 수동 초기화 이후분 + 이번 연차년도(입사일 기준 가장 최근 발생일 이후) 것만 반영한다 — 지난 연차년도에
// 사용했거나 부여받은 것은 새 발생일이 지나면 자동으로 잔여 계산에서 빠진다(이월 없음).
export async function getLeaveBalance(userId: string, hireDate: string | null): Promise<LeaveBalance> {
  const leaveYearStart = hireDate ? getCurrentLeaveYearStart(hireDate) : null;
  const [resetAt, grantResetAt] = await Promise.all([getLatestResetAt(userId), getLatestGrantResetAt(userId)]);
  const [requestUsedHours, { grantHours, manualUseHours }] = await Promise.all([
    getUsedLeaveHours(userId, resetAt, leaveYearStart),
    getAdjustmentTotals(userId, resetAt, grantResetAt, leaveYearStart),
  ]);
  const legalAccruedHours = hireDate ? calculateAccruedLeaveHours(hireDate) : 0;
  const companyGrantedHours = grantHours;
  const accruedHours = legalAccruedHours + companyGrantedHours;
  const usedHours = requestUsedHours + manualUseHours;
  return { legalAccruedHours, companyGrantedHours, accruedHours, usedHours, remainingHours: Math.round((accruedHours - usedHours) * 10) / 10 };
}

// 연차 사용/잔여 초기화. deleteHistory=true면 초기화 시점 이전의 신청/수동사용(+선택 시 회사부여) 이력 자체를
// 삭제하고, false면 이력은 남기되(내역 조회에는 계속 노출) 잔여 계산에서만 제외한다.
// resetGrants=true면 회사 부여(grant) 연차도 함께 초기화 대상에 포함한다 (기본은 사용/잔여만).
export async function resetLeaveUsage(input: {
  user_id: string;
  delete_history: boolean;
  reset_grants: boolean;
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
      reset_grants: input.reset_grants,
      reason: input.reason || null,
      created_by: input.created_by,
    })
    .select()
    .single();
  if (error) throw error;

  if (input.delete_history) {
    const deletes = [
      supabase.from('shore_leave_requests').delete().eq('user_id', input.user_id).lte('created_at', resetAt),
      supabase.from('shore_leave_adjustments').delete().eq('user_id', input.user_id).eq('adjustment_type', 'manual_use').lte('created_at', resetAt),
    ];
    if (input.reset_grants) {
      deletes.push(supabase.from('shore_leave_adjustments').delete().eq('user_id', input.user_id).eq('adjustment_type', 'grant').lte('created_at', resetAt));
    }
    for (const { error: delError } of await Promise.all(deletes)) {
      if (delError) throw delError;
    }
  }

  const detail = [input.reset_grants ? '회사부여 포함' : null, input.delete_history ? '내역삭제' : null].filter(Boolean).join(', ');
  await logAdminAction({
    user_id: input.user_id,
    action_type: 'reset',
    reason: detail ? `${input.reason || ''} (${detail})`.trim() : input.reason,
    performed_by: input.created_by,
  });

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

// 관리자가 아직 시작되지 않은(=사용되지 않은) 승인 연차를 결재 없이 즉시 강제 취소한다.
// 본인 신청 취소(결재 필요)와 달리 관리자 권한으로 바로 확정되며, 작업 로그에 남는다.
export async function forceCancelLeaveRequest(input: { id: string; user_id: string; hours: number; reason: string; performed_by: string }): Promise<void> {
  const { error } = await supabase
    .from('shore_leave_requests')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', input.id);
  if (error) throw error;
  await logAdminAction({ user_id: input.user_id, action_type: 'cancel_annual', hours: input.hours, reason: input.reason, performed_by: input.performed_by });
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

// 이미 승인된 연차의 취소 신청 — 취소 결재문서를 만든 뒤 여기로 연결해둔다. 원본의 status는
// 그대로 'approved'로 남아있다가, 취소 결재가 실제로 승인되는 순간에만 'cancelled'로 바뀐다
// (applyReferenceSideEffect의 'shore_leave_cancellation' 케이스에서 처리).
export async function linkLeaveCancellationDocument(leaveRequestId: string, documentId: string, reason: string): Promise<void> {
  const { error } = await supabase
    .from('shore_leave_requests')
    .update({ cancellation_document_id: documentId, cancellation_reason: reason, updated_at: new Date().toISOString() })
    .eq('id', leaveRequestId);
  if (error) throw error;
}
