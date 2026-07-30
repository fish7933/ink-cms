import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/lib/supabase';
import { sortRanksByDisplayOrder } from '@/lib/rank-order';
import { crewDisplayName } from '@/lib/utils';
import { useTabContext } from '@/contexts/TabContext';
import { getNationalities } from '@/services/nationality.service';
import { getBoardingScores, type RecommendationContext, type CrewBoardingScore } from '@/services/crew-boarding-score.service';
import CrewBoardingFitDetail from '@/components/rotation/CrewBoardingFitDetail';
import type { CrewWithDetails } from '@/services/crew.service';
import type { Rank, Company, Fleet, Ship as ShipType } from '@/types/models';
import type { Nationality } from '@/types/nationality';

interface CrewCandidateSelectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'boarding' | 'disembark';
  candidates: CrewWithDetails[];
  onConfirm: (selectedCrewIds: string[]) => void;
  /** 'single' — 행 하나의 선원을 고르는 경우, 클릭 즉시 확정 (체크박스 없음). 기본은 'multi'. */
  selectionMode?: 'single' | 'multi';
  /** 해당 선원이 다른 임시저장 교대계획에도 포함돼 있으면 경고 문구를 반환 (없으면 null) */
  getReservationNote?: (crew: CrewWithDetails) => string | null;
  /** 이미 선택돼 있는 선원을 바꾸려고 다시 여는 경우 — 그 선원의 소속/직급 등으로 필터를 미리 채워준다. */
  initialCrew?: CrewWithDetails | null;
  /** 같은 행의 반대편(승선자/하선자)이 먼저 정해져 있을 때 그 직급을 기본 필터로 — 동직급
   *  로테이션이 기본이므로. initialCrew가 있으면 그쪽이 우선한다(실제 선택값이라 더 정확함). */
  defaultRankId?: string;
  /** 대상 선박(+승선예정일)이 정해져 있으면 적합도 점수를 매겨 추천순으로 정렬해 보여준다 (승선 후보에만 해당). */
  scoringContext?: RecommendationContext;
}

const STATUS_LABELS: Record<string, string> = {
  registered: '등록', under_review: '검토중', sent_to_owner: '선주송부',
  owner_approved: '선주승인', owner_rejected: '선주거절', deployment_decided: '승선결정',
  onboard: '승선중', standby: '대기',
};

// crew_members.current_status 컬럼은 상태 변경 시 갱신되지 않는 legacy 필드라 신뢰할 수 없음.
// 실제 최신 상태는 status 컬럼 (CrewManagementPage / RotationPlanFormPage와 동일한 우회 패턴).
const getCrewStatus = (c: CrewWithDetails) => (c as CrewWithDetails & { status?: string }).status || c.current_status || '';

