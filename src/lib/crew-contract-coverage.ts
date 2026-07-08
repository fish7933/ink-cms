// 특정 기준일에 계약이 유효했는지(=그 선박에 승선 중이었는지) 판단하는 공통 규칙.
// crew_contracts는 sea_service_records와 달리 end_date가 항상 채워져 있으므로(계약 종료 예정일),
// 조기 하선(terminated)된 경우엔 실제 종료일(terminated_date)을 우선한다.
export function isContractActiveOnDate(
  contract: { start_date: string; end_date: string; terminated_date?: string | null; status: string },
  date: string
): boolean {
  if (contract.status === 'draft') return false;
  const effectiveEnd = contract.terminated_date || contract.end_date;
  return contract.start_date <= date && effectiveEnd >= date;
}
