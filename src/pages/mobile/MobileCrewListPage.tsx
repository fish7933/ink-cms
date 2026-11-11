import { useEffect, useMemo, useState } from 'react';
import { Search, ChevronRight } from 'lucide-react';
import { crewService, type CrewWithDetails } from '@/services/crew.service';
import { getRanks } from '@/lib/store';
import { sortRanksByDisplayOrder } from '@/lib/rank-order';
import type { Rank } from '@/types/models';

interface Props {
  onSelect: (crew: CrewWithDetails) => void;
}

// 선원 목록 — 조회 전용(모바일 범위는 선원 목록/상세 조회만). 데스크탑 CrewManagementPage의
// 선주/플릿/선박/직급/매닝사/국적 등 다중 필터는 화면이 좁은 모바일에서는 생략하고 이름/직급/
// 선박 통합 검색 한 칸으로 단순화했다.
export default function MobileCrewListPage({ onSelect }: Props) {
  const [crews, setCrews] = useState<CrewWithDetails[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    Promise.all([crewService.getAllWithDetails(), getRanks()]).then(([crewData, rankData]) => {
      setCrews(crewData);
      setRanks(rankData);
      setLoading(false);
    });
  }, []);

  const effRankId = (c: CrewWithDetails) => c.is_active_onboard ? c.rank_id : (c.pending_rank_id || c.rank_id);
  const effRankCode = (c: CrewWithDetails) => c.is_active_onboard ? c.rank_code : (c.pending_rank_code || c.rank_code);
  const effShipName = (c: CrewWithDetails) => c.is_active_onboard ? c.current_ship_name : (c.pending_ship_name || c.current_ship_name);

  // 모든 선원 목록/드롭다운은 항상 직급 관리 화면과 같은 순서(부서 → display_order)를
  // 따라야 한다 — ranks 테이블의 display_order만 단순 정렬하면 부서가 뒤섞이므로
  // sortRanksByDisplayOrder로 먼저 정렬한 뒤 그 순서의 인덱스를 기준으로 선원을 정렬한다.
  const rankOrderIndex = useMemo(() => {
    const sorted = sortRanksByDisplayOrder(ranks);
    return new Map(sorted.map((r, i) => [r.id, i]));
  }, [ranks]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sorted = [...crews].sort((a, b) => (rankOrderIndex.get(effRankId(a) || '') ?? 999) - (rankOrderIndex.get(effRankId(b) || '') ?? 999));
    if (!q) return sorted;
    return sorted.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (effRankCode(c) || '').toLowerCase().includes(q) ||
      (effShipName(c) || '').toLowerCase().includes(q)
    );
  }, [crews, search, rankOrderIndex]);

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

      <div className="space-y-2">
        {filtered.map(c => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c)}
            className="w-full flex items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3 text-left shadow-sm active:bg-gray-50"
          >
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-800 truncate">{c.name}</div>
              <div className="text-xs text-gray-500 truncate">
                {effRankCode(c) || '-'} · {effShipName(c) || '대기 중'}
              </div>
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
