import { supabase } from '@/lib/supabase';
import type {
  ApprovalLineStep,
  ApprovalAction,
} from '@/types/approval';

// crew_recommendation_approvals(채용 결재, approval.service.ts)와 동일한 구조(결재선 기반
// 다단계 승인)를 다른 대상(배승/계약 등)에도 재사용하기 위한 공통 엔진. 결재선(approval_lines/
// approval_line_steps)은 대상에 상관없이 공유한다 — 대상별로 다른 건 요청 테이블/액션 테이블과
// 최종 승인·반려 시 대상 엔티티에 반영할 후속 처리뿐이다.

export interface ApprovalRequest {
  id: string;
  approval_line_id: string;
  requester_id: string;
  requester_comment?: string;
  current_step: number;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  final_comment?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  [targetIdColumn: string]: unknown;
}

export interface ApprovalRequestWithDetails extends ApprovalRequest {
  approval_line: { id: string; name: string; steps: ApprovalLineStep[] };
  requester_name: string;
  requester_role?: string;
  actions: ApprovalAction[];
  current_approver?: ApprovalLineStep;
}

export interface ApprovalEngineConfig {
  requestTable: string;
  actionTable: string;
  targetIdColumn: string;
  onFinalApproved: (targetId: string) => Promise<void>;
  onRejected: (targetId: string) => Promise<void>;
}

