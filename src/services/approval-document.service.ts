import { supabase } from '@/lib/supabase';
import { orgChartService } from '@/services/org-chart.service';
import { formatLeaveHours } from '@/lib/leave-calc';
import type { ApprovalChainStep } from '@/types/org-chart';
import type { ApprovalLineWithSteps } from '@/types/approval';
import type {
  ApprovalDocumentType,
  ApprovalAuthorityLimit,
  ApprovalDocument,
  ApprovalDocumentAttachment,
  ApprovalDocumentStep,
  ApprovalDocumentWithDetails,
  DocumentFormField,
} from '@/types/approval-document';

// 문서유형의 전결규정(조직도 기반 자동계산)과 별개로, 결재선 관리에서 고른 결재라인을
// 그대로 기안서 결재 단계로 쓰고 싶을 때 ApprovalChainStep[] 형태로 변환해준다.
export function approvalLineToChainSteps(line: ApprovalLineWithSteps): ApprovalChainStep[] {
  return [...line.steps]
    .sort((a, b) => a.step_order - b.step_order)
    .map(s => ({
      approver_id: s.approver_id,
      approver_name: s.approver_name,
      approver_role: `결재선: ${line.name}`,
      org_unit_id: '',
      org_unit_name: '',
    }));
}

const SELF_APPROVE_COMMENT = '본인 기안으로 자동 승인 처리됨';
const ALREADY_PROCESSED_ERROR = '이미 처리되었거나 결재 순서가 아닙니다.';

// 연차/질병휴가 신청 문서(reference_type이 shore_leave_request/sick_leave_request)는 자유서식
// content만으로는 신청 당시 정보가 누락되기 쉬워, 원본 신청 레코드에서 직접 조회해 결재 상세/
// 시행문 양쪽에서 구조화된 정보로 보여준다.
export interface LeaveDetail {
  typeLabel: string;
  period: string;
  hoursLabel: string;
  reason: string;
}

const LEAVE_REFERENCE_TABLE: Record<string, string> = {
  shore_leave_request: 'shore_leave_requests',
  sick_leave_request: 'sick_leave_requests',
};
const LEAVE_REFERENCE_LABEL: Record<string, string> = {
  shore_leave_request: '연차',
  sick_leave_request: '질병휴가',
};

export async function getLeaveDetail(referenceType: string | null, referenceId: string | null): Promise<LeaveDetail | null> {
  if (!referenceType || !referenceId) return null;
  const table = LEAVE_REFERENCE_TABLE[referenceType];
  if (!table) return null;
  const { data } = await supabase.from(table).select('start_date, start_time, end_date, end_time, hours, reason').eq('id', referenceId).maybeSingle();
  if (!data) return null;
  return {
    typeLabel: LEAVE_REFERENCE_LABEL[referenceType] || '휴가',
    period: `${data.start_date} ${data.start_time} ~ ${data.end_date} ${data.end_time}`,
    hoursLabel: formatLeaveHours(data.hours),
    reason: data.reason || '-',
  };
}

