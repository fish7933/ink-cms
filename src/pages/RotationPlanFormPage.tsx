import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Plus, X, Ship, LogIn, LogOut, Download, Printer, Undo2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { sortRanksByDisplayOrder } from '@/lib/rank-order';
import { rotationService, type CrewReservation } from '@/services/rotation.service';
import { getPorts, findOrCreatePort } from '@/services/port.service';
import { getEffectiveTemplateForShip, type SalaryTemplateWithItems } from '@/lib/salary-store';
import { calculateContractPeriod } from '@/utils/contract-period';
import { crewDisplayName } from '@/lib/utils';
import { exportRotationPlanToExcel } from '@/utils/rotation-plan-export';
import { crewService, type CrewWithDetails } from '@/services/crew.service';
import { supervisorService } from '@/services/supervisor.service';
import { getSignOffReasons } from '@/services/sign-off-reason.service';
import { getCurrentUser } from '@/lib/store';
import type { Rank, Ship as ShipType, Company, Fleet } from '@/types/models';
import type { RankGrade } from '@/types/dispatch';
import type { CrewRotationAssignmentInput, CrewRotationPlanWithDetails } from '@/types/rotation';
import type { Port } from '@/types/port';
import type { SignOffReason } from '@/types/sign-off-reason';
import { useToast } from '@/hooks/use-toast';
import { useTabContext } from '@/contexts/TabContext';
import CrewCandidateSelectDialog from '@/components/rotation/CrewCandidateSelectDialog';

const STATUS_CONFIG: Record<string, { label: string; variant: 'secondary' | 'default' | 'destructive' }> = {
  draft: { label: '임시저장', variant: 'secondary' },
  pending_approval: { label: '결재대기', variant: 'default' },
  approved: { label: '승인됨', variant: 'default' },
  rejected: { label: '반려됨', variant: 'destructive' },
  executed: { label: '실행완료', variant: 'default' },
};

interface AssignmentRow {
  id: string;
  // 결재중/승인/실행완료 등 임시저장이 아닌 계획을 볼 때, 비고만은 계속 수정 가능해야 하므로
  // 실제 crew_rotation_assignments 행의 id를 들고 있어야 한다(신규 작성 중인 행은 없음).
  assignmentId?: string;
  boardingCrewId: string | null;
  // 승선/하선 후보 목록(availableCrew/onboardCrew)은 "현재 상태" 기준 스냅샷이라, 발령
  // 실행 등으로 선원 상태가 바뀌면 후보 목록에서 사라져 이름을 못 찾는 경우가 있다 —
  // 기존 계획을 불러올 때는 서버가 조인해준 이름을 여기 저장해두고 그걸 우선 표시한다.
  boardingCrewName: string | null;
  boardingRankId: string;
  boardingGrade: RankGrade | null;
  departureDate: string;
  boardingDate: string;
  disembarkCrewId: string | null;
  disembarkCrewName: string | null;
  disembarkRankId: string;
  disembarkGrade: RankGrade | null;
  disembarkDate: string;
  returnDate: string;
  disembarkReasonId: string;
  sickPayMonthlyAmount: string;
  contractMonths: string;
  notes: string;
}

