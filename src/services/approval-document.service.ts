import { supabase } from '@/lib/supabase';
import { orgChartService } from '@/services/org-chart.service';
import type { ApprovalChainStep } from '@/types/org-chart';
import type {
  ApprovalDocumentType,
  ApprovalAuthorityLimit,
  ApprovalDocument,
  ApprovalDocumentStep,
  ApprovalDocumentWithDetails,
} from '@/types/approval-document';

const SELF_APPROVE_COMMENT = '본인 기안으로 자동 승인 처리됨';
const ALREADY_PROCESSED_ERROR = '이미 처리되었거나 결재 순서가 아닙니다.';

// 전결규정에 지정된 직급의 position_order(선임도 기준값)를 조회
async function resolveAuthorityThreshold(documentTypeId: string): Promise<number | undefined> {
  const { data: limit } = await supabase
    .from('approval_authority_limits')
    .select('position_id')
    .eq('document_type_id', documentTypeId)
    .maybeSingle();
  if (!limit) return undefined;
  const { data: position } = await supabase
    .from('shore_positions')
    .select('display_order')
    .eq('id', limit.position_id)
    .single();
  return position?.display_order ?? undefined;
}

async function enrichDocuments(docs: ApprovalDocument[]): Promise<ApprovalDocumentWithDetails[]> {
  if (docs.length === 0) return [];
  const docIds = docs.map(d => d.id);
  const typeIds = [...new Set(docs.map(d => d.document_type_id))];
  const creatorIds = [...new Set(docs.map(d => d.created_by))];
  const unitIds = [...new Set(docs.map(d => d.org_unit_id).filter((id): id is string => !!id))];

  const [stepsRes, typesRes, creatorsRes, unitsRes] = await Promise.all([
    supabase.from('approval_document_steps').select('*').in('document_id', docIds).order('step_order'),
    supabase.from('approval_document_types').select('id, name').in('id', typeIds),
    supabase.from('users').select('id, name').in('id', creatorIds),
    unitIds.length > 0 ? supabase.from('org_units').select('id, name').in('id', unitIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const typesMap = new Map((typesRes.data || []).map(t => [t.id, t.name]));
  const creatorsMap = new Map((creatorsRes.data || []).map(c => [c.id, c.name]));
  const unitsMap = new Map((unitsRes.data || []).map(u => [u.id, u.name]));
  const stepsByDoc = new Map<string, ApprovalDocumentStep[]>();
  for (const s of (stepsRes.data || [])) {
    if (!stepsByDoc.has(s.document_id)) stepsByDoc.set(s.document_id, []);
    stepsByDoc.get(s.document_id)!.push(s);
  }

  return docs.map(d => ({
    ...d,
    document_type_name: typesMap.get(d.document_type_id) || '알 수 없음',
    creator_name: creatorsMap.get(d.created_by) || '알 수 없음',
    org_unit_name: d.org_unit_id ? (unitsMap.get(d.org_unit_id) || null) : null,
    steps: stepsByDoc.get(d.id) || [],
  }));
}

export const approvalDocumentService = {
  async getDocumentTypes(includeInactive = false): Promise<ApprovalDocumentType[]> {
    let query = supabase.from('approval_document_types').select('*').order('name');
    if (!includeInactive) query = query.eq('is_active', true);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async createDocumentType(input: { code: string; name: string }): Promise<ApprovalDocumentType> {
    const { data, error } = await supabase
      .from('approval_document_types')
      .insert({ code: input.code, name: input.name })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateDocumentType(id: string, updates: Partial<Pick<ApprovalDocumentType, 'code' | 'name' | 'is_active'>>): Promise<void> {
    const { error } = await supabase
      .from('approval_document_types')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  async getAuthorityLimits(): Promise<ApprovalAuthorityLimit[]> {
    const { data, error } = await supabase.from('approval_authority_limits').select('*');
    if (error) throw error;
    return data || [];
  },

  // positionId가 null이면 전결규정 해제(끝까지 결재)
  async setAuthorityLimit(documentTypeId: string, positionId: string | null): Promise<void> {
    if (positionId === null) {
      const { error } = await supabase.from('approval_authority_limits').delete().eq('document_type_id', documentTypeId);
      if (error) throw error;
      return;
    }
    const { error } = await supabase
      .from('approval_authority_limits')
      .upsert({ document_type_id: documentTypeId, position_id: positionId, updated_at: new Date().toISOString() }, { onConflict: 'document_type_id' });
    if (error) throw error;
  },

  // 기안서 작성 화면에서 부서/문서유형 선택 시 결재라인 미리보기용
  async previewChain(orgUnitId: string, documentTypeId: string): Promise<ApprovalChainStep[]> {
    const [units, members, threshold] = await Promise.all([
      orgChartService.getOrgUnits(),
      orgChartService.getOrgMembers(),
      resolveAuthorityThreshold(documentTypeId),
    ]);
    return orgChartService.buildApprovalChain(orgUnitId, units, members, threshold);
  },

  async createDocument(input: {
    document_type_id: string;
    title: string;
    content?: string;
    org_unit_id: string;
    created_by: string;
    requester_comment?: string;
  }): Promise<ApprovalDocumentWithDetails> {
    const chain = await this.previewChain(input.org_unit_id, input.document_type_id);
    if (chain.length === 0) {
      throw new Error('선택한 부서에서 결재라인을 구성할 수 없습니다. 부서장(또는 소속 인원)이 지정되어 있는지 확인해주세요.');
    }

    const now = new Date().toISOString();
    // 기안자 본인이 결재라인에 포함돼 있으면 그 단계는 생성 시점에 자동 승인 처리
    const stepRows = chain.map((c, i) => {
      const isSelf = c.approver_id === input.created_by;
      return {
        step_order: i + 1,
        approver_id: c.approver_id,
        approver_name: c.approver_name,
        approver_label: c.approver_role,
        status: (isSelf ? 'approved' : 'pending') as 'approved' | 'pending',
        comment: isSelf ? SELF_APPROVE_COMMENT : null,
        acted_at: isSelf ? now : null,
      };
    });

    const firstPending = stepRows.find(s => s.status === 'pending');
    const allApproved = !firstPending;

    const { data: doc, error: docError } = await supabase
      .from('approval_documents')
      .insert({
        document_type_id: input.document_type_id,
        title: input.title,
        content: input.content || null,
        org_unit_id: input.org_unit_id,
        created_by: input.created_by,
        requester_comment: input.requester_comment || null,
        status: allApproved ? 'approved' : 'pending',
        current_step: allApproved ? stepRows.length : firstPending!.step_order,
        completed_at: allApproved ? now : null,
      })
      .select()
      .single();
    if (docError) throw docError;

    const { data: steps, error: stepsError } = await supabase
      .from('approval_document_steps')
      .insert(stepRows.map(s => ({ ...s, document_id: doc.id })))
      .select();
    if (stepsError) throw stepsError;

    const [enriched] = await enrichDocuments([doc]);
    return { ...enriched, steps: (steps || []) as ApprovalDocumentStep[] };
  },

  async getMyDraftedDocuments(userId: string): Promise<ApprovalDocumentWithDetails[]> {
    const { data, error } = await supabase
      .from('approval_documents')
      .select('*')
      .eq('created_by', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return enrichDocuments(data || []);
  },

  async getMyPendingDocumentApprovals(userId: string): Promise<ApprovalDocumentWithDetails[]> {
    const { data: mySteps, error: stepsError } = await supabase
      .from('approval_document_steps')
      .select('document_id, step_order')
      .eq('approver_id', userId)
      .eq('status', 'pending');
    if (stepsError) throw stepsError;
    if (!mySteps || mySteps.length === 0) return [];

    const docIds = [...new Set(mySteps.map(s => s.document_id))];
    const { data: docs, error: docsError } = await supabase
      .from('approval_documents')
      .select('*')
      .in('id', docIds)
      .eq('status', 'pending');
    if (docsError) throw docsError;
    if (!docs) return [];

    const myStepOrdersByDoc = new Map<string, number[]>();
    for (const s of mySteps) {
      if (!myStepOrdersByDoc.has(s.document_id)) myStepOrdersByDoc.set(s.document_id, []);
      myStepOrdersByDoc.get(s.document_id)!.push(s.step_order);
    }
    const myTurnDocs = docs.filter(d => (myStepOrdersByDoc.get(d.id) || []).includes(d.current_step));
    return enrichDocuments(myTurnDocs);
  },

  // 관리자 전용: 결재라인 무관하게 모든 대기 문서 조회
  async getAllPendingDocumentApprovals(): Promise<ApprovalDocumentWithDetails[]> {
    const { data, error } = await supabase
      .from('approval_documents')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return enrichDocuments(data || []);
  },

  async getDocumentDetails(documentIds: string[]): Promise<ApprovalDocumentWithDetails[]> {
    if (documentIds.length === 0) return [];
    const { data, error } = await supabase.from('approval_documents').select('*').in('id', documentIds);
    if (error) throw error;
    return enrichDocuments(data || []);
  },

  async approveDocumentStep(documentId: string, approverId: string, comment?: string): Promise<void> {
    const { data: doc, error: docError } = await supabase
      .from('approval_documents')
      .select('current_step')
      .eq('id', documentId)
      .single();
    if (docError) throw docError;

    const { count: totalSteps, error: countError } = await supabase
      .from('approval_document_steps')
      .select('id', { count: 'exact', head: true })
      .eq('document_id', documentId);
    if (countError) throw countError;

    const now = new Date().toISOString();
    // 동시성 가드: 현재 단계가 아직 pending일 때만 갱신되게 조건을 걸고, 실제로 갱신됐는지 확인
    const { data: updatedSteps, error: stepError } = await supabase
      .from('approval_document_steps')
      .update({ status: 'approved', comment: comment || null, acted_at: now })
      .eq('document_id', documentId)
      .eq('step_order', doc.current_step)
      .eq('status', 'pending')
      .select();
    if (stepError) throw stepError;
    if (!updatedSteps || updatedSteps.length === 0) throw new Error(ALREADY_PROCESSED_ERROR);

    const isLastStep = doc.current_step >= (totalSteps || 0);
    if (isLastStep) {
      const { error } = await supabase
        .from('approval_documents')
        .update({ status: 'approved', completed_at: now })
        .eq('id', documentId)
        .eq('status', 'pending');
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('approval_documents')
        .update({ current_step: doc.current_step + 1 })
        .eq('id', documentId)
        .eq('status', 'pending');
      if (error) throw error;
    }
  },

  async rejectDocumentStep(documentId: string, approverId: string, comment: string): Promise<void> {
    const { data: doc, error: docError } = await supabase
      .from('approval_documents')
      .select('current_step')
      .eq('id', documentId)
      .single();
    if (docError) throw docError;

    const now = new Date().toISOString();
    const { data: updatedSteps, error: stepError } = await supabase
      .from('approval_document_steps')
      .update({ status: 'rejected', comment, acted_at: now })
      .eq('document_id', documentId)
      .eq('step_order', doc.current_step)
      .eq('status', 'pending')
      .select();
    if (stepError) throw stepError;
    if (!updatedSteps || updatedSteps.length === 0) throw new Error(ALREADY_PROCESSED_ERROR);

    const { error } = await supabase
      .from('approval_documents')
      .update({ status: 'rejected', final_comment: comment, completed_at: now })
      .eq('id', documentId)
      .eq('status', 'pending');
    if (error) throw error;
  },

  // 관리자 전용: 결재라인 무관하게 즉시 승인
  async adminForceApproveDocumentStep(documentId: string, adminId: string, comment?: string): Promise<void> {
    const { data: doc, error: docError } = await supabase
      .from('approval_documents')
      .select('current_step')
      .eq('id', documentId)
      .single();
    if (docError) throw docError;

    const now = new Date().toISOString();
    await supabase
      .from('approval_document_steps')
      .update({ status: 'approved', comment: comment || `관리자(${adminId}) 즉시 승인`, acted_at: now })
      .eq('document_id', documentId)
      .eq('step_order', doc.current_step);

    const { error } = await supabase
      .from('approval_documents')
      .update({ status: 'approved', completed_at: now })
      .eq('id', documentId);
    if (error) throw error;
  },

  // 관리자 전용: 결재라인 무관하게 즉시 반려
  async adminForceRejectDocumentStep(documentId: string, adminId: string, comment: string): Promise<void> {
    const { data: doc, error: docError } = await supabase
      .from('approval_documents')
      .select('current_step')
      .eq('id', documentId)
      .single();
    if (docError) throw docError;

    const now = new Date().toISOString();
    await supabase
      .from('approval_document_steps')
      .update({ status: 'rejected', comment: `[관리자 ${adminId}] ${comment}`, acted_at: now })
      .eq('document_id', documentId)
      .eq('step_order', doc.current_step);

    const { error } = await supabase
      .from('approval_documents')
      .update({ status: 'rejected', final_comment: comment, completed_at: now })
      .eq('id', documentId);
    if (error) throw error;
  },

  async cancelDocument(documentId: string): Promise<void> {
    const { error } = await supabase
      .from('approval_documents')
      .update({ status: 'cancelled', completed_at: new Date().toISOString() })
      .eq('id', documentId);
    if (error) throw error;
  },
};
