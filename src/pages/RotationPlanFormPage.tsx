import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, X, ArrowRight, ChevronDown, ChevronUp, Ship } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { rotationService } from '@/services/rotation.service';
import type { CrewMember, Rank, Ship as ShipType } from '@/types/models';
import type { RankGrade } from '@/types/dispatch';
import { RANK_GRADE_LABELS } from '@/types/dispatch';
import type { CrewRotationAssignmentInput } from '@/types/rotation';
import { useToast } from '@/hooks/use-toast';
import { useTabContext } from '@/contexts/TabContext';

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

export default function RotationPlanFormPage() {
  const { toast } = useToast();
  const { activeTabId, closeTab } = useTabContext();
  const [searchParams] = useSearchParams();

  const [standbyCrew, setStandbyCrew] = useState<CrewMember[]>([]);
  const [onboardCrew, setOnboardCrew] = useState<CrewMember[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [ships, setShips] = useState<ShipType[]>([]);
  const [loading, setLoading] = useState(true);

  const [shipId, setShipId] = useState('');
  const [planName, setPlanName] = useState('');
  const [planNotes, setPlanNotes] = useState('');

  const [rows, setRows] = useState<AssignmentRow[]>([makeRow()]);
  const [boardingPanelOpen, setBoardingPanelOpen] = useState(true);
  const [disembarkPanelOpen, setDisembarkPanelOpen] = useState(true);
  const [boardingSearch, setBoardingSearch] = useState('');
  const [disembarkSearch, setDisembarkSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const preBoarding = (searchParams.get('boarding') || '').split(',').filter(Boolean);
  const preDisembark = (searchParams.get('disembark') || '').split(',').filter(Boolean);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const [standbyRes, onboardRes, ranksRes, shipsRes] = await Promise.all([
      supabase.from('crew_members').select('*').in('status', ['standby', 'deployment_decided']).order('name'),
      supabase.from('crew_members').select('*').eq('status', 'onboard').order('name'),
      supabase.from('ranks').select('*').order('display_order'),
      supabase.from('ships').select('*').order('name'),
    ]);
    setStandbyCrew(standbyRes.data || []);
    setOnboardCrew(onboardRes.data || []);
    setRanks(ranksRes.data || []);
    setShips(shipsRes.data || []);

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

  const updateRow = (id: string, updates: Partial<AssignmentRow>) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));

  const addRow = () => setRows(prev => [...prev, makeRow()]);
  const removeRow = (id: string) => setRows(prev => prev.filter(r => r.id !== id));

  const usedBoardingIds = rows.map(r => r.boardingCrewId).filter(Boolean) as string[];
  const usedDisembarkIds = rows.map(r => r.disembarkCrewId).filter(Boolean) as string[];

  const filteredStandby = standbyCrew.filter(c =>
    !usedBoardingIds.includes(c.id) &&
    (boardingSearch === '' || (c.name || '').toLowerCase().includes(boardingSearch.toLowerCase()))
  );
  const filteredOnboard = onboardCrew.filter(c =>
    !usedDisembarkIds.includes(c.id) &&
    (disembarkSearch === '' || (c.name || '').toLowerCase().includes(disembarkSearch.toLowerCase()))
  );

  const addBoardingCrewToRow = (crewId: string) => {
    const emptyRow = rows.find(r => !r.boardingCrewId);
    if (emptyRow) updateRow(emptyRow.id, { boardingCrewId: crewId });
    else setRows(prev => [...prev, makeRow({ boardingCrewId: crewId })]);
  };

  const addDisembarkCrewToRow = (crewId: string) => {
    const emptyRow = rows.find(r => !r.disembarkCrewId);
    if (emptyRow) updateRow(emptyRow.id, { disembarkCrewId: crewId });
    else setRows(prev => [...prev, makeRow({ disembarkCrewId: crewId })]);
  };

  const getCrewName = (id: string | null) => {
    if (!id) return '-';
    return (standbyCrew.find(c => c.id === id) || onboardCrew.find(c => c.id === id))?.name || id;
  };

  const handleSubmit = async (asDraft: boolean) => {
    if (!shipId) { toast({ title: '선박을 선택하세요', variant: 'destructive' }); return; }
    const validRows = rows.filter(r => r.boardingCrewId || r.disembarkCrewId);
    if (validRows.length === 0) { toast({ title: '배정 정보를 입력하세요', variant: 'destructive' }); return; }

    setSubmitting(true);
    try {
      const ship = ships.find(s => s.id === shipId);
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
        owner_id: ship?.owner_id || '',
        fleet_id: ship?.fleet_id || null,
        plan_name: planName || `교대계획 ${new Date().toLocaleDateString('ko-KR')}`,
        rotation_date: validRows[0]?.boardingDate || new Date().toISOString().slice(0, 10),
        notes: planNotes || null,
        assignments,
      });

      if (!plan) throw new Error('저장에 실패했습니다');

      toast({ title: asDraft ? '임시저장 완료' : '교대계획 저장 완료', description: '결재 상신은 교대계획 목록에서 진행하세요' });
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
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">

      {/* 헤더 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Ship className="w-4 h-4" />교대 계획 작성
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => handleSubmit(true)} disabled={submitting} className="h-8">임시저장</Button>
              <Button size="sm" onClick={() => handleSubmit(false)} disabled={submitting} className="h-8 bg-blue-600 hover:bg-blue-700">저장 →</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">선박 *</Label>
              <Select value={shipId} onValueChange={setShipId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="선박 선택" /></SelectTrigger>
                <SelectContent>{ships.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">계획명</Label>
              <Input value={planName} onChange={e => setPlanName(e.target.value)} placeholder="예) 2026년 7월 A호 교대" className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">비고</Label>
              <Input value={planNotes} onChange={e => setPlanNotes(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* 왼쪽: 승선자 패널 */}
        <Card className="border-emerald-200">
          <CardHeader className="pb-2 bg-emerald-50 rounded-t-lg cursor-pointer" onClick={() => setBoardingPanelOpen(v => !v)}>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm text-emerald-800">
                승선 후보 (대기선원)
                <Badge variant="secondary" className="ml-2 text-xs">{filteredStandby.length}명</Badge>
              </CardTitle>
              {boardingPanelOpen ? <ChevronUp className="w-4 h-4 text-emerald-600" /> : <ChevronDown className="w-4 h-4 text-emerald-600" />}
            </div>
          </CardHeader>
          {boardingPanelOpen && (
            <CardContent className="pt-2 p-3">
              <Input placeholder="이름 검색..." value={boardingSearch} onChange={e => setBoardingSearch(e.target.value)} className="h-7 text-xs mb-2" />
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {filteredStandby.map(c => (
                  <div key={c.id} className="flex items-center justify-between py-1 px-2 rounded hover:bg-emerald-50 text-xs">
                    <div>
                      <span className="font-medium">{c.name}</span>
                      <span className="text-gray-500 ml-2">{c.rank || '-'}</span>
                      {(c as CrewMember & { current_grade?: string }).current_grade && (
                        <span className="ml-1 text-blue-600 font-mono">{(c as CrewMember & { current_grade?: string }).current_grade}급</span>
                      )}
                    </div>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-emerald-600" onClick={() => addBoardingCrewToRow(c.id)}>
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
                {filteredStandby.length === 0 && <p className="text-center text-gray-400 text-xs py-4">대기선원이 없습니다</p>}
              </div>
            </CardContent>
          )}
        </Card>

        {/* 가운데: 배정 상세 */}
        <div className="lg:col-span-1 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">발령 상세</h3>
            <Button size="sm" variant="outline" onClick={addRow} className="h-7 text-xs gap-1">
              <Plus className="w-3 h-3" />행 추가
            </Button>
          </div>

          {rows.map((row, idx) => (
            <Card key={row.id} className="border-gray-200">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-500">#{idx + 1}</span>
                  {rows.length > 1 && (
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-gray-400" onClick={() => removeRow(row.id)}>
                      <X className="w-3 h-3" />
                    </Button>
                  )}
                </div>

                {/* 승선자 */}
                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <Label className="text-xs font-medium text-emerald-700">승선자</Label>
                  </div>
                  <Select value={row.boardingCrewId || '_none'} onValueChange={v => updateRow(row.id, { boardingCrewId: v === '_none' ? null : v })}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="선원 선택" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">-- 없음 (하선만) --</SelectItem>
                      {standbyCrew.map(c => <SelectItem key={c.id} value={c.id}>{c.name} ({c.rank || '-'})</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="grid grid-cols-2 gap-1">
                    <Select value={row.boardingRankId || '_none'} onValueChange={v => updateRow(row.id, { boardingRankId: v === '_none' ? '' : v })}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="발령직급" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">직급 선택</SelectItem>
                        {ranks.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={row.boardingGrade || '_none'} onValueChange={v => updateRow(row.id, { boardingGrade: v === '_none' ? null : v as RankGrade })}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Grade" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">Grade</SelectItem>
                        {(Object.keys(RANK_GRADE_LABELS) as RankGrade[]).map(g => <SelectItem key={g} value={g}>{g}급</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <div>
                      <Label className="text-xs text-gray-400">출국일</Label>
                      <Input type="date" value={row.departureDate} onChange={e => updateRow(row.id, { departureDate: e.target.value })} className="h-7 text-xs" />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-400">승선일</Label>
                      <Input type="date" value={row.boardingDate} onChange={e => updateRow(row.id, { boardingDate: e.target.value })} className="h-7 text-xs" />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 py-1">
                  <div className="flex-1 border-t" /><ArrowRight className="w-3 h-3 text-gray-400" /><div className="flex-1 border-t" />
                </div>

                {/* 하선자 */}
                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-orange-500" />
                    <Label className="text-xs font-medium text-orange-700">하선자</Label>
                  </div>
                  <Select value={row.disembarkCrewId || '_none'} onValueChange={v => updateRow(row.id, { disembarkCrewId: v === '_none' ? null : v })}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="선원 선택" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">-- 없음 (승선만) --</SelectItem>
                      {onboardCrew.map(c => <SelectItem key={c.id} value={c.id}>{c.name} ({c.rank || '-'})</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="grid grid-cols-2 gap-1">
                    <div>
                      <Label className="text-xs text-gray-400">하선일</Label>
                      <Input type="date" value={row.disembarkDate} onChange={e => updateRow(row.id, { disembarkDate: e.target.value })} className="h-7 text-xs" />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-400">귀국일</Label>
                      <Input type="date" value={row.returnDate} onChange={e => updateRow(row.id, { returnDate: e.target.value })} className="h-7 text-xs" />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1 pt-1 border-t">
                  <div>
                    <Label className="text-xs text-gray-400">계약 개월</Label>
                    <Input type="number" value={row.contractMonths} onChange={e => updateRow(row.id, { contractMonths: e.target.value })} className="h-7 text-xs" placeholder="6" />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-400">비고</Label>
                    <Input value={row.notes} onChange={e => updateRow(row.id, { notes: e.target.value })} className="h-7 text-xs" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* 오른쪽: 하선자 패널 */}
        <Card className="border-orange-200">
          <CardHeader className="pb-2 bg-orange-50 rounded-t-lg cursor-pointer" onClick={() => setDisembarkPanelOpen(v => !v)}>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm text-orange-800">
                하선 후보 (승선중)
                <Badge variant="secondary" className="ml-2 text-xs">{filteredOnboard.length}명</Badge>
              </CardTitle>
              {disembarkPanelOpen ? <ChevronUp className="w-4 h-4 text-orange-600" /> : <ChevronDown className="w-4 h-4 text-orange-600" />}
            </div>
          </CardHeader>
          {disembarkPanelOpen && (
            <CardContent className="pt-2 p-3">
              <Input placeholder="이름 검색..." value={disembarkSearch} onChange={e => setDisembarkSearch(e.target.value)} className="h-7 text-xs mb-2" />
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {filteredOnboard.map(c => (
                  <div key={c.id} className="flex items-center justify-between py-1 px-2 rounded hover:bg-orange-50 text-xs">
                    <div>
                      <span className="font-medium">{c.name}</span>
                      <span className="text-gray-500 ml-2">{c.rank || '-'}</span>
                      {(c as CrewMember & { current_grade?: string }).current_grade && (
                        <span className="ml-1 text-blue-600 font-mono">{(c as CrewMember & { current_grade?: string }).current_grade}급</span>
                      )}
                    </div>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-orange-600" onClick={() => addDisembarkCrewToRow(c.id)}>
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
                {filteredOnboard.length === 0 && <p className="text-center text-gray-400 text-xs py-4">승선중인 선원이 없습니다</p>}
              </div>
            </CardContent>
          )}
        </Card>
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
                {r.boardingGrade && <span className="text-blue-600 font-mono text-[10px]">{r.boardingGrade}급</span>}
                <ArrowRight className="w-3 h-3 text-gray-300" />
                <span className="text-orange-700 font-medium">{getCrewName(r.disembarkCrewId)}</span>
                {r.disembarkGrade && <span className="text-blue-600 font-mono text-[10px]">{r.disembarkGrade}급</span>}
              </div>
            ))}
            {rows.every(r => !r.boardingCrewId && !r.disembarkCrewId) && (
              <p className="text-xs text-gray-400">배정된 선원이 없습니다</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