export function createApprovalEngine(config: ApprovalEngineConfig) {
  const { requestTable, actionTable, targetIdColumn, onFinalApproved, onRejected } = config;

  async function enrichDetails(approvals: ApprovalRequest[]): Promise<ApprovalRequestWithDetails[]> {
    if (approvals.length === 0) return [];

    const lineIds = [...new Set(approvals.map(a => a.approval_line_id))];
    const { data: lines, error: linesError } = await supabase.from('approval_lines').select('*').in('id', lineIds);
    if (linesError) throw linesError;

    const { data: steps, error: stepsError } = await supabase
      .from('approval_line_steps').select('*').in('approval_line_id', lineIds).order('step_order');
    if (stepsError) throw stepsError;

    const stepApproverIds = [...new Set((steps || []).map(s => s.approver_id))];
    const { data: stepApprovers, error: stepApproversError } = await supabase
      .from('users').select('id, name, role').in('id', stepApproverIds);
    if (stepApproversError) throw stepApproversError;
    const stepApproversMap = new Map((stepApprovers || []).map(u => [u.id, u]));

    const enrichedSteps = (steps || []).map(step => {
      const approver = stepApproversMap.get(step.approver_id);
      return { ...step, approver_name: approver?.name || 'Unknown', approver_role: approver?.role };
    });

    const approvalIds = approvals.map(a => a.id);
    const { data: actions, error: actionsError } = await supabase
      .from(actionTable).select('*').in('approval_request_id', approvalIds).order('created_at');
    if (actionsError) throw actionsError;

    const actionApproverIds = [...new Set((actions || []).map(a => a.approver_id))];
    const { data: actionApprovers, error: actionApproversError } = await supabase
      .from('users').select('id, name, role').in('id', actionApproverIds);
    if (actionApproversError) throw actionApproversError;
    const actionApproversMap = new Map((actionApprovers || []).map(u => [u.id, u]));

    const enrichedActions = (actions || []).map(action => ({
      ...action,
      comment: action.comments as string | undefined,
      approver_name: actionApproversMap.get(action.approver_id)?.name || 'Unknown',
    }));

    const requesterIds = [...new Set(approvals.map(a => a.requester_id))];
    const { data: requesters, error: requestersError } = await supabase
      .from('users').select('id, name, role').in('id', requesterIds);
    if (requestersError) throw requestersError;

    const linesMap = new Map((lines || []).map(l => [l.id, l]));
    const stepsMap = new Map<string, ApprovalLineStep[]>();
    enrichedSteps.forEach(s => {
      const arr = stepsMap.get(s.approval_line_id) || [];
      arr.push(s);
      stepsMap.set(s.approval_line_id, arr);
    });
    const actionsMap = new Map<string, ApprovalAction[]>();
    enrichedActions.forEach(a => {
      const arr = actionsMap.get(a.approval_request_id) || [];
      arr.push(a);
      actionsMap.set(a.approval_request_id, arr);
    });
    const requestersMap = new Map((requesters || []).map(u => [u.id, { name: u.name, role: u.role }]));

    return approvals.map(approval => {
      const line = linesMap.get(approval.approval_line_id);
      const lineSteps = stepsMap.get(approval.approval_line_id) || [];
      const approvalActions = actionsMap.get(approval.id) || [];
      const currentApprover = lineSteps.find(s => s.step_order === approval.current_step);
      const requester = requestersMap.get(approval.requester_id);

      return {
        ...approval,
        approval_line: { ...line!, steps: lineSteps },
        requester_name: requester?.name || '',
        requester_role: requester?.role,
        actions: approvalActions,
        current_approver: currentApprover,
      };
    });
  }

  async function getDetails(approvalIds: string[]): Promise<ApprovalRequestWithDetails[]> {
    const { data: approvals, error } = await supabase.from(requestTable).select('*').in('id', approvalIds);
    if (error) throw error;
    return enrichDetails((approvals || []) as ApprovalRequest[]);
  }

  return {
    async createApproval(targetId: string, approvalLineId: string, requesterId: string, requesterComment?: string): Promise<ApprovalRequest> {
      const { data, error } = await supabase
        .from(requestTable)
        .insert({
          [targetIdColumn]: targetId,
          approval_line_id: approvalLineId,
          requester_id: requesterId,
          requester_comment: requesterComment,
          current_step: 1,
          status: 'pending',
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    async getApprovalsByTarget(targetId: string): Promise<ApprovalRequestWithDetails[]> {
      const { data: approvals, error } = await supabase
        .from(requestTable).select('*').eq(targetIdColumn, targetId).order('created_at', { ascending: false });
      if (error) throw error;
      return enrichDetails((approvals || []) as ApprovalRequest[]);
    },

    async getMyRelatedApprovals(userId: string): Promise<ApprovalRequestWithDetails[]> {
      const [requestedRes, stepsRes] = await Promise.all([
        supabase.from(requestTable).select('id').eq('requester_id', userId),
        supabase.from('approval_line_steps').select('approval_line_id').eq('approver_id', userId),
      ]);
      if (requestedRes.error) throw requestedRes.error;
      if (stepsRes.error) throw stepsRes.error;

      const approvalIds = new Set<string>((requestedRes.data || []).map((r: { id: string }) => r.id));
      const lineIds = [...new Set((stepsRes.data || []).map((s: { approval_line_id: string }) => s.approval_line_id))];
      if (lineIds.length > 0) {
        const { data: onMyLines, error } = await supabase.from(requestTable).select('id').in('approval_line_id', lineIds);
        if (error) throw error;
        for (const a of (onMyLines || []) as { id: string }[]) approvalIds.add(a.id);
      }
      if (approvalIds.size === 0) return [];
      return getDetails([...approvalIds]);
    },

    async getAllApprovals(): Promise<ApprovalRequestWithDetails[]> {
      const { data: approvals, error } = await supabase.from(requestTable).select('id').order('created_at', { ascending: false });
      if (error) throw error;
      if (!approvals || approvals.length === 0) return [];
      return getDetails(approvals.map((a: { id: string }) => a.id));
    },

    async approveStep(approvalId: string, approverId: string, comment?: string): Promise<void> {
      const { data: approval, error: approvalError } = await supabase.from(requestTable).select('*').eq('id', approvalId).single();
      if (approvalError) throw approvalError;

      const { data: steps, error: stepsError } = await supabase
        .from('approval_line_steps').select('*').eq('approval_line_id', approval.approval_line_id).order('step_order');
      if (stepsError) throw stepsError;

      const { error: actionError } = await supabase.from(actionTable).insert({
        approval_request_id: approvalId,
        step_order: approval.current_step,
        approver_id: approverId,
        action: 'approved',
        comments: comment,
      });
      if (actionError) throw actionError;

      const isLastStep = approval.current_step >= (steps?.length || 0);

      if (isLastStep) {
        const { error: updateError } = await supabase
          .from(requestTable).update({ status: 'approved', completed_at: new Date().toISOString() }).eq('id', approvalId);
        if (updateError) throw updateError;
        await onFinalApproved(approval[targetIdColumn] as string);
      } else {
        const { error: updateError } = await supabase
          .from(requestTable).update({ current_step: approval.current_step + 1 }).eq('id', approvalId);
        if (updateError) throw updateError;
      }
    },

    async rejectStep(approvalId: string, approverId: string, comment: string): Promise<void> {
      const { data: approval, error: approvalError } = await supabase.from(requestTable).select('*').eq('id', approvalId).single();
      if (approvalError) throw approvalError;

      const { error: actionError } = await supabase.from(actionTable).insert({
        approval_request_id: approvalId,
        step_order: approval.current_step,
        approver_id: approverId,
        action: 'rejected',
        comments: comment,
      });
      if (actionError) throw actionError;

      const { error: updateError } = await supabase
        .from(requestTable)
        .update({ status: 'rejected', final_comment: comment, completed_at: new Date().toISOString() })
        .eq('id', approvalId);
      if (updateError) throw updateError;

      await onRejected(approval[targetIdColumn] as string);
    },

    async adminForceApprove(approvalId: string, adminId: string, comment?: string): Promise<void> {
      const { data: approval, error: approvalError } = await supabase.from(requestTable).select('*').eq('id', approvalId).single();
      if (approvalError) throw approvalError;

      await supabase.from(actionTable).insert({
        approval_request_id: approvalId,
        step_order: approval.current_step,
        approver_id: adminId,
        action: 'approved',
        comments: comment || '관리자 즉시 승인',
      });

      const { error: updateError } = await supabase
        .from(requestTable).update({ status: 'approved', completed_at: new Date().toISOString() }).eq('id', approvalId);
      if (updateError) throw updateError;

      await onFinalApproved(approval[targetIdColumn] as string);
    },

    async adminForceReject(approvalId: string, adminId: string, comment: string): Promise<void> {
      const { data: approval, error: approvalError } = await supabase.from(requestTable).select('*').eq('id', approvalId).single();
      if (approvalError) throw approvalError;

      await supabase.from(actionTable).insert({
        approval_request_id: approvalId,
        step_order: approval.current_step,
        approver_id: adminId,
        action: 'rejected',
        comments: comment,
      });

      const { error: updateError } = await supabase
        .from(requestTable)
        .update({ status: 'rejected', final_comment: comment, completed_at: new Date().toISOString() })
        .eq('id', approvalId);
      if (updateError) throw updateError;

      await onRejected(approval[targetIdColumn] as string);
    },
  };
}
