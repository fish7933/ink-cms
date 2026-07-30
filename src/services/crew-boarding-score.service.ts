import { supabase } from '@/lib/supabase';

export interface RecommendationContext {
  targetShipId: string;
  targetEmbarkDate?: string; // YYYY-MM-DD
  targetRankId?: string;
}

export interface CrewBoardingScore {
  crewMemberId: string;
  score: number; // 0~100
  reasons: string[]; // 표시용 짧은 근거 2~3개
}

// 각 요소를 0~1로 정규화한 뒤 이 가중치로 가중평균한다(합이 100일 필요는 없음 — 존재하는
// 요소끼리 정규화됨).
// "선원 관리 설정 > 승선 적합도 설정" 화면에서 관리자가 조정 가능 — crew_boarding_score_weights
// 싱글턴 테이블에 저장되며, 아래 DEFAULT는 그 테이블 행을 못 읽어올 때만 쓰는 대체값이다.
export interface BoardingScoreWeights {
  shipType: number;
  size: number;
  route: number;
  evaluation: number;
  workYears: number;
  sameRank: number; // 대상 직급으로 실제 승선해본 경력(연차) — 단순 현재 직급 보유 여부가 아님
  rest: number;
  desiredDate: number;
  familiarity: number; // 같은 선박/플릿/선주사 승선 경험
  age: number; // 30대 최고점, 멀어질수록 감점
}

export const DEFAULT_BOARDING_SCORE_WEIGHTS: BoardingScoreWeights = {
  shipType: 15,
  size: 10,
  route: 10,
  evaluation: 25,
  workYears: 15,
  sameRank: 20,
  rest: 15,
  desiredDate: 10,
  familiarity: 15,
  age: 10,
};

type WeightKey = keyof BoardingScoreWeights;

export const BOARDING_SCORE_FACTOR_LABELS: Record<WeightKey, string> = {
  shipType: '선종 경험',
  size: '선박 사이즈 경험',
  route: '항로 경험',
  evaluation: '기존 고과',
  workYears: '근무년수',
  sameRank: '동직급 경력',
  rest: '휴식 기간',
  desiredDate: '승선 희망일',
  familiarity: '선박/플릿/선주사 친숙도',
  age: '나이',
};

// 적합도 분석 화면에서 요소별로 보여줄 상세 — value가 null이면 데이터가 없어 채점에서 제외된
// 요소(감점이 아니라 "판단 불가")라는 뜻.
export interface BoardingScoreFactorDetail {
  key: WeightKey;
  label: string;
  weight: number;
  value: number | null; // 0~1
  detail: string; // 사람이 읽는 근거 문장
}

export interface CrewBoardingScoreDetail {
  crewMemberId: string;
  score: number;
  factors: BoardingScoreFactorDetail[];
}

export async function getBoardingScoreWeights(): Promise<BoardingScoreWeights> {
  const { data, error } = await supabase
    .from('crew_boarding_score_weights')
    .select('ship_type, size, route, evaluation, work_years, same_rank, rest, desired_date, familiarity, age')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return DEFAULT_BOARDING_SCORE_WEIGHTS;
  return {
    shipType: data.ship_type,
    size: data.size,
    route: data.route,
    evaluation: data.evaluation,
    workYears: data.work_years,
    sameRank: data.same_rank,
    rest: data.rest,
    desiredDate: data.desired_date,
    familiarity: data.familiarity,
    age: data.age,
  };
}

export async function updateBoardingScoreWeights(weights: BoardingScoreWeights): Promise<void> {
  const { data: existing } = await supabase.from('crew_boarding_score_weights').select('id').limit(1).maybeSingle();
  const payload = {
    ship_type: weights.shipType,
    size: weights.size,
    route: weights.route,
    evaluation: weights.evaluation,
    work_years: weights.workYears,
    same_rank: weights.sameRank,
    rest: weights.rest,
    desired_date: weights.desiredDate,
    familiarity: weights.familiarity,
    age: weights.age,
    updated_at: new Date().toISOString(),
  };
  const { error } = existing
    ? await supabase.from('crew_boarding_score_weights').update(payload).eq('id', existing.id)
    : await supabase.from('crew_boarding_score_weights').insert([payload]);
  if (error) throw error;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const daysBetween = (a: string, b: string) => Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86400000);

interface SeaRecordLite {
  crew_member_id: string;
  ship_id: string | null;
  ship_type: string | null;
  gross_tonnage: number | null;
  rank: string | null;
  sign_on_date: string;
  sign_off_date: string | null;
}

