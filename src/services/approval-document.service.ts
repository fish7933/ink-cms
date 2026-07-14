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
  ApprovalDocumentRejectionHistoryEntry,
  DocumentFormField,
} from '@/types/approval-document';

// 문서유형의 전결규정(조직도 기반 자동계산)과 별개로, 결재선 관리에서 고른 결재라인을
// 그대로 기안서 결재 단계로 쓰고 싶을 때 ApprovalChainStep[] 형태로 변환해준다.
export async function approvalLineToChainSteps(line: ApprovalLineWithSteps): Promise<ApprovalChainStep[]> {
  const sorted = [...line.steps].sort((a, b) => a.step_order - b.step_order);

  // 결재란/시행문에는 "결재선: OOO" 같은 라인 이름이 아니라 다른 결재라인과 동일하게
  // 결재자의 실제 직급만 표시해야 하므로, users.position_id → shore_positions.name을 조회한다.
  const approverIds = [...new Set(sorted.map(s => s.approver_id))];
  const { data: users } = await supabase.from('users').select('id, position_id').in('id', approverIds);
  const positionIdByUser = new Map((users || []).map(u => [u.id, u.position_id as string | null]));
  const positionIds = [...new Set([...positionIdByUser.values()].filter((id): id is string => !!id))];
  const { data: positions } = positionIds.length > 0
    ? await supabase.from('shore_positions').select('id, name').in('id', positionIds)
    : { data: [] as { id: string; name: string }[] };
  const positionNameById = new Map((positions || []).map(p => [p.id, p.name]));

  return sorted.map(s => {
    const positionId = positionIdByUser.get(s.approver_id);
    const positionName = positionId ? positionNameById.get(positionId) : undefined;
    return {
      approver_id: s.approver_id,
      approver_name: s.approver_name,
      approver_role: positionName || '',
      org_unit_id: '',
      org_unit_name: '',
    };
  });
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

// 반려 순간의 기록을 approval_document_rejection_history에 남긴다. 재상신 시
// approval_document_steps는 pending으로 초기화돼 반려 기록이 사라지므로, 이 이력이
// 문서에 "몇 차 상신에서 누가 왜 반려했는지"를 영구적으로 보존하는 유일한 자리가 된다.
async function recordRejectionHistory(
  documentId: string,
  resubmitCountAtRejection: number,
  rejectedStep: { step_order: number; approver_id: string; approver_name: string; approver_label: string | null },
  comment: string,
  rejectedAt: string
): Promise<void> {
  const { error } = await supabase.from('approval_document_rejection_history').insert({
    document_id: documentId,
    round: resubmitCountAtRejection + 1,
    rejected_step_order: rejectedStep.step_order,
    rejected_by: rejectedStep.approver_id,
    rejected_by_name: rejectedStep.approver_name,
    rejected_by_label: rejectedStep.approver_label,
    comment,
    rejected_at: rejectedAt,
  });
  if (error) console.error('반려 이력 기록 실패', error);
}

// 시스템 연동형 문서(reference_type/reference_id)가 최종 승인/반려되면 원본 레코드의
// 상태도 함께 동기화한다. 현재는 교대계획 결재 통합에만 쓰이지만, 다른 화면의 결재
// 연동도 여기에 케이스를 추가하면 된다.
async function applyReferenceSideEffect(
  referenceType: string,
  referenceId: string | null,
  newStatus: 'approved' | 'rejected' | 'pending'
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

  // 과거 자동승인 버그 등으로 current_step이 가리키는 단계가 이미 처리(승인/반려)돼 있는
  // 경우를 스스로 고쳐준다 — 실제로 다음에 처리해야 할 진짜 대기 단계를 다시 찾아 맞추고,
  // 남은 단계가 모두 이미 처리돼 있으면 그대로 완료 처리한다. 문서를 조회할 때마다 자동으로
  // 바로잡히므로 "이미 처리되었다"는데 화면은 "내 차례"라고 나오는 불일치가 발생하지 않는다.
  const repairs: { id: string; current_step: number; status: 'pending' | 'approved'; completed_at: string | null; reference_type: string | null; reference_id: string | null }[] = [];
  const now = new Date().toISOString();

  const enriched = docs.map(d => {
    const steps = stepsByDoc.get(d.id) || [];
    let current_step = d.current_step;
    let status = d.status;
    let completed_at = d.completed_at;

    if (status === 'pending' && steps.length > 0) {
      const curStep = steps.find(s => s.step_order === current_step);
      if (curStep && curStep.status !== 'pending') {
        const nextPending = steps.filter(s => s.step_order >= current_step).find(s => s.status === 'pending');
        if (nextPending) {
          current_step = nextPending.step_order;
        } else {
          status = 'approved';
          completed_at = completed_at || now;
        }
        repairs.push({ id: d.id, current_step, status: status as 'pending' | 'approved', completed_at, reference_type: d.reference_type, reference_id: d.reference_id });
      }
    }

    return {
      ...d,
      current_step,
      status,
      completed_at,
      document_type_name: typesMap.get(d.document_type_id) || '알 수 없음',
      creator_name: creatorsMap.get(d.created_by) || '알 수 없음',
      org_unit_name: d.org_unit_id ? (unitsMap.get(d.org_unit_id) || null) : null,
      steps,
    };
  });

  if (repairs.length > 0) {
    await Promise.all(repairs.map(async r => {
      await supabase.from('approval_documents')
        .update({ current_step: r.current_step, status: r.status, completed_at: r.completed_at })
        .eq('id', r.id).eq('status', 'pending');
      if (r.status === 'approved' && r.reference_type) {
        await applyReferenceSideEffect(r.reference_type, r.reference_id, 'approved').catch(console.error);
      }
    }));
  }

  return enriched;
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
    // manualChain을 만든 결재선의 id — 반려 후 재상신 시 같은 결재선을 다시 골라주기 위해 기억해둔다.
    manualLineId?: string;
  }): Promise<ApprovalDocumentWithDetails> {
    const chain = input.manualChain && input.manualChain.length > 0
      ? input.manualChain
      : await this.previewChain(input.org_unit_id, input.document_type_id);
    if (chain.length === 0) {
      throw new Error('선택한 부서에서 결재라인을 구성할 수 없습니다. 부서장(또는 소속 인원)이 지정되어 있는지 확인해주세요.');
    }

    const now = new Date().toISOString();
    // 기안자 본인이 결재라인에 포함돼 있으면 그 단계는 생성 시점에 자동 승인 처리 — 단, 이건
    // 조직도 기반 자동 계산 체인에서만 의미가 있다(내 상위 직급을 거슬러 올라가다 보면 내
    // 자리를 다시 지나칠 수 있음). 결재선 관리에서 직접 고른 결재선은 여러 사람이 공용으로
    // 재사용하는 고정 라인이라, 그 라인의 특정 단계에 우연히 내 계정이 들어있다고 해서 실제
    // 검토 없이 자동 승인돼버리면 안 된다.
    const isAutoChain = !(input.manualChain && input.manualChain.length > 0);
    const stepRows = chain.map((c, i) => {
      const isSelf = isAutoChain && c.approver_id === input.created_by;
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
      manual_line_id: isAutoChain ? null : (input.manualLineId || null),
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

  // 일반 사용자용: 나와 관계있는 문서 전체 (기안자 본인 / 이미 내 차례가 됐거나 지나간 결재선
  // 담당자 / 참조 대상) — 결재선에 이름은 있지만 아직 내 차례가 오지 않은(현재 단계가 나보다
  // 앞선) 문서는 제외한다 — "아직 나에게 도착하지 않은 문서"는 결재함에 보이면 안 된다. 참조는
  // 결재가 완료(승인)된 문서에 대해서만 의미가 있으므로, 아직 결재 중이거나 반려된 문서는
  // 참조 대상에게 노출되지 않는다 — 상급 결재자가 검토하기도 전에 참조자가 먼저 내용을 알게
  // 되거나, 반려돼 무효가 된 내용이 참조자에게 그대로 남는 것을 막기 위함.
  // "결재함"의 기본 노출 범위 — 관리자도 예외 없이 동일하게 적용된다.
  async getMyRelatedDocuments(userId: string, myOrgUnitIds: string[] = []): Promise<ApprovalDocumentWithDetails[]> {
    const orFilter = myOrgUnitIds.length > 0
      ? `user_id.eq.${userId},org_unit_id.in.(${myOrgUnitIds.join(',')})`
      : `user_id.eq.${userId}`;
    const [draftedRes, stepsRes, refsRes] = await Promise.all([
      supabase.from('approval_documents').select('id').eq('created_by', userId).neq('status', 'draft'),
      supabase.from('approval_document_steps').select('document_id, step_order, status').eq('approver_id', userId),
      supabase.from('approval_document_references').select('document_id').or(orFilter),
    ]);
    if (draftedRes.error) throw draftedRes.error;
    if (stepsRes.error) throw stepsRes.error;
    if (refsRes.error) throw refsRes.error;

    const myStepDocIds = [...new Set((stepsRes.data || []).map(s => s.document_id))];
    let reachedStepDocIds: string[] = [];
    if (myStepDocIds.length > 0) {
      const { data: parentDocs, error: parentError } = await supabase
        .from('approval_documents').select('id, current_step').in('id', myStepDocIds);
      if (parentError) throw parentError;
      const currentStepByDoc = new Map((parentDocs || []).map(d => [d.id, d.current_step]));
      reachedStepDocIds = (stepsRes.data || [])
        .filter(s => s.status !== 'pending' || s.step_order <= (currentStepByDoc.get(s.document_id) ?? 0))
        .map(s => s.document_id);
    }

    const refDocIds = [...new Set((refsRes.data || []).map(r => r.document_id))];
    let approvedRefDocIds: string[] = [];
    if (refDocIds.length > 0) {
      const { data: refDocs, error: refDocsError } = await supabase
        .from('approval_documents').select('id').in('id', refDocIds).eq('status', 'approved');
      if (refDocsError) throw refDocsError;
      approvedRefDocIds = (refDocs || []).map(d => d.id);
    }

    const docIds = new Set<string>();
    for (const d of draftedRes.data || []) docIds.add(d.id);
    for (const id of reachedStepDocIds) docIds.add(id);
    for (const id of approvedRefDocIds) docIds.add(id);
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

  // 결재함 "삭제"는 문서를 지우는 게 아니라 이 사용자의 결재함 목록에서만 숨기는 것 —
  // 다른 참여자의 결재함/문서 자체(결재 이력 포함)에는 전혀 영향이 없다.
  async hideDocumentForUser(documentId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('approval_document_hides')
      .upsert({ document_id: documentId, user_id: userId }, { onConflict: 'document_id,user_id' });
    if (error) throw error;
  },

  async unhideDocumentForUser(documentId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('approval_document_hides')
      .delete()
      .eq('document_id', documentId)
      .eq('user_id', userId);
    if (error) throw error;
  },

  async getHiddenDocumentIds(userId: string): Promise<Set<string>> {
    const { data, error } = await supabase.from('approval_document_hides').select('document_id').eq('user_id', userId);
    if (error) throw error;
    return new Set((data || []).map(r => r.document_id));
  },

  // "삭제된 문서함" — 이 사용자가 본인 결재함에서 숨긴 문서 목록 (문서 자체는 살아있음)
  async getMyHiddenDocuments(userId: string): Promise<ApprovalDocumentWithDetails[]> {
    const { data: hides, error: hidesError } = await supabase
      .from('approval_document_hides').select('document_id').eq('user_id', userId);
    if (hidesError) throw hidesError;
    const docIds = (hides || []).map(h => h.document_id);
    if (docIds.length === 0) return [];

    const { data: docs, error } = await supabase
      .from('approval_documents').select('*').in('id', docIds).order('created_at', { ascending: false });
    if (error) throw error;
    return enrichDocuments(docs || []);
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
      .select('current_step, reference_type, reference_id, resubmit_count')
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
    await recordRejectionHistory(documentId, doc.resubmit_count, updatedSteps[0], comment, now);
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
      .select('current_step, reference_type, reference_id, resubmit_count')
      .eq('id', documentId)
      .single();
    if (docError) throw docError;

    const now = new Date().toISOString();
    const { data: updatedSteps } = await supabase
      .from('approval_document_steps')
      .update({ status: 'rejected', comment: `[관리자 ${adminId}] ${comment}`, acted_at: now })
      .eq('document_id', documentId)
      .eq('step_order', doc.current_step)
      .select();

    const { error } = await supabase
      .from('approval_documents')
      .update({ status: 'rejected', final_comment: comment, completed_at: now })
      .eq('id', documentId);
    if (error) throw error;
    if (updatedSteps && updatedSteps[0]) await recordRejectionHistory(documentId, doc.resubmit_count, updatedSteps[0], comment, now);
    if (doc.reference_type) await applyReferenceSideEffect(doc.reference_type, doc.reference_id, 'rejected');
  },

  async cancelDocument(documentId: string): Promise<void> {
    const { error } = await supabase
      .from('approval_documents')
      .update({ status: 'cancelled', completed_at: new Date().toISOString() })
      .eq('id', documentId);
    if (error) throw error;
  },

  // 반려된 문서를 기안서 작성 화면에서 내용을 고쳐 같은 문서 id로 다시 상신한다(브랜드뉴 문서를
  // 만드는 게 아니다). 결재라인은 기본적으로 직전 상신 때와 완전히 동일하게(같은 결재자 순서
  // 그대로) 재사용한다 — 사용자가 다른 결재선을 직접 골랐거나(manualChain) 기안 부서/문서유형을
  // 바꾼 경우에만 새로 계산한다. 이전 상신의 결재 단계 행 자체는 지우고 새로 만들지만, 직전
  // 반려 기록은 rejectDocumentStep에서 이미 approval_document_rejection_history에 남아있으므로
  // 단계를 지워도 사라지지 않는다.
  async resubmitDocument(documentId: string, input: {
    document_type_id: string;
    title: string;
    content?: string;
    form_data?: Record<string, string | number | null>;
    attachments?: ApprovalDocumentAttachment[];
    org_unit_id: string;
    requester_comment?: string;
    ccUserIds?: string[];
    ccOrgUnitIds?: string[];
    manualChain?: ApprovalChainStep[];
    // manualChain을 만든 결재선의 id
    manualLineId?: string;
  }): Promise<ApprovalDocumentWithDetails> {
    const { data: existing, error: existingError } = await supabase
      .from('approval_documents')
      .select('resubmit_count, created_by, org_unit_id, document_type_id, reference_type, reference_id, manual_line_id')
      .eq('id', documentId)
      .eq('status', 'rejected')
      .single();
    if (existingError) throw existingError;

    const { data: prevSteps, error: prevStepsError } = await supabase
      .from('approval_document_steps')
      .select('*')
      .eq('document_id', documentId)
      .order('step_order');
    if (prevStepsError) throw prevStepsError;

    const now = new Date().toISOString();
    const deptOrTypeChanged = input.org_unit_id !== existing.org_unit_id || input.document_type_id !== existing.document_type_id;
    const hasManualChain = !!(input.manualChain && input.manualChain.length > 0);

    let stepRows: { step_order: number; approver_id: string; approver_name: string; approver_label: string | null; status: 'approved' | 'pending'; comment: string | null; acted_at: string | null }[];
    let manualLineIdForPayload: string | null;
    if (!hasManualChain && !deptOrTypeChanged && (prevSteps || []).length > 0) {
      // 디폴트: 부서/문서유형을 바꾸지 않았으면 직전 상신의 결재라인을 그대로 재사용한다.
      // 본인 결재라 자동승인됐던 단계만 유지하고, 나머지는 전부 pending으로 되돌려 다시 검토받는다.
      manualLineIdForPayload = existing.manual_line_id;
      stepRows = prevSteps!.map(s => {
        const isSelf = s.comment === SELF_APPROVE_COMMENT;
        return {
          step_order: s.step_order,
          approver_id: s.approver_id,
          approver_name: s.approver_name,
          approver_label: s.approver_label,
          status: (isSelf ? 'approved' : 'pending') as 'approved' | 'pending',
          comment: isSelf ? SELF_APPROVE_COMMENT : null,
          acted_at: isSelf ? now : null,
        };
      });
    } else {
      const chain = hasManualChain ? input.manualChain! : await this.previewChain(input.org_unit_id, input.document_type_id);
      if (chain.length === 0) {
        throw new Error('선택한 부서에서 결재라인을 구성할 수 없습니다. 부서장(또는 소속 인원)이 지정되어 있는지 확인해주세요.');
      }
      const isAutoChain = !hasManualChain;
      manualLineIdForPayload = isAutoChain ? null : (input.manualLineId || null);
      stepRows = chain.map((c, i) => {
        const isSelf = isAutoChain && c.approver_id === existing.created_by;
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
    }
    const firstPending = stepRows.find(s => s.status === 'pending');
    const allApproved = !firstPending;

    const docPayload = {
      document_type_id: input.document_type_id,
      title: input.title,
      content: input.content || null,
      form_data: input.form_data || null,
      attachments: input.attachments || [],
      org_unit_id: input.org_unit_id,
      requester_comment: input.requester_comment || null,
      manual_line_id: manualLineIdForPayload,
      status: allApproved ? 'approved' : 'pending',
      current_step: allApproved ? stepRows.length : firstPending!.step_order,
      completed_at: allApproved ? now : null,
      final_comment: null,
      resubmit_count: (existing.resubmit_count || 0) + 1,
      updated_at: now,
    };

    const { data: doc, error: docError } = await supabase
      .from('approval_documents')
      .update(docPayload)
      .eq('id', documentId)
      .eq('status', 'rejected')
      .select()
      .single();
    if (docError) throw docError;

    const { error: deleteStepsError } = await supabase.from('approval_document_steps').delete().eq('document_id', documentId);
    if (deleteStepsError) throw deleteStepsError;
    const { data: steps, error: stepsError } = await supabase
      .from('approval_document_steps')
      .insert(stepRows.map(s => ({ ...s, document_id: documentId })))
      .select();
    if (stepsError) throw stepsError;

    // 참조(통보) 대상도 이번 상신에서 새로 지정한 값으로 교체
    await supabase.from('approval_document_references').delete().eq('document_id', documentId);
    const refRows = [
      ...(input.ccUserIds || []).map(user_id => ({ document_id: documentId, user_id, org_unit_id: null })),
      ...(input.ccOrgUnitIds || []).map(org_unit_id => ({ document_id: documentId, user_id: null, org_unit_id })),
    ];
    if (refRows.length > 0) {
      const { error: refError } = await supabase.from('approval_document_references').insert(refRows);
      if (refError) throw refError;
    }

    if (existing.reference_type) {
      await applyReferenceSideEffect(existing.reference_type, existing.reference_id, allApproved ? 'approved' : 'pending');
    }

    const [enriched] = await enrichDocuments([doc]);
    return { ...enriched, steps: (steps || []) as ApprovalDocumentStep[] };
  },

  async getRejectionHistory(documentId: string): Promise<ApprovalDocumentRejectionHistoryEntry[]> {
    const { data, error } = await supabase
      .from('approval_document_rejection_history')
      .select('*')
      .eq('document_id', documentId)
      .order('round');
    if (error) throw error;
    return data || [];
  },

  // 결재가 끝난(승인/반려/취소) 문서를 완전히 삭제 — approval_document_steps는 CASCADE로 함께 삭제됨
  async deleteDocument(documentId: string): Promise<void> {
    const { error } = await supabase.from('approval_documents').delete().eq('id', documentId);
    if (error) throw error;
  },

  // "참조함": 결재선에는 없지만 개인 또는 소속 부서로 참조 지정된 문서 목록. 내가 기안했거나
  // 결재선에 포함된 문서는 참조로도 지정돼 있더라도 제외한다 — 참조는 결재와 무관한 사람에게만
  // 의미가 있고, 그렇지 않으면 같은 문서가 참조함과 결재함에 중복으로 나타난다. 참조는 결재가
  // 완료(승인)된 문서에 대해서만 유효하다 — 결재 중이거나 반려된 문서는 참조 대상에게 아직 보이지 않는다.
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

    const { data: steps, error: stepsError } = await supabase
      .from('approval_document_steps')
      .select('document_id')
      .eq('approver_id', userId)
      .in('document_id', docIds);
    if (stepsError) throw stepsError;
    const myStepDocIds = new Set((steps || []).map(s => s.document_id));

    const { data: docs, error: docsError } = await supabase
      .from('approval_documents')
      .select('*')
      .in('id', docIds)
      .eq('status', 'approved')
      .neq('created_by', userId)
      .order('created_at', { ascending: false });
    if (docsError) throw docsError;
    return enrichDocuments((docs || []).filter(d => !myStepDocIds.has(d.id)));
  },

  // 결재함 배지 — 참조로 지정된 문서 중 아직 상세를 열어보지 않은 건수. 내가 기안했거나
  // 결재선에 포함된 문서는 참조로도 지정돼 있더라도 무시하고(같은 문서가 "결재 대기"와
  // "참조 미열람" 배지 양쪽에 중복으로 잡히는 것을 방지), 결재가 완료(승인)된 문서만 센다 —
  // 결재 중이거나 반려된 문서는 아직 참조 대상에게 노출되지 않는다.
  async getUnreadReferenceCount(userId: string, myOrgUnitIds: string[]): Promise<number> {
    const orFilter = myOrgUnitIds.length > 0
      ? `user_id.eq.${userId},org_unit_id.in.(${myOrgUnitIds.join(',')})`
      : `user_id.eq.${userId}`;
    const { data: refs, error: refError } = await supabase
      .from('approval_document_references')
      .select('document_id')
      .or(orFilter);
    if (refError) throw refError;
    const refDocIds = [...new Set((refs || []).map(r => r.document_id))];
    if (refDocIds.length === 0) return 0;

    const [{ data: docs, error: docsError }, { data: steps, error: stepsError }] = await Promise.all([
      supabase.from('approval_documents').select('id, created_by, status').in('id', refDocIds),
      supabase.from('approval_document_steps').select('document_id').eq('approver_id', userId).in('document_id', refDocIds),
    ]);
    if (docsError) throw docsError;
    if (stepsError) throw stepsError;
    const myStepDocIds = new Set((steps || []).map(s => s.document_id));
    const docIds = refDocIds.filter(id => {
      const d = (docs || []).find(x => x.id === id);
      return !!d && d.status === 'approved' && d.created_by !== userId && !myStepDocIds.has(id);
    });
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

  // 결재함 배지 — 결재선상 지금 내 차례인(즉시 조치가 필요한) 문서 건수. 관리자라고 예외를
  // 두지 않는다 — 그룹웨어 결재함에서 관리자도 실제로 내 차례인 것만 보고 처리하므로,
  // 배지도 목록에 보이지 않는 전체 시스템 대기 건수가 아니라 동일한 기준으로 집계해야 한다.
  async getMyPendingTurnCount(userId: string, _isAdmin: boolean): Promise<number> {
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

  // 이 문서에 참조 지정된 개별/부서 참조를 실제 수신자 단위로 풀어서, 각자 열람했는지 함께 보여준다
  // (부서 참조 1건을 소속 인원 여러 명이 공유하므로, 사람 단위로 펼쳐야 "누가 아직 안 봤는지" 알 수 있다).
  async getReferenceReadStatus(documentId: string): Promise<{ userId: string; userName: string; via: string; readAt: string | null }[]> {
    const { data: refs, error: refError } = await supabase
      .from('approval_document_references')
      .select('user_id, org_unit_id')
      .eq('document_id', documentId);
    if (refError) throw refError;
    if (!refs || refs.length === 0) return [];

    const directUserIds = refs.filter(r => r.user_id).map(r => r.user_id as string);
    const orgUnitIds = refs.filter(r => r.org_unit_id).map(r => r.org_unit_id as string);

    const recipients = new Map<string, string>(); // userId -> via label
    for (const id of directUserIds) recipients.set(id, '개별 참조');

    if (orgUnitIds.length > 0) {
      const [{ data: memberships }, { data: units }] = await Promise.all([
        supabase.from('org_unit_members').select('user_id, org_unit_id').in('org_unit_id', orgUnitIds),
        supabase.from('org_units').select('id, name').in('id', orgUnitIds),
      ]);
      const unitNameById = new Map((units || []).map(u => [u.id, u.name]));
      for (const m of memberships || []) {
        if (!recipients.has(m.user_id)) recipients.set(m.user_id, `${unitNameById.get(m.org_unit_id) || '부서'} 참조`);
      }
    }

    if (recipients.size === 0) return [];
    const userIds = [...recipients.keys()];
    const [{ data: users }, { data: reads }] = await Promise.all([
      supabase.from('users').select('id, name').in('id', userIds),
      supabase.from('approval_document_reference_reads').select('user_id, read_at').eq('document_id', documentId).in('user_id', userIds),
    ]);
    const nameById = new Map((users || []).map(u => [u.id, u.name]));
    const readAtById = new Map((reads || []).map(r => [r.user_id, r.read_at]));

    return userIds.map(id => ({
      userId: id,
      userName: nameById.get(id) || '알 수 없음',
      via: recipients.get(id) || '',
      readAt: readAtById.get(id) || null,
    }));
  },
};