// 시스템 연동형 문서(reference_type/reference_id)가 최종 승인/반려되면 원본 레코드의
// 상태도 함께 동기화한다. 현재는 교대계획 결재 통합에만 쓰이지만, 다른 화면의 결재
// 연동도 여기에 케이스를 추가하면 된다.
async function applyReferenceSideEffect(
  referenceType: string,
  referenceId: string | null,
  newStatus: 'approved' | 'rejected'
): Promise<void> {
  if (!referenceId) return;
  if (referenceType === 'crew_rotation_plan') {
    await supabase
      .from('crew_rotation_plans')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', referenceId);
  }
  if (referenceType === 'crew_dispatch_order') {
    await supabase
      .from('crew_dispatch_orders')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', referenceId);
    // 승진/강등 발령은 승인 즉시 발효 — 계약 생성 + 승선경력 교체까지 한 번에 처리
    if (newStatus === 'approved') {
      await supabase.rpc('execute_dispatch_order', { order_id: referenceId });
    }
  }
  if (referenceType === 'shore_leave_request') {
    // 잔여 연차는 승인된 신청 건들의 합으로 그때그때 계산하므로(shore-leave.service.ts),
    // 여기서는 신청 상태만 동기화하면 된다 — 승인되는 순간 자동으로 잔여 연차에 반영됨.
    await supabase
      .from('shore_leave_requests')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', referenceId);
  }
  if (referenceType === 'sick_leave_request') {
    // 질병휴가는 연차와 별도 집계이며 잔여 한도가 없으므로 상태만 동기화한다.
    await supabase
      .from('sick_leave_requests')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', referenceId);
  }
}

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

  async createDocumentType(input: { code: string; name: string; field_schema?: DocumentFormField[] | null; default_cc_org_unit_ids?: string[] | null }): Promise<ApprovalDocumentType> {
    const { data, error } = await supabase
      .from('approval_document_types')
      .insert({ code: input.code, name: input.name, field_schema: input.field_schema || null, default_cc_org_unit_ids: input.default_cc_org_unit_ids || null })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateDocumentType(id: string, updates: Partial<Pick<ApprovalDocumentType, 'code' | 'name' | 'is_active' | 'field_schema' | 'default_cc_org_unit_ids'>>): Promise<void> {
    const { error } = await supabase
      .from('approval_document_types')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  // 이 유형으로 만들어진 문서가 하나라도 있으면 DB 제약(ON DELETE RESTRICT)으로 삭제가 거부된다 —
  // 그 경우 비활성화를 안내한다 (호출부에서 에러코드 23503을 확인).
  async deleteDocumentType(id: string): Promise<void> {
    const { error } = await supabase.from('approval_document_types').delete().eq('id', id);
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
    form_data?: Record<string, string | number | null>;
    attachments?: ApprovalDocumentAttachment[];
    org_unit_id: string;
    created_by: string;
    requester_comment?: string;
    reference_type?: string;
    reference_id?: string;
    // 결재선과 별개로 통보만 받을 참조자(개인) / 참조 부서
    ccUserIds?: string[];
    ccOrgUnitIds?: string[];
    // 임시저장해둔 초안을 정식 제출로 전환할 때 — 새 행을 만들지 않고 이 초안 행을 그대로 갱신한다.
    draftId?: string;
    // 문서유형의 전결규정(조직도 기반 자동 계산)과 별개로, 결재선 관리에서 고른 결재라인을
    // 그대로 쓰고 싶을 때 넘긴다 — 지정되면 previewChain() 자동계산을 건너뛴다.
    manualChain?: ApprovalChainStep[];
  }): Promise<ApprovalDocumentWithDetails> {
    const chain = input.manualChain && input.manualChain.length > 0
      ? input.manualChain
      : await this.previewChain(input.org_unit_id, input.document_type_id);
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

    const docPayload = {
      document_type_id: input.document_type_id,
      title: input.title,
      content: input.content || null,
      form_data: input.form_data || null,
      attachments: input.attachments || [],
      org_unit_id: input.org_unit_id,
      created_by: input.created_by,
      requester_comment: input.requester_comment || null,
      reference_type: input.reference_type || null,
      reference_id: input.reference_id || null,
      status: allApproved ? 'approved' : 'pending',
      current_step: allApproved ? stepRows.length : firstPending!.step_order,
      completed_at: allApproved ? now : null,
    };

    const { data: doc, error: docError } = input.draftId
      ? await supabase.from('approval_documents').update({ ...docPayload, updated_at: now }).eq('id', input.draftId).select().single()
      : await supabase.from('approval_documents').insert(docPayload).select().single();
    if (docError) throw docError;

    if (allApproved && doc.reference_type) {
      await applyReferenceSideEffect(doc.reference_type, doc.reference_id, 'approved');
    }

    const refRows = [
      ...(input.ccUserIds || []).map(user_id => ({ document_id: doc.id, user_id, org_unit_id: null })),
      ...(input.ccOrgUnitIds || []).map(org_unit_id => ({ document_id: doc.id, user_id: null, org_unit_id })),
    ];
    if (refRows.length > 0) {
      const { error: refError } = await supabase.from('approval_document_references').insert(refRows);
      if (refError) throw refError;
    }

    const { data: steps, error: stepsError } = await supabase
      .from('approval_document_steps')
      .insert(stepRows.map(s => ({ ...s, document_id: doc.id })))
      .select();
    if (stepsError) throw stepsError;

    const [enriched] = await enrichDocuments([doc]);
    return { ...enriched, steps: (steps || []) as ApprovalDocumentStep[] };
  },

  // 기안서 작성 중 임시저장. draftId가 없으면 새 초안을 만들고, 있으면 그 초안을 그대로 갱신한다.
  // 결재라인/단계는 만들지 않으며(status='draft'), 정식 제출 전까지 결재함에는 노출되지 않는다.
  async saveDraft(input: {
    draftId?: string;
    document_type_id: string;
    title: string;
    content?: string;
    form_data?: Record<string, string | number | null>;
    attachments?: ApprovalDocumentAttachment[];
    org_unit_id?: string;
    created_by: string;
    requester_comment?: string;
  }): Promise<ApprovalDocumentWithDetails> {
    const payload = {
      document_type_id: input.document_type_id,
      title: input.title,
      content: input.content || null,
      form_data: input.form_data || null,
      attachments: input.attachments || [],
      org_unit_id: input.org_unit_id || null,
      created_by: input.created_by,
      requester_comment: input.requester_comment || null,
      status: 'draft',
      current_step: 0,
      updated_at: new Date().toISOString(),
    };
    const { data: doc, error } = input.draftId
      ? await supabase.from('approval_documents').update(payload).eq('id', input.draftId).select().single()
      : await supabase.from('approval_documents').insert(payload).select().single();
    if (error) throw error;
    const [enriched] = await enrichDocuments([doc]);
    return { ...enriched, steps: [] };
  },

  async deleteDraft(id: string): Promise<void> {
    const { error } = await supabase.from('approval_documents').delete().eq('id', id).eq('status', 'draft');
    if (error) throw error;
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

  // 시스템관리자 이상 전용: 상태 무관 전체 문서 조회 ("결재함"에서 전체보기)
  async getAllDocuments(): Promise<ApprovalDocumentWithDetails[]> {
    const { data, error } = await supabase
      .from('approval_documents')
      .select('*')
      .neq('status', 'draft')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return enrichDocuments(data || []);
  },

  // 일반 사용자용: 나와 관계있는 문서 전체 (기안자 본인 / 결재선에 포함된 결재자 / 참조 대상) — 상태 무관.
  // "결재함"의 기본 노출 범위 — 시스템관리자 이상은 getAllDocuments()로 전체를 본다.
  async getMyRelatedDocuments(userId: string, myOrgUnitIds: string[] = []): Promise<ApprovalDocumentWithDetails[]> {
    const orFilter = myOrgUnitIds.length > 0
      ? `user_id.eq.${userId},org_unit_id.in.(${myOrgUnitIds.join(',')})`
      : `user_id.eq.${userId}`;
    const [draftedRes, stepsRes, refsRes] = await Promise.all([
      supabase.from('approval_documents').select('id').eq('created_by', userId).neq('status', 'draft'),
      supabase.from('approval_document_steps').select('document_id').eq('approver_id', userId),
      supabase.from('approval_document_references').select('document_id').or(orFilter),
    ]);
    if (draftedRes.error) throw draftedRes.error;
    if (stepsRes.error) throw stepsRes.error;
    if (refsRes.error) throw refsRes.error;

    const docIds = new Set<string>();
    for (const d of draftedRes.data || []) docIds.add(d.id);
    for (const s of stepsRes.data || []) docIds.add(s.document_id);
    for (const r of refsRes.data || []) docIds.add(r.document_id);
    if (docIds.size === 0) return [];

    const { data: docs, error } = await supabase
      .from('approval_documents')
      .select('*')
      .in('id', [...docIds])
      .order('created_at', { ascending: false });
    if (error) throw error;
    return enrichDocuments(docs || []);
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
      .select('current_step, reference_type, reference_id')
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
      if (doc.reference_type) await applyReferenceSideEffect(doc.reference_type, doc.reference_id, 'approved');
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
      .select('current_step, reference_type, reference_id')
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
    if (doc.reference_type) await applyReferenceSideEffect(doc.reference_type, doc.reference_id, 'rejected');
  },

  // 관리자 전용: 결재라인 무관하게 즉시 승인
  async adminForceApproveDocumentStep(documentId: string, adminId: string, comment?: string): Promise<void> {
    const { data: doc, error: docError } = await supabase
      .from('approval_documents')
      .select('current_step, reference_type, reference_id')
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
    if (doc.reference_type) await applyReferenceSideEffect(doc.reference_type, doc.reference_id, 'approved');
  },

  // 관리자 전용: 결재라인 무관하게 즉시 반려
  async adminForceRejectDocumentStep(documentId: string, adminId: string, comment: string): Promise<void> {
    const { data: doc, error: docError } = await supabase
      .from('approval_documents')
      .select('current_step, reference_type, reference_id')
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
    if (doc.reference_type) await applyReferenceSideEffect(doc.reference_type, doc.reference_id, 'rejected');
  },

  async cancelDocument(documentId: string): Promise<void> {
    const { error } = await supabase
      .from('approval_documents')
      .update({ status: 'cancelled', completed_at: new Date().toISOString() })
      .eq('id', documentId);
    if (error) throw error;
  },

  // 결재가 끝난(승인/반려/취소) 문서를 완전히 삭제 — approval_document_steps는 CASCADE로 함께 삭제됨
  async deleteDocument(documentId: string): Promise<void> {
    const { error } = await supabase.from('approval_documents').delete().eq('id', documentId);
    if (error) throw error;
  },

  // "참조함": 결재선에는 없지만 개인 또는 소속 부서로 참조 지정된 문서 목록
  async getReferencedDocuments(userId: string, myOrgUnitIds: string[]): Promise<ApprovalDocumentWithDetails[]> {
    const orFilter = myOrgUnitIds.length > 0
      ? `user_id.eq.${userId},org_unit_id.in.(${myOrgUnitIds.join(',')})`
      : `user_id.eq.${userId}`;
    const { data: refs, error: refError } = await supabase
      .from('approval_document_references')
      .select('document_id')
      .or(orFilter);
    if (refError) throw refError;
    const docIds = [...new Set((refs || []).map(r => r.document_id))];
    if (docIds.length === 0) return [];

    const { data: docs, error: docsError } = await supabase
      .from('approval_documents')
      .select('*')
      .in('id', docIds)
      .order('created_at', { ascending: false });
    if (docsError) throw docsError;
    return enrichDocuments(docs || []);
  },

  // 결재함 배지 — 참조로 지정된 문서 중 아직 상세를 열어보지 않은 건수
  async getUnreadReferenceCount(userId: string, myOrgUnitIds: string[]): Promise<number> {
    const orFilter = myOrgUnitIds.length > 0
      ? `user_id.eq.${userId},org_unit_id.in.(${myOrgUnitIds.join(',')})`
      : `user_id.eq.${userId}`;
    const { data: refs, error: refError } = await supabase
      .from('approval_document_references')
      .select('document_id')
      .or(orFilter);
    if (refError) throw refError;
    const docIds = [...new Set((refs || []).map(r => r.document_id))];
    if (docIds.length === 0) return 0;

    const { data: reads, error: readsError } = await supabase
      .from('approval_document_reference_reads')
      .select('document_id')
      .eq('user_id', userId)
      .in('document_id', docIds);
    if (readsError) throw readsError;
    const readSet = new Set((reads || []).map(r => r.document_id));
    return docIds.filter(id => !readSet.has(id)).length;
  },

  // 참조로 지정된 문서 상세를 열람했을 때 호출 — 이후 배지 집계에서 제외된다
  async markReferenceRead(documentId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('approval_document_reference_reads')
      .upsert({ document_id: documentId, user_id: userId }, { onConflict: 'document_id,user_id' });
    if (error) throw error;
  },

  // 결재함 배지 — 결재선상 지금 내 차례인(즉시 조치가 필요한) 문서 건수. 관리자는 전체 대기 건수.
  async getMyPendingTurnCount(userId: string, isAdmin: boolean): Promise<number> {
    if (isAdmin) {
      const { count, error } = await supabase
        .from('approval_documents')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (error) throw error;
      return count || 0;
    }

    const { data: steps, error: stepsError } = await supabase
      .from('approval_document_steps')
      .select('document_id, step_order')
      .eq('approver_id', userId)
      .eq('status', 'pending');
    if (stepsError) throw stepsError;
    if (!steps || steps.length === 0) return 0;

    const docIds = [...new Set(steps.map(s => s.document_id))];
    const { data: docs, error: docsError } = await supabase
      .from('approval_documents')
      .select('id, status, current_step')
      .in('id', docIds)
      .eq('status', 'pending');
    if (docsError) throw docsError;

    const currentStepByDoc = new Map((docs || []).map(d => [d.id, d.current_step]));
    const myTurnDocIds = new Set(
      steps.filter(s => currentStepByDoc.get(s.document_id) === s.step_order).map(s => s.document_id)
    );
    return myTurnDocIds.size;
  },
};
