import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { addMonths, format } from 'date-fns';
import { ArrowUpCircle, ArrowDownCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/lib/supabase';
import { sortRanksByDisplayOrder } from '@/lib/rank-order';
import { dispatchService } from '@/services/dispatch.service';
import { approvalService } from '@/services/approval.service';
import { loadShipSalaryRankMaps, getRankOptionsForShip, getGradeOptionsForShipRank, type ShipSalaryRankMaps } from '@/services/ship-salary-rank.service';
import { getCurrentUser } from '@/lib/store';
import type { CrewMember, Rank, User } from '@/types/models';
import type { RankGrade, DispatchType } from '@/types/dispatch';
import type { ApprovalLineWithSteps } from '@/types/approval';
import { useToast } from '@/hooks/use-toast';
import { useTabContext } from '@/contexts/TabContext';

interface CrewForDispatch extends CrewMember {
  ship_name?: string;
  owner_name?: string;
  fleet_name?: string;
  current_grade?: string;
}

interface DispatchRow {
  crewId: string;
  crewName: string;
  locked: boolean; // 선원 목록에서 선택되어 넘어온 행 — 선원/선주/플릿/선박을 고정 표시
  shipId: string | null;
  shipName: string;
  ownerName: string;
  fleetName: string;
  previousRankId: string;
  previousRankCode: string;
  previousGrade: RankGrade | null;
  newRankId: string;
  newGrade: RankGrade | null;
  effectiveDate: string;
  expiryDate: string;
  notes: string;
}

const EMPTY_ROW: DispatchRow = {
  crewId: '', crewName: '', locked: false, shipId: null, shipName: '', ownerName: '', fleetName: '',
  previousRankId: '', previousRankCode: '', previousGrade: null,
  newRankId: '', newGrade: null, effectiveDate: '', expiryDate: '', notes: '',
};

export default function DispatchOrderPage() {
  const { toast } = useToast();
  const { activeTabId, closeTab } = useTabContext();
  const [searchParams] = useSearchParams();

  const [crews, setCrews] = useState<CrewForDispatch[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [embarkByCrew, setEmbarkByCrew] = useState<Map<string, { embark_date: string; contract_months: number | null }>>(new Map());
  const [salaryRankMaps, setSalaryRankMaps] = useState<ShipSalaryRankMaps>({ rankOptionsByShip: new Map(), gradesByTemplate: new Map() });
  const [dispatchType, setDispatchType] = useState<DispatchType>('promotion');
  const [rows, setRows] = useState<DispatchRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  // 결재 상신 다이얼로그 — 채용/배승/계약 결재와 동일하게 결재선을 직접 선택
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [approvalLines, setApprovalLines] = useState<ApprovalLineWithSteps[]>([]);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [submitLineId, setSubmitLineId] = useState('');
  const [submitComment, setSubmitComment] = useState('');
  const [defaultLineId, setDefaultLineId] = useState('');
  const [saveLineDefault, setSaveLineDefault] = useState(false);

  const preCrewIds = (searchParams.get('crew') || '').split(',').filter(Boolean);

  useEffect(() => { loadData(); }, []);
  useEffect(() => {
    getCurrentUser().then(async u => {
      setCurrentUser(u);
      if (!u) return;
      approvalService.getApprovalLines(u.company_id ?? null).then(setApprovalLines);
      const { data: pref } = await supabase.from('users').select('default_approval_line_id').eq('id', u.id).single();
      if (pref?.default_approval_line_id) setDefaultLineId(pref.default_approval_line_id);
    });
  }, []);

  const calcExpiryDate = (embark?: { embark_date: string; contract_months: number | null }): string => {
    if (!embark?.embark_date || !embark.contract_months) return '';
    return format(addMonths(new Date(embark.embark_date), embark.contract_months), 'yyyy-MM-dd');
  };

  const loadData = async () => {
    setLoading(true);
    const [crewRes, ranksRes, ownersRes, fleetsRes, embarkRes, salaryMaps] = await Promise.all([
      supabase.from('crew_members').select('*, ships(name, owner_id, fleet_id)').eq('status', 'onboard').order('name'),
      supabase.from('ranks').select('*'),
      supabase.from('companies').select('id, name'),
      supabase.from('fleets').select('id, name'),
      supabase.from('crew_embarkation_records').select('crew_member_id, embark_date, contract_months').eq('status', 'active'),
      loadShipSalaryRankMaps(),
    ]);

    const sortedRanks = sortRanksByDisplayOrder(ranksRes.data || []);
    setRanks(sortedRanks);
    setSalaryRankMaps(salaryMaps);

    const ownersMap = new Map((ownersRes.data || []).map(o => [o.id, o.name]));
    const fleetsMap = new Map((fleetsRes.data || []).map(f => [f.id, f.name]));

    const crewData: CrewForDispatch[] = (crewRes.data || []).map((c: CrewMember & { ships?: { name: string; owner_id?: string; fleet_id?: string } | null; current_grade?: string }) => ({
      ...c,
      ship_name: c.ships?.name || '',
      owner_name: c.ships?.owner_id ? (ownersMap.get(c.ships.owner_id) || '') : '',
      fleet_name: c.ships?.fleet_id ? (fleetsMap.get(c.ships.fleet_id) || '') : '',
    }));
    setCrews(crewData);

    const embarkMap = new Map((embarkRes.data || []).map(e => [e.crew_member_id, { embark_date: e.embark_date, contract_months: e.contract_months }]));
    setEmbarkByCrew(embarkMap);

    const buildRow = (id: string, locked: boolean): DispatchRow => {
      if (!id) return { ...EMPTY_ROW, locked };
      const c = crewData.find(x => x.id === id);
      const rankId = c?.rank_id || '';
      return {
        ...EMPTY_ROW,
        crewId: id,
        crewName: c?.name || '',
        locked,
        shipId: c?.current_ship_id || null,
        shipName: c?.ship_name || '',
        ownerName: c?.owner_name || '',
        fleetName: c?.fleet_name || '',
        previousRankId: rankId,
        previousRankCode: sortedRanks.find(r => r.id === rankId)?.rank_code || '',
        previousGrade: (c?.current_grade as RankGrade) || null,
        newRankId: rankId,
        newGrade: (c?.current_grade as RankGrade) || null,
        expiryDate: calcExpiryDate(embarkMap.get(id)),
      };
    };

    if (preCrewIds.length > 0) setRows(preCrewIds.map(id => buildRow(id, true)));
    else setRows([buildRow('', false)]);
    setLoading(false);
  };

  const updateRow = (idx: number, updates: Partial<DispatchRow>) =>
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...updates } : r));

  const addRow = () => setRows(prev => [...prev, { ...EMPTY_ROW }]);

  const handleCrewSelect = (idx: number, crewId: string) => {
    const c = crews.find(x => x.id === crewId);
    const rankId = c?.rank_id || '';
    const expiryDate = calcExpiryDate(embarkByCrew.get(crewId));
    updateRow(idx, {
      crewId,
      crewName: c?.name || '',
      shipId: c?.current_ship_id || null,
      shipName: c?.ship_name || '',
      ownerName: c?.owner_name || '',
      fleetName: c?.fleet_name || '',
      previousRankId: rankId,
      previousRankCode: getRankCode(rankId),
      previousGrade: (c?.current_grade as RankGrade) || null,
      newRankId: rankId,
      newGrade: (c?.current_grade as RankGrade) || null,
      expiryDate,
    });
  };

  const getRankCode = (id: string) => ranks.find(r => r.id === id)?.rank_code || '';
  const getRankOptions = (shipId: string | null): Rank[] => getRankOptionsForShip(salaryRankMaps, shipId);
  const getGradeOptions = (shipId: string | null, rankId: string): string[] => getGradeOptionsForShipRank(salaryRankMaps, shipId, rankId);

  const getValidRows = () => rows.filter(r => r.crewId && (r.newRankId !== r.previousRankId || r.newGrade !== r.previousGrade));

  const handleSaveDraft = async () => {
    const validRows = getValidRows();
    if (validRows.length === 0) {
      toast({ title: '변경사항이 없습니다', description: '직급 또는 Grade를 변경해 주세요', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      for (const r of validRows) {
        const order = await dispatchService.createDispatchOrder({
          crew_member_id: r.crewId,
          ship_id: r.shipId,
          dispatch_type: dispatchType,
          previous_rank_id: r.previousRankId || null,
          previous_grade: r.previousGrade,
          new_rank_id: r.newRankId || null,
          new_grade: r.newGrade,
          effective_date: r.effectiveDate || new Date().toISOString().slice(0, 10),
          expiry_date: r.expiryDate || null,
          notes: r.notes || null,
        });
        if (!order) throw new Error(`${r.crewName} 발령 생성 실패`);
      }
      toast({ title: '임시저장 완료' });
      if (activeTabId) closeTab(activeTabId);
    } catch (e) {
      toast({ title: '오류', description: String(e), variant: 'destructive' });
    } finally { setSubmitting(false); }
  };

  const openSubmitDialog = () => {
    if (getValidRows().length === 0) {
      toast({ title: '변경사항이 없습니다', description: '직급 또는 Grade를 변경해 주세요', variant: 'destructive' });
      return;
    }
    setSubmitLineId(defaultLineId || '');
    setSubmitComment('');
    setSaveLineDefault(false);
    setSubmitDialogOpen(true);
  };

  const handleConfirmSubmit = async () => {
    if (!submitLineId || !currentUser) return;
    const validRows = getValidRows();
    setSubmitting(true);
    try {
      if (saveLineDefault) {
        await supabase.from('users').update({ default_approval_line_id: submitLineId }).eq('id', currentUser.id);
        setDefaultLineId(submitLineId);
      }
      for (const r of validRows) {
        const order = await dispatchService.createDispatchOrder({
          crew_member_id: r.crewId,
          ship_id: r.shipId,
          dispatch_type: dispatchType,
          previous_rank_id: r.previousRankId || null,
          previous_grade: r.previousGrade,
          new_rank_id: r.newRankId || null,
          new_grade: r.newGrade,
          effective_date: r.effectiveDate || new Date().toISOString().slice(0, 10),
          expiry_date: r.expiryDate || null,
          notes: r.notes || null,
        });
        if (!order) throw new Error(`${r.crewName} 발령 생성 실패`);

        const result = await dispatchService.submitDispatchOrderForApproval(order.id, submitLineId, submitComment || undefined);
        if (!result.ok) throw new Error(result.message || `${r.crewName} 결재 상신 실패`);
      }
      toast({ title: '결재 상신 완료', description: '승인이 완료되면 계약/승선경력에 즉시 반영됩니다.' });
      setSubmitDialogOpen(false);
      window.dispatchEvent(new CustomEvent('dispatch-order-data-changed'));
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
              {dispatchType === 'promotion'
                ? <ArrowUpCircle className="w-5 h-5 text-emerald-600" />
                : <ArrowDownCircle className="w-5 h-5 text-red-500" />}
              {dispatchType === 'promotion' ? '승진 발령' : '강등 발령'}
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleSaveDraft} disabled={submitting} className="h-8">
                임시저장
              </Button>
              <Button size="sm" onClick={openSubmitDialog} disabled={submitting} className="h-8 bg-blue-600 hover:bg-blue-700">
                결재 상신 →
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex gap-3 items-center">
            <Label className="text-xs whitespace-nowrap">발령 유형</Label>
            <div className="flex gap-2">
              <Button
                size="sm" variant={dispatchType === 'promotion' ? 'default' : 'outline'}
                className={`h-8 gap-1.5 ${dispatchType === 'promotion' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}
                onClick={() => setDispatchType('promotion')}
              >
                <TrendingUp className="w-3.5 h-3.5" />승진
              </Button>
              <Button
                size="sm" variant={dispatchType === 'demotion' ? 'default' : 'outline'}
                className={`h-8 gap-1.5 ${dispatchType === 'demotion' ? 'bg-red-500 hover:bg-red-600' : ''}`}
                onClick={() => setDispatchType('demotion')}
              >
                <TrendingDown className="w-3.5 h-3.5" />강등
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 발령 대상 목록 */}
      <div className="space-y-3">
        {rows.map((row, idx) => {
          const changed = row.newRankId !== row.previousRankId || row.newGrade !== row.previousGrade;
          const rankOptions = getRankOptions(row.shipId);
          const gradeOptions = getGradeOptions(row.shipId, row.newRankId);
          return (
            <Card key={idx} className={`border-l-4 ${changed ? (dispatchType === 'promotion' ? 'border-l-emerald-500' : 'border-l-red-400') : 'border-l-gray-200'}`}>
              <CardContent className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                  {/* 선원 선택 (선원 목록에서 넘어온 경우 고정 표시) */}
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs">선원 *</Label>
                      {row.locked ? (
                        <div className="h-8 flex items-center px-2 rounded border bg-gray-50 text-sm font-medium">
                          {row.crewName}
                        </div>
                      ) : (
                        <Select value={row.crewId || '_none'} onValueChange={v => handleCrewSelect(idx, v === '_none' ? '' : v)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="선원 선택 (승선중)" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_none">선원 선택</SelectItem>
                            {crews.map(c => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name} — {getRankCode(c.rank_id || '')}{c.current_grade ? `(${c.current_grade})` : ''}
                                {c.ship_name ? ` | ${c.ship_name}` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>

                    {row.crewId && (
                      <div className="bg-gray-50 rounded p-2 text-xs space-y-1">
                        <p className="text-gray-500 font-medium">현재</p>
                        <p>{row.previousRankCode || '-'}{row.previousGrade ? `(${row.previousGrade})` : ''}</p>
                        <p className="text-gray-400">
                          {[row.ownerName, row.fleetName, row.shipName].filter(Boolean).join(' / ') || '-'}
                        </p>
                      </div>
                    )}

                    <div className="space-y-1">
                      <Label className="text-xs">발효일 *</Label>
                      <Input type="date" value={row.effectiveDate} onChange={e => updateRow(idx, { effectiveDate: e.target.value })} className="h-8 text-xs" />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">만료일 <span className="text-gray-400 font-normal">(하선예정일 기본값, 수정 가능)</span></Label>
                      <Input type="date" value={row.expiryDate} onChange={e => updateRow(idx, { expiryDate: e.target.value })} className="h-8 text-xs" />
                    </div>
                  </div>

                  {/* 변경 후 */}
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-blue-700">변경 후 직급 <span className="text-gray-400 font-normal">(급여템플릿 등록 직급만)</span></Label>
                      <Select value={row.newRankId || '_none'} onValueChange={v => updateRow(idx, { newRankId: v === '_none' ? '' : v })} disabled={rankOptions.length === 0}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="직급 선택" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">직급 선택</SelectItem>
                          {rankOptions.map(r => <SelectItem key={r.id} value={r.id}>{r.rank_code}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {row.shipId && rankOptions.length === 0 && (
                        <p className="text-xs text-red-500">이 선박에 배정된 급여템플릿이 없어 직급을 선택할 수 없습니다.</p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-blue-700">변경 후 Grade <span className="text-gray-400 font-normal">(급여템플릿 등록 등급만)</span></Label>
                      <Select value={row.newGrade || '_none'} onValueChange={v => updateRow(idx, { newGrade: v === '_none' ? null : v as RankGrade })} disabled={gradeOptions.length === 0}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Grade 선택" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">Grade 없음</SelectItem>
                          {gradeOptions.map(g => (
                            <SelectItem key={g} value={g}>{g}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* 변동 미리보기 */}
                    {changed && row.crewId && (
                      <div className={`rounded p-2 text-xs ${dispatchType === 'promotion' ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
                        <p className="font-medium mb-1">{dispatchType === 'promotion' ? '↑ 승진' : '↓ 강등'}</p>
                        <p>
                          <span className="text-gray-500">{row.previousRankCode}{row.previousGrade ? `(${row.previousGrade})` : ''}</span>
                          {' → '}
                          <span className="font-medium">{getRankCode(row.newRankId)}{row.newGrade ? `(${row.newGrade})` : ''}</span>
                        </p>
                      </div>
                    )}

                    <div className="space-y-1">
                      <Label className="text-xs">사유</Label>
                      <Input value={row.notes} onChange={e => updateRow(idx, { notes: e.target.value })} className="h-8 text-xs" placeholder="발령 사유" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Button variant="outline" size="sm" onClick={addRow} className="w-full h-8 text-xs border-dashed">
        + 발령 대상 추가
      </Button>

      <Dialog open={submitDialogOpen} onOpenChange={o => !submitting && setSubmitDialogOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{dispatchType === 'promotion' ? '승진' : '강등'} 발령 결재 상신</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">{getValidRows().length}건을 결재 상신합니다.</p>
            <div>
              <label className="text-sm font-medium mb-2 block">결재 라인 선택 *</label>
              <Select value={submitLineId} onValueChange={setSubmitLineId}>
                <SelectTrigger><SelectValue placeholder="결재 라인을 선택하세요" /></SelectTrigger>
                <SelectContent>
                  {approvalLines.length === 0
                    ? <SelectItem value="none" disabled>등록된 결재 라인이 없습니다</SelectItem>
                    : approvalLines.map(l => <SelectItem key={l.id} value={String(l.id)}>{l.name} ({l.steps.length}단계)</SelectItem>)}
                </SelectContent>
              </Select>
              {submitLineId && (
                <div className="flex items-center space-x-2 mt-2">
                  <Checkbox id="save-line-default-dispatch" checked={saveLineDefault} onCheckedChange={c => setSaveLineDefault(c as boolean)} />
                  <label htmlFor="save-line-default-dispatch" className="text-sm text-gray-700 cursor-pointer">앞으로도 해당 결재 라인 이용</label>
                </div>
              )}
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">요청 사유 (선택)</label>
              <Textarea value={submitComment} onChange={e => setSubmitComment(e.target.value)} placeholder="요청 사유를 입력하세요..." className="min-h-[80px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitDialogOpen(false)} disabled={submitting}>취소</Button>
            <Button onClick={handleConfirmSubmit} disabled={submitting || !submitLineId} className="bg-blue-600 hover:bg-blue-700">
              {submitting ? '처리 중...' : '결재 상신'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
