import { supabase } from '@/lib/supabase';

export interface RecommendationContext {
  targetShipId: string;
  targetEmbarkDate?: string; // YYYY-MM-DD
}

export interface CrewBoardingScore {
  crewMemberId: string;
  score: number; // 0~100
  reasons: string[]; // 표시용 짧은 근거 2~3개
}

// 각 요소를 0~1로 정규화한 뒤 이 가중치로 가중평균한다. 나이는 선호 방향(젊을수록/많을수록)이
// 정해지지 않아 점수화하지 않고 정보로만 보여준다 — 방향이 정해지면 여기 한 줄만 추가하면 된다.
export const BOARDING_SCORE_WEIGHTS = {
  shipType: 0.15,
  size: 0.10,
  route: 0.10,
  evaluation: 0.25,
  workYears: 0.15,
  rest: 0.15,
  desiredDate: 0.10,
} as const;

type WeightKey = keyof typeof BOARDING_SCORE_WEIGHTS;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const daysBetween = (a: string, b: string) => Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86400000);

interface SeaRecordLite {
  crew_member_id: string;
  ship_id: string | null;
  ship_type: string | null;
  gross_tonnage: number | null;
  sign_on_date: string;
  sign_off_date: string | null;
}

// 후보 여러 명의 적합도를 한 번의 벌크 조회로 계산한다(후보마다 따로 쿼리하지 않음).
export async function getBoardingScores(
  candidateIds: string[],
  ctx: RecommendationContext
): Promise<Map<string, CrewBoardingScore>> {
  const result = new Map<string, CrewBoardingScore>();
  if (candidateIds.length === 0) return result;

  const [{ data: targetShip }, { data: seaRecords }, { data: evals }, { data: members }] = await Promise.all([
    supabase.from('ships').select('id, ship_type, gross_tonnage, route').eq('id', ctx.targetShipId).maybeSingle(),
    supabase
      .from('sea_service_records')
      .select('crew_member_id, ship_id, ship_type, gross_tonnage, sign_on_date, sign_off_date')
      .in('crew_member_id', candidateIds),
    supabase.from('crew_evaluations').select('crew_member_id, overall_rating, status').in('crew_member_id', candidateIds),
    supabase.from('crew_members').select('id, desired_embark_date, date_of_birth').in('id', candidateIds),
  ]);

  if (!targetShip) {
    // 대상 선박을 못 찾으면 채점 근거가 없으니 빈 결과 — 호출부는 이 경우 정렬/표시를 건너뛴다.
    return result;
  }

  // sea_service_records에는 항로(route)가 없다 — 과거 승선했던 배의 ship_id로 ships를 한 번 더
  // 조회해 "그 배가 지금 다니는 항로"를 그때도 다녔을 것으로 근사한다. 회사 입사 전 경력
  // (ship_id가 없는 pre_company 기록)은 이 방식으로 항로를 알 수 없어 항로 매칭에서 제외된다.
  const historicalShipIds = [...new Set((seaRecords || []).map(r => r.ship_id).filter((id): id is string => !!id))];
  const { data: historicalShips } = historicalShipIds.length > 0
    ? await supabase.from('ships').select('id, route').in('id', historicalShipIds)
    : { data: [] as { id: string; route: string | null }[] };
  const routeByShipId = new Map((historicalShips || []).map(s => [s.id, s.route]));

  const recordsByCrew = new Map<string, SeaRecordLite[]>();
  for (const r of (seaRecords || []) as SeaRecordLite[]) {
    if (!recordsByCrew.has(r.crew_member_id)) recordsByCrew.set(r.crew_member_id, []);
    recordsByCrew.get(r.crew_member_id)!.push(r);
  }
  const evalsByCrew = new Map<string, number[]>();
  for (const e of evals || []) {
    if (e.status === 'draft' || e.overall_rating == null) continue;
    if (!evalsByCrew.has(e.crew_member_id)) evalsByCrew.set(e.crew_member_id, []);
    evalsByCrew.get(e.crew_member_id)!.push(e.overall_rating);
  }
  const memberById = new Map((members || []).map(m => [m.id, m]));

  const today = new Date().toISOString().slice(0, 10);

  for (const crewId of candidateIds) {
    const records = recordsByCrew.get(crewId) || [];
    const parts: { key: WeightKey; value: number }[] = [];
    const reasons: string[] = [];

    // 선종 매칭 — 과거 승선 기록 중 대상 선박과 같은 선종 비율
    const typedRecords = records.filter(r => r.ship_type);
    if (targetShip.ship_type && typedRecords.length > 0) {
      const matches = typedRecords.filter(r => r.ship_type!.trim() === targetShip.ship_type!.trim()).length;
      const v = matches / typedRecords.length;
      parts.push({ key: 'shipType', value: v });
      if (matches > 0) reasons.push(`동일 선종 경력 ${matches}건`);
    }

    // 사이즈 매칭 — 과거 평균 총톤수와 대상 선박 총톤수의 근접도
    const sizedRecords = records.filter(r => r.gross_tonnage);
    if (targetShip.gross_tonnage && sizedRecords.length > 0) {
      const avgGt = sizedRecords.reduce((s, r) => s + (r.gross_tonnage || 0), 0) / sizedRecords.length;
      const v = clamp01(1 - Math.abs(avgGt - targetShip.gross_tonnage) / targetShip.gross_tonnage);
      parts.push({ key: 'size', value: v });
    }

    // 항로 매칭 — 과거 승선했던 배(ship_id 있는 것만)의 현재 항로와 대상 선박 항로 비교
    const routableRecords = records.filter(r => r.ship_id && routeByShipId.get(r.ship_id));
    if (targetShip.route && routableRecords.length > 0) {
      const matches = routableRecords.filter(r => routeByShipId.get(r.ship_id!)?.trim() === targetShip.route!.trim()).length;
      const v = matches / routableRecords.length;
      parts.push({ key: 'route', value: v });
      if (matches > 0) reasons.push(`동일 항로 경력 ${matches}건`);
    }

    // 고과 — 최종 확정된(초안 제외) 평가의 평균 (1~5 → 0~1)
    const ratings = evalsByCrew.get(crewId) || [];
    if (ratings.length > 0) {
      const avg = ratings.reduce((s, v) => s + v, 0) / ratings.length;
      parts.push({ key: 'evaluation', value: clamp01((avg - 1) / 4) });
      reasons.push(`고과 평균 ${avg.toFixed(1)}점`);
    }

    // 근무년수 — sign_on~sign_off(진행중이면 오늘까지) 구간을 다 더해 연 단위로, 체감(5년=0.5) 반영
    if (records.length > 0) {
      const totalDays = records.reduce((s, r) => s + daysBetween(r.sign_on_date, r.sign_off_date || today), 0);
      const years = totalDays / 365.25;
      parts.push({ key: 'workYears', value: years / (years + 5) });
    }

    // 휴식 — 가장 최근 하선일로부터 경과일수가 90일일 때 최고점, 짧거나 길수록(양방향) 감점
    const signOffDates = records.map(r => r.sign_off_date).filter((d): d is string => !!d);
    if (signOffDates.length > 0) {
      const lastSignOff = signOffDates.reduce((a, b) => (a > b ? a : b));
      const restDays = Math.round(daysBetween(lastSignOff, today));
      const v = clamp01(1 - Math.abs(restDays - 90) / 90);
      parts.push({ key: 'rest', value: v });
      reasons.push(`휴식 ${restDays}일${Math.abs(restDays - 90) <= 15 ? ' (적정)' : ''}`);
    }

    // 승선 희망일 — 등록돼 있고 목표 승선일도 있을 때만 가산 (미등록이면 중립 — 감점 아님)
    const member = memberById.get(crewId);
    if (member?.desired_embark_date && ctx.targetEmbarkDate) {
      const diff = Math.round(daysBetween(member.desired_embark_date, ctx.targetEmbarkDate));
      const v = clamp01(1 - diff / 30);
      parts.push({ key: 'desiredDate', value: v });
      reasons.push(`희망일과 ${diff}일 차이`);
    }

    // 나이는 점수화하지 않고 표시 정보로만 남긴다.
    if (member?.date_of_birth) {
      const age = Math.floor((Date.now() - new Date(member.date_of_birth).getTime()) / (365.25 * 86400000));
      reasons.push(`만 ${age}세`);
    }

    const weightSum = parts.reduce((s, p) => s + BOARDING_SCORE_WEIGHTS[p.key], 0);
    const weighted = parts.reduce((s, p) => s + BOARDING_SCORE_WEIGHTS[p.key] * p.value, 0);
    const score = weightSum > 0 ? Math.round((weighted / weightSum) * 100) : 0;

    result.set(crewId, { crewMemberId: crewId, score, reasons: reasons.slice(0, 3) });
  }

  return result;
}