interface TargetShipLite {
  id: string;
  ship_type: string | null;
  gross_tonnage: number | null;
  route: string | null;
  fleet_id: string | null;
  owner_id: string | null;
}

interface BulkData {
  weights: BoardingScoreWeights;
  targetShip: TargetShipLite | null;
  targetRankNames: string[];
  recordsByCrew: Map<string, SeaRecordLite[]>;
  evalsByCrew: Map<string, number[]>;
  memberById: Map<string, { id: string; desired_embark_date: string | null; date_of_birth: string | null }>;
  routeByShipId: Map<string, string | null>;
  fleetByShipId: Map<string, string | null>;
  ownerByShipId: Map<string, string | null>;
}

// 후보 목록에 필요한 모든 참조 데이터를 한 번의 벌크 조회로 가져온다(후보마다 따로 쿼리하지 않음).
async function fetchBulkData(candidateIds: string[], ctx: RecommendationContext): Promise<BulkData> {
  const [weights, { data: targetShip }, { data: seaRecords }, { data: evals }, { data: members }, { data: targetRank }] = await Promise.all([
    getBoardingScoreWeights(),
    supabase.from('ships').select('id, ship_type, gross_tonnage, route, fleet_id, owner_id').eq('id', ctx.targetShipId).maybeSingle(),
    supabase
      .from('sea_service_records')
      .select('crew_member_id, ship_id, ship_type, gross_tonnage, rank, sign_on_date, sign_off_date')
      .in('crew_member_id', candidateIds),
    supabase.from('crew_evaluations').select('crew_member_id, overall_rating, status').in('crew_member_id', candidateIds),
    supabase.from('crew_members').select('id, desired_embark_date, date_of_birth').in('id', candidateIds),
    ctx.targetRankId
      ? supabase.from('ranks').select('rank_code, name').eq('id', ctx.targetRankId).maybeSingle()
      : Promise.resolve({ data: null as { rank_code: string | null; name: string | null } | null }),
  ]);

  // sea_service_records.rank는 자유 텍스트라 ranks 테이블의 rank_code/name 둘 다와 비교한다.
  const targetRankNames = [targetRank?.rank_code, targetRank?.name]
    .filter((v): v is string => !!v && v.trim().length > 0)
    .map(v => v.trim());

  // sea_service_records에는 항로(route)가 없다 — 과거 승선했던 배의 ship_id로 ships를 한 번 더
  // 조회해 "그 배가 지금 다니는 항로"를 그때도 다녔을 것으로 근사한다. 회사 입사 전 경력
  // (ship_id가 없는 pre_company 기록)은 이 방식으로 항로를 알 수 없어 항로 매칭에서 제외된다.
  const historicalShipIds = [...new Set((seaRecords || []).map(r => r.ship_id).filter((id): id is string => !!id))];
  const { data: historicalShips } = historicalShipIds.length > 0
    ? await supabase.from('ships').select('id, route, fleet_id, owner_id').in('id', historicalShipIds)
    : { data: [] as { id: string; route: string | null; fleet_id: string | null; owner_id: string | null }[] };

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

  return {
    weights,
    targetShip: targetShip || null,
    targetRankNames,
    recordsByCrew,
    evalsByCrew,
    memberById: new Map((members || []).map(m => [m.id, m])),
    routeByShipId: new Map((historicalShips || []).map(s => [s.id, s.route])),
    fleetByShipId: new Map((historicalShips || []).map(s => [s.id, s.fleet_id])),
    ownerByShipId: new Map((historicalShips || []).map(s => [s.id, s.owner_id])),
  };
}

