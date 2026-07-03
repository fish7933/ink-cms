import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, X, ArrowRight, Ship } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabase';
import { rotationService } from '@/services/rotation.service';
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

// 기준 출국일로부터 출국일/승선일/하선일/귀국일을 계산 (행 생성 시점에만 1회 적용, 실시간 바인딩 아님)
function cascadeDatesFromBase(baseDate: string): Pick<AssignmentRow, 'departureDate' | 'boardingDate' | 'disembarkDate' | 'returnDate'> {
  if (!baseDate) return { departureDate: '', boardingDate: '', disembarkDate: '', returnDate: '' };
  const addDays = (iso: string, n: number) => {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const departureDate = baseDate;
  const boardingDate = addDays(baseDate, 1);
  const disembarkDate = boardingDate;
  const returnDate = addDays(disembarkDate, 1);
  return { departureDate, boardingDate, disembarkDate, returnDate };
}

// 계획명 끝의 "(YYYY-MM-DD)" 접미사를 교체/추가 (그 앞의 사용자 입력 텍스트는 보존)
const DATE_SUFFIX_RE = / \(\d{4}-\d{2}-\d{2}\)$/;
function withDateSuffix(name: string, date: string): string {
  const base = name.replace(DATE_SUFFIX_RE, '');
  return date ? `${base} (${date})` : base;
}

export default function RotationPlanFormPage() {
  const { toast } = useToast();
  const { activeTabId, closeTab } = useTabContext();
  const [searchParams] = useSearchParams();

  const [availableCrew, setAvailableCrew] = useState<CrewWithDetails[]>([]);
  const [onboardCrew, setOnboardCrew] = useState<CrewWithDetails[]>([]);
  // 반려되지 않은 다른 교대 계획(임시저장/결재대기/승인)에 이미 승선·하선자로 들어간 선원 — 중복 배정 방지
  const [reservedCrewIds, setReservedCrewIds] = useState<Set<string>>(new Set());
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

  useEffect(() => { loadData(); }, []);

  // 등록/대기/하선(standby) 선원 모두 승선 후보 가능
  const BOARDING_CANDIDATE_STATUSES = ['registered', 'under_review', 'sent_to_owner', 'owner_approved', 'owner_rejected', 'standby', 'deployment_decided'];

  // crew_members.current_status 컬럼은 상태 변경 시 갱신되지 않는 legacy 필드라 신뢰할 수 없음.
  // 실제 최신 상태는 status 컬럼 (CrewManagementPage와 동일한 우회 패턴).
  const getCrewStatus = (c: CrewWithDetails) => (c as CrewWithDetails & { status?: string }).status || c.current_status || '';

  const loadData = async () => {
    setLoading(true);
    const [allCrew, ranksRes, ownersRes, portsData, reserved] = await Promise.all([
      crewService.getAllWithDetails(),
      supabase.from('ranks').select('*').order('display_order'),
      supabase.from('companies').select('*').eq('type', 'owner').order('name'),
      getPorts(),
      rotationService.getActivelyReservedCrewIds(),
    ]);
    setAvailableCrew(allCrew.filter(c => BOARDING_CANDIDATE_STATUSES.includes(getCrewStatus(c))).sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    setOnboardCrew(allCrew.filter(c => getCrewStatus(c) === 'onboard').sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    setReservedCrewIds(reserved);
    setRanks(ranksRes.data || []);
    setOwners(ownersRes.data || []);
    setPorts(portsData);

    const maxPre = Math.max(preBoarding.length, preDisembark.length);
    const initRows: AssignmentRow[] = [];
    for (let i = 0; i < Math.max(maxPre, 1); i++) {
      initRows.push(makeRow({
        boardingCrewId: preBoarding[i] || null,
        disembarkCrewId: preDisembark[i] || null,
      }));
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

  const handleOwnerChange = (id: string) => {
    setOwnerId(id);
    setFleetId('');
    setShipId('');
  };
  const handleFleetChange = (id: string) => {
    setFleetId(id === '_none' ? '' : id);
    setShipId('');
  };

  // 선박에 연결된 급여 템플릿 (등급 체계 + 계약개월 자동입력에 사용)
  useEffect(() => {
    if (!shipId) { setEffectiveTemplate(null); return; }
    getEffectiveTemplateForShip(shipId).then(setEffectiveTemplate);
  }, [shipId]);

  // 선박 선택 시 계획명 자동완성: "{선박명} {연도}-{월} #{그 달의 순번}" (영문, 월 단위 순번 리셋)
  useEffect(() => {
    if (!shipId) return;
    const ship = ships.find(s => s.id === shipId);
    if (!ship) return;
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01T00:00:00Z`;
    const monthEnd = month === 12 ? `${year + 1}-01-01T00:00:00Z` : `${year}-${String(month + 1).padStart(2, '0')}-01T00:00:00Z`;
    supabase.from('crew_rotation_plans')
      .select('id', { count: 'exact', head: true })
      .eq('ship_id', shipId)
      .gte('created_at', monthStart)
      .lt('created_at', monthEnd)
      .then(({ count }) => {
        const seq = (count || 0) + 1;
        const base = `${ship.name} ${year}-${String(month).padStart(2, '0')} #${seq}`;
        setPlanName(withDateSuffix(base, baseDepartureDate));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipId, ships]);

  // 기준 출국일이 바뀌면 계획명 끝의 (YYYY-MM-DD) 접미사만 교체 (나머지 텍스트는 보존)
  useEffect(() => {
    setPlanName(prev => prev ? withDateSuffix(prev, baseDepartureDate) : prev);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseDepartureDate]);

  const updateRow = (id: string, updates: Partial<AssignmentRow>) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));

  const addRow = () => setRows(prev => [...prev, makeRow(cascadeDatesFromBase(baseDepartureDate))]);
  const removeRow = (id: string) => setRows(prev => prev.filter(r => r.id !== id));

  const usedBoardingIds = rows.map(r => r.boardingCrewId).filter(Boolean) as string[];
  const usedDisembarkIds = rows.map(r => r.disembarkCrewId).filter(Boolean) as string[];

  // reservedCrewIds: 반려되지 않은 다른 교대 계획에 이미 승선/하선자로 들어간 선원 — 중복 배정 방지로 후보에서 제외
  const boardingCandidates = availableCrew.filter(c => !usedBoardingIds.includes(c.id) && !reservedCrewIds.has(c.id));
  // 하선 후보는 반드시 이 교대 계획의 해당 선박에 승선 중인 선원만 (다른 선박 승선자는 대상 아님)
  const disembarkCandidates = onboardCrew.filter(c => !usedDisembarkIds.includes(c.id) && c.current_ship_id === shipId && !reservedCrewIds.has(c.id));

  // 급여 템플릿에서 특정 직급(이름)에 정의된 등급 목록
  const gradesForRank = (rankName: string): string[] => {
    if (!effectiveTemplate) return [];
    return Array.from(new Set(
      effectiveTemplate.items.filter(i => i.rank === rankName && i.rank_grade).map(i => i.rank_grade as string)
    ));
  };
  // 직급 id 기준으로 등급 목록 조회 (행에는 rankId만 저장되어 있으므로)
  const gradesForRankId = (rankId: string): string[] => {
    const rank = ranks.find(r => r.id === rankId);
    return rank ? gradesForRank(rank.name) : [];
  };

  // 선원 선택 시 직급/등급/계약개월 자동입력값 계산
  const computeAutoFields = (crew: CrewWithDetails) => {
    const rank = ranks.find(r => r.id === crew.rank_id);
    const rankId = rank?.id || crew.rank_id || '';
    const templateGrades = rank ? gradesForRank(rank.name) : [];
    const crewGrade = (crew as CrewWithDetails & { current_grade?: string }).current_grade || '';
    const grade = crewGrade && templateGrades.includes(crewGrade) ? crewGrade : null;

    let contractMonths = '';
    const owner = owners.find(o => o.id === ownerId) || null;
    if (rank && owner) {
      const ship = ships.find(s => s.id === shipId) || null;
      const fleet = fleets.find(f => f.id === fleetId) || null;
      const cm = calculateContractPeriod(rank.rank_category, ship, fleet, owner);
      if (cm) contractMonths = String(cm);
    }
    return { rankId, grade, contractMonths };
  };

  const addBoardingCrewIdsAsRows = (ids: string[]) => {
    const seed = cascadeDatesFromBase(baseDepartureDate);
    const newRows = ids.map(id => {
      const crew = availableCrew.find(c => c.id === id);
      const auto = crew ? computeAutoFields(crew) : { rankId: '', grade: null, contractMonths: '' };
      return makeRow({ boardingCrewId: id, boardingRankId: auto.rankId, boardingGrade: auto.grade, contractMonths: auto.contractMonths, ...seed });
    });
    // 후보 추가 시 위쪽의 빈 행(승/하선자 둘 다 없음)은 정리 — 필요하면 "빈 행 추가"로 다시 만들 수 있음
    setRows(prev => [...prev.filter(r => r.boardingCrewId || r.disembarkCrewId), ...newRows]);
  };
  const addDisembarkCrewIdsAsRows = (ids: string[]) => {
    const seed = cascadeDatesFromBase(baseDepartureDate);
    const newRows = ids.map(id => {
      const crew = onboardCrew.find(c => c.id === id);
      const auto = crew ? computeAutoFields(crew) : { rankId: '', grade: null, contractMonths: '' };
      return makeRow({ disembarkCrewId: id, disembarkRankId: auto.rankId, disembarkGrade: auto.grade, contractMonths: auto.contractMonths, ...seed });
    });
    setRows(prev => [...prev.filter(r => r.boardingCrewId || r.disembarkCrewId), ...newRows]);
  };

  const getCrew = (id: string | null) => (id && (availableCrew.find(c => c.id === id) || onboardCrew.find(c => c.id === id))) || null;
  const getCrewName = (id: string | null) => getCrew(id)?.name || '-';
  // 표시 규칙: 직급이 이름보다 앞에 오도록 ("선주 플릿 선박" > "직급" > "이름"), 직급은 코드로 표기
  const getCrewRankName = (id: string | null) => {
    const c = getCrew(id);
    return c ? `${c.rank_code ? c.rank_code + ' ' : ''}${c.name}` : '선원 선택';
  };

  const rowPickerCandidates = (): CrewWithDetails[] => {
    if (!rowPicker) return [];
    const row = rows.find(r => r.id === rowPicker.rowId);
    if (rowPicker.side === 'boarding') {
      return availableCrew.filter(c => c.id === row?.boardingCrewId || (!usedBoardingIds.includes(c.id) && !reservedCrewIds.has(c.id)));
    }
    return onboardCrew.filter(c => c.id === row?.disembarkCrewId || (c.current_ship_id === shipId && !usedDisembarkIds.includes(c.id) && !reservedCrewIds.has(c.id)));
  };

  const handleRowPickerConfirm = (ids: string[]) => {
    if (!rowPicker) return;
    const id = ids[0] || null;
    if (!id) {
      updateRow(rowPicker.rowId, rowPicker.side === 'boarding' ? { boardingCrewId: null } : { disembarkCrewId: null });
      return;
    }
    const pool = rowPicker.side === 'boarding' ? availableCrew : onboardCrew;
    const crew = pool.find(c => c.id === id);
    const auto = crew ? computeAutoFields(crew) : { rankId: '', grade: null, contractMonths: '' };
    if (rowPicker.side === 'boarding') {
      updateRow(rowPicker.rowId, { boardingCrewId: id, boardingRankId: auto.rankId, boardingGrade: auto.grade, contractMonths: auto.contractMonths });
    } else {
      updateRow(rowPicker.rowId, { disembarkCrewId: id, disembarkRankId: auto.rankId, disembarkGrade: auto.grade, contractMonths: auto.contractMonths });
    }
  };

  const countryOptions = Array.from(new Set(ports.map(p => p.country_name))).sort();
  const cityOptions = Array.from(new Set(ports.filter(p => p.country_name === countryName).map(p => p.city_name))).sort();

  const handleCountrySelect = (value: string) => {
    if (value === '_manual') { setManualCountry(true); setCountryName(''); }
    else if (value === '_none') { setManualCountry(false); setCountryName(''); }
    else { setManualCountry(false); setCountryName(value); }
    setManualCity(false);
    setCityName('');
  };

  const handleCitySelect = (value: string) => {
    if (value === '_manual') { setManualCity(true); setCityName(''); }
    else if (value === '_none') { setManualCity(false); setCityName(''); }
    else { setManualCity(false); setCityName(value); }
  };

  const handleSubmit = async () => {
    if (!ownerId) { toast({ title: '선주를 선택하세요', variant: 'destructive' }); return; }
    if (!shipId) { toast({ title: '선박을 선택하세요', variant: 'destructive' }); return; }
    const validRows = rows.filter(r => r.boardingCrewId || r.disembarkCrewId);
    if (validRows.length === 0) { toast({ title: '배정 정보를 입력하세요', variant: 'destructive' }); return; }

    setSubmitting(true);
    try {
      // 직접 입력한 교대지는 저장하여 다음부터 목록에 포함되도록 함
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
        salary_template_id: null,
        salary_amount: null,
        salary_currency: 'USD',
        embark_date: r.boardingDate || new Date().toISOString().slice(0, 10),
        notes: r.notes || null,
      }));

      const plan = await rotationService.createRotationPlan({
        ship_id: shipId,
        owner_id: ownerId,
        fleet_id: fleetId || null,
        plan_name: planName || `Rotation Plan ${new Date().toISOString().slice(0, 10)}`,
        rotation_date: validRows[0]?.boardingDate || new Date().toISOString().slice(0, 10),
        notes: planNotes || null,
        base_departure_date: baseDepartureDate || null,
        port_id: portId,
        assignments,
      });

      if (!plan) throw new Error('저장에 실패했습니다');

      toast({ title: '작성 완료', description: '결재 상신은 교대계획 목록에서 진행하세요' });
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
    <div className="max-w-5xl mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-3">

      {/* 헤더 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Ship className="w-4 h-4" />교대 계획 작성
            </CardTitle>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => handleSubmit()} disabled={submitting} className="h-8 bg-blue-600 hover:bg-blue-700">작성 완료</Button>
            </div>
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
                  <Input value={countryName} onChange={e => setCountryName(e.target.value)} placeholder="국가명 입력 (영어)" className="h-8 text-xs" />
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
                  <Input value={cityName} onChange={e => setCityName(e.target.value)} placeholder="도시명 입력 (영어)" className="h-8 text-xs" />
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
              <Label className="text-xs">기준 출국일</Label>
              <Input type="date" value={baseDepartureDate} onChange={e => setBaseDepartureDate(e.target.value)} className="h-8 text-xs" />
              <p className="text-[10px] text-gray-400">이후 추가되는 행의 날짜를 자동계산합니다</p>
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
                <span className="text-xs font-medium text-gray-500">#{idx + 1}</span>
                {rows.length > 1 && (
                  <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-gray-400" onClick={() => removeRow(row.id)}>
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {/* 승선자 */}
                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                    <Label className="text-[11px] font-medium text-emerald-700">승선자</Label>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-7 text-xs flex-1 min-w-0 justify-start font-normal truncate px-2"
                      onClick={() => setRowPicker({ rowId: row.id, side: 'boarding' })}
                    >
                      <span className="truncate">{getCrewRankName(row.boardingCrewId)}</span>
                    </Button>
                    <Select value={row.boardingRankId || '_none'} onValueChange={v => updateRow(row.id, { boardingRankId: v === '_none' ? '' : v })}>
                      <SelectTrigger className="h-7 text-xs w-24 shrink-0"><SelectValue placeholder="직급" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">직급</SelectItem>
                        {ranks.map(r => <SelectItem key={r.id} value={r.id}>{r.rank_code || r.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {(() => {
                      const opts = gradesForRankId(row.boardingRankId);
                      return opts.length > 0 ? (
                        <Select value={row.boardingGrade || '_none'} onValueChange={v => updateRow(row.id, { boardingGrade: v === '_none' ? null : v })}>
                          <SelectTrigger className="h-7 text-xs w-14 shrink-0 px-1"><SelectValue placeholder="Grade" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_none">-</SelectItem>
                            {opts.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input value={row.boardingGrade || ''} onChange={e => updateRow(row.id, { boardingGrade: e.target.value || null })}
                          placeholder="Grade" className="h-7 text-xs w-14 shrink-0" />
                      );
                    })()}
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <Input type="date" value={row.departureDate} onChange={e => updateRow(row.id, { departureDate: e.target.value })} className="h-7 text-xs" title="출국일" />
                    <Input type="date" value={row.boardingDate} onChange={e => updateRow(row.id, { boardingDate: e.target.value })} className="h-7 text-xs" title="승선일" />
                  </div>
                </div>

                {/* 하선자 */}
                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
                    <Label className="text-[11px] font-medium text-orange-700">하선자</Label>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-7 text-xs flex-1 min-w-0 justify-start font-normal truncate px-2"
                      onClick={() => setRowPicker({ rowId: row.id, side: 'disembark' })}
                    >
                      <span className="truncate">{getCrewRankName(row.disembarkCrewId)}</span>
                    </Button>
                    <Select value={row.disembarkRankId || '_none'} onValueChange={v => updateRow(row.id, { disembarkRankId: v === '_none' ? '' : v })}>
                      <SelectTrigger className="h-7 text-xs w-24 shrink-0"><SelectValue placeholder="직급" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">직급</SelectItem>
                        {ranks.map(r => <SelectItem key={r.id} value={r.id}>{r.rank_code || r.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {(() => {
                      const opts = gradesForRankId(row.disembarkRankId);
                      return opts.length > 0 ? (
                        <Select value={row.disembarkGrade || '_none'} onValueChange={v => updateRow(row.id, { disembarkGrade: v === '_none' ? null : v })}>
                          <SelectTrigger className="h-7 text-xs w-14 shrink-0 px-1"><SelectValue placeholder="Grade" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_none">-</SelectItem>
                            {opts.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input value={row.disembarkGrade || ''} onChange={e => updateRow(row.id, { disembarkGrade: e.target.value || null })}
                          placeholder="Grade" className="h-7 text-xs w-14 shrink-0" />
                      );
                    })()}
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <Input type="date" value={row.disembarkDate} onChange={e => updateRow(row.id, { disembarkDate: e.target.value })} className="h-7 text-xs" title="하선일" />
                    <Input type="date" value={row.returnDate} onChange={e => updateRow(row.id, { returnDate: e.target.value })} className="h-7 text-xs" title="귀국일" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1 pt-1 border-t">
                <Input type="number" value={row.contractMonths} onChange={e => updateRow(row.id, { contractMonths: e.target.value })} className="h-7 text-xs" placeholder="계약 개월" />
                <Input value={row.notes} onChange={e => updateRow(row.id, { notes: e.target.value })} className="h-7 text-xs" placeholder="비고" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 배정 요약 */}
      <Card className="bg-gray-50">
        <CardContent className="py-3 px-4">
          <p className="text-xs text-gray-500 font-medium mb-2">배정 요약</p>
          <div className="flex flex-wrap gap-2">
            {rows.filter(r => r.boardingCrewId || r.disembarkCrewId).map((r, i) => (
              <div key={r.id} className="text-xs bg-white border rounded px-2 py-1 flex items-center gap-1.5">
                <span className="text-gray-400">#{i + 1}</span>
                <span className="text-emerald-700 font-medium">{getCrewName(r.boardingCrewId)}</span>
                {r.boardingGrade && <span className="text-blue-600 font-mono text-[10px]">{r.boardingGrade}</span>}
                <ArrowRight className="w-3 h-3 text-gray-300" />
                <span className="text-orange-700 font-medium">{getCrewName(r.disembarkCrewId)}</span>
                {r.disembarkGrade && <span className="text-blue-600 font-mono text-[10px]">{r.disembarkGrade}</span>}
              </div>
            ))}
            {rows.every(r => !r.boardingCrewId && !r.disembarkCrewId) && (
              <p className="text-xs text-gray-400">배정된 선원이 없습니다</p>
            )}
          </div>
        </CardContent>
      </Card>

      <CrewCandidateSelectDialog
        open={boardingDialogOpen}
        onOpenChange={setBoardingDialogOpen}
        mode="boarding"
        candidates={boardingCandidates}
        onConfirm={addBoardingCrewIdsAsRows}
      />
      <CrewCandidateSelectDialog
        open={disembarkDialogOpen}
        onOpenChange={setDisembarkDialogOpen}
        mode="disembark"
        candidates={disembarkCandidates}
        onConfirm={addDisembarkCrewIdsAsRows}
      />
      <CrewCandidateSelectDialog
        open={rowPicker !== null}
        onOpenChange={open => { if (!open) setRowPicker(null); }}
        mode={rowPicker?.side === 'disembark' ? 'disembark' : 'boarding'}
        candidates={rowPickerCandidates()}
        onConfirm={handleRowPickerConfirm}
        selectionMode="single"
      />
    </div>
  );
}
