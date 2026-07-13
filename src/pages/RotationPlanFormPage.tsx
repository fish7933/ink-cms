import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Plus, X, Ship, LogIn, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabase';
import { sortRanksByDisplayOrder } from '@/lib/rank-order';
import { rotationService, type CrewReservation } from '@/services/rotation.service';
import { getPorts, findOrCreatePort } from '@/services/port.service';
import { getEffectiveTemplateForShip, type SalaryTemplateWithItems } from '@/lib/salary-store';
import { calculateContractPeriod } from '@/utils/contract-period';
import { crewService, type CrewWithDetails } from '@/services/crew.service';
import type { Rank, Ship as ShipType, Company, Fleet } from '@/types/models';
import type { RankGrade } from '@/types/dispatch';
import type { CrewRotationAssignmentInput } from '@/types/rotation';
import type { Port } from '@/types/port';
import { useToast } from '@/hooks/use-toast';
import { useTabContext } from '@/contexts/TabContext';
import CrewCandidateSelectDialog from '@/components/rotation/CrewCandidateSelectDialog';

interface AssignmentRow {
  id: string;
  boardingCrewId: string | null;
  boardingRankId: string;
  boardingGrade: RankGrade | null;
  departureDate: string;
  boardingDate: string;
  disembarkCrewId: string | null;
  disembarkRankId: string;
  disembarkGrade: RankGrade | null;
  disembarkDate: string;
  returnDate: string;
  contractMonths: string;
  notes: string;
}

function makeRow(overrides?: Partial<AssignmentRow>): AssignmentRow {
  return {
    id: crypto.randomUUID(),
    boardingCrewId: null, boardingRankId: '', boardingGrade: null,
    departureDate: '', boardingDate: '',
    disembarkCrewId: null, disembarkRankId: '', disembarkGrade: null,
    disembarkDate: '', returnDate: '',
    contractMonths: '', notes: '',
    ...overrides,
  };
}