// 후보 한 명의 적합도를 계산한다 — 요소별 세부 내역(factors)까지 전부 담아 반환하고, 목록용
// 짧은 근거(reasons)는 그 세부 내역에서 뽑아 만든다.
function scoreCandidate(crewId: string, ctx: RecommendationContext, bulk: BulkData, today: string): CrewBoardingScoreDetail {
  const { weights, targetShip, targetRankNames, recordsByCrew, evalsByCrew, memberById, routeByShipId, fleetByShipId, ownerByShipId } = bulk;
  const records = recordsByCrew.get(crewId) || [];
  const member = memberById.get(crewId);
  const factors: BoardingScoreFactorDetail[] = [];
  const push = (key: WeightKey, value: number | null, detail: string) => factors.push({ key, label: BOARDING_SCORE_FACTOR_LABELS[key], weight: weights[key], value, detail });

  if (!targetShip) {
    for (const key of Object.keys(weights) as WeightKey[]) push(key, null, '대상 선박 정보를 찾을 수 없습니다.');
    return { crewMemberId: crewId, score: 0, factors };
  }

  // 선종 매칭
  const typedRecords = records.filter(r => r.ship_type);
  if (targetShip.ship_type && typedRecords.length > 0) {
    const matches = typedRecords.filter(r => r.ship_type!.trim() === targetShip.ship_type!.trim()).length;
    push('shipType', matches / typedRecords.length, `과거 경력 ${typedRecords.length}건 중 동일 선종(${targetShip.ship_type}) ${matches}건`);
  } else {
    push('shipType', null, '비교할 과거 승선 선종 이력이 없습니다.');
  }

  // 사이즈 매칭
  const sizedRecords = records.filter(r => r.gross_tonnage);
  if (targetShip.gross_tonnage && sizedRecords.length > 0) {
    const avgGt = sizedRecords.reduce((s, r) => s + (r.gross_tonnage || 0), 0) / sizedRecords.length;
    const v = clamp01(1 - Math.abs(avgGt - targetShip.gross_tonnage) / targetShip.gross_tonnage);
    push('size', v, `과거 평균 총톤수 ${Math.round(avgGt).toLocaleString('ko-KR')}톤 (대상 선박 ${Math.round(targetShip.gross_tonnage).toLocaleString('ko-KR')}톤)`);
  } else {
    push('size', null, '비교할 과거 승선 선박 톤수 이력이 없습니다.');
  }

  // 항로 매칭
  const routableRecords = records.filter(r => r.ship_id && routeByShipId.get(r.ship_id));
  if (targetShip.route && routableRecords.length > 0) {
    const matches = routableRecords.filter(r => routeByShipId.get(r.ship_id!)?.trim() === targetShip.route!.trim()).length;
    push('route', matches / routableRecords.length, `과거 경력 ${routableRecords.length}건 중 동일 항로(${targetShip.route}) ${matches}건`);
  } else {
    push('route', null, '비교할 과거 항로 이력이 없습니다(항로 정보가 없는 선박 경력 제외).');
  }

  // 고과
  const ratings = evalsByCrew.get(crewId) || [];
  if (ratings.length > 0) {
    const avg = ratings.reduce((s, v) => s + v, 0) / ratings.length;
    push('evaluation', clamp01((avg - 1) / 4), `확정된 승선평가 ${ratings.length}건 평균 ${avg.toFixed(1)}점(5점 만점)`);
  } else {
    push('evaluation', null, '확정된 승선평가 이력이 없습니다.');
  }

  // 근무년수
  if (records.length > 0) {
    const totalDays = records.reduce((s, r) => s + daysBetween(r.sign_on_date, r.sign_off_date || today), 0);
    const years = totalDays / 365.25;
    push('workYears', years / (years + 5), `누적 승선 기간 약 ${years.toFixed(1)}년`);
  } else {
    push('workYears', null, '승선 이력이 없습니다.');
  }

  // 동직급 경력 — 지금 그 직급을 갖고 있는지가 아니라, 실제로 그 직급으로 승선해본 연차가
  // 얼마나 되는지를 본다(막 진급해 그 직급 경력이 전혀 없는 사람과 오래 근무한 사람을 구분).
  if (targetRankNames.length > 0) {
    const sameRankRecords = records.filter(r => r.rank && targetRankNames.includes(r.rank.trim()));
    if (sameRankRecords.length > 0) {
      const sameRankDays = sameRankRecords.reduce((s, r) => s + daysBetween(r.sign_on_date, r.sign_off_date || today), 0);
      const sameRankYears = sameRankDays / 365.25;
      push('sameRank', sameRankYears / (sameRankYears + 2), `해당 직급으로 승선한 경력 약 ${sameRankYears.toFixed(1)}년`);
    } else {
      push('sameRank', 0, '해당 직급으로 승선한 경력이 없습니다.');
    }
  } else {
    push('sameRank', null, '대상 직급 정보가 없습니다.');
  }

  // 휴식
  const signOffDates = records.map(r => r.sign_off_date).filter((d): d is string => !!d);
  if (signOffDates.length > 0) {
    const lastSignOff = signOffDates.reduce((a, b) => (a > b ? a : b));
    const restDays = Math.round(daysBetween(lastSignOff, today));
    push('rest', clamp01(1 - Math.abs(restDays - 90) / 90), `마지막 하선(${lastSignOff})으로부터 ${restDays}일 경과 (기준 90일)`);
  } else {
    push('rest', null, '하선 이력이 없어 휴식 기간을 계산할 수 없습니다.');
  }

  // 승선 희망일
  if (member?.desired_embark_date && ctx.targetEmbarkDate) {
    const diff = Math.round(daysBetween(member.desired_embark_date, ctx.targetEmbarkDate));
    push('desiredDate', clamp01(1 - diff / 30), `희망일 ${member.desired_embark_date} vs 목표 승선일 ${ctx.targetEmbarkDate} (차이 ${diff}일)`);
  } else {
    push('desiredDate', null, member?.desired_embark_date ? '목표 승선일이 아직 정해지지 않았습니다.' : '승선 희망일이 등록돼 있지 않습니다.');
  }

  // 친숙도
  const recordsWithShip = records.filter(r => r.ship_id);
  if (recordsWithShip.length > 0) {
    const sameShip = recordsWithShip.some(r => r.ship_id === ctx.targetShipId);
    const sameFleet = !sameShip && targetShip.fleet_id && recordsWithShip.some(r => fleetByShipId.get(r.ship_id!) === targetShip.fleet_id);
    const sameOwner = !sameShip && !sameFleet && targetShip.owner_id && recordsWithShip.some(r => ownerByShipId.get(r.ship_id!) === targetShip.owner_id);
    if (sameShip) push('familiarity', 1, '동일 선박 승선 경험 있음');
    else if (sameFleet) push('familiarity', 0.6, '동일 플릿 승선 경험 있음(같은 선박은 아님)');
    else if (sameOwner) push('familiarity', 0.3, '동일 선주사 승선 경험 있음(같은 플릿은 아님)');
    else push('familiarity', 0, '동일 선박/플릿/선주사 승선 경험 없음');
  } else {
    push('familiarity', null, '승선 이력이 없습니다.');
  }

  // 나이
  if (member?.date_of_birth) {
    const age = Math.floor((Date.now() - new Date(member.date_of_birth).getTime()) / (365.25 * 86400000));
    const distFromThirties = age < 30 ? 30 - age : age > 39 ? age - 39 : 0;
    push('age', clamp01(1 - distFromThirties / 20), `만 ${age}세 (기준 30~39세)`);
  } else {
    push('age', null, '생년월일 정보가 없습니다.');
  }

  const scored = factors.filter((f): f is BoardingScoreFactorDetail & { value: number } => f.value !== null);
  const weightSum = scored.reduce((s, f) => s + f.weight, 0);
  const weighted = scored.reduce((s, f) => s + f.weight * f.value, 0);
  const score = weightSum > 0 ? Math.round((weighted / weightSum) * 100) : 0;

  return { crewMemberId: crewId, score, factors };
}

