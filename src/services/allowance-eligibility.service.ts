import { supabase } from '@/lib/supabase';
import { allowanceService } from '@/services/allowance.service';
import type { AllowanceKind } from '@/types/allowance';

export interface AllowanceEligibilityItem {
  templateItemId: string;
  allowanceItemId: string;
  allowanceItemName: string;
  kind: AllowanceKind;
  amount: number;
  currency: string;
  eligible: boolean;
  reasons: string[]; // 조건 미충족 사유(한국어). eligible=true면 빈 배열.
  payoutCountSoFar: number; // reset_on_owner_change 적용 후 값
}

interface AssignmentInput {
  assignmentId: string;
  crewMemberId: string;
  rankId: string;
  embarkDate: string;
}

function monthsBetween(fromDate: string, toDate: string): number {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + (to.getDate() >= from.getDate() ? 0 : -1);
}

// 재고용수당 등 수당 지급 조건(최대 지급 횟수 / 직전 계약 최소 개월 / 재승선 인정 기간 /
// 선주 변경 시 리셋)을 크루 승선/계약 이력 기준으로 자동 판정한다. 이 판정은 지급 대상
// 여부를 "보여주기" 위한 것일 뿐 — 실제 발령에 적용할지는 발령자가 최종 결정한다
// (rotation.service.ts::executeRotationPlan에서 명시적 선택이 없을 때만 기본값으로 사용).
async function evaluateForShipAssignments(params: {
  shipId: string;
  ownerId: string;
  assignments: AssignmentInput[];
}): Promise<Map<string, AllowanceEligibilityItem[]>> {
  const { shipId, ownerId, assignments } = params;
  const result = new Map<string, AllowanceEligibilityItem[]>();
  if (assignments.length === 0) return result;

  const template = await allowanceService.getEffectiveTemplateForShip(shipId);
  if (!template || template.items.length === 0) {
    for (const a of assignments) result.set(a.assignmentId, []);
    return result;
  }

  const crewMemberIds = [...new Set(assignments.map(a => a.crewMemberId))];

  // 각 크루의 과거 승선기록(직전 재직 기간/재승선 간격 판정용) 전체를 한 번에 조회
  const { data: embarkRecords } = await supabase
    .from('crew_embarkation_records')
    .select('crew_member_id, departure_date, embark_date, disembark_date, return_date')
    .in('crew_member_id', crewMemberIds)
    .order('embark_date', { ascending: false });

  // 각 크루의 과거 계약(직전 선주 비교용) 전체를 한 번에 조회
  const { data: pastContracts } = await supabase
    .from('crew_contracts')
    .select('id, crew_member_id, owner_id, start_date')
    .in('crew_member_id', crewMemberIds)
    .order('start_date', { ascending: false });

  const contractIds = [...new Set((pastContracts || []).map(c => c.id))];
  const { data: pastAllowances } = contractIds.length > 0
    ? await supabase.from('crew_contract_allowances').select('contract_id, allowance_item_id').in('contract_id', contractIds)
    : { data: [] as { contract_id: string; allowance_item_id: string }[] };

  for (const a of assignments) {
    // 이 크루의, 이번 승선일보다 앞선 가장 최근 승선기록 (없으면 "최초 승선")
    const previousRecord = (embarkRecords || [])
      .filter(r => r.crew_member_id === a.crewMemberId && r.embark_date < a.embarkDate)
      .sort((x, y) => (x.embark_date < y.embark_date ? 1 : -1))[0] || null;

    const priorContractMonths = previousRecord
      ? monthsBetween(
          previousRecord.departure_date || previousRecord.embark_date,
          previousRecord.return_date || previousRecord.disembark_date || a.embarkDate,
        )
      : null;
    const gapMonths = previousRecord && (previousRecord.return_date || previousRecord.disembark_date)
      ? monthsBetween(previousRecord.return_date || previousRecord.disembark_date!, a.embarkDate)
      : null;

    // 이 크루의, 이번 계약보다 앞선 가장 최근 과거 계약 — 선주 변경 여부 판정용
    const previousContract = (pastContracts || [])
      .filter(c => c.crew_member_id === a.crewMemberId && c.start_date < a.embarkDate)
      .sort((x, y) => (x.start_date < y.start_date ? 1 : -1))[0] || null;
    const ownerChanged = !!previousContract && previousContract.owner_id !== ownerId;

    const rankSpecific = template.items.filter(i => i.rank_id === a.rankId);
    const matched = rankSpecific.length > 0 ? rankSpecific : template.items.filter(i => !i.rank_id);

    const items: AllowanceEligibilityItem[] = matched.map(item => {
      const pastContractIdsForCrew = (pastContracts || [])
        .filter(c => c.crew_member_id === a.crewMemberId && c.start_date < a.embarkDate)
        .map(c => c.id);
      const rawPayoutCount = (pastAllowances || []).filter(
        pa => pastContractIdsForCrew.includes(pa.contract_id) && pa.allowance_item_id === item.allowance_item_id
      ).length;
      const payoutCountSoFar = item.reset_on_owner_change && ownerChanged ? 0 : rawPayoutCount;

      const reasons: string[] = [];
      if (item.max_payout_count != null && payoutCountSoFar >= item.max_payout_count) {
        reasons.push(`최대 지급 횟수(${item.max_payout_count}회) 초과 (누적 ${payoutCountSoFar}회)`);
      }
      if (item.min_prior_contract_months != null) {
        if (!previousRecord) {
          reasons.push('최초 승선으로 대상 아님');
        } else if (priorContractMonths == null || priorContractMonths < item.min_prior_contract_months) {
          reasons.push(`직전 계약 ${item.min_prior_contract_months}개월 미만 (실제 ${priorContractMonths ?? 0}개월)`);
        }
      }
      if (item.max_gap_months != null && previousRecord && gapMonths != null && gapMonths > item.max_gap_months) {
        reasons.push(`재승선 인정 기간(${item.max_gap_months}개월) 초과 경과 (실제 ${gapMonths}개월)`);
      }

      return {
        templateItemId: item.id,
        allowanceItemId: item.allowance_item_id,
        allowanceItemName: item.allowance_item.name,
        kind: item.kind,
        amount: item.amount,
        currency: item.currency,
        eligible: reasons.length === 0,
        reasons,
        payoutCountSoFar,
      };
    });

    result.set(a.assignmentId, items);
  }

  return result;
}

export const allowanceEligibilityService = { evaluateForShipAssignments };
