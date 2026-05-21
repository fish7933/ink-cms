import { supabase } from '@/lib/supabase';
import type {
  ApprovalLine,
  ApprovalLineStep,
  ApprovalLineWithSteps,
  CrewRecommendationApproval,
  CrewRecommendationApprovalWithDetails,
  ApprovalAction,
} from '@/types/approval';

class ApprovalService {
  // Approval Lines Management
  async getApprovalLines(companyId: string): Promise<ApprovalLineWithSteps[]> {
    const { data: lines, error: linesError } = await supabase
      .from('approval_lines')
      .select('*')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('name');

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
      .in('crew_recommendation_approval_id', approvalIds)
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

    // Enrich actions with approver details
    const enrichedActions = (actions || []).map(action => ({
      ...action,
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
      if (!actionsMap.has(a.crew_recommendation_approval_id)) {
        actionsMap.set(a.crew_recommendation_approval_id, []);
      }
      actionsMap.get(a.crew_recommendation_approval_id)!.push(a);
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
      .in('crew_recommendation_approval_id', approvalIds)
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

    // Enrich actions with approver details
    const enrichedActions = (actions || []).map(action => ({
      ...action,
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
      if (!actionsMap.has(a.crew_recommendation_approval_id)) {
        actionsMap.set(a.crew_recommendation_approval_id, []);
      }
      actionsMap.get(a.crew_recommendation_approval_id)!.push(a);
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
        crew_recommendation_approval_id: approvalId,
        step_order: approval.current_step,
        approver_id: approverId,
        action: 'approved',
        comment,
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
        crew_recommendation_approval_id: approvalId,
        step_order: approval.current_step,
        approver_id: approverId,
        action: 'rejected',
        comment,
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
}

export const approvalService = new ApprovalService();