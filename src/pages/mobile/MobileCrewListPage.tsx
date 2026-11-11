import { useEffect, useMemo, useState } from 'react';
import { Search, ChevronRight } from 'lucide-react';
import { crewService, type CrewWithDetails } from '@/services/crew.service';
import { getRanks } from '@/lib/store';
import { sortRanksByDisplayOrder } from '@/lib/rank-order';
import { getNationalities } from '@/services/nationality.service';
import type { Rank } from '@/types/models';
import type { Nationality } from '@/types/nationality';

interface Props {
  onSelect: (crew: CrewWithDetails) => void;
}

// 데스크탑 CrewManagementPage와 동일한 5단계 탭 — 같은 상태 매핑(CATEGORY_STATUS_MAP/
// matchesCategory)을 그대로 가져와 모바일에서도 같은 기준으로 분류한다.
type CategoryTab = 'all' | 'registered' | 'standby' | 'onboard' | 'disembarked';
const CATEGORY_LABELS: Record<CategoryTab, string> = {
  all: '전체', registered: '등록', standby: '대기', onboard: '승선중', disembarked: '하선',
};
const CATEGORY_STATUS_MAP: Record<CategoryTab, string[]> = {
  all: [],
  registered: ['registered', 'under_review', 'sent_to_owner', 'owner_approved', 'owner_rejected'],
  standby: ['deployment_decided', 'standby'],
  onboard: ['onboard'],
  disembarked: ['standby'],
};
const CATEGORY_ORDER: CategoryTab[] = ['all', 'registered', 'standby', 'onboard', 'disembarked'];

function matchesCategory(c: CrewWithDetails & { status?: string }, cat: CategoryTab): boolean {
  if (cat === 'all') return true;
  const st = c.status || c.current_status || '';
  if (cat === 'standby') return CATEGORY_STATUS_MAP.standby.includes(st) && Boolean(c.has_pending_plan);
  if (cat === 'disembarked') return st === 'standby' && !c.has_pending_plan;
  return CATEGORY_STATUS_MAP[cat].includes(st);
}

