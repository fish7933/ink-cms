import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowUpCircle, ArrowDownCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { dispatchService } from '@/services/dispatch.service';
import type { CrewMember, Rank } from '@/types/models';
import type { RankGrade, DispatchType } from '@/types/dispatch';
import { RANK_GRADE_LABELS } from '@/types/dispatch';
import { useToast } from '@/hooks/use-toast';
import { useTabContext } from '@/contexts/TabContext';

interface DispatchRow {
  crewId: string;
  crewName: string;
  shipId: string | null;
  shipName: string;
  previousRankId: string;
  previousRankName: string;
  previousGrade: RankGrade | null;
  newRankId: string;
  newGrade: RankGrade | null;
  effectiveDate: string;
  notes: string;
}

export default function DispatchOrderPage() {
  const { toast } = useToast();
  const { activeTabId, closeTab } = useTabContext();
  const [searchParams] = useSearchParams();

  const [crews, setCrews] = useState<(CrewMember & { status?: string; current_grade?: string; current_ship_id?: string; ship_name?: string })[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [dispatchType, setDispatchType] = useState<DispatchType>('promotion');
  const [rows, setRows] = useState<DispatchRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  const preCrewIds = (searchParams.get('crew') || '').split(',').filter(Boolean);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const [crewRes, ranksRes] = await Promise.all([
      supabase.from('crew_members').select('*, ships(name)').eq('status', 'onboard').order('name'),
      supabase.from('ranks').select('*').order('display_order'),
    ]);
    const crewData = (crewRes.data || []).map((c: CrewMember & { ships?: { name: string } | null }) => ({
      ...c,
      ship_name: c.ships?.name || '',
    }));
    setCrews(crewData);
    setRanks(ranksRes.data || []);

    // URL에서 사전 선택된 선원으로 행 초기화
    const preRows: DispatchRow[] = preCrewIds.map(id => {
      const c = crewData.find((x: CrewMember) => x.id === id);
      return {
        crewId: id,
        crewName: c?.name || '',
        shipId: c?.current_ship_id || null,
        shipName: (c as CrewMember & { ship_name?: string })?.ship_name || '',
        previousRankId: c?.rank_id || '',
        previousRankName: '',
        previousGrade: (c as CrewMember & { current_grade?: string })?.current_grade as RankGrade || null,
        newRankId: c?.rank_id || '',
        newGrade: (c as CrewMember & { current_grade?: string })?.current_grade as RankGrade || null,
        effectiveDate: '',
        notes: '',
      };
    });

    if (preRows.length > 0) setRows(preRows);
    else setRows([{
      crewId: '', crewName: '', shipId: null, shipName: '',
      previousRankId: '', previousRankName: '', previousGrade: null,
      newRankId: '', newGrade: null, effectiveDate: '', notes: '',
    }]);
    setLoading(false);
  };

  const updateRow = (idx: number, updates: Partial<DispatchRow>) =>
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...updates } : r));

  const addRow = () => setRows(prev => [...prev, {
    crewId: '', crewName: '', shipId: null, shipName: '',
    previousRankId: '', previousRankName: '', previousGrade: null,
    newRankId: '', newGrade: null, effectiveDate: '', notes: '',
  }]);

  const handleCrewSelect = (idx: number, crewId: string) => {
    const c = crews.find(x => x.id === crewId);
    updateRow(idx, {
      crewId,
      crewName: c?.name || '',
      shipId: c?.current_ship_id || null,
      shipName: (c as CrewMember & { ship_name?: string })?.ship_name || '',
      previousRankId: c?.rank_id || '',
      previousGrade: (c as CrewMember & { current_grade?: string })?.current_grade as RankGrade || null,
      newRankId: c?.rank_id || '',
      newGrade: (c as CrewMember & { current_grade?: string })?.current_grade as RankGrade || null,
    });
  };

  const getRankName = (id: string) => ranks.find(r => r.id === id)?.name || '';
  const getRankCode = (id: string) => ranks.find(r => r.id === id)?.rank_code || '';

  const handleSubmit = async (asDraft: boolean) => {
    const validRows = rows.filter(r => r.crewId && (r.newRankId !== r.previousRankId || r.newGrade !== r.previousGrade));
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
          notes: r.notes || null,
        });
        if (!order) throw new Error(`${r.crewName} 발령 생성 실패`);

        if (!asDraft) {
          await dispatchService.submitForApproval(order.id, '');
        }
      }
      toast({ title: asDraft ? '임시저장 완료' : '결재 상신 완료' });
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
    <div className="max-w-4xl mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">

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
              <Button variant="outline" size="sm" onClick={() => handleSubmit(true)} disabled={submitting} className="h-8">
                임시저장
              </Button>
              <Button size="sm" onClick={() => handleSubmit(false)} disabled={submitting} className="h-8 bg-blue-600 hover:bg-blue-700">
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
          return (
            <Card key={idx} className={`border-l-4 ${changed ? (dispatchType === 'promotion' ? 'border-l-emerald-500' : 'border-l-red-400') : 'border-l-gray-200'}`}>
              <CardContent className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                  {/* 선원 선택 */}
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs">선원 *</Label>
                      <Select value={row.crewId || '_none'} onValueChange={v => handleCrewSelect(idx, v === '_none' ? '' : v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="선원 선택 (승선중)" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">선원 선택</SelectItem>
                          {crews.map(c => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name} — {c.rank || '-'} {(c as CrewMember & { current_grade?: string }).current_grade ? `(${(c as CrewMember & { current_grade?: string }).current_grade}급)` : ''}
                              {(c as CrewMember & { ship_name?: string }).ship_name ? ` | ${(c as CrewMember & { ship_name?: string }).ship_name}` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {row.crewId && (
                      <div className="bg-gray-50 rounded p-2 text-xs space-y-1">
                        <p className="text-gray-500 font-medium">현재</p>
                        <p>{getRankName(row.previousRankId) || '-'} <span className="font-mono">{row.previousGrade ? `${row.previousGrade}급` : ''}</span></p>
                        {row.shipName && <p className="text-gray-400">{row.shipName} 승선중</p>}
                      </div>
                    )}

                    <div className="space-y-1">
                      <Label className="text-xs">발효일 *</Label>
                      <Input type="date" value={row.effectiveDate} onChange={e => updateRow(idx, { effectiveDate: e.target.value })} className="h-8 text-xs" />
                    </div>
                  </div>

                  {/* 변경 후 */}
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-blue-700">변경 후 직급</Label>
                      <Select value={row.newRankId || '_none'} onValueChange={v => updateRow(idx, { newRankId: v === '_none' ? '' : v })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="직급 선택" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">직급 선택</SelectItem>
                          {ranks.map(r => <SelectItem key={r.id} value={r.id}>{r.name} ({r.rank_code})</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-blue-700">변경 후 Grade</Label>
                      <Select value={row.newGrade || '_none'} onValueChange={v => updateRow(idx, { newGrade: v === '_none' ? null : v as RankGrade })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Grade 선택" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">Grade 없음</SelectItem>
                          {(Object.entries(RANK_GRADE_LABELS) as [RankGrade, string][]).map(([g, label]) => (
                            <SelectItem key={g} value={g}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* 변동 미리보기 */}
                    {changed && row.crewId && (
                      <div className={`rounded p-2 text-xs ${dispatchType === 'promotion' ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
                        <p className="font-medium mb-1">{dispatchType === 'promotion' ? '↑ 승진' : '↓ 강등'}</p>
                        <p>
                          <span className="text-gray-500">{getRankName(row.previousRankId)}{row.previousGrade ? ` ${row.previousGrade}급` : ''}</span>
                          {' → '}
                          <span className="font-medium">{getRankName(row.newRankId)}{row.newGrade ? ` ${row.newGrade}급` : ''}</span>
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
    </div>
  );
}
