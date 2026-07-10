import { supabase } from '@/lib/supabase';
import type {
  ApprovalLine,
  ApprovalLineStep,
  ApprovalLineWithSteps,
  CrewRecommendationApproval,
  CrewRecommendationApprovalWithDetails,
  ApprovalAction,
} from '@/types/approval';
import { crewRecommendationService } from './crew-recommendation.service';

class ApprovalService {
  // Approval Lines Management
  // companyId가 없으면(admin 등) 전체 공통(company_id 없음) 결재선만 조회
  async getApprovalLines(companyId: string | null): Promise<ApprovalLineWithSteps[]> {
    let query = supabase
      .from('approval_lines')
      .select('*')
      .eq('is_active', true)
      .order('name');
    query = companyId
      ? query.or(`company_id.eq.${companyId},company_id.is.null`)
      : query.is('company_id', null);
    const { data: lines, error: linesError } = await query;

    if (linesError) throw linesError;
    if (!lines) return [];

    // Get steps for all lines
    const lineIds = lines.map(l => l.id);
    const { data: steps, error: stepsError } = await supabase
      .from('approval_line_steps')
      .select('*')
      .in('approval_line_id', lineIds)
      .order('step_order');

    if (stepsError) throw stepsError;

    // Get approver details
    if (steps && steps.length > 0) {
      const approverIds = [...new Set(steps.map(s => s.approver_id))];
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, name, role')
        .in('id', approverIds);

      if (usersError) throw usersError;

      // Create a map of user details
      const usersMap = new Map((users || []).map(u => [u.id, u]));

      // Enrich steps with approver details
      const enrichedSteps = steps.map(step => {
        const user = usersMap.get(step.approver_id);
        return {
          ...step,
          approver_name: user?.name || 'Unknown',
          approver_role: user?.role,
        };
      });

      // Map steps to lines
      return lines.map(line => ({
        ...line,
        steps: enrichedSteps.filter(s => s.approval_line_id === line.id),
      }));
    }

    // Map steps to lines (no enrichment needed if no steps)
    return lines.map(line => ({
      ...line,
      steps: [],
    }));
  }

  async createApprovalLine(
    companyId: string,
    name: string,
    description: string,
    steps: Omit<ApprovalLineStep, 'id' | 'approval_line_id' | 'created_at'>[]
  ): Promise<ApprovalLineWithSteps> {
    // Create approval line
    const { data: line, error: lineError } = await supabase
      .from('approval_lines')
      .insert({
        company_id: companyId,
        name,
        description,
        is_active: true,
      })
      .select()
      .single();

    if (lineError) throw lineError;

    // Create steps
    const stepsToInsert = steps.map(step => ({
      ...step,
      approval_line_id: line.id,
    }));

    const { data: createdSteps, error: stepsError } = await supabase
      .from('approval_line_steps')
      .insert(stepsToInsert)
      .select();

    if (stepsError) throw stepsError;

    return {
      ...line,
      steps: createdSteps || [],
    };
  }

  async updateApprovalLine(
    lineId: string,
    updates: Partial<Pick<ApprovalLine, 'name' | 'description' | 'is_active'>>
  ): Promise<void> {
    const { error } = await supabase
      .from('approval_lines')
      .update(updates)
      .eq('id', lineId);

    if (error) throw error;
  }

  async deleteApprovalLine(lineId: string): Promise<void> {
    const { error } = await supabase
      .from('approval_lines')
      .delete()
      .eq('id', lineId);

    if (error) throw error;
  }