// 후보 여러 명의 적합도를 한 번의 벌크 조회로 계산한다(후보마다 따로 쿼리하지 않음).
export async function getBoardingScores(
  candidateIds: string[],
  ctx: RecommendationContext
): Promise<Map<string, CrewBoardingScore>> {
  const result = new Map<string, CrewBoardingScore>();
  if (candidateIds.length === 0) return result;

  const bulk = await fetchBulkData(candidateIds, ctx);
  if (!bulk.targetShip) return result; // 대상 선박을 못 찾으면 채점 근거가 없으니 빈 결과.

  const today = new Date().toISOString().slice(0, 10);
  for (const crewId of candidateIds) {
    const detail = scoreCandidate(crewId, ctx, bulk, today);
    const reasons = detail.factors.filter(f => f.value !== null && f.value > 0).map(f => f.detail).slice(0, 3);
    result.set(crewId, { crewMemberId: crewId, score: detail.score, reasons });
  }
  return result;
}

// 적합도 분석 화면용 — 후보 한 명의 요소별 세부 내역을 전부 반환한다.
export async function getBoardingScoreDetail(crewId: string, ctx: RecommendationContext): Promise<CrewBoardingScoreDetail | null> {
  const bulk = await fetchBulkData([crewId], ctx);
  if (!bulk.targetShip) return null;
  const today = new Date().toISOString().slice(0, 10);
  return scoreCandidate(crewId, ctx, bulk, today);
}
