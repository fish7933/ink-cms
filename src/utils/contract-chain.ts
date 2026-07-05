import type { CrewContractWithDetails } from '@/types/contract';

export interface ContractChain {
  rootId: string;
  contracts: CrewContractWithDetails[]; // 시작일 오름차순 (최초 → 갱신 이력)
  root: CrewContractWithDetails;
  latest: CrewContractWithDetails; // 현재 표시 기준이 되는 행(가장 최근 계약/갱신)
  renewalCount: number;
  totalMonths: number; // 최초 계약부터 갱신 전부 합산한 실제 승선 개월수
}

function monthsBetween(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  const months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
  const dayFraction = (e.getDate() - s.getDate()) / 30;
  return Math.max(0, months + dayFraction);
}

/** 계약 목록을 갱신 사슬(최초 계약 + 그 갱신들) 단위로 묶는다. */
export function buildContractChains(contracts: CrewContractWithDetails[]): ContractChain[] {
  const groups = new Map<string, CrewContractWithDetails[]>();
  for (const c of contracts) {
    const key = c.root_contract_id || c.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }

  const chains: ContractChain[] = [];
  for (const [rootId, list] of groups) {
    const sorted = [...list].sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
    const root = sorted.find(c => !c.root_contract_id) || sorted[0];
    const latest = sorted[sorted.length - 1];
    const totalMonths = sorted.reduce((sum, c) => sum + (c.duration_months ?? monthsBetween(c.start_date, c.end_date)), 0);
    chains.push({
      rootId,
      contracts: sorted,
      root,
      latest,
      renewalCount: sorted.length - 1,
      totalMonths,
    });
  }
  return chains;
}

export type EffectiveStatus = 'draft' | 'valid' | 'expired' | 'completed' | 'terminated' | 'renewed';

export const EFFECTIVE_STATUS_CONFIG: Record<EffectiveStatus, { label: string; color: string }> = {
  draft: { label: '임시', color: 'bg-gray-100 text-gray-600' },
  valid: { label: '유효', color: 'bg-green-100 text-green-700' },
  expired: { label: '만료', color: 'bg-red-100 text-red-700' },
  completed: { label: '완료', color: 'bg-blue-100 text-blue-700' },
  terminated: { label: '해지', color: 'bg-red-100 text-red-700' },
  renewed: { label: '갱신됨', color: 'bg-purple-100 text-purple-700' },
};

/** 계약 하나의 실제 표시 상태 — active 상태인 계약만 만료일 기준으로 유효/만료를 나눈다. */
export function getEffectiveStatus(contract: CrewContractWithDetails, today: Date = new Date()): EffectiveStatus {
  if (contract.status === 'active') {
    const end = new Date(contract.end_date);
    end.setHours(23, 59, 59, 999);
    return today <= end ? 'valid' : 'expired';
  }
  return contract.status as EffectiveStatus;
}

/** 최초 계약~갱신 합산 개월수가 이 값 이상이면 하선 필요 배지를 표시 */
export const DISEMBARK_NEEDED_THRESHOLD_MONTHS = 10;