  // Crew Recommendation Approvals
  async createApproval(
    crewRecommendationId: string,
    approvalLineId: string,
    requesterId: string,
    requesterComment?: string
  ): Promise<CrewRecommendationApproval> {
    const { data, error } = await supabase
      .from('crew_recommendation_approvals')
      .insert({
        crew_recommendation_id: crewRecommendationId,
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
  }

  async getApprovalsByRecommendation(
    crewRecommendationId: string
  ): Promise<CrewRecommendationApprovalWithDetails[]> {
    const { data: approvals, error: approvalsError } = await supabase
      .from('crew_recommendation_approvals')
      .select('*')
      .eq('crew_recommendation_id', crewRecommendationId)
      .order('created_at', { ascending: false });

    if (approvalsError) throw approvalsError;
    if (!approvals || approvals.length === 0) return [];

    // Get approval line details
    const lineIds = [...new Set(approvals.map(a => a.approval_line_id))];
    const { data: lines, error: linesError } = await supabase
      .from('approval_lines')
      .select('*')
      .in('id', lineIds);

    if (linesError) throw linesError;

    // Get steps
    const { data: steps, error: stepsError } = await supabase
      .from('approval_line_steps')
      .select('*')
      .in('approval_line_id', lineIds)
      .order('step_order');

    if (stepsError) throw stepsError;

    // Get approver details for steps
    const stepApproverIds = [...new Set((steps || []).map(s => s.approver_id))];
    const { data: stepApprovers, error: stepApproversError } = await supabase
      .from('users')
      .select('id, name, role')
      .in('id', stepApproverIds);

    if (stepApproversError) throw stepApproversError;

    const stepApproversMap = new Map((stepApprovers || []).map(u => [u.id, u]));

    // Enrich steps with approver details
    const enrichedSteps = (steps || []).map(step => {
      const approver = stepApproversMap.get(step.approver_id);
      return {
        ...step,
        approver_name: approver?.name || 'Unknown',
        approver_role: approver?.role,
      };
    });

    // Get actions
    const approvalIds = approvals.map(a => a.id);
    const { data: actions, error: actionsError } = await supabase
      .from('approval_actions')
      .select('*')
      .in('approval_request_id', approvalIds)
      .order('created_at');

    if (actionsError) throw actionsError;

    // Get approver details for actions
    const actionApproverIds = [...new Set((actions || []).map(a => a.approver_id))];
    const { data: actionApprovers, error: actionApproversError } = await supabase
      .from('users')
      .select('id, name, role')
      .in('id', actionApproverIds);

    if (actionApproversError) throw actionApproversError;

    const actionApproversMap = new Map((actionApprovers || []).map(u => [u.id, u]));

    // Enrich actions with approver details (DB 컬럼명은 comments지만 앱 전체 컨벤션에 맞춰 comment로 노출)
    const enrichedActions = (actions || []).map(action => ({
      ...action,
      comment: action.comments as string | undefined,
      approver_name: actionApproversMap.get(action.approver_id)?.name || 'Unknown',
    }));

    // Get requester details (name and role)
    const requesterIds = [...new Set(approvals.map(a => a.requester_id))];
    const { data: requesters, error: requestersError } = await supabase
      .from('users')
      .select('id, name, role')
      .in('id', requesterIds);

    if (requestersError) throw requestersError;

    // Map data
    const linesMap = new Map((lines || []).map(l => [l.id, l]));
    const stepsMap = new Map<string, ApprovalLineStep[]>();
    enrichedSteps.forEach(s => {
      if (!stepsMap.has(s.approval_line_id)) {
        stepsMap.set(s.approval_line_id, []);
      }
      stepsMap.get(s.approval_line_id)!.push(s);
    });
    const actionsMap = new Map<string, ApprovalAction[]>();
    enrichedActions.forEach(a => {
      if (!actionsMap.has(a.approval_request_id)) {
        actionsMap.set(a.approval_request_id, []);
      }
      actionsMap.get(a.approval_request_id)!.push(a);
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
        approval_line: {
          ...line!,
          steps: lineSteps,
        },
        requester_name: requester?.name || '',
        requester_role: requester?.role,
        actions: approvalActions,
        current_approver: currentApprover,
      };
    });
  }

  async getMyPendingApprovals(userId: string): Promise<CrewRecommendationApprovalWithDetails[]> {
    console.log('Fetching pending approvals for user:', userId);
    
    // Get approval line steps where user is approver
    const { data: mySteps, error: stepsError } = await supabase
      .from('approval_line_steps')
      .select('approval_line_id, step_order')
      .eq('approver_id', userId);

    if (stepsError) {
      console.error('Error fetching user steps:', stepsError);
      throw stepsError;
    }
    
    console.log('User steps found:', mySteps?.length || 0);
    if (!mySteps || mySteps.length === 0) return [];

    // Get pending approvals for those lines
    const lineIds = [...new Set(mySteps.map(s => s.approval_line_id))];
    console.log('Checking lines:', lineIds);
    
    const { data: approvals, error: approvalsError } = await supabase
      .from('crew_recommendation_approvals')
      .select('*')
      .in('approval_line_id', lineIds)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (approvalsError) {
      console.error('Error fetching pending approvals:', approvalsError);
      throw approvalsError;
    }
    
    console.log('Pending approvals found (raw):', approvals?.length || 0);
    if (!approvals || approvals.length === 0) return [];

    // Filter approvals where current step matches user's step
    const myApprovals = approvals.filter(approval => {
      // Find all steps for this user in this approval line (user might be in multiple steps)
      const userStepsInLine = mySteps.filter(s => s.approval_line_id === approval.approval_line_id);
      
      // Check if any of the user's steps match the current step of the approval
      const isMyTurn = userStepsInLine.some(s => s.step_order === approval.current_step);
      
      if (isMyTurn) {
        console.log(`Approval ${approval.id} is waiting for user at step ${approval.current_step}`);
      }
      
      return isMyTurn;
    });

    console.log('Filtered approvals (my turn):', myApprovals.length);
    if (myApprovals.length === 0) return [];

    // Get full details
    return this.getApprovalDetails(myApprovals.map(a => a.id));
  }

  async getApprovalDetails(approvalIds: string[]): Promise<CrewRecommendationApprovalWithDetails[]> {
    const { data: approvals, error: approvalsError } = await supabase
      .from('crew_recommendation_approvals')
      .select('*')
      .in('id', approvalIds);

    if (approvalsError) throw approvalsError;
    if (!approvals || approvals.length === 0) return [];

    // Get approval line details
    const lineIds = [...new Set(approvals.map(a => a.approval_line_id))];
    const { data: lines, error: linesError } = await supabase
      .from('approval_lines')
      .select('*')
      .in('id', lineIds);

    if (linesError) throw linesError;

    // Get steps
    const { data: steps, error: stepsError } = await supabase
      .from('approval_line_steps')
      .select('*')
      .in('approval_line_id', lineIds)
      .order('step_order');

    if (stepsError) throw stepsError;

    // Get approver details for steps
    const stepApproverIds = [...new Set((steps || []).map(s => s.approver_id))];
    const { data: stepApprovers, error: stepApproversError } = await supabase
      .from('users')
      .select('id, name, role')
      .in('id', stepApproverIds);

    if (stepApproversError) throw stepApproversError;

    const stepApproversMap = new Map((stepApprovers || []).map(u => [u.id, u]));

    // Enrich steps with approver details
    const enrichedSteps = (steps || []).map(step => {
      const approver = stepApproversMap.get(step.approver_id);
      return {
        ...step,
        approver_name: approver?.name || 'Unknown',
        approver_role: approver?.role,
      };
    });

    // Get actions
    const { data: actions, error: actionsError } = await supabase
      .from('approval_actions')
      .select('*')
      .in('approval_request_id', approvalIds)
      .order('created_at');

    if (actionsError) throw actionsError;

    // Get approver details for actions
    const actionApproverIds = [...new Set((actions || []).map(a => a.approver_id))];
    const { data: actionApprovers, error: actionApproversError } = await supabase
      .from('users')
      .select('id, name, role')
      .in('id', actionApproverIds);

    if (actionApproversError) throw actionApproversError;

    const actionApproversMap = new Map((actionApprovers || []).map(u => [u.id, u]));

    // Enrich actions with approver details (DB 컬럼명은 comments지만 앱 전체 컨벤션에 맞춰 comment로 노출)
    const enrichedActions = (actions || []).map(action => ({
      ...action,
      comment: action.comments as string | undefined,
      approver_name: actionApproversMap.get(action.approver_id)?.name || 'Unknown',
    }));

    // Get requester details (name and role)
    const requesterIds = [...new Set(approvals.map(a => a.requester_id))];
    const { data: requesters, error: requestersError } = await supabase
      .from('users')
      .select('id, name, role')
      .in('id', requesterIds);

    if (requestersError) throw requestersError;

    // Map data
    const linesMap = new Map((lines || []).map(l => [l.id, l]));
    const stepsMap = new Map<string, ApprovalLineStep[]>();
    enrichedSteps.forEach(s => {
      if (!stepsMap.has(s.approval_line_id)) {
        stepsMap.set(s.approval_line_id, []);
      }
      stepsMap.get(s.approval_line_id)!.push(s);
    });
    const actionsMap = new Map<string, ApprovalAction[]>();
    enrichedActions.forEach(a => {
      if (!actionsMap.has(a.approval_request_id)) {
        actionsMap.set(a.approval_request_id, []);
      }
      actionsMap.get(a.approval_request_id)!.push(a);
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
        approval_line: {
          ...line!,
          steps: lineSteps,
        },
        requester_name: requester?.name || '',
        requester_role: requester?.role,
        actions: approvalActions,
        current_approver: currentApprover,
      };
    });
  }

