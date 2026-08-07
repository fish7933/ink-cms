import { supabase } from '@/lib/supabase';
import { logAdminAction } from '@/services/shore-leave.service';
import type { SickLeaveRequest, SickLeaveRequestWithDetails, SickLeaveAttachment } from '@/types/sick-leave';

export async function getMySickLeaveRequests(userId: string): Promise<SickLeaveRequest[]> {
  const { data, error } = await supabase
    .from('sick_leave_requests')
    .select('*')
    .eq('user_id', userId)
    .order('start_date', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getAllSickLeaveRequests(): Promise<SickLeaveRequestWithDetails[]> {
  const { data, error } = await supabase
    .from('sick_leave_requests')
    .select('*, users!user_id(name)')
    .order('start_date', { ascending: false });
  if (error) throw error;
  return (data || []).map((r: Record<string, unknown>) => {
    const user = r.users as { name: string } | null;
    return { ...r, user_name: user?.name || '알 수 없음' } as SickLeaveRequestWithDetails;
  });
}

// 질병휴가는 연차와 달리 잔여 한도가 없어, 참고용으로 누적 사용 시간만 집계한다.
export async function getUsedSickLeaveHours(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('sick_leave_requests')
    .select('hours')
    .eq('user_id', userId)
    .eq('status', 'approved');
  if (error) throw error;
  return (data || []).reduce((sum, r) => sum + Number(r.hours), 0);
}

export async function addSickLeaveRequest(input: {
  user_id: string;
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  hours: number;
  reason?: string;
  approval_document_id?: string;
}): Promise<SickLeaveRequest> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('sick_leave_requests')
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

export async function cancelSickLeaveRequest(id: string): Promise<void> {
  const { error } = await supabase
    .from('sick_leave_requests')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// 관리자가 아직 시작되지 않은(=사용되지 않은) 승인 질병휴가를 결재 없이 즉시 강제 취소한다.
// shore-leave.service.ts의 forceCancelLeaveRequest와 동일한 패턴, 작업 로그도 같은 테이블에 남긴다.
export async function forceCancelSickLeaveRequest(input: { id: string; user_id: string; hours: number; reason: string; performed_by: string }): Promise<void> {
  const { error } = await supabase
    .from('sick_leave_requests')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', input.id);
  if (error) throw error;
  await logAdminAction({ user_id: input.user_id, action_type: 'cancel_sick', hours: input.hours, reason: input.reason, performed_by: input.performed_by });
}

export async function deleteSickLeaveRequest(id: string): Promise<void> {
  const { error } = await supabase.from('sick_leave_requests').delete().eq('id', id);
  if (error) throw error;
}

export async function linkSickLeaveRequestDocument(sickLeaveRequestId: string, documentId: string): Promise<void> {
  const { error } = await supabase
    .from('sick_leave_requests')
    .update({ approval_document_id: documentId, updated_at: new Date().toISOString() })
    .eq('id', sickLeaveRequestId);
  if (error) throw error;
}

// 이미 승인된 질병휴가의 취소 신청 — shore-leave.service.ts의 linkLeaveCancellationDocument와 동일한 패턴.
export async function linkSickLeaveCancellationDocument(sickLeaveRequestId: string, documentId: string, reason: string): Promise<void> {
  const { error } = await supabase
    .from('sick_leave_requests')
    .update({ cancellation_document_id: documentId, cancellation_reason: reason, updated_at: new Date().toISOString() })
    .eq('id', sickLeaveRequestId);
  if (error) throw error;
}

// 질병휴가는 신청 시점이 아니라 사후에 증빙(진단서 등)을 첨부할 수 있어야 하므로,
// 상태와 무관하게 언제든 첨부파일 목록을 갱신할 수 있게 별도 함수로 둔다.
export async function updateSickLeaveAttachments(id: string, attachments: SickLeaveAttachment[]): Promise<void> {
  const { error } = await supabase
    .from('sick_leave_requests')
    .update({ attachments, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}
