import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { msg } from '@/lib/messages';
import { crewDisplayName } from '@/lib/utils';
import {
  Plus, Search, X, ChevronLeft, ChevronRight, Trash2,
  ArrowUpCircle, Ship, Users, UserCheck, UserMinus, LayoutList,
  CheckCircle, XCircle, RefreshCw,
  ArrowUp, ArrowDown, ArrowUpDown, Star,
} from 'lucide-react';
import { useTabContext } from '@/contexts/TabContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { crewService, type CrewWithDetails } from '@/services/crew.service';
import { rotationService } from '@/services/rotation.service';
import { getCurrentUser } from '@/lib/store';
import { supervisorService } from '@/services/supervisor.service';
import { supabase } from '@/lib/supabase';
import { sortRanksByDisplayOrder } from '@/lib/rank-order';
import type { Rank } from '@/types/models';
import type { RegistrationSource } from '@/types/dispatch';
import { REGISTRATION_SOURCE_LABELS, CREW_CATEGORY_LABELS } from '@/types/dispatch';
import { getNationalities } from '@/services/nationality.service';
import type { Nationality } from '@/types/nationality';
import { getEvaluations } from '@/services/evaluation.service';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';

type CategoryTab = 'all' | 'registered' | 'standby' | 'onboard' | 'disembarked';

// 탭별 날짜 컬럼 헤더 — registered는 승선가능일 하나만, 나머지는 두 컬럼
const DATE_COLUMN_LABELS: Record<CategoryTab, { col1: string; col2?: string }> = {
  all:         { col1: '승선(예정)일', col2: '하선(예정)일' },
  registered:  { col1: '승선가능일' },
  standby:     { col1: '승선예정일', col2: '하선예정일' },
  onboard:     { col1: '승선일', col2: '하선예정일' },
  disembarked: { col1: '하선일', col2: '승선가능일' },
};

const CATEGORY_STATUS_MAP: Record<CategoryTab, string[]> = {
  all:          [],
  registered:   ['registered', 'under_review', 'sent_to_owner', 'owner_approved', 'owner_rejected'],
  standby:      ['deployment_decided', 'standby'],
  onboard:      ['onboard'],
  disembarked:  ['standby'],
};

// status='standby'인 선원은 "승선 계획에 들어가 있으나 발령 전(대기)"과 "하선 후 아직 계획 없음(하선)"
// 두 경우를 모두 포함하므로, has_pending_plan(예정된 교대계획 배정 존재 여부)으로 구분해야
// 두 탭에 동일 인원이 중복으로 보이지 않는다.
const matchesCategory = (c: CrewWithDetails & { status?: string }, cat: CategoryTab): boolean => {
  if (cat === 'all') return true;
  const st = c.status || c.current_status || '';
  if (cat === 'standby') return CATEGORY_STATUS_MAP.standby.includes(st) && Boolean(c.has_pending_plan);
  if (cat === 'disembarked') return st === 'standby' && !c.has_pending_plan;
  return CATEGORY_STATUS_MAP[cat].includes(st);
};

