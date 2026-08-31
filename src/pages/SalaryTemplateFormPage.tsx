import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Save, Plus, X, ChevronDown, ChevronRight, Ship as ShipIcon, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import BadgeSelect from '@/components/ui/BadgeSelect';
import type { BadgeSelectItem, BadgeSelectGroup } from '@/components/ui/BadgeSelect';
import { useTabContext } from '@/contexts/TabContext';
import {
  getSalaryComponents,
  getSalaryTemplateWithItems,
  getSalaryTemplateHistory,
  deleteSalaryTemplateHistoryVersion,
  getEffectiveTemplateMapForShips,
  addSalaryTemplate,
  updateSalaryTemplate,
  type SalaryComponent,
  type SalaryTemplate,
  type SalaryTemplateWithItems,
} from '@/lib/salary-store';
import { getRanks } from '@/lib/store';
import { getShips } from '@/services/ship.service';
import type { Rank } from '@/types/models';
import SalaryTemplateMatrixTable from '@/components/salary/SalaryTemplateMatrixTable';

const CURRENCIES = ['USD', 'EUR', 'KRW', 'JPY'];
type AmountMatrix = Record<string, Record<string, number>>;

export default function SalaryTemplateFormPage() {
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { closeTab, activeTabId, updateTab } = useTabContext();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [components, setComponents] = useState<SalaryComponent[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);

  const [formData, setFormData] = useState({ name: '', description: '', currency: 'USD' });
  const [effectiveFrom, setEffectiveFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [effectiveUntil, setEffectiveUntil] = useState<string | null>(null);
  const [selectedRanks, setSelectedRanks] = useState<string[]>([]);
  const [selectedComponents, setSelectedComponents] = useState<string[]>([]);
  const [amounts, setAmounts] = useState<AmountMatrix>({});
  // 직급별 등급(A/B/C...) 목록. 비어있으면 그 직급은 등급 구분 없이 단일 금액.
  const [rankGrades, setRankGrades] = useState<Record<string, string[]>>({});

  const [assignedShips, setAssignedShips] = useState<string[]>([]);
  const [history, setHistory] = useState<SalaryTemplate[]>([]);
  const [historyDetails, setHistoryDetails] = useState<Record<string, SalaryTemplateWithItems | null>>({});
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        const [compsData, ranksData] = await Promise.all([getSalaryComponents(), getRanks()]);
        setComponents(compsData);
        setRanks(ranksData);

        if (isEdit && id) {
          const tmpl = await getSalaryTemplateWithItems(id);
          if (tmpl) {
            setFormData({ name: tmpl.name, description: tmpl.description || '', currency: tmpl.currency });
            setEffectiveFrom(tmpl.effective_from);
            setEffectiveUntil(tmpl.effective_until ?? null);
            setSelectedRanks(tmpl.ranks);
            const compIds = [...new Set(tmpl.items.map(i => i.component_id))];
            // 저장된 금액 항목이 하나도 없으면(예: 직급만 등록되고 금액을 넣기 전) "선택된 급여 항목"이 빈 배열로
            // 역산되어 표 자체가 안 보이는 문제가 있었음 — 그 경우 신규 템플릿과 동일하게 전체 항목을 기본 선택.
            setSelectedComponents(compIds.length > 0 ? compIds : compsData.map(c => c.id));
            const mat: AmountMatrix = {};
            const grades: Record<string, string[]> = {};
            for (const item of tmpl.items) {
              const r = item.rank || '';
              const g = item.rank_grade || null;
              const key = g ? `${r}::${g}` : r;
              if (!mat[key]) mat[key] = {};
              mat[key][item.component_id] = item.amount;
              if (g) {
                if (!grades[r]) grades[r] = [];
                if (!grades[r].includes(g)) grades[r].push(g);
              }
            }
            Object.values(grades).forEach(list => list.sort());
            setAmounts(mat);
            setRankGrades(grades);
            if (activeTabId) updateTab(activeTabId, { title: `템플릿 수정: ${tmpl.name}` });

            const ships = await getShips();
            const templateMap = await getEffectiveTemplateMapForShips(ships);
            setAssignedShips(ships.filter(s => templateMap[s.id]?.id === id && s.is_active !== false).map(s => s.name));

            const hist = await getSalaryTemplateHistory(id);
            setHistory(hist.filter(h => h.id !== id));
          }
        } else {
          // 신규: 전체 항목 기본 선택
          const allRanks = ranksData.map(r => r.name);
          const allComps = compsData.map(c => c.id);
          setSelectedRanks(allRanks);
          setSelectedComponents(allComps);
        }
      } catch (e) {
        console.error(e);
        toast({ title: '불러오기 실패', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [id]);

  const rowKey = (rank: string, grade: string | null) => grade ? `${rank}::${grade}` : rank;
  const getAmount = (rank: string, grade: string | null, cid: string) => amounts[rowKey(rank, grade)]?.[cid] || 0;
  const setAmount = (rank: string, grade: string | null, cid: string, val: number) =>
    setAmounts(prev => ({ ...prev, [rowKey(rank, grade)]: { ...prev[rowKey(rank, grade)], [cid]: val } }));

  const nextGradeLetter = (existing: string[]) => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (const l of letters) if (!existing.includes(l)) return l;
    return `G${existing.length + 1}`;
  };
  const addGrade = (rank: string) => {
    const existing = rankGrades[rank] || [];
    const newGrade = nextGradeLetter(existing);
    // 새 등급의 금액은 기존 대표(등급 없음) 금액을 그대로 가져와, 최소한의 수정만으로 등급별 급여를 만들 수 있게 함
    const representative = amounts[rank];
    setRankGrades(prev => ({ ...prev, [rank]: [...existing, newGrade] }));
    if (representative) {
      setAmounts(prev => ({ ...prev, [rowKey(rank, newGrade)]: { ...representative } }));
    }
  };
  const removeGrade = (rank: string, grade: string) => {
    setRankGrades(prev => ({ ...prev, [rank]: (prev[rank] || []).filter(g => g !== grade) }));
    setAmounts(prev => {
      const next = { ...prev };
      delete next[rowKey(rank, grade)];
      return next;
    });
  };

  const toggleHistory = async (h: SalaryTemplate) => {
    if (expandedHistoryId === h.id) { setExpandedHistoryId(null); return; }
    setExpandedHistoryId(h.id);
    if (!historyDetails[h.id]) {
      const full = await getSalaryTemplateWithItems(h.id);
      setHistoryDetails(prev => ({ ...prev, [h.id]: full }));
    }
  };

  const handleDeleteHistory = async (h: SalaryTemplate) => {
    if (!confirm(`${h.effective_from} ~ ${h.effective_until} 버전을 삭제하시겠습니까?\n앞뒤 버전의 유효기간이 자동으로 이어붙습니다.`)) return;
    const ok = await deleteSalaryTemplateHistoryVersion(h.id);
    if (!ok) {
      toast({ title: '삭제 실패', variant: 'destructive' });
      return;
    }
    toast({ title: '삭제 완료' });
    window.dispatchEvent(new CustomEvent('salary-template-data-changed'));
    if (expandedHistoryId === h.id) setExpandedHistoryId(null);
    setHistoryDetails(prev => { const next = { ...prev }; delete next[h.id]; return next; });
    // 삭제된 버전의 앞뒤 이어붙이기로 현재 편집 중인 템플릿의 유효기간이 바뀌었을 수 있으니 함께 새로고침
    if (id) {
      const [tmpl, hist] = await Promise.all([getSalaryTemplateWithItems(id), getSalaryTemplateHistory(id)]);
      if (tmpl) setEffectiveUntil(tmpl.effective_until ?? null);
      setHistory(hist.filter(x => x.id !== id));
    }
  };

  // display_order 기준 정렬을 유지하기 위해 components 배열 순서로 필터링
  const earningIds = components
    .filter(c => (c.component_type ?? 'earning') === 'earning' && selectedComponents.includes(c.id))
    .map(c => c.id);
  const deductionIds = components
    .filter(c => c.component_type === 'deduction' && selectedComponents.includes(c.id))
    .map(c => c.id);
  const rowTotal = (rank: string, grade: string | null) => earningIds.reduce((s, cid) => s + getAmount(rank, grade, cid), 0);
  const rowDeferred = (rank: string, grade: string | null) =>
    earningIds.filter(cid => components.find(x => x.id === cid)?.payment_type === 'deferred')
              .reduce((s, cid) => s + getAmount(rank, grade, cid), 0);
  const rowDeduction = (rank: string, grade: string | null) => deductionIds.reduce((s, cid) => s + getAmount(rank, grade, cid), 0);
  const rowMonthlyPay = (rank: string, grade: string | null) => rowTotal(rank, grade) - rowDeferred(rank, grade) - rowDeduction(rank, grade);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) { toast({ title: '템플릿명을 입력하세요.', variant: 'destructive' }); return; }
    if (selectedRanks.length === 0) { toast({ title: '직급을 1개 이상 선택하세요.', variant: 'destructive' }); return; }

    const items = selectedRanks.flatMap(rank => {
      const grades = rankGrades[rank]?.length ? rankGrades[rank] : [null];
      return grades.flatMap(grade =>
        selectedComponents.map(cid => ({ rank, rank_grade: grade, component_id: cid, amount: getAmount(rank, grade, cid) }))
      );
    });

    setSaving(true);
    try {
      if (isEdit && id) {
        const result = await updateSalaryTemplate(id, { ...formData, is_active: true, effective_from: effectiveFrom }, selectedRanks, items);
        if (!result) {
          toast({ title: '수정 실패', description: '적용 시작일은 이전 버전의 적용 시작일보다 뒤여야 합니다.', variant: 'destructive' });
          return;
        }
        toast({ title: '수정 완료' });
      } else {
        await addSalaryTemplate({ ...formData, is_active: true, effective_from: effectiveFrom }, selectedRanks, items);
        toast({ title: '저장 완료' });
      }
      window.dispatchEvent(new CustomEvent('salary-template-data-changed'));
      // 현재 탭 닫고 목록으로
      if (activeTabId) closeTab(activeTabId);
      else navigate('/salary/templates');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-gray-500">로딩 중...</p>
      </div>
    );
  }

  const rankItems = ranks.map(r => ({ value: r.name, label: r.rank_code || r.name } as BadgeSelectItem));
  const rankCodeOf = (rankName: string) => ranks.find(r => r.name === rankName)?.rank_code || rankName;
  // 표 렌더링 순서는 선택된 순서가 아니라 항상 직급 마스터 목록(display_order)을 기준으로 함.
  // (선택되었지만 마스터 목록에 없는 이름은 데이터 유실 방지를 위해 끝에 붙임)
  const orderedSelectedRanks = [
    ...ranks.filter(r => selectedRanks.includes(r.name)).map(r => r.name),
    ...selectedRanks.filter(name => !ranks.some(r => r.name === name)),
  ];

  const compGroups: BadgeSelectGroup[] = [
    {
      label: '급여 구성',
      color: 'blue' as const,
      items: components
        .filter(c => (c.component_type ?? 'earning') === 'earning')
        .map(c => ({
          value: c.id,
          label: c.name,
          sublabel: c.payment_type === 'deferred' ? '후불' : '매월',
          color: c.payment_type === 'deferred' ? 'amber' : 'blue',
        } as BadgeSelectItem)),
    },
    {
      label: '공제 항목',
      color: 'red' as const,
      items: components
        .filter(c => c.component_type === 'deduction')
        .map(c => ({ value: c.id, label: c.name, color: 'red' } as BadgeSelectItem)),
    },
  ].filter(g => g.items.length > 0);

  return (
    <div className="max-w-7xl mx-auto px-4 py-4">
      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {isEdit ? '급여 템플릿 수정' : '급여 템플릿 추가'}
              </CardTitle>
              <Button type="submit" size="sm" className="gap-1.5 h-8" disabled={saving || (isEdit && !!effectiveUntil)}>
                <Save className="h-4 w-4" />
                {saving ? '저장 중...' : '저장'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* 기본 정보 */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">템플릿명 *</Label>
                <Input
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="h-9 text-sm"
                  placeholder="Standard Officer 2025"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">통화</Label>
                <Select value={formData.currency} onValueChange={v => setFormData({ ...formData, currency: v })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">적용 시작일 {isEdit && <span className="text-gray-400 font-normal">(~ {effectiveUntil || '현재'})</span>}</Label>
                <Input
                  type="date"
                  value={effectiveFrom}
                  onChange={e => setEffectiveFrom(e.target.value)}
                  className="h-9 text-sm"
                  disabled={isEdit && !!effectiveUntil}
                />
              </div>
            </div>
            {isEdit && effectiveUntil && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                종료된 과거 버전입니다 (이력 열람 전용). 급여 인상 등 변경사항은 목록의 "갱신"으로 새 버전을 만들어 반영하세요.
              </p>
            )}
            {isEdit && !effectiveUntil && (
              <p className="text-xs text-gray-400">
                적용 시작일을 변경하면 이전 버전의 종료일도 하루 전으로 자동 조정됩니다.
              </p>
            )}

            {/* 직급 선택 */}
            <BadgeSelect
              label="적용 직급"
              items={rankItems}
              selected={selectedRanks}
              onChange={setSelectedRanks}
            />

            {/* 급여 항목 선택 */}
            <BadgeSelect
              label="급여 항목"
              groups={compGroups}
              selected={selectedComponents}
              onChange={setSelectedComponents}
            />

            {/* 금액 입력 표 */}
            {selectedRanks.length > 0 && selectedComponents.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-sm">직급별 금액 입력</Label>
                <div className="overflow-x-auto border rounded-md">
                  <table className="text-xs w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        <th className="sticky left-0 bg-gray-50 border-r p-1" />
                        {earningIds.length > 0 && (
                          <th colSpan={earningIds.length} className="text-center py-1 px-2 text-blue-700 font-semibold border-r bg-blue-50/50">
                            ← 급여 구성 항목
                          </th>
                        )}
                        {deductionIds.length > 0 && (
                          <th colSpan={deductionIds.length} className="text-center py-1 px-2 text-red-600 font-semibold border-r bg-red-50/50">
                            공제 항목
                          </th>
                        )}
                        <th colSpan={2} className="text-center py-1 px-2 text-gray-600 font-semibold bg-gray-100">
                          계산 결과
                        </th>
                      </tr>
                      <tr className="bg-gray-100">
                        <th className="text-left p-2 border-r font-semibold sticky left-0 bg-gray-100 min-w-32">직급</th>
                        {earningIds.map(cid => {
                          const comp = components.find(c => c.id === cid);
                          return (
                            <th key={cid} className="text-center p-1 border-r font-semibold min-w-24 bg-blue-50/30">
                              <div>{comp?.name}</div>
                              <div className={`text-[10px] font-normal ${comp?.payment_type === 'deferred' ? 'text-amber-500' : 'text-blue-400'}`}>
                                {comp?.payment_type === 'deferred' ? '후불성' : '매월'}
                              </div>
                            </th>
                          );
                        })}
                        {deductionIds.map((cid, i) => {
                          const comp = components.find(c => c.id === cid);
                          return (
                            <th key={cid} className={`text-center p-1 border-r font-semibold min-w-24 bg-red-50/30 ${i === 0 ? 'border-l-2 border-l-red-200' : ''}`}>
                              <div>{comp?.name}</div>
                              <div className="text-[10px] font-normal text-red-400">공제</div>
                            </th>
                          );
                        })}
                        <th className="text-center p-2 font-semibold min-w-24 bg-gray-100 border-l-2 border-l-gray-400">
                          <div className="text-[10px] font-bold text-gray-500">TW</div>
                          <div>월 급여 총액</div>
                        </th>
                        <th className="text-center p-2 font-semibold min-w-24 bg-blue-100 text-blue-800">
                          <div className="text-[10px] font-bold text-blue-500">AW</div>
                          <div>월 실지급액</div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderedSelectedRanks.map(rank => {
                        const grades = rankGrades[rank] || [];
                        const gradeRows: (string | null)[] = grades.length ? grades : [null];
                        return gradeRows.map((grade, i) => {
                          const isLast = i === gradeRows.length - 1;
                          return (
                            <tr key={rowKey(rank, grade)} className="border-t">
                              <td className="p-1.5 pl-2 border-r text-gray-700 bg-gray-50 sticky left-0 text-xs">
                                <div className="flex items-center gap-1 flex-wrap">
                                  <span className="font-medium">{rankCodeOf(rank)}</span>
                                  {grade && (
                                    <span className="inline-flex items-center gap-0.5 bg-white border rounded px-1.5 py-0.5 text-[10px]">
                                      {grade}
                                      <button type="button" onClick={() => removeGrade(rank, grade)} className="text-gray-400 hover:text-red-500">
                                        <X className="w-2.5 h-2.5" />
                                      </button>
                                    </span>
                                  )}
                                  {isLast && (
                                    <button type="button" onClick={() => addGrade(rank)} className="inline-flex items-center gap-0.5 text-[10px] text-blue-600 hover:underline shrink-0">
                                      <Plus className="w-2.5 h-2.5" />등급
                                    </button>
                                  )}
                                </div>
                              </td>
                              {earningIds.map(cid => (
                                <td key={cid} className="p-1 border-r">
                                  <Input type="number" value={getAmount(rank, grade, cid) || ''} onChange={e => setAmount(rank, grade, cid, parseInt(e.target.value) || 0)}
                                    className="h-7 text-xs text-right w-full" placeholder="0" min={0} />
                                </td>
                              ))}
                              {deductionIds.map((cid, di) => (
                                <td key={cid} className={`p-1 border-r bg-red-50/20 ${di === 0 ? 'border-l-2 border-l-red-200' : ''}`}>
                                  <Input type="number" value={getAmount(rank, grade, cid) || ''} onChange={e => setAmount(rank, grade, cid, parseInt(e.target.value) || 0)}
                                    className="h-7 text-xs text-right w-full" placeholder="0" min={0} />
                                </td>
                              ))}
                              <td className="p-2 text-right font-semibold bg-gray-50 border-l-2 border-l-gray-400">
                                {rowTotal(rank, grade).toLocaleString()}
                              </td>
                              <td className="p-2 text-right font-bold text-blue-700 bg-blue-50">
                                {rowMonthlyPay(rank, grade).toLocaleString()}
                              </td>
                            </tr>
                          );
                        });
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-400">월 실지급액 = 급여 구성 합계 − 후불성 − 공제</p>
              </div>
            )}

            {/* 설명 (맨 아래) */}
            <div className="space-y-1.5">
              <Label className="text-sm">설명</Label>
              <Textarea
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                rows={2}
                className="text-sm"
                placeholder="템플릿에 대한 설명을 입력하세요"
              />
            </div>

            {/* 할당된 선박 */}
            {isEdit && (
              <div>
                <Label className="text-sm flex items-center gap-1.5">
                  <ShipIcon className="h-3.5 w-3.5" />할당된 선박 ({assignedShips.length})
                </Label>
                <div className="mt-1.5">
                  {assignedShips.length === 0 ? (
                    <p className="text-xs text-gray-400">할당된 선박이 없습니다.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {assignedShips.map(name => (
                        <Badge key={name} variant="outline" className="text-xs">{name}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

          </CardContent>
        </Card>
      </form>

      {/* 갱신 히스토리 */}
      {isEdit && (
        <Card className="mt-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">갱신 히스토리 ({history.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {history.length === 0 ? (
              <p className="text-xs text-gray-400 py-2 text-center">이전 버전이 없습니다.</p>
            ) : (
              history.map(h => (
                <div key={h.id} className="border rounded-md">
                  <div className="w-full flex items-center justify-between p-2.5 text-sm hover:bg-gray-50">
                    <button type="button" onClick={() => toggleHistory(h)} className="flex items-center gap-1.5 flex-1 text-left">
                      {expandedHistoryId === h.id ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      {h.effective_from} ~ {h.effective_until}
                    </button>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">종료된 버전</Badge>
                      <button
                        type="button"
                        onClick={() => handleDeleteHistory(h)}
                        className="text-gray-400 hover:text-red-600"
                        title="이 버전 삭제"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  {expandedHistoryId === h.id && (
                    <div className="p-2.5 pt-0">
                      {historyDetails[h.id] ? (
                        <SalaryTemplateMatrixTable template={historyDetails[h.id]!} components={components} ranks={ranks} />
                      ) : (
                        <p className="text-xs text-gray-400 py-2 text-center">불러오는 중...</p>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