export default function CrewCandidateSelectDialog({ open, onOpenChange, mode, candidates, onConfirm, selectionMode = 'multi', getReservationNote, initialCrew, defaultRankId, scoringContext }: CrewCandidateSelectDialogProps) {
  const isSingle = selectionMode === 'single';
  const { openNewTab } = useTabContext();

  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [scores, setScores] = useState<Map<string, CrewBoardingScore>>(new Map());
  const [fitnessModalCrewId, setFitnessModalCrewId] = useState<string | null>(null);

  const [owners, setOwners] = useState<Company[]>([]);
  const [manningAgencies, setManningAgencies] = useState<Company[]>([]);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [ships, setShips] = useState<ShipType[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [nationalities, setNationalities] = useState<Nationality[]>([]);

  const [filterOwner, setFilterOwner] = useState('all');
  const [filterFleet, setFilterFleet] = useState('all');
  const [filterShip, setFilterShip] = useState('all');
  const [filterRank, setFilterRank] = useState('all');
  const [filterManning, setFilterManning] = useState('all');
  const [filterNationality, setFilterNationality] = useState('all');

  // 선원 목록(CrewManagementPage)과 동일한 참조 데이터 로딩
  useEffect(() => {
    Promise.all([
      supabase.from('ranks').select('*'),
      supabase.from('companies').select('*'),
      getNationalities(),
    ]).then(([ranksRes, companiesRes, natData]) => {
      setRanks(sortRanksByDisplayOrder(ranksRes.data || []));
      if (companiesRes.data) {
        setOwners(companiesRes.data.filter((c: Company) => c.type === 'owner'));
        setManningAgencies(companiesRes.data.filter((c: Company) => c.type === 'manning'));
      }
      setNationalities(natData);
    });
  }, []);

  // 선주 > 플릿 > 선박 캐스케이드 (CrewManagementPage와 동일)
  useEffect(() => {
    if (filterOwner !== 'all') supabase.from('fleets').select('*').eq('owner_id', filterOwner).then(({ data }) => setFleets(data || []));
    else { setFleets([]); setFilterFleet('all'); }
  }, [filterOwner]);
  useEffect(() => {
    if (filterFleet !== 'all') supabase.from('ships').select('*').eq('fleet_id', filterFleet).then(({ data }) => setShips(data || []));
    else if (filterOwner !== 'all') supabase.from('ships').select('*').eq('owner_id', filterOwner).then(({ data }) => setShips(data || []));
    else { setShips([]); setFilterShip('all'); }
  }, [filterFleet, filterOwner]);

  useEffect(() => {
    if (open) {
      setSelectedIds([]);
      setSearch('');
      // 이미 선택된 선원을 바꾸려고 다시 연 경우, 그 선원의 소속/직급 등으로 필터를 미리 채워
      // 같은 배 안에서 후임을 고르는 등의 흔한 상황에서 다시 필터링할 필요가 없게 한다.
      setFilterOwner(initialCrew?.owner_id || 'all');
      setFilterFleet(initialCrew?.fleet_id || 'all');
      setFilterShip(initialCrew?.current_ship_id || 'all');
      setFilterRank(initialCrew?.rank_id || defaultRankId || 'all');
      setFilterManning(initialCrew?.manning_agency_id || 'all');
      setFilterNationality(initialCrew?.nationality || 'all');
    }
  }, [open, initialCrew, defaultRankId]);

  // 승선 후보이고 대상 선박이 정해져 있을 때만 적합도 점수를 매긴다(하선 후보에는 적용 안 함).
  useEffect(() => {
    if (open && mode === 'boarding' && scoringContext && candidates.length > 0) {
      getBoardingScores(candidates.map(c => c.id), scoringContext).then(setScores).catch(() => setScores(new Map()));
    } else {
      setScores(new Map());
    }
  }, [open, mode, scoringContext, candidates]);

  // 적합도 모달은 Radix Dialog가 아니라 직접 만든 오버레이라, Escape도 직접 처리해야 한다
  // (Radix Dialog로 겹쳐 쓰면 바깥쪽 후보 선택 모달까지 같이 닫혀버리는 문제가 있었음).
  useEffect(() => {
    if (!fitnessModalCrewId) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setFitnessModalCrewId(null); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [fitnessModalCrewId]);

  const filtered = useMemo(() => {
    let list = candidates;
    if (search) {
      const t = search.toLowerCase();
      list = list.filter(c =>
        c.name?.toLowerCase().includes(t) ||
        c.name_english?.toLowerCase().includes(t) ||
        c.rank_name?.toLowerCase().includes(t) ||
        c.passport_number?.toLowerCase().includes(t) ||
        c.seaman_book_number?.toLowerCase().includes(t)
      );
    }
    if (filterOwner !== 'all') list = list.filter(c => c.owner_id === filterOwner);
    if (filterFleet !== 'all') list = list.filter(c => c.fleet_id === filterFleet);
    if (filterShip !== 'all') list = list.filter(c => c.current_ship_id === filterShip);
    if (filterRank !== 'all') list = list.filter(c => c.rank_id === filterRank);
    if (filterManning !== 'all') list = list.filter(c => c.manning_agency_id === filterManning);
    if (filterNationality !== 'all') list = list.filter(c => c.nationality === filterNationality);
    // 적합도 점수가 있으면 추천순(내림차순)으로 정렬 — 점수가 없는 사람은 뒤로 보낸다.
    if (scores.size > 0) {
      list = [...list].sort((a, b) => (scores.get(b.id)?.score ?? -1) - (scores.get(a.id)?.score ?? -1));
    }
    return list;
  }, [candidates, search, filterOwner, filterFleet, filterShip, filterRank, filterManning, filterNationality, scores]);

  const isFiltered = filterOwner !== 'all' || filterFleet !== 'all' || filterShip !== 'all' || filterRank !== 'all' || filterManning !== 'all' || filterNationality !== 'all';
  const clearFilters = () => { setFilterOwner('all'); setFilterFleet('all'); setFilterShip('all'); setFilterRank('all'); setFilterManning('all'); setFilterNationality('all'); };

  const toggleSelect = (id: string) =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleAll = (checked: boolean) =>
    setSelectedIds(checked ? filtered.map(c => c.id) : []);

  const handleRowClick = (id: string) => {
    if (isSingle) {
      onConfirm([id]);
      onOpenChange(false);
    } else {
      toggleSelect(id);
    }
  };

  const handleConfirm = () => {
    onConfirm(selectedIds);
    onOpenChange(false);
  };

  const handleClear = () => {
    onConfirm([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">{mode === 'boarding' ? '승선 후보 선택' : '하선 후보 선택'}</DialogTitle>
          <DialogDescription className="text-xs">
            {isSingle ? '선원을 한 명 선택하세요' : '여러 명을 선택하면 각 인원마다 새 발령 행이 생성됩니다'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground w-3.5 h-3.5" />
            <Input placeholder="이름, 직급, 여권번호, 선원수첩번호로 검색..." value={search} onChange={e => setSearch(e.target.value)} className="h-8 text-xs pl-8" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={filterOwner} onValueChange={setFilterOwner}>
              <SelectTrigger className="h-8 text-xs w-28"><SelectValue placeholder="선주사" /></SelectTrigger>
              <SelectContent><SelectItem value="all">전체 선주사</SelectItem>{owners.map(o => <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={filterFleet} onValueChange={setFilterFleet} disabled={filterOwner === 'all'}>
              <SelectTrigger className="h-8 text-xs w-24"><SelectValue placeholder="플릿" /></SelectTrigger>
              <SelectContent><SelectItem value="all">전체 플릿</SelectItem>{fleets.map(f => <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={filterShip} onValueChange={setFilterShip} disabled={filterOwner === 'all'}>
              <SelectTrigger className="h-8 text-xs w-24"><SelectValue placeholder="선박" /></SelectTrigger>
              <SelectContent><SelectItem value="all">전체 선박</SelectItem>{ships.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={filterRank} onValueChange={setFilterRank}>
              <SelectTrigger className="h-8 text-xs w-24"><SelectValue placeholder="직급" /></SelectTrigger>
              <SelectContent><SelectItem value="all">전체 직급</SelectItem>{ranks.map(r => <SelectItem key={r.id} value={String(r.id)}>{r.rank_code || r.name}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={filterManning} onValueChange={setFilterManning}>
              <SelectTrigger className="h-8 text-xs w-24"><SelectValue placeholder="매닝사" /></SelectTrigger>
              <SelectContent><SelectItem value="all">전체 매닝사</SelectItem>{manningAgencies.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={filterNationality} onValueChange={setFilterNationality}>
              <SelectTrigger className="h-8 text-xs w-24"><SelectValue placeholder="국적" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 국적</SelectItem>
                {nationalities.map(n => <SelectItem key={n.id} value={n.country_code}>{n.country_name_ko} ({n.country_code})</SelectItem>)}
              </SelectContent>
            </Select>
            {isFiltered && (
              <Button variant="outline" size="sm" onClick={clearFilters} className="h-8 text-xs gap-1">
                <X className="w-3 h-3" />초기화
              </Button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto border rounded-md">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b sticky top-0">
              <tr>
                {!isSingle && (
                  <th className="w-8 px-3 py-2 text-left">
                    <Checkbox
                      checked={filtered.length > 0 && filtered.every(c => selectedIds.includes(c.id))}
                      onCheckedChange={checked => toggleAll(!!checked)}
                    />
                  </th>
                )}
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">직급</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">이름</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">상태</th>
                {scores.size > 0 && <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">적합도</th>}
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">선택</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const reservationNote = getReservationNote?.(c);
                const boardingScore = scores.get(c.id);
                const selected = selectedIds.includes(c.id);
                return (
                  <tr key={c.id} className="border-b hover:bg-gray-50">
                    {!isSingle && (
                      <td className="px-3 py-2">
                        <Checkbox checked={selected} onCheckedChange={() => toggleSelect(c.id)} />
                      </td>
                    )}
                    <td className="px-3 py-2 text-gray-700" onClick={() => openNewTab(`/crew/${c.id}`, [c.rank_code, crewDisplayName(c)].filter(Boolean).join(' ') || '선원 정보')}>
                      <button type="button" className="hover:underline hover:text-blue-600">{c.rank_code || '-'}</button>
                    </td>
                    <td className="px-3 py-2 font-medium" onClick={() => openNewTab(`/crew/${c.id}`, [c.rank_code, crewDisplayName(c)].filter(Boolean).join(' ') || '선원 정보')}>
                      <button type="button" className="hover:underline hover:text-blue-600">{crewDisplayName(c)}</button>
                      {reservationNote && (
                        <div className="text-[10px] text-amber-600 font-normal mt-0.5">⚠ {reservationNote}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">
                      {/* "대기"만으로는 하선 후 대기 중인지 다른 계획에 이미 배정 예정인지 구분이 안 되므로,
                          예약이 걸려 있으면 상태 옆에 명시한다. */}
                      {STATUS_LABELS[getCrewStatus(c)] || getCrewStatus(c) || '-'}
                      {reservationNote && <span className="text-amber-600"> (배정예정)</span>}
                    </td>
                    {scores.size > 0 && (
                      <td className="px-3 py-2">
                        {boardingScore ? (
                          <div onClick={() => setFitnessModalCrewId(c.id)}>
                            <button type="button" className="font-semibold text-emerald-700 hover:underline">{boardingScore.score}점</button>
                            {boardingScore.reasons.length > 0 && (
                              <div className="text-[10px] text-gray-400 mt-0.5">{boardingScore.reasons.slice(0, 2).join(' · ')}</div>
                            )}
                          </div>
                        ) : <span className="text-gray-300">-</span>}
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={isSingle || !selected ? 'outline' : 'default'}
                        className="h-7 text-xs"
                        onClick={() => handleRowClick(c.id)}
                      >
                        {isSingle ? '선택' : (selected ? '선택됨' : '선택')}
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={(isSingle ? 4 : 5) + (scores.size > 0 ? 1 : 0)} className="text-center py-8 text-xs text-gray-400">후보가 없습니다</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-9 text-sm">취소</Button>
          {isSingle ? (
            <Button type="button" variant="outline" onClick={handleClear} className="h-9 text-sm text-gray-600">선택 해제</Button>
          ) : (
            <Button
              type="button"
              onClick={handleConfirm}
              disabled={selectedIds.length === 0}
              className={`h-9 text-sm ${mode === 'boarding' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-orange-600 hover:bg-orange-700'}`}
            >
              {selectedIds.length > 0 ? `${selectedIds.length}명 추가` : (mode === 'boarding' ? '승선 후보 추가' : '하선 후보 추가')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>

      {fitnessModalCrewId && scoringContext && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 pointer-events-auto"
          onClick={() => setFitnessModalCrewId(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 relative"
            onClick={e => e.stopPropagation()}
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 absolute right-3 top-3"
              onClick={() => setFitnessModalCrewId(null)}
            >
              <X className="w-4 h-4" />
            </Button>
            <CrewBoardingFitDetail
              crewId={fitnessModalCrewId}
              shipId={scoringContext.targetShipId}
              embarkDate={scoringContext.targetEmbarkDate}
              rankId={scoringContext.targetRankId}
            />
          </div>
        </div>,
        document.body
      )}
    </Dialog>
  );
}