function makeRow(overrides?: Partial<AssignmentRow>): AssignmentRow {
  return {
    id: crypto.randomUUID(),
    boardingCrewId: null, boardingCrewName: null, boardingRankId: '', boardingGrade: null,
    departureDate: '', boardingDate: '',
    disembarkCrewId: null, disembarkCrewName: null, disembarkRankId: '', disembarkGrade: null,
    disembarkDate: '', returnDate: '',
    disembarkReasonId: '', sickPayMonthlyAmount: '',
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
  const { activeTabId, closeTab, openTab } = useTabContext();
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
  const [signOffReasons, setSignOffReasons] = useState<SignOffReason[]>([]);
  const [loading, setLoading] = useState(true);

  const [owners, setOwners] = useState<Company[]>([]);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [ships, setShips] = useState<ShipType[]>([]);
  // 관리자가 아니면 본인 담당 선박만 배승계획을 만들 수 있도록 제한 (null = 아직 안 불러옴/관리자라 무제한)
  const [supervisedShipIds, setSupervisedShipIds] = useState<Set<string> | null>(null);
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
  // 수정 모드에서 기존 계획을 불러올 때 setBaseDepartureDate가 한 번 호출되는데, 그 초기 로드에서만
  // 저장된 개별 행 일자를 덮어쓰지 않도록 건너뛴다. 그 이후 사용자가 기준 교대일을 직접 바꾸면 정상적으로 재계산되어야 한다.
  const skipCascadeOnLoadRef = useRef(false);
  const [boardingDialogOpen, setBoardingDialogOpen] = useState(false);
  const [disembarkDialogOpen, setDisembarkDialogOpen] = useState(false);
  const [rowPicker, setRowPicker] = useState<{ rowId: string; side: 'boarding' | 'disembark' } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 임시저장이 아닌 계획(결재대기/승인/반려/실행완료)을 열람할 때 쓰는 상태 — 비고를 제외한
  // 모든 입력부를 잠근 채로 같은 작성 폼 레이아웃을 그대로 보여준다.
  const [planStatus, setPlanStatus] = useState('draft');
  const [loadedPlan, setLoadedPlan] = useState<CrewRotationPlanWithDetails | null>(null);
  const [portLabel, setPortLabel] = useState('');
  const [executing, setExecuting] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const isReadOnly = isEditMode && planStatus !== 'draft';

  const preBoarding = (searchParams.get('boarding') || '').split(',').filter(Boolean);
  const preDisembark = (searchParams.get('disembark') || '').split(',').filter(Boolean);

  const BOARDING_CANDIDATE_STATUSES = ['registered', 'under_review', 'sent_to_owner', 'owner_approved', 'owner_rejected', 'standby', 'deployment_decided'];
  const getCrewStatus = (c: CrewWithDetails) => (c as CrewWithDetails & { status?: string }).status || c.current_status || '';

  useEffect(() => { loadData(); }, []);

  // 관리자가 아니면 본인 담당 선박만 남긴다 (아직 로딩 전이면 그대로 통과시켜 깜빡임 방지)
  const filterSupervisedShips = (list: ShipType[]) =>
    supervisedShipIds ? list.filter(s => supervisedShipIds.has(s.id)) : list;

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
    const [allCrew, ranksRes, ownersRes, portsData, reservations, user, reasons] = await Promise.all([
      crewService.getAllWithDetails(),
      supabase.from('ranks').select('*'),
      supabase.from('companies').select('*').eq('type', 'owner').order('name'),
      getPorts(),
      rotationService.getCrewReservations(),
      getCurrentUser(),
      getSignOffReasons(),
    ]);
    setSignOffReasons(reasons);

    // 관리자가 아니면 본인 담당 선박만 선택/자동배정 가능 — loadData 내에서 동기적으로 먼저 구해서
    // 아래 자동 선박 선택 로직에서도 즉시 반영되도록 한다(useEffect 경합으로 인한 순간적 미필터 방지).
    let supervisedIds: Set<string> | null = null;
    if (user && user.role !== 'admin' && user.role !== 'system_admin') {
      supervisedIds = new Set(await supervisorService.getSupervisedShips(user.id));
      setSupervisedShipIds(supervisedIds);
    }

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
      setPlanStatus(existing.status);
      setLoadedPlan(existing);

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
      skipCascadeOnLoadRef.current = true;
      setBaseDepartureDate(existing.base_departure_date || '');
      if (existing.port_id) {
        const port = (portsData || []).find(p => p.id === existing.port_id);
        if (port) { setCountryName(port.country_name); setCityName(port.city_name); setPortLabel(`${port.country_name} ${port.city_name}`); }
      }

      // 승선자가 아직 정해지지 않은(직급도 안 고른) 채로 저장된 행은, 하선자 직급이 있으면
      // 그 직급을 승선자 직급 기본값으로 채운다 — 동직급 로테이션이 기본이라는 가정과 동일.
      const fillBoardingRankFromDisembark = (row: AssignmentRow): AssignmentRow =>
        !row.boardingCrewId && !row.boardingRankId && row.disembarkRankId
          ? { ...row, boardingRankId: row.disembarkRankId }
          : row;

      const loadedRows: AssignmentRow[] = existing.assignments.length > 0
        ? existing.assignments.map(a => fillBoardingRankFromDisembark(makeRow({
            assignmentId: a.id,
            boardingCrewId: a.on_crew_id,
            boardingCrewName: a.on_crew_name || null,
            boardingRankId: a.on_rank_id || '',
            boardingGrade: a.on_rank_grade,
            departureDate: a.on_departure_date || '',
            boardingDate: a.embark_date || '',
            disembarkCrewId: a.off_crew_id,
            disembarkCrewName: a.off_crew_name || null,
            disembarkRankId: a.off_rank_id || '',
            disembarkGrade: a.off_rank_grade,
            disembarkDate: a.off_disembark_date || '',
            returnDate: a.off_return_date || '',
            disembarkReasonId: a.off_sign_off_reason_id || '',
            sickPayMonthlyAmount: a.off_sick_pay_monthly_amount != null ? String(a.off_sick_pay_monthly_amount) : '',
            contractMonths: a.contract_months != null ? String(a.contract_months) : '',
            notes: a.notes || '',
          })))
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
    // 하선 사유는 90% 이상이 계약만료라, 새 행은 기본으로 그 값을 미리 선택해둔다(state인
    // signOffReasons는 이 함수 실행 시점엔 아직 반영 전이라 방금 받아온 reasons를 직접 쓴다).
    const defaultReasonId = reasons.find(r => r.name === '계약만료')?.id || '';
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
        disembarkReasonId: defaultReasonId,
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

    if (autoShipRef?.current_ship_id && autoShipRef?.owner_id && (!supervisedIds || supervisedIds.has(autoShipRef.current_ship_id))) {
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
    // 수정 모드에서는 이미 배정된 선박이 표시에서 사라지지 않도록 담당 선박 제한을 적용하지 않는다.
    q.order('name').then(({ data }) => setShips(isEditMode ? (data || []) : filterSupervisedShips(data || [])));
  }, [ownerId, fleetId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    // 수정 모드에서 기존 계획을 불러올 때 setBaseDepartureDate가 최초 1회 호출되는데, 그때는 각 배정
    // 건의 저장된 개별 일자를 그대로 유지해야 하므로 재계산을 건너뛴다. 그 다음부터(사용자가 기준
    // 교대일을 직접 수정하는 경우) 는 수정 모드에서도 모든 행의 날짜를 기준일에 맞춰 재배열한다.
    if (skipCascadeOnLoadRef.current) { skipCascadeOnLoadRef.current = false; return; }
    if (!isEditMode) setPlanName(prev => prev ? withDateSuffix(prev, baseDepartureDate) : prev);
    if (baseDepartureDate) {
      const dates = cascadeDatesFromBase(baseDepartureDate);
      setRows(prev => prev.map(r => ({ ...r, ...dates })));
    }
  }, [baseDepartureDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateRow = (id: string, updates: Partial<AssignmentRow>) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  const addRow = () => setRows(prev => [...prev, makeRow({ ...cascadeDatesFromBase(baseDepartureDate), disembarkReasonId: defaultDisembarkReasonId() })]);
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

  // 하선사유 기본값 — 대부분의 하선은 계약만료이므로, 매번 고르지 않아도 되게 기본 선택해둔다.
  const defaultDisembarkReasonId = () => signOffReasons.find(r => r.name === '계약만료')?.id || '';

  const addDisembarkCrewIdsAsRows = (ids: string[]) => {
    const seed = cascadeDatesFromBase(baseDepartureDate);
    const newRows = ids.map(id => {
      const crew = onboardCrew.find(c => c.id === id);
      const auto = crew ? computeDisembarkAutoFields(crew) : { rankId: '', grade: null };
      return makeRow({ disembarkCrewId: id, disembarkRankId: auto.rankId, disembarkGrade: auto.grade, disembarkReasonId: defaultDisembarkReasonId(), ...seed });
    });
    setRows(prev => [...prev.filter(r => r.boardingCrewId || r.disembarkCrewId), ...newRows]);
  };

  const getCrew = (id: string | null) => (id && (availableCrew.find(c => c.id === id) || onboardCrew.find(c => c.id === id))) || null;
  // 발령 실행 등으로 선원 상태가 바뀌어 현재 후보 목록(availableCrew/onboardCrew)에서 빠지면
  // getCrew가 못 찾는다 — 그럴 땐 계획 로드 시 서버 조인으로 저장해둔 이름(fallbackName)을 쓴다.
  const getCrewLabel = (id: string | null, fallbackName?: string | null) => {
    const c = getCrew(id);
    if (c) {
      const code = c.rank_code || '';
      const name = crewDisplayName(c);
      return code ? `[${code}] ${name}` : name;
    }
    if (id) return fallbackName || '이름 확인 불가';
    return '선원 선택';
  };

  const rowPickerCandidates = (): CrewWithDetails[] => {
    if (!rowPicker) return [];
    const row = rows.find(r => r.id === rowPicker.rowId);
    if (rowPicker.side === 'boarding') {
      return availableCrew.filter(c => c.id === row?.boardingCrewId || (!usedBoardingIds.includes(c.id) && !isHardReserved(c.id)));
    }
    return onboardCrew.filter(c => c.id === row?.disembarkCrewId || (c.current_ship_id === shipId && !usedDisembarkIds.includes(c.id) && !isHardReserved(c.id)));
  };

  // 이미 선택된 선원을 바꾸려고 다시 연 경우 필터를 그 선원 기준으로 미리 채우기 위한 값.
  const rowPickerInitialCrew = (): CrewWithDetails | null => {
    if (!rowPicker) return null;
    const row = rows.find(r => r.id === rowPicker.rowId);
    const currentId = rowPicker.side === 'boarding' ? row?.boardingCrewId : row?.disembarkCrewId;
    return currentId ? getCrew(currentId) : null;
  };

  // 같은 행의 반대편(승선자/하선자)이 먼저 정해져 있으면 그 직급을 후보 목록의 기본 필터로 쓴다.
  // 동직급 로테이션이 아주 특별한 경우를 빼고는 기본이라, 반대편이 이미 있는데 직급을 매번
  // 다시 고르게 하지 않기 위함 — 반대편 직급이 아직 없으면(둘 다 빈 새 행) 필터 없이 전체를 보여준다.
  const rowPickerDefaultRankId = (): string | undefined => {
    if (!rowPicker) return undefined;
    const row = rows.find(r => r.id === rowPicker.rowId);
    if (!row) return undefined;
    return (rowPicker.side === 'boarding' ? row.disembarkRankId : row.boardingRankId) || undefined;
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
      const existingRow = rows.find(r => r.id === rowPicker.rowId);
      // 승선자가 아직 정해지지 않은(직급도 안 고른) 행이면, 동직급 로테이션이 기본이므로
      // 하선자 직급을 승선자 직급 기본값으로 바로 채워준다 — 사용자가 또 골라야 하는 수고를 던다.
      const shouldFillBoardingRank = auto.rankId && !existingRow?.boardingCrewId && !existingRow?.boardingRankId;
      updateRow(rowPicker.rowId, {
        disembarkCrewId: id,
        disembarkRankId: auto.rankId,
        disembarkGrade: auto.grade,
        disembarkReasonId: existingRow?.disembarkReasonId || defaultDisembarkReasonId(),
        ...(shouldFillBoardingRank ? { boardingRankId: auto.rankId } : {}),
      });
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
      const names = missingRank.map(r => { const c = getCrew(r.boardingCrewId); return c ? crewDisplayName(c) : '?'; }).join(', ');
      toast({ title: '승선 직급 필수', description: `${names} — 승선 직급을 선택하세요`, variant: 'destructive' });
      return;
    }
    const missingGrade = validRows.filter(r => r.boardingCrewId && r.boardingRankId && gradesForRankId(r.boardingRankId).length > 0 && !r.boardingGrade);
    if (missingGrade.length > 0) {
      const names = missingGrade.map(r => { const c = getCrew(r.boardingCrewId); return c ? crewDisplayName(c) : '?'; }).join(', ');
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
        off_sign_off_reason_id: r.disembarkReasonId || null,
        off_sick_pay_monthly_amount: r.sickPayMonthlyAmount ? +r.sickPayMonthlyAmount : null,
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
      window.dispatchEvent(new CustomEvent('rotation-plan-data-changed'));
      const { moved } = result;
      if (moved.length > 0) {
        const summary = moved.map(m => `${m.crewName}(${m.fromPlanName})`).join(', ');
        toast({ title: isEditMode ? '수정 완료' : '작성 완료', description: `${summary} — 이전 임시저장 계획에서 제외되고 이 계획에 포함되었습니다.` });
      } else {
        toast({ title: isEditMode ? '수정 완료' : '작성 완료', description: '결재 상신은 교대계획 목록에서 진행하세요' });
      }
      // 작성/수정 완료 후에는 항상 선원 교대 발령 목록으로 이동(이미 열려 있으면 그 탭을
      // 최신 데이터로 새로고침해 활성화)한 뒤, 현재 폼 탭은 닫는다.
      openTab('/crew-rotation', '선원 교대 발령');
      if (activeTabId) closeTab(activeTabId);
    } catch (e) {
      toast({ title: '오류', description: String(e), variant: 'destructive' });
    } finally { setSubmitting(false); }
  };

  // 임시저장이 아닌 계획에서는 비고(계획 비고 + 승/하선자별 비고)만 계속 저장할 수 있다.
  const handleSaveNotes = async () => {
    if (!editPlanId) return;
    setSavingNotes(true);
    try {
      await rotationService.updateRotationPlan(editPlanId, { notes: planNotes || null });
      await Promise.all(
        rows.filter(r => r.assignmentId).map(r => rotationService.updateAssignmentNotes(r.assignmentId!, r.notes || null))
      );
      toast({ title: '비고가 저장되었습니다.' });
    } catch (e) {
      toast({ title: '비고 저장 중 오류가 발생했습니다.', description: String(e), variant: 'destructive' });
    } finally { setSavingNotes(false); }
  };

  const handleDeleteDraft = async () => {
    if (!editPlanId) return;
    if (!confirm('이 임시저장 계획을 삭제하시겠습니까? 삭제 이력이 기록되며, 배정된 선원들의 임시저장 표시도 함께 풀립니다.')) return;
    const user = await getCurrentUser();
    if (!user) return;
    setDeleting(true);
    try {
      const ok = await rotationService.deleteRotationPlan(editPlanId, user.id);
      if (ok) {
        toast({ title: '삭제되었습니다' });
        window.dispatchEvent(new CustomEvent('rotation-plan-data-changed'));
        openTab('/crew-rotation', '선원 교대 발령');
        if (activeTabId) closeTab(activeTabId);
      } else {
        toast({ title: '삭제 중 오류가 발생했습니다', variant: 'destructive' });
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleWithdraw = async () => {
    if (!editPlanId || !confirm('이 교대 계획의 결재 상신을 철회하시겠습니까? 배정됐던 선원들의 임시저장 표시도 함께 풀립니다.')) return;
    setWithdrawing(true);
    try {
      const ok = await rotationService.withdrawRotationPlan(editPlanId, (await getCurrentUser())?.id || '');
      if (ok) {
        toast({ title: '철회되었습니다', description: '결재 상신이 철회되고 계획이 반려 상태로 정리되었습니다.' });
        setPlanStatus('rejected');
        window.dispatchEvent(new CustomEvent('rotation-plan-data-changed'));
      } else {
        toast({ title: '철회할 대기 중인 결재가 없습니다', variant: 'destructive' });
      }
    } catch (e) {
      toast({ title: '철회 중 오류가 발생했습니다', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setWithdrawing(false);
    }
  };

  const handleExecute = async () => {
    if (!editPlanId || !confirm('발령을 실행하시겠습니까? 실행하면 선원 상태가 즉시 변경됩니다.')) return;
    setExecuting(true);
    try {
      const ok = await rotationService.executeRotationPlan(editPlanId);
      if (ok) {
        toast({ title: '발령이 실행되었습니다', description: '선원 상태가 업데이트되었습니다.' });
        setPlanStatus('executed');
        window.dispatchEvent(new CustomEvent('rotation-plan-data-changed'));
      } else {
        toast({ title: '실행 중 오류가 발생했습니다', variant: 'destructive' });
      }
    } finally { setExecuting(false); }
  };

  const handleExportExcel = async () => {
    if (!loadedPlan) return;
    setExporting(true);
    try {
      await exportRotationPlanToExcel(loadedPlan, portLabel);
    } finally { setExporting(false); }
  };

  const handlePrint = () => {
    if (!editPlanId) return;
    window.open(`/print/rotation-plans/${editPlanId}`, '_blank');
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  );

  // 배정 요약 표의 상병급여 열은 상병하선이 하나라도 있을 때만 보여준다 — 평소엔 안 쓰는 열이라 숨겨둔다.
  const hasSickPayInSummary = rows.some(r => signOffReasons.find(sr => sr.id === r.disembarkReasonId)?.name === '상병하선');
  // 선원이 여러 명 나열되는 표/리스트는 항상 직급순(ranks는 이미 sortRanksByDisplayOrder로 정렬됨)을
  // 따라야 한다 — "교대 배정 요약"에 이 규칙을 적용하기 위한 직급 인덱스 조회.
  const rankIndexById = new Map(ranks.map((r, i) => [r.id, i]));
  const rankSortIndex = (rankId: string) => rankIndexById.get(rankId) ?? 999;

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-3">

      {/* 헤더 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Ship className="w-4 h-4" />
              {isReadOnly ? '교대 계획 상세' : isEditMode ? '교대 계획 수정 (임시저장)' : '교대 계획 작성'}
              {isReadOnly && (
                <Badge variant={STATUS_CONFIG[planStatus]?.variant || 'secondary'}>
                  {STATUS_CONFIG[planStatus]?.label || planStatus}
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              {isReadOnly ? (
                <>
                  <Button size="sm" variant="outline" className="h-8" onClick={handleExportExcel} disabled={exporting}>
                    <Download className="w-3.5 h-3.5 mr-1" />{exporting ? '내보내는 중...' : '엑셀 다운로드'}
                  </Button>
                  <Button size="sm" variant="outline" className="h-8" onClick={handlePrint}>
                    <Printer className="w-3.5 h-3.5 mr-1" />PDF 출력
                  </Button>
                  {planStatus === 'approved' && (
                    <Button size="sm" className="h-8" onClick={handleExecute} disabled={executing}>
                      {executing ? '실행 중...' : '발령 실행'}
                    </Button>
                  )}
                  {planStatus === 'pending_approval' && (
                    <Button size="sm" variant="outline" className="h-8 text-red-600 border-red-300 hover:bg-red-50" onClick={handleWithdraw} disabled={withdrawing}>
                      <Undo2 className="w-3.5 h-3.5 mr-1" />{withdrawing ? '철회 중...' : '계획 철회'}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="h-8 text-blue-600 border-blue-300 hover:bg-blue-50" onClick={handleSaveNotes} disabled={savingNotes}>
                    {savingNotes ? '저장 중...' : '비고 저장'}
                  </Button>
                </>
              ) : (
                <>
                  {isEditMode && (
                    <Button size="sm" variant="outline" className="h-8 text-red-600 border-red-300 hover:bg-red-50" onClick={handleDeleteDraft} disabled={deleting}>
                      <Trash2 className="w-3.5 h-3.5 mr-1" />{deleting ? '삭제 중...' : '삭제'}
                    </Button>
                  )}
                  <Button size="sm" onClick={handleSubmit} disabled={submitting} className="h-8 bg-blue-600 hover:bg-blue-700">{isEditMode ? '수정 완료' : '작성 완료'}</Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-2.5">
          <div className="grid grid-cols-2 md:grid-cols-[1fr_1fr_1fr_2fr] gap-3">
            <div className="space-y-1">
              <Label className="text-xs">선주 *</Label>
              <Select value={ownerId || '_none'} onValueChange={v => handleOwnerChange(v === '_none' ? '' : v)} disabled={isReadOnly}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="선주 선택" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">선주 선택</SelectItem>
                  {owners.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">플릿</Label>
              <Select value={fleetId || '_none'} onValueChange={handleFleetChange} disabled={isReadOnly || !ownerId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="전체" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">전체</SelectItem>
                  {fleets.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">선박 *</Label>
              <Select value={shipId || '_none'} onValueChange={v => setShipId(v === '_none' ? '' : v)} disabled={isReadOnly || !ownerId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="선박 선택" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">선박 선택</SelectItem>
                  {ships.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">계획명</Label>
              <Input value={planName} onChange={e => setPlanName(e.target.value)} placeholder="선박 선택 시 자동입력" className="h-8 text-[12px] md:text-[12px]" disabled={isReadOnly} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              {/* 교대 계획 하나는 항상 한 장소에서 이루어지므로, 국가/도시를 두 칸으로 나누지 않고
                  비고와 같은 방식으로 한 칸 안에 같이 보여준다. */}
              <Label className="text-xs">교대지 (국가/도시)</Label>
              <div className="flex gap-1">
                {manualCountry ? (
                  <>
                    <Input value={countryName} onChange={e => handleManualCountryChange(e.target.value)} placeholder="국가명 (영어)" className="h-8 text-xs flex-1 min-w-0" disabled={isReadOnly} />
                    {!isReadOnly && (
                      <Button type="button" variant="outline" size="sm" className="h-8 text-xs shrink-0 px-2" onClick={() => { setManualCountry(false); setCountryName(''); }}>목록</Button>
                    )}
                  </>
                ) : (
                  <Select value={countryName || '_none'} onValueChange={handleCountrySelect} disabled={isReadOnly}>
                    <SelectTrigger className="h-8 text-xs flex-1 min-w-0"><SelectValue placeholder="국가 선택" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_manual">직접 입력...</SelectItem>
                      <SelectItem value="_none">국가 선택</SelectItem>
                      {countryOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                {(manualCountry || manualCity) ? (
                  <>
                    <Input value={cityName} onChange={e => setCityName(e.target.value)} placeholder="도시명 (영어)" className="h-8 text-xs flex-1 min-w-0" disabled={isReadOnly} />
                    {!manualCountry && !isReadOnly && (
                      <Button type="button" variant="outline" size="sm" className="h-8 text-xs shrink-0 px-2" onClick={() => { setManualCity(false); setCityName(''); }}>목록</Button>
                    )}
                  </>
                ) : (
                  <Select value={cityName || '_none'} onValueChange={handleCitySelect} disabled={isReadOnly || !countryName}>
                    <SelectTrigger className="h-8 text-xs flex-1 min-w-0"><SelectValue placeholder={countryName ? '도시 선택' : '국가를 먼저 선택'} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_manual">직접 입력...</SelectItem>
                      <SelectItem value="_none">도시 선택</SelectItem>
                      {cityOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">기준 교대일</Label>
              <Input type="date" value={baseDepartureDate} onChange={e => setBaseDepartureDate(e.target.value)} className="h-8 text-[12px] md:text-[12px]" disabled={isReadOnly} />
              <p className="text-[10px] text-gray-400">승선/하선일은 기준일, 출국일은 하루 전날, 귀국일은 하루 뒷날로 일괄 설정합니다</p>
            </div>
          </div>

          <div className="space-y-1">
            <Textarea value={planNotes} onChange={e => setPlanNotes(e.target.value)} placeholder="비고" rows={1} className="text-xs md:text-xs resize-none min-h-0 h-8 py-1.5" />
          </div>
        </CardContent>
      </Card>

      {/* 발령 상세 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-semibold text-gray-700">발령 상세</h3>
          {!isReadOnly && (
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
          )}
        </div>

        {rows.map((row, idx) => (
          <Card key={row.id} className="border-gray-200">
            <CardContent className="p-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-400">#{idx + 1}</span>
                {rows.length > 1 && !isReadOnly && (
                  <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-gray-400" onClick={() => removeRow(row.id)}>
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {/* ────────── On-Signer ────────── */}
                <div className="space-y-1 rounded-md border border-emerald-100 bg-emerald-50/30 p-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <LogIn className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-[11px] font-semibold text-emerald-700">On-Signer</span>
                  </div>
                  <div className="flex gap-1">
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[9px] text-emerald-600 shrink-0">직급</span>
                      <Select value={row.boardingRankId || '_none'} onValueChange={v => updateRow(row.id, { boardingRankId: v === '_none' ? '' : v, boardingGrade: null })} disabled={isReadOnly}>
                        <SelectTrigger className="h-7 text-xs w-20 shrink-0"><SelectValue placeholder="직급 *" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">직급 *</SelectItem>
                          {ranks.map(r => <SelectItem key={r.id} value={r.id}>{r.rank_code || r.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[9px] text-emerald-600 shrink-0">등급</span>
                      {(() => {
                        const opts = gradesForRankId(row.boardingRankId);
                        return opts.length > 0 ? (
                          <Select value={row.boardingGrade || '_none'} onValueChange={v => updateRow(row.id, { boardingGrade: v === '_none' ? null : v })} disabled={isReadOnly}>
                            <SelectTrigger className={`h-7 text-[12px] md:text-[12px] w-16 shrink-0 px-1 ${!row.boardingGrade ? 'border-orange-300' : ''}`}>
                              <SelectValue placeholder="등급 *" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_none" className="text-[12px]">선택 *</SelectItem>
                              {opts.map(g => <SelectItem key={g} value={g} className="text-[12px]">{g}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input value={row.boardingGrade || ''} onChange={e => updateRow(row.id, { boardingGrade: e.target.value || null })}
                            placeholder="등급" className="h-7 text-[12px] md:text-[12px] w-16 shrink-0" disabled={isReadOnly} />
                        );
                      })()}
                    </div>
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <span className="text-[9px] text-emerald-600 shrink-0">이름</span>
                      <Button
                        type="button" variant="outline" disabled={isReadOnly}
                        className="h-7 text-xs flex-1 min-w-0 justify-start font-normal truncate px-2 border-emerald-200"
                        onClick={() => setRowPicker({ rowId: row.id, side: 'boarding' })}
                      >
                        <span className="truncate text-emerald-800">{getCrewLabel(row.boardingCrewId, row.boardingCrewName)}</span>
                      </Button>
                    </div>
                  </div>
                  {draftReservationFor(row.boardingCrewId) && (
                    <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                      ⚠ 임시저장 계획 "{draftReservationFor(row.boardingCrewId)!.planName}"에도 포함되어 있습니다 — 저장 시 그 계획에서 제외됩니다.
                    </p>
                  )}
                  <div className="flex gap-1">
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <span className="text-[9px] text-emerald-600 shrink-0">출국일</span>
                      <Input type="date" value={row.departureDate} onChange={e => updateRow(row.id, { departureDate: e.target.value })} className="h-7 text-[12px] md:text-[12px] px-1 min-w-0" disabled={isReadOnly} />
                    </div>
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <span className="text-[9px] text-emerald-600 shrink-0">승선일</span>
                      <Input type="date" value={row.boardingDate} onChange={e => updateRow(row.id, { boardingDate: e.target.value })} className="h-7 text-[12px] md:text-[12px] px-1 min-w-0" disabled={isReadOnly} />
                    </div>
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <span className="text-[9px] text-emerald-600 shrink-0 whitespace-nowrap">계약개월</span>
                      <Input
                        type="number"
                        value={row.contractMonths}
                        onChange={e => updateRow(row.id, { contractMonths: e.target.value })}
                        className="h-7 text-xs px-1 min-w-0"
                        placeholder={row.boardingCrewId && !row.contractMonths ? '미설정' : ''}
                        disabled={isReadOnly}
                      />
                    </div>
                  </div>
                </div>

                {/* ────────── Off-Signer ────────── */}
                <div className="space-y-1 rounded-md border border-orange-100 bg-orange-50/30 p-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <LogOut className="w-3.5 h-3.5 text-orange-600" />
                    <span className="text-[11px] font-semibold text-orange-700">Off-Signer</span>
                  </div>
                  {/* 하선자는 이미 승선 중인 선원이라 직급/등급이 배정 시점의 사실(현재 배정 선박
                      기준)일 뿐 여기서 새로 고르는 값이 아니므로, 둘 다 고정 표시만 하고 수정은 막는다. */}
                  <div className="flex gap-1">
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[9px] text-orange-600 shrink-0">직급</span>
                      <div
                        className="h-7 text-xs w-16 shrink-0 px-1 flex items-center justify-center rounded-md border border-gray-200 bg-gray-100 text-gray-600 font-mono"
                        title="현재 승선 중 직급 (고정)"
                      >
                        {ranks.find(r => r.id === row.disembarkRankId)?.rank_code || '-'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[9px] text-orange-600 shrink-0">등급</span>
                      <div
                        className="h-7 text-xs w-14 shrink-0 px-1 flex items-center justify-center rounded-md border border-gray-200 bg-gray-100 text-gray-600 font-mono"
                        title="현재 승선 중 등급 (고정)"
                      >
                        {row.disembarkGrade || '-'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <span className="text-[9px] text-orange-600 shrink-0">이름</span>
                      <Button
                        type="button" variant="outline" disabled={isReadOnly}
                        className="h-7 text-xs flex-1 min-w-0 justify-start font-normal truncate px-2 border-orange-200"
                        onClick={() => setRowPicker({ rowId: row.id, side: 'disembark' })}
                      >
                        <span className="truncate text-orange-800">{getCrewLabel(row.disembarkCrewId, row.disembarkCrewName)}</span>
                      </Button>
                    </div>
                  </div>
                  {draftReservationFor(row.disembarkCrewId) && (
                    <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                      ⚠ 임시저장 계획 "{draftReservationFor(row.disembarkCrewId)!.planName}"에도 포함되어 있습니다 — 저장 시 그 계획에서 제외됩니다.
                    </p>
                  )}
                  <div className="flex gap-1">
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <span className="text-[9px] text-orange-600 shrink-0">하선일</span>
                      <Input type="date" value={row.disembarkDate} onChange={e => updateRow(row.id, { disembarkDate: e.target.value })} className="h-7 text-[12px] md:text-[12px] px-1 min-w-0" disabled={isReadOnly} />
                    </div>
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <span className="text-[9px] text-orange-600 shrink-0">귀국일</span>
                      <Input type="date" value={row.returnDate} onChange={e => updateRow(row.id, { returnDate: e.target.value })} className="h-7 text-[12px] md:text-[12px] px-1 min-w-0" disabled={isReadOnly} />
                    </div>
                    {row.disembarkCrewId && (
                      <div className="flex items-center gap-1 flex-1 min-w-0">
                        <span className="text-[9px] text-orange-600 shrink-0 whitespace-nowrap">하선사유</span>
                        <Select value={row.disembarkReasonId || '_none'} onValueChange={v => updateRow(row.id, { disembarkReasonId: v === '_none' ? '' : v, sickPayMonthlyAmount: '' })} disabled={isReadOnly}>
                          <SelectTrigger className="h-7 text-xs min-w-0"><SelectValue placeholder="선택" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_none">하선사유 선택</SelectItem>
                            {signOffReasons.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {signOffReasons.find(r => r.id === row.disembarkReasonId)?.name === '상병하선' && (
                      <div className="flex items-center gap-1 flex-1 min-w-0">
                        <span className="text-[9px] text-red-500 shrink-0 whitespace-nowrap">상병급여</span>
                        <Input
                          type="number" value={row.sickPayMonthlyAmount}
                          onChange={e => updateRow(row.id, { sickPayMonthlyAmount: e.target.value })}
                          className="h-7 text-xs px-1 min-w-0" disabled={isReadOnly}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 비고 */}
              <div className="pt-1 border-t">
                <Input value={row.notes} onChange={e => updateRow(row.id, { notes: e.target.value })} className="h-7 text-xs w-full" placeholder="비고" />
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
            <div className="rounded-md border bg-white overflow-hidden overflow-x-auto">
              <table className="w-full text-xs whitespace-nowrap">
                <thead className="bg-gray-50 border-b">
                  <tr className="text-[10px] text-gray-400">
                    <th className="text-left py-1 px-2 font-medium">#</th>
                    <th className="text-left py-1 px-2 font-medium text-emerald-600">On-Signer</th>
                    <th className="text-left py-1 px-2 font-medium">승선일</th>
                    <th className="text-left py-1 px-2 font-medium">계약개월</th>
                    <th className="text-left py-1 pl-6 pr-2 font-medium text-orange-600 border-l">Off-Signer</th>
                    <th className="text-left py-1 px-2 font-medium">하선일</th>
                    <th className="text-left py-1 px-2 font-medium">하선사유</th>
                    {hasSickPayInSummary && <th className="text-left py-1 px-2 font-medium text-red-500">상병급여</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows
                    .filter(r => r.boardingCrewId || r.disembarkCrewId)
                    .slice()
                    .sort((a, b) => rankSortIndex(a.boardingRankId || a.disembarkRankId) - rankSortIndex(b.boardingRankId || b.disembarkRankId))
                    .map((r, i) => {
                    const inCrew = getCrew(r.boardingCrewId);
                    const outCrew = getCrew(r.disembarkCrewId);
                    const inRankCode = r.boardingRankId ? ranks.find(rk => rk.id === r.boardingRankId)?.rank_code : '';
                    const outRankCode = r.disembarkRankId ? ranks.find(rk => rk.id === r.disembarkRankId)?.rank_code : '';
                    const disembarkReasonName = signOffReasons.find(sr => sr.id === r.disembarkReasonId)?.name;
                    return (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="py-1 px-2 text-gray-400 font-mono">{i + 1}</td>
                        <td className="py-1 px-2">
                          {r.boardingCrewId ? (
                            <span className="flex items-center gap-1">
                              <span className="flex items-center gap-1 w-[70px] shrink-0">
                                {inRankCode && <span className="font-mono text-[10px] bg-emerald-50 text-emerald-700 px-1 rounded shrink-0">{inRankCode}</span>}
                                {r.boardingGrade
                                  ? <span className="font-mono text-[10px] text-emerald-600 bg-emerald-50 px-1 rounded shrink-0">{r.boardingGrade}급</span>
                                  : gradesForRankId(r.boardingRankId).length > 0
                                    ? <span className="text-[10px] text-orange-500 shrink-0">등급 미선택</span>
                                    : null}
                              </span>
                              <span className="font-medium text-emerald-800">{(inCrew ? crewDisplayName(inCrew) : '') || r.boardingCrewName || '이름 확인 불가'}</span>
                            </span>
                          ) : <span className="text-gray-300 italic">미정</span>}
                        </td>
                        <td className="py-1 px-2 text-gray-400">{r.boardingDate || '-'}</td>
                        <td className="py-1 px-2 text-gray-400">{r.contractMonths ? `${r.contractMonths}개월` : '-'}</td>
                        <td className="py-1 pl-6 pr-2 border-l">
                          {r.disembarkCrewId ? (
                            <span className="flex items-center gap-1">
                              <span className="flex items-center gap-1 w-[70px] shrink-0">
                                {outRankCode && <span className="font-mono text-[10px] bg-orange-50 text-orange-700 px-1 rounded shrink-0">{outRankCode}</span>}
                                {r.disembarkGrade && <span className="font-mono text-[10px] text-orange-600 bg-orange-50 px-1 rounded shrink-0">{r.disembarkGrade}급</span>}
                              </span>
                              <span className="font-medium text-orange-800">{(outCrew ? crewDisplayName(outCrew) : '') || r.disembarkCrewName || '이름 확인 불가'}</span>
                            </span>
                          ) : <span className="text-gray-300 italic">미정</span>}
                        </td>
                        <td className="py-1 px-2 text-gray-400">{r.disembarkDate || '-'}</td>
                        <td className="py-1 px-2 text-gray-400">{disembarkReasonName || '-'}</td>
                        {hasSickPayInSummary && (
                          <td className="py-1 px-2 text-red-600 font-mono">{disembarkReasonName === '상병하선' && r.sickPayMonthlyAmount ? r.sickPayMonthlyAmount : '-'}</td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
        scoringContext={shipId ? { targetShipId: shipId } : undefined}
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
        initialCrew={rowPickerInitialCrew()}
        defaultRankId={rowPickerDefaultRankId()}
        scoringContext={
          rowPicker?.side !== 'disembark' && shipId
            ? { targetShipId: shipId, targetEmbarkDate: rows.find(r => r.id === rowPicker?.rowId)?.boardingDate || undefined, targetRankId: rowPickerDefaultRankId() }
            : undefined
        }
      />
    </div>
  );
}