// baseDate는 "기준 교대일" — 승선/하선일은 그날 그대로, 출국일은 하루 전날, 귀국일은 하루 뒷날로 계산한다.
function cascadeDatesFromBase(baseDate: string): Pick<AssignmentRow, 'departureDate' | 'boardingDate' | 'disembarkDate' | 'returnDate'> {
  if (!baseDate) return { departureDate: '', boardingDate: '', disembarkDate: '', returnDate: '' };
  const addDays = (iso: string, n: number) => {
    const [y, m, d] = iso.split('-').map(Number);
    const date = new Date(y, m - 1, d + n);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  const boardingDate = baseDate;
  const disembarkDate = baseDate;
  const departureDate = addDays(baseDate, -1);
  const returnDate = addDays(baseDate, 1);
  return { departureDate, boardingDate, disembarkDate, returnDate };
}

const DATE_SUFFIX_RE = / \(\d{4}-\d{2}-\d{2}\)$/;
function withDateSuffix(name: string, date: string): string {
  const base = name.replace(DATE_SUFFIX_RE, '');
  return date ? `${base} (${date})` : base;
}

export default function RotationPlanFormPage() {
  const { toast } = useToast();
  const { activeTabId, closeTab, openNewTab, tabs } = useTabContext();
  const [searchParams] = useSearchParams();
  const params = useParams<{ id?: string }>();
  const editPlanId = params.id;
  const isEditMode = !!editPlanId;

  const [availableCrew, setAvailableCrew] = useState<CrewWithDetails[]>([]);
  const [onboardCrew, setOnboardCrew] = useState<CrewWithDetails[]>([]);
  // 다른 활성(임시저장/결재중/승인) 교대계획에 이미 배정된 선원 — draft 배정은 후보에서 빼지 않고
  // 경고만 표시한다(저장 시 그 draft 계획에서 자동으로 제외됨). draft가 아니면 후보에서 제외.
  const [crewReservations, setCrewReservations] = useState<Map<string, CrewReservation>>(new Map());
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [ports, setPorts] = useState<Port[]>([]);
  const [loading, setLoading] = useState(true);

  const [owners, setOwners] = useState<Company[]>([]);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [ships, setShips] = useState<ShipType[]>([]);
  const [ownerId, setOwnerId] = useState('');
  const [fleetId, setFleetId] = useState('');
  const [shipId, setShipId] = useState('');
  const [effectiveTemplate, setEffectiveTemplate] = useState<SalaryTemplateWithItems | null>(null);

  const [planName, setPlanName] = useState('');
  const [planNotes, setPlanNotes] = useState('');
  const [baseDepartureDate, setBaseDepartureDate] = useState('');
  const [countryName, setCountryName] = useState('');
  const [manualCountry, setManualCountry] = useState(false);
  const [cityName, setCityName] = useState('');
  const [manualCity, setManualCity] = useState(false);

  const [rows, setRows] = useState<AssignmentRow[]>([makeRow()]);
  const [boardingDialogOpen, setBoardingDialogOpen] = useState(false);
  const [disembarkDialogOpen, setDisembarkDialogOpen] = useState(false);
  const [rowPicker, setRowPicker] = useState<{ rowId: string; side: 'boarding' | 'disembark' } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const preBoarding = (searchParams.get('boarding') || '').split(',').filter(Boolean);
  const preDisembark = (searchParams.get('disembark') || '').split(',').filter(Boolean);

  const BOARDING_CANDIDATE_STATUSES = ['registered', 'under_review', 'sent_to_owner', 'owner_approved', 'owner_rejected', 'standby', 'deployment_decided'];
  const getCrewStatus = (c: CrewWithDetails) => (c as CrewWithDetails & { status?: string }).status || c.current_status || '';

  useEffect(() => { loadData(); }, []);

  // 선주/선박 선택 후 기존 행의 계약개월을 자동 채움 (빈 행만)
  useEffect(() => {
    if (!ownerId || !owners.length || !ranks.length) return;
    const owner = owners.find(o => o.id === ownerId);
    if (!owner) return;
    setRows(prev => {
      let changed = false;
      const next = prev.map(row => {
        if (!row.boardingCrewId || row.contractMonths) return row;
        const crew = [...availableCrew, ...onboardCrew].find(c => c.id === row.boardingCrewId);
        if (!crew?.rank_id) return row;
        const rank = ranks.find(r => r.id === crew.rank_id);
        if (!rank) return row;
        const ship = ships.find(s => s.id === shipId) || null;
        const fleet = fleets.find(f => f.id === fleetId) || null;
        const cm = calculateContractPeriod(rank.rank_category, ship, fleet, owner);
        if (cm != null && cm > 0) { changed = true; return { ...row, contractMonths: String(cm) }; }
        return row;
      });
      return changed ? next : prev;
    });
  }, [ownerId, owners, shipId, ships, fleetId, fleets, ranks, availableCrew, onboardCrew]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async () => {
    setLoading(true);
    const [allCrew, ranksRes, ownersRes, portsData, reservations] = await Promise.all([
      crewService.getAllWithDetails(),
      supabase.from('ranks').select('*'),
      supabase.from('companies').select('*').eq('type', 'owner').order('name'),
      getPorts(),
      rotationService.getCrewReservations(),
    ]);

    const ranksData: Rank[] = sortRanksByDisplayOrder(ranksRes.data || []);
    const ownersData: Company[] = ownersRes.data || [];
    const ranksById = new Map(ranksData.map(r => [r.id, r]));
    const crewById = new Map(allCrew.map(c => [c.id, c]));

    setAvailableCrew(allCrew.filter(c => BOARDING_CANDIDATE_STATUSES.includes(getCrewStatus(c))).sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    setOnboardCrew(allCrew.filter(c => getCrewStatus(c) === 'onboard').sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    setCrewReservations(new Map(reservations.map(r => [r.crewId, r])));
    setRanks(ranksData);
    setOwners(ownersData);
    setPorts(portsData);

    // 임시저장(draft) 계획을 다시 열어 수정하는 경우 — 저장된 배정 내용을 그대로 불러와 채운다.
    if (editPlanId) {
      const existing = await rotationService.getRotationPlanById(editPlanId);
      if (!existing) {
        toast({ title: '교대계획을 찾을 수 없습니다.', variant: 'destructive' });
        if (activeTabId) closeTab(activeTabId);
        return;
      }
      if (existing.status !== 'draft') {
        toast({ title: '임시저장 상태의 계획만 수정할 수 있습니다.', description: '이미 결재가 진행중이거나 처리된 계획입니다.', variant: 'destructive' });
        if (activeTabId) closeTab(activeTabId);
        return;
      }

      const [fleetsRes, shipsRes] = await Promise.all([
        supabase.from('fleets').select('*').eq('owner_id', existing.owner_id).order('name'),
        supabase.from('ships').select('*').eq('owner_id', existing.owner_id).order('name'),
      ]);
      setFleets(fleetsRes.data || []);
      setShips(shipsRes.data || []);
      setOwnerId(existing.owner_id);
      setFleetId(existing.fleet_id || '');
      setShipId(existing.ship_id);
      setPlanName(existing.plan_name);
      setPlanNotes(existing.notes || '');
      setBaseDepartureDate(existing.base_departure_date || '');
      if (existing.port_id) {
        const port = (portsData || []).find(p => p.id === existing.port_id);
        if (port) { setCountryName(port.country_name); setCityName(port.city_name); }
      }

      const loadedRows: AssignmentRow[] = existing.assignments.length > 0
        ? existing.assignments.map(a => makeRow({
            boardingCrewId: a.on_crew_id,
            boardingRankId: a.on_rank_id || '',
            boardingGrade: a.on_rank_grade,
            departureDate: a.on_departure_date || '',
            boardingDate: a.embark_date || '',
            disembarkCrewId: a.off_crew_id,
            disembarkRankId: a.off_rank_id || '',
            disembarkGrade: a.off_rank_grade,
            disembarkDate: a.off_disembark_date || '',
            returnDate: a.off_return_date || '',
            contractMonths: a.contract_months != null ? String(a.contract_months) : '',
            notes: a.notes || '',
          }))
        : [makeRow()];
      setRows(loadedRows);
      setLoading(false);
      return;
    }

    // 승선자용 초기 필드: rank 자동, grade는 null (사용자 선택 필수)
    const initBoardingFields = (crewId: string, ownerObj?: Company, shipObj?: ShipType, fleetObj?: Fleet): Partial<AssignmentRow> => {
      const crew = crewById.get(crewId);
      if (!crew) return {};
      const rank = ranksById.get(crew.rank_id || '');
      let contractMonths = '';
      if (rank && ownerObj) {
        const cm = calculateContractPeriod(rank.rank_category, shipObj || null, fleetObj || null, ownerObj);
        if (cm != null && cm > 0) contractMonths = String(cm);
      }
      return { boardingRankId: rank?.id || crew.rank_id || '', boardingGrade: null, ...(contractMonths ? { contractMonths } : {}) };
    };

    // 하선자용 초기 필드: rank + grade 모두 crew 데이터에서 그대로 삽입
    const initDisembarkFields = (crewId: string): Partial<AssignmentRow> => {
      const crew = crewById.get(crewId);
      if (!crew) return {};
      const rank = ranksById.get(crew.rank_id || '');
      const grade = ((crew as CrewWithDetails & { current_grade?: string }).current_grade) || null;
      return { disembarkRankId: rank?.id || crew.rank_id || '', disembarkGrade: grade };
    };

    // 행 초기화 (직급/등급 포함)
    const maxPre = Math.max(preBoarding.length, preDisembark.length);
    const initRows: AssignmentRow[] = [];
    for (let i = 0; i < Math.max(maxPre, 1); i++) {
      const bId = preBoarding[i] || null;
      const dId = preDisembark[i] || null;
      initRows.push(makeRow({
        boardingCrewId: bId,
        ...(bId ? initBoardingFields(bId) : {}),
        disembarkCrewId: dId,
        ...(dId ? initDisembarkFields(dId) : {}),
      }));
    }

    // 선주/플릿/선박 자동 선택 대상 결정:
    // 1) 하선 선원이 지정된 경우 → 그 선원이 현재 승선 중인 선박 기준
    // 2) 승선 선원만 지정된 경우 → 등록 시 추천받은 선박(current_ship_id)이 있으면 그 선박 기준
    const autoShipRef = preDisembark.length > 0
      ? allCrew.find(c => c.id === preDisembark[0] && getCrewStatus(c) === 'onboard')
      : preBoarding.length > 0
        ? allCrew.find(c => c.id === preBoarding[0] && BOARDING_CANDIDATE_STATUSES.includes(getCrewStatus(c)))
        : undefined;

    if (autoShipRef?.current_ship_id && autoShipRef?.owner_id) {
      const autoOwnerId = autoShipRef.owner_id;
      const autoFleetId = autoShipRef.fleet_id || '';
      const autoShipId = autoShipRef.current_ship_id;

      const [fleetsRes, shipsRes] = await Promise.all([
        supabase.from('fleets').select('*').eq('owner_id', autoOwnerId).order('name'),
        supabase.from('ships').select('*').eq('owner_id', autoOwnerId).order('name'),
      ]);
      const loadedFleets: Fleet[] = fleetsRes.data || [];
      const loadedShips: ShipType[] = shipsRes.data || [];
      const ownerObj = ownersData.find(o => o.id === autoOwnerId);
      const shipObj = loadedShips.find(s => s.id === autoShipId);
      const fleetObj = loadedFleets.find(f => f.id === autoFleetId);

      setFleets(loadedFleets);
      setShips(loadedShips);
      setOwnerId(autoOwnerId);
      setFleetId(autoFleetId);
      setShipId(autoShipId);

      // 승선자 있으면 계약개월 재계산 (이제 owner/ship 정보 있음)
      if (preBoarding.length > 0 && ownerObj) {
        for (const row of initRows) {
          if (row.boardingCrewId) {
            const fields = initBoardingFields(row.boardingCrewId, ownerObj, shipObj, fleetObj);
            Object.assign(row, fields);
          }
        }
      }
    }

    setRows(initRows);
    setLoading(false);
  };

  // 선주 > 플릿 > 선박 캐스케이드
  useEffect(() => {
    if (!ownerId) { setFleets([]); return; }
    supabase.from('fleets').select('*').eq('owner_id', ownerId).order('name')
      .then(({ data }) => setFleets(data || []));
  }, [ownerId]);

  useEffect(() => {
    if (!ownerId) { setShips([]); return; }
    let q = supabase.from('ships').select('*').eq('owner_id', ownerId);
    if (fleetId) q = q.eq('fleet_id', fleetId);
    q.order('name').then(({ data }) => setShips(data || []));
  }, [ownerId, fleetId]);

  const handleOwnerChange = (id: string) => { setOwnerId(id); setFleetId(''); setShipId(''); };
  const handleFleetChange = (id: string) => { setFleetId(id === '_none' ? '' : id); setShipId(''); };

  useEffect(() => {
    if (!shipId) { setEffectiveTemplate(null); return; }
    getEffectiveTemplateForShip(shipId).then(setEffectiveTemplate);
  }, [shipId]);

  useEffect(() => {
    if (!shipId || isEditMode) return;
    const ship = ships.find(s => s.id === shipId);
    if (!ship) return;
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01T00:00:00Z`;
    const monthEnd = month === 12 ? `${year + 1}-01-01T00:00:00Z` : `${year}-${String(month + 1).padStart(2, '0')}-01T00:00:00Z`;
    supabase.from('crew_rotation_plans')
      .select('id', { count: 'exact', head: true })
      .eq('ship_id', shipId).gte('created_at', monthStart).lt('created_at', monthEnd)
      .then(({ count }) => {
        const seq = (count || 0) + 1;
        const base = `${ship.name} ${year}-${String(month).padStart(2, '0')} #${seq}`;
        setPlanName(withDateSuffix(base, baseDepartureDate));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipId, ships]);

  useEffect(() => {
    // 수정 모드에서 기존 계획을 불러올 때는 각 배정 건마다 저장된 개별 일자를 그대로 써야 하므로,
    // 기준일 하나로 모든 행의 날짜를 일괄 재계산해 덮어쓰지 않는다.
    if (isEditMode) return;
    setPlanName(prev => prev ? withDateSuffix(prev, baseDepartureDate) : prev);
    if (baseDepartureDate) {
      const dates = cascadeDatesFromBase(baseDepartureDate);
      setRows(prev => prev.map(r => ({ ...r, ...dates })));
    }
  }, [baseDepartureDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateRow = (id: string, updates: Partial<AssignmentRow>) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  const addRow = () => setRows(prev => [...prev, makeRow(cascadeDatesFromBase(baseDepartureDate))]);
  const removeRow = (id: string) => setRows(prev => prev.filter(r => r.id !== id));

  // 급여 템플릿에서 특정 직급에 정의된 등급 목록
  const gradesForRank = (rankName: string): string[] => {
    if (!effectiveTemplate) return [];
    return Array.from(new Set(
      effectiveTemplate.items.filter(i => i.rank === rankName && i.rank_grade).map(i => i.rank_grade as string)
    ));
  };
  const gradesForRankId = (rankId: string): string[] => {
    const rank = ranks.find(r => r.id === rankId);
    return rank ? gradesForRank(rank.name) : [];
  };

  // 승선자용: rank 자동, grade는 null (필수 선택)
  const computeBoardingAutoFields = (crew: CrewWithDetails) => {
    const rank = ranks.find(r => r.id === crew.rank_id);
    const rankId = rank?.id || crew.rank_id || '';
    let contractMonths = '';
    const owner = owners.find(o => o.id === ownerId) || null;
    if (rank && owner) {
      const ship = ships.find(s => s.id === shipId) || null;
      const fleet = fleets.find(f => f.id === fleetId) || null;
      const cm = calculateContractPeriod(rank.rank_category, ship, fleet, owner);
      if (cm) contractMonths = String(cm);
    }
    return { rankId, grade: null as RankGrade | null, contractMonths };
  };

  // 하선자용: rank + grade 모두 crew 현재 정보에서 자동 삽입
  const computeDisembarkAutoFields = (crew: CrewWithDetails) => {
    const rank = ranks.find(r => r.id === crew.rank_id);
    const rankId = rank?.id || crew.rank_id || '';
    const grade = ((crew as CrewWithDetails & { current_grade?: string }).current_grade) || null;
    return { rankId, grade: grade as RankGrade | null };
  };

  const usedBoardingIds = rows.map(r => r.boardingCrewId).filter(Boolean) as string[];
  const usedDisembarkIds = rows.map(r => r.disembarkCrewId).filter(Boolean) as string[];

  // 결재중/승인된 다른 계획에 배정된 선원만 후보에서 제외한다 — 임시저장(draft) 계획에 있는 선원은
  // 후보로 남겨두고 경고만 표시한다(저장 시 그 draft 계획에서 자동으로 빠짐).
  const isHardReserved = (crewId: string) => {
    const r = crewReservations.get(crewId);
    if (!r) return false;
    if (isEditMode && r.planId === editPlanId) return false;
    return r.status !== 'draft';
  };
  const draftReservationFor = (crewId: string | null): CrewReservation | null => {
    if (!crewId) return null;
    const r = crewReservations.get(crewId);
    if (!r) return null;
    if (isEditMode && r.planId === editPlanId) return null;
    return r.status === 'draft' ? r : null;
  };

  const boardingCandidates = availableCrew.filter(c => !usedBoardingIds.includes(c.id) && !isHardReserved(c.id));
  const disembarkCandidates = onboardCrew.filter(c => !usedDisembarkIds.includes(c.id) && c.current_ship_id === shipId && !isHardReserved(c.id));

  const addBoardingCrewIdsAsRows = (ids: string[]) => {
    const seed = cascadeDatesFromBase(baseDepartureDate);
    const newRows = ids.map(id => {
      const crew = availableCrew.find(c => c.id === id);
      const auto = crew ? computeBoardingAutoFields(crew) : { rankId: '', grade: null, contractMonths: '' };
      return makeRow({ boardingCrewId: id, boardingRankId: auto.rankId, boardingGrade: auto.grade, contractMonths: auto.contractMonths, ...seed });
    });
    setRows(prev => [...prev.filter(r => r.boardingCrewId || r.disembarkCrewId), ...newRows]);
  };

  const addDisembarkCrewIdsAsRows = (ids: string[]) => {
    const seed = cascadeDatesFromBase(baseDepartureDate);
    const newRows = ids.map(id => {
      const crew = onboardCrew.find(c => c.id === id);
      const auto = crew ? computeDisembarkAutoFields(crew) : { rankId: '', grade: null };
      return makeRow({ disembarkCrewId: id, disembarkRankId: auto.rankId, disembarkGrade: auto.grade, ...seed });
    });
    setRows(prev => [...prev.filter(r => r.boardingCrewId || r.disembarkCrewId), ...newRows]);
  };

  const getCrew = (id: string | null) => (id && (availableCrew.find(c => c.id === id) || onboardCrew.find(c => c.id === id))) || null;
  const getCrewLabel = (id: string | null) => {
    const c = getCrew(id);
    if (!c) return '선원 선택';
    const code = c.rank_code || '';
    return code ? `[${code}] ${c.name}` : c.name;
  };

  const rowPickerCandidates = (): CrewWithDetails[] => {
    if (!rowPicker) return [];
    const row = rows.find(r => r.id === rowPicker.rowId);
    if (rowPicker.side === 'boarding') {
      return availableCrew.filter(c => c.id === row?.boardingCrewId || (!usedBoardingIds.includes(c.id) && !isHardReserved(c.id)));
    }
    return onboardCrew.filter(c => c.id === row?.disembarkCrewId || (c.current_ship_id === shipId && !usedDisembarkIds.includes(c.id) && !isHardReserved(c.id)));
  };

  const handleRowPickerConfirm = (ids: string[]) => {
    if (!rowPicker) return;
    const id = ids[0] || null;
    if (!id) {
      updateRow(rowPicker.rowId, rowPicker.side === 'boarding'
        ? { boardingCrewId: null, boardingRankId: '', boardingGrade: null }
        : { disembarkCrewId: null, disembarkRankId: '', disembarkGrade: null });
      return;
    }
    if (rowPicker.side === 'boarding') {
      const crew = availableCrew.find(c => c.id === id);
      const auto = crew ? computeBoardingAutoFields(crew) : { rankId: '', grade: null, contractMonths: '' };
      updateRow(rowPicker.rowId, { boardingCrewId: id, boardingRankId: auto.rankId, boardingGrade: auto.grade, contractMonths: auto.contractMonths });
    } else {
      const crew = onboardCrew.find(c => c.id === id);
      const auto = crew ? computeDisembarkAutoFields(crew) : { rankId: '', grade: null };
      updateRow(rowPicker.rowId, { disembarkCrewId: id, disembarkRankId: auto.rankId, disembarkGrade: auto.grade });
    }
  };

  const countryOptions = Array.from(new Set(ports.map(p => p.country_name))).sort();
  const cityOptions = Array.from(new Set(ports.filter(p => p.country_name === countryName).map(p => p.city_name))).sort();

  const handleCountrySelect = (value: string) => {
    if (value === '_manual') { setManualCountry(true); setCountryName(''); }
    else if (value === '_none') { setManualCountry(false); setCountryName(''); }
    else { setManualCountry(false); setCountryName(value); }
    setManualCity(false); setCityName('');
  };
  const handleCitySelect = (value: string) => {
    if (value === '_manual') { setManualCity(true); setCityName(''); }
    else if (value === '_none') { setManualCity(false); setCityName(''); }
    else { setManualCity(false); setCityName(value); }
  };
  // 직접입력한 국가명이 실제로 목록에 있는 국가와 일치하면 선택 목록 모드로 되돌려서
  // 교대지 도시 셀렉트 박스가 뜨도록 한다.
  const handleManualCountryChange = (value: string) => {
    const match = countryOptions.find(c => c.toLowerCase() === value.trim().toLowerCase());
    if (match) {
      setManualCountry(false);
      setCountryName(match);
      setManualCity(false);
      setCityName('');
    } else {
      setCountryName(value);
    }
  };

  const handleSubmit = async () => {
    if (!ownerId) { toast({ title: '선주를 선택하세요', variant: 'destructive' }); return; }
    if (!shipId) { toast({ title: '선박을 선택하세요', variant: 'destructive' }); return; }
    const validRows = rows.filter(r => r.boardingCrewId || r.disembarkCrewId);
    if (validRows.length === 0) { toast({ title: '배정 정보를 입력하세요', variant: 'destructive' }); return; }

    // 승선자 직급/등급 필수 검증 — 등급은 그 직급의 급여템플릿에 실제로 등급 옵션이 있을 때만 필수
    const missingRank = validRows.filter(r => r.boardingCrewId && !r.boardingRankId);
    if (missingRank.length > 0) {
      const names = missingRank.map(r => getCrew(r.boardingCrewId)?.name || '?').join(', ');
      toast({ title: '승선 직급 필수', description: `${names} — 승선 직급을 선택하세요`, variant: 'destructive' });
      return;
    }
    const missingGrade = validRows.filter(r => r.boardingCrewId && r.boardingRankId && gradesForRankId(r.boardingRankId).length > 0 && !r.boardingGrade);
    if (missingGrade.length > 0) {
      const names = missingGrade.map(r => getCrew(r.boardingCrewId)?.name || '?').join(', ');
      toast({ title: '승선 등급 필수', description: `${names} — 이 직급은 급여템플릿에 등급이 구분돼 있어 등급을 선택해야 합니다`, variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      let portId: string | null = null;
      if (countryName && cityName) {
        const port = await findOrCreatePort(countryName, cityName);
        portId = port?.id || null;
      }

      const assignments: CrewRotationAssignmentInput[] = validRows.map(r => ({
        on_crew_id: r.boardingCrewId,
        on_rank_id: r.boardingRankId || null,
        on_rank_grade: r.boardingGrade,
        on_departure_date: r.departureDate || null,
        off_crew_id: r.disembarkCrewId,
        off_rank_id: r.disembarkRankId || null,
        off_rank_grade: r.disembarkGrade,
        off_disembark_date: r.disembarkDate || null,
        off_return_date: r.returnDate || null,
        contract_months: r.contractMonths ? +r.contractMonths : null,
        salary_template_id: effectiveTemplate?.id || null,
        salary_amount: null,
        salary_currency: 'USD',
        embark_date: r.boardingDate || new Date().toISOString().slice(0, 10),
        notes: r.notes || null,
      }));

      const planPayload = {
        ship_id: shipId,
        owner_id: ownerId,
        fleet_id: fleetId || null,
        plan_name: planName || `Rotation Plan ${new Date().toISOString().slice(0, 10)}`,
        rotation_date: validRows[0]?.boardingDate || new Date().toISOString().slice(0, 10),
        notes: planNotes || null,
        base_departure_date: baseDepartureDate || null,
        port_id: portId,
        assignments,
      };

      const result = isEditMode
        ? await rotationService.updateRotationPlanWithAssignments(editPlanId!, planPayload)
        : await rotationService.createRotationPlan(planPayload);

      if (!result) throw new Error('저장에 실패했습니다');
      const { moved } = result;
      if (moved.length > 0) {
        const summary = moved.map(m => `${m.crewName}(${m.fromPlanName})`).join(', ');
        toast({ title: isEditMode ? '수정 완료' : '작성 완료', description: `${summary} — 이전 임시저장 계획에서 제외되고 이 계획에 포함되었습니다.` });
      } else {
        toast({ title: isEditMode ? '수정 완료' : '작성 완료', description: '결재 상신은 교대계획 목록에서 진행하세요' });
      }
      // 교대발령 목록 탭이 없으면 열어준 뒤 현재 폼 탭을 닫음
      if (!tabs.some(t => t.path === '/crew-rotation')) {
        openNewTab('/crew-rotation', '선원 교대 발령');
      }
      if (activeTabId) closeTab(activeTabId);
    } catch (e) {
      toast({ title: '오류', description: String(e), variant: 'destructive' });
    } finally { setSubmitting(false); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-3">

      {/* 헤더 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Ship className="w-4 h-4" />{isEditMode ? '교대 계획 수정 (임시저장)' : '교대 계획 작성'}
            </CardTitle>
            <Button size="sm" onClick={handleSubmit} disabled={submitting} className="h-8 bg-blue-600 hover:bg-blue-700">{isEditMode ? '수정 완료' : '작성 완료'}</Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-2.5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">선주 *</Label>
              <Select value={ownerId || '_none'} onValueChange={v => handleOwnerChange(v === '_none' ? '' : v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="선주 선택" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">선주 선택</SelectItem>
                  {owners.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">플릿</Label>
              <Select value={fleetId || '_none'} onValueChange={handleFleetChange} disabled={!ownerId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="전체" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">전체</SelectItem>
                  {fleets.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">선박 *</Label>
              <Select value={shipId || '_none'} onValueChange={v => setShipId(v === '_none' ? '' : v)} disabled={!ownerId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="선박 선택" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">선박 선택</SelectItem>
                  {ships.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">계획명</Label>
              <Input value={planName} onChange={e => setPlanName(e.target.value)} placeholder="선박 선택 시 자동입력" className="h-8 text-xs" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">교대지 국가</Label>
              {manualCountry ? (
                <div className="flex gap-1">
                  <Input value={countryName} onChange={e => handleManualCountryChange(e.target.value)} placeholder="국가명 (영어)" className="h-8 text-xs" />
                  <Button type="button" variant="outline" size="sm" className="h-8 text-xs shrink-0 px-2" onClick={() => { setManualCountry(false); setCountryName(''); }}>목록</Button>
                </div>
              ) : (
                <Select value={countryName || '_none'} onValueChange={handleCountrySelect}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="국가 선택" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_manual">직접 입력...</SelectItem>
                    <SelectItem value="_none">국가 선택</SelectItem>
                    {countryOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">교대지 도시</Label>
              {(manualCountry || manualCity) ? (
                <div className="flex gap-1">
                  <Input value={cityName} onChange={e => setCityName(e.target.value)} placeholder="도시명 (영어)" className="h-8 text-xs" />
                  {!manualCountry && (
                    <Button type="button" variant="outline" size="sm" className="h-8 text-xs shrink-0 px-2" onClick={() => { setManualCity(false); setCityName(''); }}>목록</Button>
                  )}
                </div>
              ) : (
                <Select value={cityName || '_none'} onValueChange={handleCitySelect} disabled={!countryName}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={countryName ? '도시 선택' : '국가를 먼저 선택'} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_manual">직접 입력...</SelectItem>
                    <SelectItem value="_none">도시 선택</SelectItem>
                    {cityOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">기준 교대일</Label>
              <Input type="date" value={baseDepartureDate} onChange={e => setBaseDepartureDate(e.target.value)} className="h-8 text-xs" />
              <p className="text-[10px] text-gray-400">승선/하선일은 기준일, 출국일은 하루 전날, 귀국일은 하루 뒷날로 일괄 설정합니다</p>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">비고</Label>
            <Textarea value={planNotes} onChange={e => setPlanNotes(e.target.value)} rows={2} className="text-xs resize-none" />
          </div>
        </CardContent>
      </Card>

      {/* 발령 상세 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-semibold text-gray-700">발령 상세</h3>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setBoardingDialogOpen(true)} className="h-7 text-xs gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50">
              <Plus className="w-3 h-3" />승선 후보 추가
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDisembarkDialogOpen(true)} className="h-7 text-xs gap-1 border-orange-300 text-orange-700 hover:bg-orange-50">
              <Plus className="w-3 h-3" />하선 후보 추가
            </Button>
            <Button size="sm" variant="outline" onClick={addRow} className="h-7 text-xs gap-1">
              <Plus className="w-3 h-3" />빈 행 추가
            </Button>
          </div>
        </div>

        {rows.map((row, idx) => (
          <Card key={row.id} className="border-gray-200">
            <CardContent className="p-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-400">#{idx + 1}</span>
                {rows.length > 1 && (
                  <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-gray-400" onClick={() => removeRow(row.id)}>
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {/* ────────── 신규 승선 (IN) ────────── */}
                <div className="space-y-1 rounded-md border border-emerald-100 bg-emerald-50/30 p-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <LogIn className="w-3.5 h-3.5 text-emerald-600" />
                    <Label className="text-[11px] font-semibold text-emerald-700">신규 승선 (IN)</Label>
                    <span className="text-[10px] text-emerald-500">출국일 → 승선일</span>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      type="button" variant="outline"
                      className="h-7 text-xs flex-1 min-w-0 justify-start font-normal truncate px-2 border-emerald-200"
                      onClick={() => setRowPicker({ rowId: row.id, side: 'boarding' })}
                    >
                      <span className="truncate text-emerald-800">{getCrewLabel(row.boardingCrewId)}</span>
                    </Button>
                    <Select value={row.boardingRankId || '_none'} onValueChange={v => updateRow(row.id, { boardingRankId: v === '_none' ? '' : v, boardingGrade: null })}>
                      <SelectTrigger className="h-7 text-xs w-20 shrink-0"><SelectValue placeholder="직급 *" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">직급 *</SelectItem>
                        {ranks.map(r => <SelectItem key={r.id} value={r.id}>{r.rank_code || r.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {(() => {
                      const opts = gradesForRankId(row.boardingRankId);
                      return opts.length > 0 ? (
                        <Select value={row.boardingGrade || '_none'} onValueChange={v => updateRow(row.id, { boardingGrade: v === '_none' ? null : v })}>
                          <SelectTrigger className={`h-7 text-xs w-16 shrink-0 px-1 ${!row.boardingGrade ? 'border-orange-300' : ''}`}>
                            <SelectValue placeholder="등급 *" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_none">선택 *</SelectItem>
                            {opts.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input value={row.boardingGrade || ''} onChange={e => updateRow(row.id, { boardingGrade: e.target.value || null })}
                          placeholder="등급" className="h-7 text-xs w-16 shrink-0" />
                      );
                    })()}
                  </div>
                  {draftReservationFor(row.boardingCrewId) && (
                    <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                      ⚠ 임시저장 계획 "{draftReservationFor(row.boardingCrewId)!.planName}"에도 포함되어 있습니다 — 저장 시 그 계획에서 제외됩니다.
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-1">
                    <div className="relative">
                      <Input type="date" value={row.departureDate} onChange={e => updateRow(row.id, { departureDate: e.target.value })} className="h-7 text-xs pr-1" />
                      <span className="absolute -top-1.5 left-1 text-[9px] text-emerald-500 bg-emerald-50 px-0.5">출국</span>
                    </div>
                    <div className="relative">
                      <Input type="date" value={row.boardingDate} onChange={e => updateRow(row.id, { boardingDate: e.target.value })} className="h-7 text-xs pr-1" />
                      <span className="absolute -top-1.5 left-1 text-[9px] text-emerald-500 bg-emerald-50 px-0.5">승선</span>
                    </div>
                  </div>
                </div>

                {/* ────────── 기존 하선 (OUT) ────────── */}
                <div className="space-y-1 rounded-md border border-orange-100 bg-orange-50/30 p-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <LogOut className="w-3.5 h-3.5 text-orange-600" />
                    <Label className="text-[11px] font-semibold text-orange-700">기존 하선 (OUT)</Label>
                    <span className="text-[10px] text-orange-500">하선일 → 귀국일</span>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      type="button" variant="outline"
                      className="h-7 text-xs flex-1 min-w-0 justify-start font-normal truncate px-2 border-orange-200"
                      onClick={() => setRowPicker({ rowId: row.id, side: 'disembark' })}
                    >
                      <span className="truncate text-orange-800">{getCrewLabel(row.disembarkCrewId)}</span>
                    </Button>
                    <Select value={row.disembarkRankId || '_none'} onValueChange={v => updateRow(row.id, { disembarkRankId: v === '_none' ? '' : v })}>
                      <SelectTrigger className="h-7 text-xs w-20 shrink-0"><SelectValue placeholder="직급" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">직급</SelectItem>
                        {ranks.map(r => <SelectItem key={r.id} value={r.id}>{r.rank_code || r.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {(() => {
                      const opts = gradesForRankId(row.disembarkRankId);
                      return opts.length > 0 ? (
                        <Select value={row.disembarkGrade || '_none'} onValueChange={v => updateRow(row.id, { disembarkGrade: v === '_none' ? null : v })}>
                          <SelectTrigger className="h-7 text-xs w-16 shrink-0 px-1"><SelectValue placeholder="등급" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_none">선택</SelectItem>
                            {opts.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input value={row.disembarkGrade || ''} onChange={e => updateRow(row.id, { disembarkGrade: e.target.value || null })}
                          placeholder="등급" className="h-7 text-xs w-16 shrink-0" />
                      );
                    })()}
                  </div>
                  {draftReservationFor(row.disembarkCrewId) && (
                    <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                      ⚠ 임시저장 계획 "{draftReservationFor(row.disembarkCrewId)!.planName}"에도 포함되어 있습니다 — 저장 시 그 계획에서 제외됩니다.
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-1">
                    <div className="relative">
                      <Input type="date" value={row.disembarkDate} onChange={e => updateRow(row.id, { disembarkDate: e.target.value })} className="h-7 text-xs pr-1" />
                      <span className="absolute -top-1.5 left-1 text-[9px] text-orange-500 bg-orange-50 px-0.5">하선</span>
                    </div>
                    <div className="relative">
                      <Input type="date" value={row.returnDate} onChange={e => updateRow(row.id, { returnDate: e.target.value })} className="h-7 text-xs pr-1" />
                      <span className="absolute -top-1.5 left-1 text-[9px] text-orange-500 bg-orange-50 px-0.5">귀국</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 계약개월 + 비고 */}
              <div className="grid grid-cols-2 gap-1 pt-1 border-t">
                <div className="relative">
                  <Input
                    type="number"
                    value={row.contractMonths}
                    onChange={e => updateRow(row.id, { contractMonths: e.target.value })}
                    className="h-7 text-xs"
                    placeholder={row.boardingCrewId && !row.contractMonths ? '계약개월 (선주사 기본값 미설정)' : '계약 개월'}
                  />
                </div>
                <Input value={row.notes} onChange={e => updateRow(row.id, { notes: e.target.value })} className="h-7 text-xs" placeholder="비고" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 배정 요약 */}
      <Card className="bg-gray-50">
        <CardContent className="py-3 px-4">
          <p className="text-xs font-semibold text-gray-600 mb-2">교대 배정 요약</p>
          {rows.every(r => !r.boardingCrewId && !r.disembarkCrewId) ? (
            <p className="text-xs text-gray-400">배정된 선원이 없습니다</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {rows.filter(r => r.boardingCrewId || r.disembarkCrewId).map((r, i) => {
                const inCrew = getCrew(r.boardingCrewId);
                const outCrew = getCrew(r.disembarkCrewId);
                const inRankCode = r.boardingRankId ? ranks.find(rk => rk.id === r.boardingRankId)?.rank_code : '';
                const outRankCode = r.disembarkRankId ? ranks.find(rk => rk.id === r.disembarkRankId)?.rank_code : '';
                return (
                  <div key={r.id} className="bg-white border rounded-md p-2 space-y-1.5 text-xs">
                    <div className="flex items-center gap-1 border-b pb-1">
                      <span className="text-[10px] text-gray-400 font-mono">#{i + 1}</span>
                      {(inRankCode || outRankCode) && (
                        <span className="text-[10px] font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                          {inRankCode || outRankCode}
                        </span>
                      )}
                      {r.contractMonths && (
                        <span className="ml-auto text-[10px] text-gray-400">{r.contractMonths}개월</span>
                      )}
                    </div>
                    {/* OUT 하선 */}
                    <div className="flex items-center gap-1.5">
                      <div className="flex items-center gap-1 w-16 shrink-0">
                        <LogOut className="w-3 h-3 text-orange-500" />
                        <span className="text-[10px] font-medium text-orange-600">하선(OUT)</span>
                      </div>
                      {outCrew ? (
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="font-medium text-orange-800 truncate">{outCrew.name}</span>
                          {r.disembarkGrade && <span className="font-mono text-[10px] text-orange-600 bg-orange-50 px-1 rounded shrink-0">{r.disembarkGrade}급</span>}
                          {r.disembarkDate && <span className="text-[10px] text-gray-400 shrink-0">{r.disembarkDate}</span>}
                        </div>
                      ) : <span className="text-gray-300 italic text-[10px]">미정</span>}
                    </div>
                    {/* IN 승선 */}
                    <div className="flex items-center gap-1.5">
                      <div className="flex items-center gap-1 w-16 shrink-0">
                        <LogIn className="w-3 h-3 text-emerald-500" />
                        <span className="text-[10px] font-medium text-emerald-600">승선(IN)</span>
                      </div>
                      {inCrew ? (
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="font-medium text-emerald-800 truncate">{inCrew.name}</span>
                          {r.boardingGrade
                            ? <span className="font-mono text-[10px] text-emerald-600 bg-emerald-50 px-1 rounded shrink-0">{r.boardingGrade}급</span>
                            : gradesForRankId(r.boardingRankId).length > 0
                              ? <span className="text-[10px] text-orange-500 shrink-0">등급 미선택</span>
                              : null}
                          {r.boardingDate && <span className="text-[10px] text-gray-400 shrink-0">{r.boardingDate}</span>}
                        </div>
                      ) : <span className="text-gray-300 italic text-[10px]">미정</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <CrewCandidateSelectDialog
        open={boardingDialogOpen}
        onOpenChange={setBoardingDialogOpen}
        mode="boarding"
        candidates={boardingCandidates}
        onConfirm={addBoardingCrewIdsAsRows}
        getReservationNote={c => { const r = draftReservationFor(c.id); return r ? `임시저장 계획 "${r.planName}"에도 포함됨 — 저장 시 제외됩니다` : null; }}
      />
      <CrewCandidateSelectDialog
        open={disembarkDialogOpen}
        onOpenChange={setDisembarkDialogOpen}
        mode="disembark"
        candidates={disembarkCandidates}
        onConfirm={addDisembarkCrewIdsAsRows}
        getReservationNote={c => { const r = draftReservationFor(c.id); return r ? `임시저장 계획 "${r.planName}"에도 포함됨 — 저장 시 제외됩니다` : null; }}
      />
      <CrewCandidateSelectDialog
        open={rowPicker !== null}
        onOpenChange={open => { if (!open) setRowPicker(null); }}
        mode={rowPicker?.side === 'disembark' ? 'disembark' : 'boarding'}
        candidates={rowPickerCandidates()}
        onConfirm={handleRowPickerConfirm}
        selectionMode="single"
        getReservationNote={c => { const r = draftReservationFor(c.id); return r ? `임시저장 계획 "${r.planName}"에도 포함됨 — 저장 시 제외됩니다` : null; }}
      />
    </div>
  );
}
