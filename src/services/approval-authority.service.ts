import { supabase } from '@/lib/supabase';

// 채용/배승/계약/승진강등 4개 결재 도메인이 결재선(approval_lines)은 그대로 따르되,
// 문서유형/전결규정관리에 설정된 전결(직급 기준 자동 종결)·참조(기본 참조부서) 규정도
// 함께 적용받도록 하는 공통 헬퍼. 기존 자유기안서 엔진(approval-document.service.ts)의
// org-chart 기반 결재선 자동구성 로직과는 별개로, 결재선은 그대로 두고 승인 시점에만
// 전결 여부를 판정하고, 상신 시점에 참조부서를 스냅샷 저장한다.
export type ApprovalDomainCode = 'crew_recommendation' | 'rotation_plan' | 'crew_contract' | 'dispatch_order';

async function resolveAuthorityThresholdOrder(documentTypeCode: string): Promise<number | undefined> {
  const { data: type } = await supabase
    .from('approval_document_types').select('id').eq('code', documentTypeCode).maybeSingle();
  if (!type) return undefined;

  const { data: limit } = await supabase
    .from('approval_authority_limits').select('position_id').eq('document_type_id', type.id).maybeSingle();
  if (!limit) return undefined;

  const { data: position } = await supabase
    .from('shore_positions').select('display_order').eq('id', limit.position_id).single();
  return position?.display_order ?? undefined;
}

async function resolveUserPositionOrder(userId: string): Promise<number | undefined> {
  const { data: user } = await supabase.from('users').select('position_id').eq('id', userId).maybeSingle();
  if (!user?.position_id) return undefined;

  const { data: position } = await supabase
    .from('shore_positions').select('display_order').eq('id', user.position_id).single();
  return position?.display_order ?? undefined;
}

// 이 결재자가 전결 기준 직급과 같거나 더 상위(선임)이면, 그의 승인으로 나머지 단계를
// 건너뛰고 전체 라인을 즉시 종결해야 한다 (display_order는 값이 작을수록 상위 직급).
export async function isAuthorityDelegated(documentTypeCode: ApprovalDomainCode, approverId: string): Promise<boolean> {
  const [threshold, approverOrder] = await Promise.all([
    resolveAuthorityThresholdOrder(documentTypeCode),
    resolveUserPositionOrder(approverId),
  ]);
  if (threshold === undefined || approverOrder === undefined) return false;
  return approverOrder <= threshold;
}

// 문서유형에 설정된 기본 참조부서를 결재 상신 시점의 스냅샷으로 저장
export async function applyDefaultReferences(domain: ApprovalDomainCode, requestId: string): Promise<void> {
  const { data: type } = await supabase
    .from('approval_document_types').select('default_cc_org_unit_ids').eq('code', domain).maybeSingle();
  const orgUnitIds = type?.default_cc_org_unit_ids || [];
  if (orgUnitIds.length === 0) return;

  await supabase.from('approval_request_references').insert(
    orgUnitIds.map((org_unit_id: string) => ({ domain, request_id: requestId, org_unit_id }))
  );
}

// 요청 id 목록에 대해 참조부서 이름 목록을 반환 (목록 화면에서 결재 현황과 함께 표시용)
export async function getReferenceOrgUnitNames(domain: ApprovalDomainCode, requestIds: string[]): Promise<Map<string, string[]>> {
  if (requestIds.length === 0) return new Map();

  const { data: refs } = await supabase
    .from('approval_request_references')
    .select('request_id, org_unit_id')
    .eq('domain', domain)
    .in('request_id', requestIds);
  if (!refs || refs.length === 0) return new Map();

  const unitIds = [...new Set(refs.map(r => r.org_unit_id))];
  const { data: units } = await supabase.from('org_units').select('id, name').in('id', unitIds);
  const unitNameMap = new Map((units || []).map(u => [u.id, u.name]));

  const result = new Map<string, string[]>();
  for (const r of refs) {
    const name = unitNameMap.get(r.org_unit_id);
    if (!name) continue;
    const arr = result.get(r.request_id) || [];
    arr.push(name);
    result.set(r.request_id, arr);
  }
  return result;
}