export function CrewManagementPage() {
  const { toast } = useToast();
  const { openNewTab } = useTabContext();
  const navigate = useNavigate();
  const permissions = usePermissions('crew_list');

  const [crew, setCrew] = useState<CrewWithDetails[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [nationalities, setNationalities] = useState<Nationality[]>([]);
  const [evaluationScores, setEvaluationScores] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);

  const [category, setCategory] = useState<CategoryTab>('onboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOwner, setFilterOwner] = useState('all');
  const [filterFleet, setFilterFleet] = useState('all');
  const [filterShip, setFilterShip] = useState('all');
  const [filterRank, setFilterRank] = useState('all');
  const [filterManning, setFilterManning] = useState('all');
  const [filterSource, setFilterSource] = useState('all');
  const [filterNationality, setFilterNationality] = useState('all');

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  // 헤더 클릭 정렬
  type SortField = 'owner' | 'fleet' | 'ship' | 'manning' | 'rank' | 'name' | 'nationality' | 'birth' | 'date1' | 'date2';
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  useEffect(() => { loadData(); }, []);
  useEffect(() => { setCurrentPage(1); setSelectedIds([]); }, [category, searchTerm, filterOwner, filterFleet, filterShip, filterRank, filterManning, filterSource, filterNationality, sortField, sortDirection]); // eslint-disable-line react-hooks/exhaustive-deps

  // 메뉴 접속(canView) 권한이 명시적으로 꺼진 경우에도 접근 차단 — 로딩 중(loading)에는
  // 아직 기본값이라 판단하지 않고 기다린다(정상 권한 사용자가 잠깐 튕겨나가는 걸 방지).
  useEffect(() => {
    if (!permissions.loading && !permissions.canView) navigate('/dashboard');
  }, [permissions.loading, permissions.canView, navigate]);
  // 선주사가 바뀌면 하위(플릿/선박) 선택은 더 이상 유효하지 않을 수 있어 초기화
  useEffect(() => { if (filterOwner === 'all') setFilterFleet('all'); }, [filterOwner]);
  useEffect(() => { if (filterFleet === 'all' && filterOwner === 'all') setFilterShip('all'); }, [filterFleet, filterOwner]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [crewData, ranksRes, natData, evaluations] = await Promise.all([
        crewService.getAllWithDetails(),
        supabase.from('ranks').select('*'),
        getNationalities(),
        getEvaluations(),
      ]);
      setCrew(crewData);
      if (ranksRes.data) setRanks(sortRanksByDisplayOrder(ranksRes.data));
      setNationalities(natData);

      // 선원별 최신 고과(overall_rating)만 사용 — getEvaluations()는 최신순 정렬이라 첫 값만 취함
      const scoreMap = new Map<string, number>();
      for (const ev of evaluations) {
        if (ev.overall_rating == null) continue;
        if (!scoreMap.has(ev.crew_member_id)) scoreMap.set(ev.crew_member_id, ev.overall_rating);
      }
      setEvaluationScores(scoreMap);
    } finally { setLoading(false); }
  };

  // 승선 중이 아닌 선원은 표에 예정된 교대계획의 선주/플릿/선박/직급이 표시되므로(하선/대기 상태),
  // 필터·카운트도 이 "실제로 보이는 값" 기준으로 맞춘다 (안 그러면 화면에 보이는 값과 필터 결과가 어긋남).
  const effOwnerId = (c: CrewWithDetails) => (c.is_active_onboard ? c.owner_id : (c.pending_owner_id || c.owner_id));
  const effOwnerName = (c: CrewWithDetails) => (c.is_active_onboard ? c.owner_name : (c.pending_owner_name || c.owner_name));
  const effFleetId = (c: CrewWithDetails) => (c.is_active_onboard ? c.fleet_id : (c.pending_fleet_id || c.fleet_id));
  const effFleetName = (c: CrewWithDetails) => (c.is_active_onboard ? c.fleet_name : (c.pending_fleet_name || c.fleet_name));
  const effShipId = (c: CrewWithDetails) => (c.is_active_onboard ? c.current_ship_id : (c.pending_ship_id || c.current_ship_id));
  const effShipName = (c: CrewWithDetails) => (c.is_active_onboard ? c.current_ship_name : (c.pending_ship_name || c.current_ship_name));
  const effRankId = (c: CrewWithDetails) => (c.is_active_onboard ? c.rank_id : (c.pending_rank_id || c.rank_id));

  const filtered = useMemo(() => {
    let list = crew.filter(c => matchesCategory(c, category));
    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      list = list.filter(c =>
        c.name?.toLowerCase().includes(t) ||
        c.name_english?.toLowerCase().includes(t) ||
        c.rank_name?.toLowerCase().includes(t) ||
        c.passport_number?.toLowerCase().includes(t) ||
        c.seaman_book_number?.toLowerCase().includes(t)
      );
    }
    if (filterOwner !== 'all') list = list.filter(c => effOwnerId(c) === filterOwner);
    if (filterFleet !== 'all') list = list.filter(c => effFleetId(c) === filterFleet);
    if (filterShip !== 'all') list = list.filter(c => effShipId(c) === filterShip);
    if (filterRank !== 'all') list = list.filter(c => effRankId(c) === filterRank);
    if (filterManning !== 'all') list = list.filter(c => c.manning_agency_id === filterManning);
    if (filterSource !== 'all') list = list.filter(c => (c as CrewWithDetails & { registration_source?: string }).registration_source === filterSource);
    if (filterNationality !== 'all') list = list.filter(c => c.nationality === filterNationality);
    return list;
  }, [crew, category, searchTerm, filterOwner, filterFleet, filterShip, filterRank, filterManning, filterSource, filterNationality]);

  // category/검색어만 적용된 목록 — 각 필터 셀렉트박스의 옵션/카운트 계산 기준
  const facetCrew = useMemo(() => {
    let list = crew.filter(c => matchesCategory(c, category));
    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      list = list.filter(c =>
        c.name?.toLowerCase().includes(t) ||
        c.name_english?.toLowerCase().includes(t) ||
        c.rank_name?.toLowerCase().includes(t) ||
        c.passport_number?.toLowerCase().includes(t) ||
        c.seaman_book_number?.toLowerCase().includes(t)
      );
    }
    return list;
  }, [crew, category, searchTerm]);

  type FacetKey = 'owner' | 'fleet' | 'ship' | 'rank' | 'manning' | 'nationality' | 'source';

  // 자기 자신을 제외한 나머지 필터를 적용한 목록 — 다른 조건에 맞춰 실시간으로 갱신되는 옵션/카운트를 위함
  const facetFilter = (list: CrewWithDetails[], exclude: FacetKey) => {
    let l = list;
    if (exclude !== 'owner' && filterOwner !== 'all') l = l.filter(c => effOwnerId(c) === filterOwner);
    if (exclude !== 'fleet' && filterFleet !== 'all') l = l.filter(c => effFleetId(c) === filterFleet);
    if (exclude !== 'ship' && filterShip !== 'all') l = l.filter(c => effShipId(c) === filterShip);
    if (exclude !== 'rank' && filterRank !== 'all') l = l.filter(c => effRankId(c) === filterRank);
    if (exclude !== 'manning' && filterManning !== 'all') l = l.filter(c => c.manning_agency_id === filterManning);
    if (exclude !== 'nationality' && filterNationality !== 'all') l = l.filter(c => c.nationality === filterNationality);
    if (exclude !== 'source' && filterSource !== 'all') l = l.filter(c => (c as CrewWithDetails & { registration_source?: string }).registration_source === filterSource);
    return l;
  };

  interface FacetOption { value: string; label: string; count: number }

  const buildFacetOptions = (
    list: CrewWithDetails[],
    keyOf: (c: CrewWithDetails) => string | undefined | null,
    labelOf: (c: CrewWithDetails) => string,
  ): FacetOption[] => {
    const map = new Map<string, FacetOption>();
    for (const c of list) {
      const key = keyOf(c);
      if (!key) continue;
      const existing = map.get(key);
      if (existing) existing.count += 1;
      else map.set(key, { value: key, label: labelOf(c), count: 1 });
    }
    return [...map.values()];
  };

  const ownerFacet = useMemo(() => {
    const base = facetFilter(facetCrew, 'owner');
    const options = buildFacetOptions(base, effOwnerId, c => effOwnerName(c) || '(이름없음)')
      .sort((a, b) => a.label.localeCompare(b.label, 'ko'));
    return { total: base.length, options };
  }, [facetCrew, filterFleet, filterShip, filterRank, filterManning, filterNationality, filterSource]);

  const fleetFacet = useMemo(() => {
    const base = facetFilter(facetCrew, 'fleet');
    const options = buildFacetOptions(base, effFleetId, c => effFleetName(c) || '(이름없음)')
      .sort((a, b) => a.label.localeCompare(b.label, 'ko'));
    return { total: base.length, options };
  }, [facetCrew, filterOwner, filterShip, filterRank, filterManning, filterNationality, filterSource]);

  const shipFacet = useMemo(() => {
    const base = facetFilter(facetCrew, 'ship');
    const options = buildFacetOptions(base, effShipId, c => effShipName(c) || '(이름없음)')
      .sort((a, b) => a.label.localeCompare(b.label, 'ko'));
    return { total: base.length, options };
  }, [facetCrew, filterOwner, filterFleet, filterRank, filterManning, filterNationality, filterSource]);

  const manningFacet = useMemo(() => {
    const base = facetFilter(facetCrew, 'manning');
    const options = buildFacetOptions(base, c => c.manning_agency_id, c => c.manning_agency_name || '(이름없음)')
      .sort((a, b) => a.label.localeCompare(b.label, 'ko'));
    return { total: base.length, options };
  }, [facetCrew, filterOwner, filterFleet, filterShip, filterRank, filterNationality, filterSource]);

  const rankFacet = useMemo(() => {
    const base = facetFilter(facetCrew, 'rank');
    const rankLabel = (c: CrewWithDetails) => {
      const code = c.is_active_onboard ? c.rank_code : (c.pending_rank_code || c.rank_code);
      return code ? `${code} (${c.rank_name})` : (c.rank_name || '(이름없음)');
    };
    const options = buildFacetOptions(base, effRankId, rankLabel);
    const orderIndex = new Map(ranks.map((r, i) => [r.id, i]));
    options.sort((a, b) => (orderIndex.get(a.value) ?? 999) - (orderIndex.get(b.value) ?? 999));
    return { total: base.length, options };
  }, [facetCrew, filterOwner, filterFleet, filterShip, filterManning, filterNationality, filterSource, ranks]);

  const nationalityFacet = useMemo(() => {
    const base = facetFilter(facetCrew, 'nationality');
    const options = buildFacetOptions(base, c => c.nationality, c => {
      const nat = nationalities.find(n => n.country_code === c.nationality);
      return nat ? `${nat.country_name_ko} (${nat.country_code})` : (c.nationality || '');
    }).sort((a, b) => a.label.localeCompare(b.label, 'ko'));
    return { total: base.length, options };
  }, [facetCrew, filterOwner, filterFleet, filterShip, filterRank, filterManning, filterSource, nationalities]);

  const sourceFacet = useMemo(() => {
    const base = facetFilter(facetCrew, 'source');
    const options = buildFacetOptions(
      base,
      c => (c as CrewWithDetails & { registration_source?: string }).registration_source,
      c => REGISTRATION_SOURCE_LABELS[(c as CrewWithDetails & { registration_source?: RegistrationSource }).registration_source as RegistrationSource] || '기타',
    );
    const orderIndex = new Map((Object.keys(REGISTRATION_SOURCE_LABELS) as RegistrationSource[]).map((k, i) => [k, i]));
    options.sort((a, b) => (orderIndex.get(a.value as RegistrationSource) ?? 999) - (orderIndex.get(b.value as RegistrationSource) ?? 999));
    return { total: base.length, options };
  }, [facetCrew, filterOwner, filterFleet, filterShip, filterRank, filterManning, filterNationality]);

  const countOf = (cat: CategoryTab) => {
    if (cat === 'all') return crew.length;
    return crew.filter(c => matchesCategory(c, cat)).length;
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const rankOrderIndex = useMemo(() => new Map(ranks.map((r, i) => [r.id, i])), [ranks]);

  // 탭(category)별로 실제 화면에 표시되는 승선/하선(예정)일 컬럼 값과 동일한 값을 정렬 기준으로 사용
  const getDateCol1 = (c: CrewWithDetails) => {
    if (category === 'registered') return c.recommended_available_date || '';
    if (category === 'standby') return c.pending_embark_date || '';
    if (category === 'onboard') return c.latest_embark_date || '';
    if (category === 'disembarked') return c.latest_disembark_date || '';
    return c.is_active_onboard ? (c.latest_embark_date || '') : (c.pending_embark_date || c.latest_embark_date || '');
  };
  const getDateCol2 = (c: CrewWithDetails) => {
    if (category === 'standby' || category === 'onboard') return c.disembark_forecast_date || '';
    // 하선 선원의 승선가능일은 면담일지에서 입력한 승선 희망일을 사용한다.
    if (category === 'disembarked') return c.desired_embark_date || '';
    if (category === 'all') return c.is_active_onboard ? (c.disembark_forecast_date || '') : (c.latest_disembark_date || '');
    return '';
  };

  const getSortValue = (c: CrewWithDetails, field: SortField): string | number => {
    switch (field) {
      case 'owner': return effOwnerName(c) || '';
      case 'fleet': return effFleetName(c) || '';
      case 'ship': return effShipName(c) || '';
      case 'manning': return (c as CrewWithDetails & { manning_agency_name?: string }).manning_agency_name || '';
      case 'rank': return rankOrderIndex.get(effRankId(c) || '') ?? 999;
      case 'name': return crewDisplayName(c);
      case 'nationality': return c.nationality || '';
      case 'birth': return c.date_of_birth || '';
      case 'date1': return getDateCol1(c);
      case 'date2': return getDateCol2(c);
    }
  };

  const sorted = useMemo(() => {
    if (!sortField) return filtered;
    const dir = sortDirection === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = getSortValue(a, sortField);
      const vb = getSortValue(b, sortField);
      if (typeof va === 'number' && typeof vb === 'number') return dir * (va - vb);
      return dir * String(va).localeCompare(String(vb), 'ko');
    });
  }, [filtered, sortField, sortDirection, rankOrderIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
    return sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
  };

  const totalPages = Math.ceil(sorted.length / itemsPerPage);
  const paginated = sorted.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const goToPage = (p: number) => setCurrentPage(Math.max(1, Math.min(p, totalPages)));

  const toggleSelect = (id: string) =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleAll = (checked: boolean) =>
    setSelectedIds(checked ? paginated.map(c => c.id) : []);

  // 기준 교대일(하선예정일) 하루 전/뒤로 출국일/귀국일을 계산 — 계약만료 하선계획 자동생성과 동일한 규칙
  const addDays = (iso: string, n: number) => {
    const [y, m, d] = iso.split('-').map(Number);
    const date = new Date(y, m - 1, d + n);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  // 승선 중인 선원을 선택해 일괄 하선 계획을 만들 때는, 사람이 직접 작성 화면을 거치지 않고
  // 선박별로 묶어 각 선원의 하선예정일을 기준 교대일로 삼아 바로 임시저장한다
  // (계약만료 하선계획 자동생성과 동일한 방식).
  const createBulkDisembarkDrafts = async () => {
    const me = await getCurrentUser();
    if (!me) return;
    const isAdminRole = me.role === 'admin' || me.role === 'system_admin';
    const supervisedShipIds = isAdminRole ? null : new Set(await supervisorService.getSupervisedShips(me.id));

    const groups = new Map<string, { shipName: string; ownerId: string; fleetId: string | null; members: CrewWithDetails[] }>();
    const unassignable: string[] = [];
    const notSupervised: string[] = [];
    for (const id of selectedIds) {
      const member = crew.find(c => c.id === id);
      if (!member) continue;
      if (!member.current_ship_id || !member.owner_id || !member.disembark_forecast_date) {
        unassignable.push(member.name);
        continue;
      }
      if (supervisedShipIds && !supervisedShipIds.has(member.current_ship_id)) {
        notSupervised.push(member.name);
        continue;
      }
      const key = member.current_ship_id;
      if (!groups.has(key)) {
        groups.set(key, { shipName: member.current_ship_name || '미배정', ownerId: member.owner_id, fleetId: member.fleet_id || null, members: [] });
      }
      groups.get(key)!.members.push(member);
    }

    if (groups.size === 0) {
      toast({
        title: '하선 계획을 만들 수 없습니다',
        description: notSupervised.length > 0
          ? '선택한 선원 모두 본인 담당 선박이 아닙니다.'
          : '선택한 선원 모두 승선 선박 또는 하선예정일 정보가 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    let created = 0;
    const today = new Date();
    for (const [shipId, group] of groups) {
      const baseDate = group.members.map(m => m.disembark_forecast_date!).sort()[0];
      const planName = `${group.shipName} 하선계획 ${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      const plan = await rotationService.createRotationPlan({
        ship_id: shipId,
        owner_id: group.ownerId,
        fleet_id: group.fleetId,
        plan_name: planName,
        rotation_date: baseDate,
        notes: '',
        base_departure_date: baseDate,
        port_id: null,
        assignments: group.members.map(m => ({
          off_crew_id: m.id,
          off_rank_id: m.rank_id || null,
          off_rank_grade: (m as CrewWithDetails & { current_grade?: string }).current_grade || null,
          off_disembark_date: m.disembark_forecast_date!,
          off_return_date: addDays(m.disembark_forecast_date!, 1),
          on_crew_id: null,
          on_rank_id: null,
          on_rank_grade: null,
          on_departure_date: addDays(m.disembark_forecast_date!, -1),
          contract_months: null,
          salary_template_id: null,
          salary_amount: null,
          salary_currency: 'USD',
          embark_date: m.disembark_forecast_date!,
          notes: '',
        })),
      });
      if (plan) created++;
    }

    const skipReasons = [
      unassignable.length > 0 ? `승선 선박/하선예정일 없음: ${unassignable.join(', ')}` : '',
      notSupervised.length > 0 ? `본인 담당 선박 아님: ${notSupervised.join(', ')}` : '',
    ].filter(Boolean).join(' / ');
    toast({
      title: `${created}개 선박 하선계획 임시저장 완료`,
      description: skipReasons ? `제외됨 — ${skipReasons}` : '교대계획(선원 발령) 목록에서 확인하세요.',
    });
    setSelectedIds([]);
    await loadData();
  };

  const openRotationPlan = (mode: 'boarding' | 'disembark') => {
    if (selectedIds.length === 0) { toast({ title: '선원을 선택하세요', variant: 'destructive' }); return; }

    if (mode === 'disembark') {
      if (!confirm(`선택한 ${selectedIds.length}명의 하선예정일을 기준 교대일로 하여 승선 선박별로 하선계획을 임시저장하시겠습니까?`)) return;
      createBulkDisembarkDrafts();
      return;
    }

    openNewTab(`/crew-rotation/new?${mode}=${selectedIds.join(',')}`, '교대계획 작성', true);
  };

  const openDispatchOrder = () => {
    if (selectedIds.length === 0) { toast({ title: '선원을 선택하세요', variant: 'destructive' }); return; }
    openNewTab(`/crew-dispatch/new?crew=${selectedIds.join(',')}`, '승진/강등 발령', true);
  };

  const confirmDelete = async () => {
    const ids = selectedIds;
    try {
      const me = await getCurrentUser();
      if (!me) return;
      const { error } = await crewService.softDelete(ids, me.id);
      if (error) {
        console.error('선원 삭제 오류:', error);
        toast({ title: '삭제 실패', description: error, variant: 'destructive' });
        return;
      }
      toast({ title: '삭제 완료', description: `${ids.length}명이 삭제 선원 리스트로 이동되었습니다.` });
      setSelectedIds([]);
      setShowDeleteDialog(false);
      await loadData();
    } catch (err) {
      console.error('삭제 중 예외:', err);
      toast({ title: '삭제 실패', description: '예기치 않은 오류가 발생했습니다.', variant: 'destructive' });
    }
  };

  const isFiltered = filterOwner !== 'all' || filterFleet !== 'all' || filterShip !== 'all' ||
    filterRank !== 'all' || filterManning !== 'all' || filterSource !== 'all' || filterNationality !== 'all';

  const clearFilters = () => {
    setFilterOwner('all'); setFilterFleet('all'); setFilterShip('all');
    setFilterRank('all'); setFilterManning('all'); setFilterSource('all');
    setFilterNationality('all'); setSearchTerm('');
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3" />
        <p className="text-sm text-gray-600">로딩 중...</p>
      </div>
    </div>
  );

  return (
    <>
      <div className="max-w-[1600px] mx-auto px-3 sm:px-4 lg:px-6 py-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-base">선원 관리</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">등록부터 하선까지 선원 현황을 관리합니다</p>
              </div>
              <div className="flex gap-2">
                {selectedIds.length > 0 && (
                  <>
                    {(category === 'standby' || category === 'registered' || category === 'disembarked') && (
                      <Button onClick={() => openRotationPlan('boarding')} size="sm" className="gap-1.5 h-8 bg-emerald-600 hover:bg-emerald-700">
                        <Ship className="w-4 h-4" />교대계획(승선) ({selectedIds.length})
                      </Button>
                    )}
                    {category === 'onboard' && (
                      <>
                        <Button onClick={() => openRotationPlan('disembark')} size="sm" className="gap-1.5 h-8 bg-orange-500 hover:bg-orange-600">
                          <UserMinus className="w-4 h-4" />교대계획(하선) ({selectedIds.length})
                        </Button>
                        <Button onClick={openDispatchOrder} size="sm" variant="outline" className="gap-1.5 h-8">
                          <ArrowUpCircle className="w-4 h-4" />승진/강등 발령
                        </Button>
                      </>
                    )}
                    {permissions.canDelete && (
                      <Button onClick={() => setShowDeleteDialog(true)} size="sm" variant="destructive" className="gap-1.5 h-8">
                        <Trash2 className="w-4 h-4" />삭제 ({selectedIds.length})
                      </Button>
                    )}
                  </>
                )}
                {permissions.canCreate && (
                  <Button onClick={() => openNewTab('/crew/new', '선원 등록', true)} size="sm" className="gap-1.5 h-8">
                    <Plus className="w-4 h-4" />선원 등록
                  </Button>
                )}
                <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={loadData} disabled={loading}>
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />새로고침
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-0 space-y-3">
            {/* 검색 */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="이름, 직급, 여권번호, 선원수첩번호로 검색..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-10 h-9 text-sm"
              />
            </div>

            {/* 필터 */}
            <div className="flex flex-wrap gap-2">
              <Select value={filterOwner} onValueChange={setFilterOwner}>
                <SelectTrigger className="h-8 text-xs w-32"><SelectValue placeholder="선주사" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 선주사 ({ownerFacet.total})</SelectItem>
                  {ownerFacet.options.map(o => <SelectItem key={o.value} value={o.value}>{o.label} ({o.count})</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterFleet} onValueChange={setFilterFleet} disabled={filterOwner === 'all'}>
                <SelectTrigger className="h-8 text-xs w-28"><SelectValue placeholder="플릿" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 플릿 ({fleetFacet.total})</SelectItem>
                  {fleetFacet.options.map(f => <SelectItem key={f.value} value={f.value}>{f.label} ({f.count})</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterShip} onValueChange={setFilterShip} disabled={filterOwner === 'all'}>
                <SelectTrigger className="h-8 text-xs w-28"><SelectValue placeholder="선박" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 선박 ({shipFacet.total})</SelectItem>
                  {shipFacet.options.map(s => <SelectItem key={s.value} value={s.value}>{s.label} ({s.count})</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterRank} onValueChange={setFilterRank}>
                <SelectTrigger className="h-8 text-xs w-28"><SelectValue placeholder="직급" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 직급 ({rankFacet.total})</SelectItem>
                  {rankFacet.options.map(r => <SelectItem key={r.value} value={r.value}>{r.label} ({r.count})</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterManning} onValueChange={setFilterManning}>
                <SelectTrigger className="h-8 text-xs w-28"><SelectValue placeholder="매닝사" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 매닝사 ({manningFacet.total})</SelectItem>
                  {manningFacet.options.map(a => <SelectItem key={a.value} value={a.value}>{a.label} ({a.count})</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterNationality} onValueChange={setFilterNationality}>
                <SelectTrigger className="h-8 text-xs w-28"><SelectValue placeholder="국적" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 국적 ({nationalityFacet.total})</SelectItem>
                  {nationalityFacet.options.map(n => <SelectItem key={n.value} value={n.value}>{n.label} ({n.count})</SelectItem>)}
                </SelectContent>
              </Select>
              {category === 'registered' && (
                <Select value={filterSource} onValueChange={setFilterSource}>
                  <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="등록출처" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체 출처 ({sourceFacet.total})</SelectItem>
                    {sourceFacet.options.map(s => <SelectItem key={s.value} value={s.value}>{s.label} ({s.count})</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              {isFiltered && (
                <Button variant="outline" size="sm" onClick={clearFilters} className="h-8 text-xs gap-1">
                  <X className="w-3 h-3" />초기화
                </Button>
              )}
            </div>

            {/* 5단계 탭 */}
            <Tabs value={category} onValueChange={v => setCategory(v as CategoryTab)}>
              <TabsList className="h-9 gap-1">
                <TabsTrigger value="all" className="text-xs h-8 gap-1.5">
                  <LayoutList className="w-3.5 h-3.5" />전체
                  <Badge variant="secondary" className="text-xs px-1.5 py-0 h-4">{countOf('all')}</Badge>
                </TabsTrigger>
                <TabsTrigger value="registered" className="text-xs h-8 gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  {CREW_CATEGORY_LABELS.registered}
                  <Badge variant="secondary" className="text-xs px-1.5 py-0 h-4">{countOf('registered')}</Badge>
                </TabsTrigger>
                <TabsTrigger value="standby" className="text-xs h-8 gap-1.5">
                  <UserCheck className="w-3.5 h-3.5" />
                  {CREW_CATEGORY_LABELS.standby}
                  <Badge variant="secondary" className="text-xs px-1.5 py-0 h-4">{countOf('standby')}</Badge>
                </TabsTrigger>
                <TabsTrigger value="onboard" className="text-xs h-8 gap-1.5">
                  <Ship className="w-3.5 h-3.5" />
                  {CREW_CATEGORY_LABELS.onboard}
                  <Badge variant="secondary" className="text-xs px-1.5 py-0 h-4">{countOf('onboard')}</Badge>
                </TabsTrigger>
                <TabsTrigger value="disembarked" className="text-xs h-8 gap-1.5">
                  <UserMinus className="w-3.5 h-3.5" />
                  {CREW_CATEGORY_LABELS.disembarked}
                  <Badge variant="secondary" className="text-xs px-1.5 py-0 h-4">{countOf('disembarked')}</Badge>
                </TabsTrigger>
              </TabsList>

              {(['all','registered','standby','onboard','disembarked'] as CategoryTab[]).map(cat => (
                <TabsContent key={cat} value={cat} className="mt-3">
                  {/* 카운트 + 페이지당 설정 */}
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-xs text-gray-500">
                      총 {filtered.length}명
                      {selectedIds.length > 0 && msg.crew.selectedCount(selectedIds.length)}
                    </p>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">페이지당:</Label>
                      <Select value={itemsPerPage.toString()} onValueChange={v => { setItemsPerPage(+v); setCurrentPage(1); }}>
                        <SelectTrigger className="h-7 w-16 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[10,20,50,100].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* 테이블 */}
                  <div className="border rounded-md overflow-x-auto">
                    <table className="w-full text-xs whitespace-nowrap">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="w-8 px-2 py-2">
                            <Checkbox
                              checked={paginated.length > 0 && paginated.every(c => selectedIds.includes(c.id))}
                              onCheckedChange={checked => toggleAll(!!checked)}
                            />
                          </th>
                          <th className="w-8 px-2 py-2 text-center font-medium text-gray-400">#</th>
                          <th className="px-2 py-2 text-center font-medium text-gray-600">상태</th>
                          <th className="px-2 py-2 text-left font-medium text-gray-600 cursor-pointer select-none" onClick={() => handleSort('owner')}>
                            <span className="flex items-center gap-1">선주사<SortIcon field="owner" /></span>
                          </th>
                          <th className="px-2 py-2 text-left font-medium text-gray-600 cursor-pointer select-none" onClick={() => handleSort('fleet')}>
                            <span className="flex items-center gap-1">플릿<SortIcon field="fleet" /></span>
                          </th>
                          <th className="px-2 py-2 text-left font-medium text-gray-600 cursor-pointer select-none" onClick={() => handleSort('ship')}>
                            <span className="flex items-center gap-1">선박<SortIcon field="ship" /></span>
                          </th>
                          <th className="px-2 py-2 text-left font-medium text-gray-600 cursor-pointer select-none" onClick={() => handleSort('manning')}>
                            <span className="flex items-center gap-1">매닝사<SortIcon field="manning" /></span>
                          </th>
                          <th className="px-2 py-2 text-left font-medium text-gray-600 cursor-pointer select-none" onClick={() => handleSort('rank')}>
                            <span className="flex items-center gap-1">직급(등급)<SortIcon field="rank" /></span>
                          </th>
                          <th className="px-2 py-2 text-left font-medium text-gray-600 cursor-pointer select-none" onClick={() => handleSort('name')}>
                            <span className="flex items-center gap-1">이름<SortIcon field="name" /></span>
                          </th>
                          <th className="px-2 py-2 text-left font-medium text-gray-600 cursor-pointer select-none" onClick={() => handleSort('nationality')}>
                            <span className="flex items-center gap-1">국적<SortIcon field="nationality" /></span>
                          </th>
                          <th className="px-2 py-2 text-left font-medium text-gray-600 cursor-pointer select-none" onClick={() => handleSort('birth')}>
                            <span className="flex items-center gap-1">생년월일(나이)<SortIcon field="birth" /></span>
                          </th>
                          <th className="px-2 py-2 text-left font-medium text-gray-600 cursor-pointer select-none" onClick={() => handleSort('date1')}>
                            <span className="flex items-center gap-1">{DATE_COLUMN_LABELS[cat].col1}<SortIcon field="date1" /></span>
                          </th>
                          {DATE_COLUMN_LABELS[cat].col2 && (
                            <th className="px-2 py-2 text-left font-medium text-gray-600 cursor-pointer select-none" onClick={() => handleSort('date2')}>
                              <span className="flex items-center gap-1">{DATE_COLUMN_LABELS[cat].col2}<SortIcon field="date2" /></span>
                            </th>
                          )}
                          {cat === 'registered' ? (
                            <>
                              <th className="px-2 py-2 text-right font-medium text-gray-600">제시급여</th>
                              <th className="px-2 py-2 text-right font-medium text-gray-600">희망급여</th>
                            </>
                          ) : (
                            <th className="px-2 py-2 text-center font-medium text-gray-600">급여표</th>
                          )}
                          <th className="px-2 py-2 text-center font-medium text-gray-600">고과</th>
                          <th className="px-2 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginated.length === 0 ? (
                          <tr><td colSpan={(DATE_COLUMN_LABELS[cat].col2 ? 16 : 15) + (cat === 'registered' ? 1 : 0)} className="text-center py-8 text-sm text-gray-400">선원이 없습니다</td></tr>
                        ) : paginated.map((c, idx) => {
                          const crewExt = c as CrewWithDetails & { status?: string; registration_source?: string; current_grade?: string };
                          // 국적은 코드로 표기 (레거시로 한글 국가명이 그대로 저장된 데이터는 코드로 정규화)
                          const natEntry = nationalities.find(n => n.country_code === c.nationality || n.country_name_ko === c.nationality);
                          const nationalityDisplay = natEntry ? natEntry.country_code : (c.nationality || '-');
                          return (
                            <tr key={c.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => openNewTab(`/crew/${c.id}`, [c.rank_code, crewDisplayName(c)].filter(Boolean).join(' ') || '선원 정보')}>
                              <td className="px-2 py-1.5" onClick={e => e.stopPropagation()}>
                                <Checkbox checked={selectedIds.includes(c.id)} onCheckedChange={() => toggleSelect(c.id)} />
                              </td>
                              <td className="px-2 py-1.5 text-center text-gray-400">{(currentPage - 1) * itemsPerPage + idx + 1}</td>
                              <td className="px-2 py-1.5 text-center">
                                {c.pending_plan_status === 'draft' && (
                                  <Badge variant="outline" className="text-[10px] h-4 px-1 text-gray-500 border-gray-300">임시저장</Badge>
                                )}
                                {c.pending_plan_status === 'pending_approval' && (
                                  <Badge variant="outline" className="text-[10px] h-4 px-1 text-amber-600 border-amber-300">결재중</Badge>
                                )}
                                {c.pending_plan_status === 'approved' && (
                                  <Badge variant="outline" className="text-[10px] h-4 px-1 text-emerald-600 border-emerald-300">발령대기중</Badge>
                                )}
                              </td>
                              <td className="px-2 py-1.5 max-w-[90px] truncate" title={c.is_active_onboard ? crewExt.owner_name : (c.pending_owner_name || crewExt.owner_name)}>
                                {c.is_active_onboard
                                  ? <span className="text-gray-600">{crewExt.owner_name || '-'}</span>
                                  : c.pending_owner_name
                                    ? <span className="text-violet-600">{c.pending_owner_name}</span>
                                    : <span className="text-gray-600">{crewExt.owner_name || '-'}</span>}
                              </td>
                              <td className="px-2 py-1.5 max-w-[80px] truncate" title={c.is_active_onboard ? crewExt.fleet_name : (c.pending_fleet_name || crewExt.fleet_name)}>
                                {c.is_active_onboard
                                  ? <span className="text-gray-500">{crewExt.fleet_name || '-'}</span>
                                  : c.pending_fleet_name
                                    ? <span className="text-violet-500">{c.pending_fleet_name}</span>
                                    : <span className="text-gray-500">{crewExt.fleet_name || '-'}</span>}
                              </td>
                              <td className="px-2 py-1.5 max-w-[90px] truncate" title={c.is_active_onboard ? crewExt.current_ship_name : (c.pending_ship_name || crewExt.current_ship_name)}>
                                {c.is_active_onboard
                                  ? <span className="font-medium">{crewExt.current_ship_name || '-'}</span>
                                  : c.pending_ship_name
                                    ? <span className="font-medium text-violet-700">{c.pending_ship_name}</span>
                                    : <span className="font-medium">{crewExt.current_ship_name || '-'}</span>}
                              </td>
                              <td className="px-2 py-1.5 max-w-[80px] truncate text-gray-500" title={crewExt.manning_agency_name}>
                                {crewExt.manning_agency_name || '-'}
                              </td>
                              <td className="px-2 py-1.5">
                                {(() => {
                                  const showCode = c.is_active_onboard ? c.rank_code : (c.pending_rank_code || c.rank_code);
                                  const showGrade = c.is_active_onboard ? crewExt.current_grade : (c.pending_rank_grade || crewExt.current_grade);
                                  const isPending = !c.is_active_onboard && (c.pending_rank_code || c.pending_rank_grade);
                                  const label = showCode || c.rank_name || '-';
                                  return (
                                    <span className={`font-mono ${isPending ? 'text-violet-700' : 'text-gray-700'}`}>
                                      {label}{showGrade ? `(${showGrade})` : ''}
                                    </span>
                                  );
                                })()}
                              </td>
                              <td className="px-2 py-1.5 font-medium text-gray-900">{crewDisplayName(c)}</td>
                              <td className="px-2 py-1.5 text-gray-500">{nationalityDisplay}</td>
                              <td className="px-2 py-1.5 text-gray-500">
                                {c.date_of_birth
                                  ? <span>{c.date_of_birth}<span className="text-gray-400 ml-1">({c.age}세)</span></span>
                                  : '-'}
                              </td>
                              {cat === 'registered' && (
                                <td className="px-2 py-1.5">
                                  <span className="text-gray-500">{c.recommended_available_date || '-'}</span>
                                </td>
                              )}
                              {cat === 'standby' && (
                                <>
                                  <td className="px-2 py-1.5"><span className="text-violet-600">{c.pending_embark_date || '-'}</span></td>
                                  <td className="px-2 py-1.5"><span className="text-violet-600">{c.disembark_forecast_date || '-'}</span></td>
                                </>
                              )}
                              {cat === 'onboard' && (
                                <>
                                  <td className="px-2 py-1.5"><span className="text-gray-500">{c.latest_embark_date || '-'}</span></td>
                                  <td className="px-2 py-1.5"><span className="text-violet-600">{c.disembark_forecast_date || '-'}</span></td>
                                </>
                              )}
                              {cat === 'disembarked' && (
                                <>
                                  <td className="px-2 py-1.5"><span className="text-gray-500">{c.latest_disembark_date || '-'}</span></td>
                                  <td className="px-2 py-1.5"><span className="text-gray-500">{c.desired_embark_date || '-'}</span></td>
                                </>
                              )}
                              {cat === 'all' && (
                                <>
                                  <td className="px-2 py-1.5">
                                    {c.is_active_onboard
                                      ? <span className="text-gray-500">{c.latest_embark_date || '-'}</span>
                                      : c.pending_embark_date
                                        ? <span className="text-violet-600">{c.pending_embark_date}</span>
                                        : <span className="text-gray-400">{c.latest_embark_date || '-'}</span>}
                                  </td>
                                  <td className="px-2 py-1.5">
                                    {c.is_active_onboard
                                      ? (c.disembark_forecast_date
                                          ? <span className="text-violet-600">{c.disembark_forecast_date}</span>
                                          : <span className="text-gray-300">-</span>)
                                      : <span className="text-gray-500">{c.latest_disembark_date || '-'}</span>}
                                  </td>
                                </>
                              )}
                              {cat === 'registered' ? (
                                <>
                                  <td className="px-2 py-1.5 text-right text-gray-500">
                                    {c.offered_salary_amount != null
                                      ? `${c.offered_salary_amount.toLocaleString()} ${c.offered_salary_currency}`
                                      : '-'}
                                  </td>
                                  <td className="px-2 py-1.5 text-right text-gray-700">
                                    {c.recommended_salary_amount != null
                                      ? `${c.recommended_salary_amount.toLocaleString()} ${c.recommended_salary_currency}`
                                      : '-'}
                                  </td>
                                </>
                              ) : (
                                <td className="px-2 py-1.5 text-center">
                                  {c.has_salary_template
                                    ? <CheckCircle className="w-4 h-4 text-green-500 mx-auto" />
                                    : <XCircle className="w-4 h-4 text-gray-300 mx-auto" />}
                                </td>
                              )}
                              <td className="px-2 py-1.5 text-center">
                                {evaluationScores.has(c.id) ? (
                                  <span className="inline-flex items-center gap-0.5 text-amber-500 font-medium" title={`최근 고과 ${evaluationScores.get(c.id)!.toFixed(1)}점`}>
                                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                                    {evaluationScores.get(c.id)!.toFixed(1)}
                                  </span>
                                ) : (
                                  <span className="text-gray-300">-</span>
                                )}
                              </td>
                              <td className="px-2 py-1.5 text-right" onClick={e => e.stopPropagation()}>
                                <div className="flex justify-end gap-1">
                                  {permissions.canDelete && (
                                    <Button
                                      size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                      onClick={() => { setSelectedIds([c.id]); setShowDeleteDialog(true); }}
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* 페이지네이션 */}
                  {totalPages > 1 && (
                    <div className="flex justify-center items-center gap-2 pt-3">
                      <Button variant="outline" size="sm" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1} className="h-8">
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        const p = totalPages <= 5 ? i + 1
                          : currentPage <= 3 ? i + 1
                          : currentPage >= totalPages - 2 ? totalPages - 4 + i
                          : currentPage - 2 + i;
                        return (
                          <Button key={p} variant={currentPage === p ? 'default' : 'outline'} size="sm"
                            onClick={() => goToPage(p)} className="h-8 w-8 p-0">{p}</Button>
                        );
                      })}
                      <Button variant="outline" size="sm" onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages} className="h-8">
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>선원 삭제 확인</AlertDialogTitle>
            <AlertDialogDescription>
              선택한 {selectedIds.length}명의 선원을 삭제 선원 리스트로 이동하시겠습니까?
              선원 관리 설정 &gt; 삭제 선원 리스트에서 다시 복구하거나(시스템관리자 이상은 영구 삭제) 할 수 있습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default CrewManagementPage;