// 선원 목록 — 조회 전용(모바일 범위는 선원 목록/상세 조회만).
export default function MobileCrewListPage({ onSelect }: Props) {
  const [crews, setCrews] = useState<CrewWithDetails[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [nationalities, setNationalities] = useState<Nationality[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CategoryTab>('all');
  const [filterOwner, setFilterOwner] = useState('all');
  const [filterFleet, setFilterFleet] = useState('all');
  const [filterShip, setFilterShip] = useState('all');
  const [filterRank, setFilterRank] = useState('all');
  const [filterManning, setFilterManning] = useState('all');
  const [filterNationality, setFilterNationality] = useState('all');

  useEffect(() => {
    Promise.all([crewService.getAllWithDetails(), getRanks(), getNationalities()]).then(([crewData, rankData, natData]) => {
      setCrews(crewData);
      setRanks(rankData);
      setNationalities(natData);
      setLoading(false);
    });
  }, []);

  const effRankId = (c: CrewWithDetails) => c.is_active_onboard ? c.rank_id : (c.pending_rank_id || c.rank_id);
  const effRankCode = (c: CrewWithDetails) => c.is_active_onboard ? c.rank_code : (c.pending_rank_code || c.rank_code);
  const effShipName = (c: CrewWithDetails) => c.is_active_onboard ? c.current_ship_name : (c.pending_ship_name || c.current_ship_name);
  const effOwnerId = (c: CrewWithDetails) => c.is_active_onboard ? c.owner_id : (c.pending_owner_id || c.owner_id);
  const effOwnerName = (c: CrewWithDetails) => c.is_active_onboard ? c.owner_name : (c.pending_owner_name || c.owner_name);
  const effFleetId = (c: CrewWithDetails) => c.is_active_onboard ? c.fleet_id : (c.pending_fleet_id || c.fleet_id);
  const effFleetName = (c: CrewWithDetails) => c.is_active_onboard ? c.fleet_name : (c.pending_fleet_name || c.fleet_name);
  const effShipId = (c: CrewWithDetails) => c.is_active_onboard ? c.current_ship_id : (c.pending_ship_id || c.current_ship_id);

  // 승선중이면 승선일(+하선예정일), 승선 예정이면 승선예정일, 그 외(하선/등록)엔 최근 하선일을 보여준다.
  const embarkInfo = (c: CrewWithDetails): string | null => {
    if (c.is_active_onboard) {
      if (!c.latest_embark_date) return null;
      return `승선 ${c.latest_embark_date}${c.disembark_forecast_date ? ` · 하선예정 ${c.disembark_forecast_date}` : ''}`;
    }
    if (c.has_pending_plan && c.pending_embark_date) return `승선예정 ${c.pending_embark_date}`;
    if (c.latest_disembark_date) return `하선 ${c.latest_disembark_date}`;
    return null;
  };

  // 모든 선원 목록/드롭다운은 항상 직급 관리 화면과 같은 순서(부서 → display_order)를
  // 따라야 한다 — ranks 테이블의 display_order만 단순 정렬하면 부서가 뒤섞이므로
  // sortRanksByDisplayOrder로 먼저 정렬한 뒤 그 순서의 인덱스를 기준으로 선원을 정렬한다.
  const sortedRanks = useMemo(() => sortRanksByDisplayOrder(ranks), [ranks]);
  const rankOrderIndex = useMemo(() => new Map(sortedRanks.map((r, i) => [r.id, i])), [sortedRanks]);

  const byCategory = useMemo(() => crews.filter(c => matchesCategory(c, category)), [crews, category]);

  // 데스크탑 CrewManagementPage처럼 다른 필터와 교차시킨 옵션별 카운트까지는 두지 않고
  // (모바일에서는 과한 복잡도), 현재 탭 안에서 실제로 존재하는 값만 간단히 모아 보여준다.
  const uniqueOptions = (getId: (c: CrewWithDetails) => string | undefined, getLabel: (c: CrewWithDetails) => string | undefined) => {
    const map = new Map<string, string>();
    for (const c of byCategory) {
      const id = getId(c);
      if (id && !map.has(id)) map.set(id, getLabel(c) || id);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'ko'));
  };
  const ownerOptions = useMemo(() => uniqueOptions(effOwnerId, effOwnerName), [byCategory]);
  const fleetOptions = useMemo(() => uniqueOptions(effFleetId, effFleetName), [byCategory]);
  const shipOptions = useMemo(() => uniqueOptions(effShipId, effShipName), [byCategory]);
  const manningOptions = useMemo(() => uniqueOptions(c => c.manning_agency_id, c => c.manning_agency_name), [byCategory]);
  const nationalityCodes = useMemo(() => new Set(byCategory.map(c => c.nationality).filter((n): n is string => !!n)), [byCategory]);
  const nationalityOptions = useMemo(
    () => nationalities.filter(n => nationalityCodes.has(n.country_code)).map(n => [n.country_code, n.country_name_ko] as const),
    [nationalities, nationalityCodes]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = byCategory.filter(c =>
      (filterOwner === 'all' || effOwnerId(c) === filterOwner) &&
      (filterFleet === 'all' || effFleetId(c) === filterFleet) &&
      (filterShip === 'all' || effShipId(c) === filterShip) &&
      (filterRank === 'all' || effRankId(c) === filterRank) &&
      (filterManning === 'all' || c.manning_agency_id === filterManning) &&
      (filterNationality === 'all' || c.nationality === filterNationality)
    );
    list = [...list].sort((a, b) => (rankOrderIndex.get(effRankId(a) || '') ?? 999) - (rankOrderIndex.get(effRankId(b) || '') ?? 999));
    if (q) {
      list = list.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (effRankCode(c) || '').toLowerCase().includes(q) ||
        (effShipName(c) || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [byCategory, search, rankOrderIndex, filterOwner, filterFleet, filterShip, filterRank, filterManning, filterNationality]);

  if (loading) {
    return <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="이름, 직급, 선박으로 검색"
          className="w-full h-10 pl-9 pr-3 rounded-lg border border-gray-200 bg-white text-sm"
        />
      </div>

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {CATEGORY_ORDER.map(cat => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategory(cat)}
            className={`shrink-0 h-8 px-3 rounded-full text-xs font-medium border ${category === cat ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}
          >
            {CATEGORY_LABELS[cat]} {crews.filter(c => matchesCategory(c, cat)).length}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <select value={filterOwner} onChange={e => setFilterOwner(e.target.value)} className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs">
          <option value="all">선주사 전체</option>
          {ownerOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <select value={filterFleet} onChange={e => setFilterFleet(e.target.value)} className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs">
          <option value="all">플릿 전체</option>
          {fleetOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <select value={filterShip} onChange={e => setFilterShip(e.target.value)} className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs">
          <option value="all">선박 전체</option>
          {shipOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <select value={filterRank} onChange={e => setFilterRank(e.target.value)} className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs">
          <option value="all">직급 전체</option>
          {sortedRanks.map(r => <option key={r.id} value={r.id}>{r.rank_code || r.name}</option>)}
        </select>
        <select value={filterManning} onChange={e => setFilterManning(e.target.value)} className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs">
          <option value="all">매닝사 전체</option>
          {manningOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <select value={filterNationality} onChange={e => setFilterNationality(e.target.value)} className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs">
          <option value="all">국적 전체</option>
          {nationalityOptions.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
        </select>
      </div>

      <div className="space-y-2">
        {filtered.map(c => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c)}
            className="w-full flex items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3 text-left shadow-sm active:bg-gray-50"
          >
            <div className="min-w-0">
              <div className="text-xs text-gray-500 truncate">
                {effRankCode(c) || '-'} · {effShipName(c) || '대기 중'}
              </div>
              <div className="text-sm font-semibold text-gray-800 truncate">{c.name}</div>
              {embarkInfo(c) && <div className="text-[11px] text-gray-400 truncate mt-0.5">{embarkInfo(c)}</div>}
            </div>
            <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full ${c.is_active_onboard ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
              {c.is_active_onboard ? '승선중' : '대기중'}
            </span>
            <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="text-center text-sm text-gray-400 py-10">검색 결과가 없습니다.</div>
        )}
      </div>
    </div>
  );
}
