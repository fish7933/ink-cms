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

// 화면 안에서 왔다갔다 하는 동안(MobileShell의 keep-alive)은 컴포넌트가 안 사라지니 괜찮지만,
// 브라우저 탭을 새로고침하거나 앱을 다시 열면 컴포넌트 자체가 새로 마운트되며 검색어/탭/필터가
// 전부 초기화된다 — 그래서 localStorage에도 저장해 "다시 접속해도" 유지되게 한다.
const FILTERS_KEY = 'mobileCrewListFilters';
interface SavedFilters {
  search: string; category: CategoryTab;
  filterOwner: string; filterFleet: string; filterShip: string;
  filterRank: string; filterManning: string; filterNationality: string;
}
function loadSavedFilters(): Partial<SavedFilters> {
  try {
    const raw = localStorage.getItem(FILTERS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// 선원 목록 — 조회 전용(모바일 범위는 선원 목록/상세 조회만).
export default function MobileCrewListPage({ onSelect }: Props) {
  const [crews, setCrews] = useState<CrewWithDetails[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [nationalities, setNationalities] = useState<Nationality[]>([]);
  const [loading, setLoading] = useState(true);
  const saved = loadSavedFilters();
  const [search, setSearch] = useState(saved.search ?? '');
  const [category, setCategory] = useState<CategoryTab>(saved.category ?? 'all');
  const [filterOwner, setFilterOwner] = useState(saved.filterOwner ?? 'all');
  const [filterFleet, setFilterFleet] = useState(saved.filterFleet ?? 'all');
  const [filterShip, setFilterShip] = useState(saved.filterShip ?? 'all');
  const [filterRank, setFilterRank] = useState(saved.filterRank ?? 'all');
  const [filterManning, setFilterManning] = useState(saved.filterManning ?? 'all');
  const [filterNationality, setFilterNationality] = useState(saved.filterNationality ?? 'all');

  useEffect(() => {
    const toSave: SavedFilters = { search, category, filterOwner, filterFleet, filterShip, filterRank, filterManning, filterNationality };
    try { localStorage.setItem(FILTERS_KEY, JSON.stringify(toSave)); } catch { /* ignore */ }
  }, [search, category, filterOwner, filterFleet, filterShip, filterRank, filterManning, filterNationality]);

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

  // 승선중이면 승선일(+하선예정일, 줄바꿔서), 승선 예정이면 승선예정일, 그 외(하선/등록)엔 최근 하선일을 보여준다.
  const embarkInfo = (c: CrewWithDetails): { primary: string; secondary?: string } | null => {
    if (c.is_active_onboard) {
      if (!c.latest_embark_date) return null;
      return { primary: `승선 ${c.latest_embark_date}`, secondary: c.disembark_forecast_date ? `하선예정 ${c.disembark_forecast_date}` : undefined };
    }
    if (c.has_pending_plan && c.pending_embark_date) return { primary: `승선예정 ${c.pending_embark_date}` };
    if (c.latest_disembark_date) return { primary: `하선 ${c.latest_disembark_date}` };
    return null;
  };

  // 모든 선원 목록/드롭다운은 항상 직급 관리 화면과 같은 순서(부서 → display_order)를
  // 따라야 한다 — ranks 테이블의 display_order만 단순 정렬하면 부서가 뒤섞이므로
  // sortRanksByDisplayOrder로 먼저 정렬한 뒤 그 순서의 인덱스를 기준으로 선원을 정렬한다.
  const sortedRanks = useMemo(() => sortRanksByDisplayOrder(ranks), [ranks]);
  const rankOrderIndex = useMemo(() => new Map(sortedRanks.map((r, i) => [r.id, i])), [sortedRanks]);

  const byCategory = useMemo(() => crews.filter(c => matchesCategory(c, category)), [crews, category]);

  // 데스크탑 CrewManagementPage와 동일한 교차필터(facet) 패턴 — 선주사를 고르면 플릿/선박
  // 옵션이 그 선주사 소속만 남도록, 자기 자신을 뺀 나머지 활성 필터를 먼저 적용한 목록을
  // 기준으로 각 드롭다운의 옵션/카운트를 계산한다.
  type FacetKey = 'owner' | 'fleet' | 'ship' | 'rank' | 'manning' | 'nationality';
  const facetFilter = (exclude: FacetKey) => {
    let l = byCategory;
    if (exclude !== 'owner' && filterOwner !== 'all') l = l.filter(c => effOwnerId(c) === filterOwner);
    if (exclude !== 'fleet' && filterFleet !== 'all') l = l.filter(c => effFleetId(c) === filterFleet);
    if (exclude !== 'ship' && filterShip !== 'all') l = l.filter(c => effShipId(c) === filterShip);
    if (exclude !== 'rank' && filterRank !== 'all') l = l.filter(c => effRankId(c) === filterRank);
    if (exclude !== 'manning' && filterManning !== 'all') l = l.filter(c => c.manning_agency_id === filterManning);
    if (exclude !== 'nationality' && filterNationality !== 'all') l = l.filter(c => c.nationality === filterNationality);
    return l;
  };
  const buildFacetOptions = (list: CrewWithDetails[], getId: (c: CrewWithDetails) => string | undefined, getLabel: (c: CrewWithDetails) => string | undefined) => {
    const map = new Map<string, { label: string; count: number }>();
    for (const c of list) {
      const id = getId(c);
      if (!id) continue;
      const existing = map.get(id);
      if (existing) existing.count += 1;
      else map.set(id, { label: getLabel(c) || id, count: 1 });
    }
    return [...map.entries()].map(([id, v]) => [id, v.label, v.count] as const).sort((a, b) => a[1].localeCompare(b[1], 'ko'));
  };

  const ownerOptions = useMemo(() => buildFacetOptions(facetFilter('owner'), effOwnerId, effOwnerName), [byCategory, filterFleet, filterShip, filterRank, filterManning, filterNationality]);
  const fleetOptions = useMemo(() => buildFacetOptions(facetFilter('fleet'), effFleetId, effFleetName), [byCategory, filterOwner, filterShip, filterRank, filterManning, filterNationality]);
  const shipOptions = useMemo(() => buildFacetOptions(facetFilter('ship'), effShipId, effShipName), [byCategory, filterOwner, filterFleet, filterRank, filterManning, filterNationality]);
  const manningOptions = useMemo(() => buildFacetOptions(facetFilter('manning'), c => c.manning_agency_id, c => c.manning_agency_name), [byCategory, filterOwner, filterFleet, filterShip, filterRank, filterNationality]);
  // 직급은 라벨 알파벳순이 아니라 항상 직급 관리 화면과 같은 순서(rankOrderIndex)로.
  const rankFacetOptions = useMemo(
    () => [...buildFacetOptions(facetFilter('rank'), effRankId, effRankCode)].sort((a, b) => (rankOrderIndex.get(a[0]) ?? 999) - (rankOrderIndex.get(b[0]) ?? 999)),
    [byCategory, filterOwner, filterFleet, filterShip, filterManning, filterNationality, rankOrderIndex]
  );
  const nationalityOptions = useMemo(() => {
    const base = facetFilter('nationality');
    const counts = new Map<string, number>();
    for (const c of base) { if (c.nationality) counts.set(c.nationality, (counts.get(c.nationality) || 0) + 1); }
    return nationalities
      .filter(n => counts.has(n.country_code))
      .map(n => [n.country_code, n.country_name_ko, counts.get(n.country_code)!] as const)
      .sort((a, b) => a[1].localeCompare(b[1], 'ko'));
  }, [byCategory, filterOwner, filterFleet, filterShip, filterRank, filterManning, nationalities]);

  // 선주사를 '전체'로 되돌리면 플릿/선박도 같이 초기화 — 데스크탑과 동일한 동작.
  useEffect(() => { if (filterOwner === 'all') setFilterFleet('all'); }, [filterOwner]);
  useEffect(() => { if (filterFleet === 'all' && filterOwner === 'all') setFilterShip('all'); }, [filterFleet, filterOwner]);

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
          {ownerOptions.map(([id, label, count]) => <option key={id} value={id}>{label} ({count})</option>)}
        </select>
        <select value={filterFleet} onChange={e => setFilterFleet(e.target.value)} disabled={filterOwner === 'all'} className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs disabled:opacity-50">
          <option value="all">플릿 전체</option>
          {fleetOptions.map(([id, label, count]) => <option key={id} value={id}>{label} ({count})</option>)}
        </select>
        <select value={filterShip} onChange={e => setFilterShip(e.target.value)} disabled={filterOwner === 'all'} className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs disabled:opacity-50">
          <option value="all">선박 전체</option>
          {shipOptions.map(([id, label, count]) => <option key={id} value={id}>{label} ({count})</option>)}
        </select>
        <select value={filterRank} onChange={e => setFilterRank(e.target.value)} className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs">
          <option value="all">직급 전체</option>
          {rankFacetOptions.map(([id, label, count]) => <option key={id} value={id}>{label} ({count})</option>)}
        </select>
        <select value={filterManning} onChange={e => setFilterManning(e.target.value)} className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs">
          <option value="all">매닝사 전체</option>
          {manningOptions.map(([id, label, count]) => <option key={id} value={id}>{label} ({count})</option>)}
        </select>
        <select value={filterNationality} onChange={e => setFilterNationality(e.target.value)} className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs">
          <option value="all">국적 전체</option>
          {nationalityOptions.map(([code, label, count]) => <option key={code} value={code}>{label} ({count})</option>)}
        </select>
      </div>

      <div className="space-y-1.5">
        {filtered.map(c => {
          const embark = embarkInfo(c);
          return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c)}
            className="w-full flex items-center justify-between gap-3 rounded-xl border bg-white px-4 py-2.5 text-left shadow-sm active:bg-gray-50"
          >
            <div className="min-w-0 leading-tight">
              <div className="text-xs text-gray-500 truncate">{effShipName(c) || '대기 중'}</div>
              {/* 직급과 이름은 항시 같이 다닌다 — 따로 떨어뜨려 표시하지 않는다. */}
              <div className="text-sm font-semibold text-gray-800 truncate">
                <span className="text-blue-600">{effRankCode(c) || '-'}</span> {c.name}
              </div>
              {embark && <div className="text-[11px] text-gray-400 truncate">{embark.primary}</div>}
              {embark?.secondary && <div className="text-[11px] text-gray-400 truncate">{embark.secondary}</div>}
            </div>
            <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full ${c.is_active_onboard ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
              {c.is_active_onboard ? '승선중' : '대기중'}
            </span>
            <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
          </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center text-sm text-gray-400 py-10">검색 결과가 없습니다.</div>
        )}
      </div>
    </div>
  );
}