  async approveStep(
    approvalId: string,
    approverId: string,
    comment?: string
  ): Promise<void> {
    // Get current approval
    const { data: approval, error: approvalError } = await supabase
      .from('crew_recommendation_approvals')
      .select('*, approval_line_id, current_step')
      .eq('id', approvalId)
      .single();

    if (approvalError) throw approvalError;

    // Get approval line steps
    const { data: steps, error: stepsError } = await supabase
      .from('approval_line_steps')
      .select('*')
      .eq('approval_line_id', approval.approval_line_id)
      .order('step_order');

    if (stepsError) throw stepsError;

    // Create approval action
    const { error: actionError } = await supabase
      .from('approval_actions')
      .insert({
        approval_request_id: approvalId,
        step_order: approval.current_step,
        approver_id: approverId,
        action: 'approved',
        comments: comment,
      });

    if (actionError) throw actionError;

    // Check if this is the last step
    const isLastStep = approval.current_step >= (steps?.length || 0);

    if (isLastStep) {
      // Final approval - update crew recommendation status to accepted
      const { error: updateError } = await supabase
        .from('crew_recommendation_approvals')
        .update({
          status: 'approved',
          completed_at: new Date().toISOString(),
        })
        .eq('id', approvalId);

      if (updateError) throw updateError;

      // Update crew recommendation status
      const { error: recError } = await supabase
        .from('crew_recommendations')
        .update({ status: 'accepted' })
        .eq('id', approval.crew_recommendation_id);

      if (recError) throw recError;

      // 최종 승인되면 등록 선원 목록에도 바로 반영되도록 자동 등록
      await crewRecommendationService.registerCrewFromRecommendation(approval.crew_recommendation_id);
    } else {
      // Move to next step
      const { error: updateError } = await supabase
        .from('crew_recommendation_approvals')
        .update({
          current_step: approval.current_step + 1,
        })
        .eq('id', approvalId);

      if (updateError) throw updateError;
    }
  }

  async rejectStep(
    approvalId: string,
    approverId: string,
    comment: string
  ): Promise<void> {
    // Get current approval
    const { data: approval, error: approvalError } = await supabase
      .from('crew_recommendation_approvals')
      .select('crew_recommendation_id, current_step')
      .eq('id', approvalId)
      .single();

    if (approvalError) throw approvalError;

    // Create approval action
    const { error: actionError } = await supabase
      .from('approval_actions')
      .insert({
        approval_request_id: approvalId,
        step_order: approval.current_step,
        approver_id: approverId,
        action: 'rejected',
        comments: comment,
      });

    if (actionError) throw actionError;

    // Update approval status to rejected
    const { error: updateError } = await supabase
      .from('crew_recommendation_approvals')
      .update({
        status: 'rejected',
        final_comment: comment,
        completed_at: new Date().toISOString(),
      })
      .eq('id', approvalId);

    if (updateError) throw updateError;

    // Update crew recommendation status to rejected
    const { error: recError } = await supabase
      .from('crew_recommendations')
      .update({ status: 'rejected' })
      .eq('id', approval.crew_recommendation_id);

    if (recError) throw recError;
  }

  async cancelApproval(approvalId: string): Promise<void> {
    const { error } = await supabase
      .from('crew_recommendation_approvals')
      .update({
        status: 'cancelled',
        completed_at: new Date().toISOString(),
      })
      .eq('id', approvalId);

    if (error) throw error;
  }

  // 관리자 전용: 결재라인 무관하게 모든 대기 결재 조회
  async getAllPendingApprovals(): Promise<CrewRecommendationApprovalWithDetails[]> {
    const { data: approvals, error } = await supabase
      .from('crew_recommendation_approvals')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!approvals || approvals.length === 0) return [];

    return this.getApprovalDetails(approvals.map(a => a.id));
  }

  // 관리자 전용: 상태 무관 전체 선원추천 결재 조회 ("결재함"에서 전체보기)
  async getAllApprovals(): Promise<CrewRecommendationApprovalWithDetails[]> {
    const { data: approvals, error } = await supabase
      .from('crew_recommendation_approvals')
      .select('id')
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!approvals || approvals.length === 0) return [];

    return this.getApprovalDetails(approvals.map(a => a.id));
  }

  // 일반 사용자용: 나와 관계있는 선원추천 결재 전체 (요청자 본인 / 결재선에 포함된 결재자) — 상태 무관.
  // "결재함"의 기본 노출 범위 — 시스템관리자 이상은 getAllApprovals()로 전체를 본다.
  async getMyRelatedApprovals(userId: string): Promise<CrewRecommendationApprovalWithDetails[]> {
    const [requestedRes, stepsRes] = await Promise.all([
      supabase.from('crew_recommendation_approvals').select('id').eq('requester_id', userId),
      supabase.from('approval_line_steps').select('approval_line_id').eq('approver_id', userId),
    ]);
    if (requestedRes.error) throw requestedRes.error;
    if (stepsRes.error) throw stepsRes.error;

    const approvalIds = new Set<string>((requestedRes.data || []).map(r => r.id));
    const lineIds = [...new Set((stepsRes.data || []).map(s => s.approval_line_id))];
    if (lineIds.length > 0) {
      const { data: onMyLines, error } = await supabase
        .from('crew_recommendation_approvals')
        .select('id')
        .in('approval_line_id', lineIds);
      if (error) throw error;
      for (const a of onMyLines || []) approvalIds.add(a.id);
    }
    if (approvalIds.size === 0) return [];
    return this.getApprovalDetails([...approvalIds]);
  }

  // 관리자 전용: 결재라인 무관하게 즉시 승인
  async adminForceApprove(approvalId: string, adminId: string, comment?: string): Promise<void> {
    const { data: approval, error: approvalError } = await supabase
      .from('crew_recommendation_approvals')
      .select('crew_recommendation_id, current_step')
      .eq('id', approvalId)
      .single();

    if (approvalError) throw approvalError;

    await supabase.from('approval_actions').insert({
      approval_request_id: approvalId,
      step_order: approval.current_step,
      approver_id: adminId,
      action: 'approved',
      comments: comment || '관리자 즉시 승인',
    });

    const { error: updateError } = await supabase
      .from('crew_recommendation_approvals')
      .update({ status: 'approved', completed_at: new Date().toISOString() })
      .eq('id', approvalId);

    if (updateError) throw updateError;

    const { error: recError } = await supabase
      .from('crew_recommendations')
      .update({ status: 'accepted' })
      .eq('id', approval.crew_recommendation_id);

    if (recError) throw recError;

    // 최종 승인되면 등록 선원 목록에도 바로 반영되도록 자동 등록
    await crewRecommendationService.registerCrewFromRecommendation(approval.crew_recommendation_id);
  }

  // 관리자 전용: 결재라인 무관하게 즉시 반려
  async adminForceReject(approvalId: string, adminId: string, comment: string): Promise<void> {
    const { data: approval, error: approvalError } = await supabase
      .from('crew_recommendation_approvals')
      .select('crew_recommendation_id, current_step')
      .eq('id', approvalId)
      .single();

    if (approvalError) throw approvalError;

    await supabase.from('approval_actions').insert({
      approval_request_id: approvalId,
      step_order: approval.current_step,
      approver_id: adminId,
      action: 'rejected',
      comments: comment,
    });

    const { error: updateError } = await supabase
      .from('crew_recommendation_approvals')
      .update({ status: 'rejected', final_comment: comment, completed_at: new Date().toISOString() })
      .eq('id', approvalId);

    if (updateError) throw updateError;

    const { error: recError } = await supabase
      .from('crew_recommendations')
      .update({ status: 'rejected' })
      .eq('id', approval.crew_recommendation_id);

    if (recError) throw recError;
  }
}

export const approvalService = new ApprovalService();