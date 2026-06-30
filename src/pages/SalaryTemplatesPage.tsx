import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit2, Trash2, ChevronDown, ChevronUp, ArrowLeft, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { getCurrentUser } from '@/lib/store';
import {
  getSalaryTemplates,
  getSalaryTemplateWithItems,
  addSalaryTemplate,
  updateSalaryTemplate,
  deleteSalaryTemplate,
  getSalaryComponents,
  type SalaryTemplate,
  type SalaryTemplateWithItems,
  type SalaryComponent,
} from '@/lib/salary-store';

const RANKS = [
  'Master', 'Chief Officer', '2nd Officer', '3rd Officer',
  'Chief Engineer', '2nd Engineer', '3rd Engineer', '4th Engineer',
  'Bosun', 'AB', 'OS', 'Fitter', 'Oiler', 'Wiper',
  'Chief Cook', 'Messman',
];

const CURRENCIES = ['USD', 'EUR', 'KRW'];

type AmountMatrix = Record<string, Record<string, number>>;

export default function SalaryTemplatesPage() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<SalaryTemplate[]>([]);
  const [components, setComponents] = useState<SalaryComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [formView, setFormView] = useState<{ id?: string; record?: SalaryTemplateWithItems } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedData, setExpandedData] = useState<SalaryTemplateWithItems | null>(null);

  const [formData, setFormData] = useState({ name: '', description: '', currency: 'USD', is_active: true });
  const [selectedRanks, setSelectedRanks] = useState<string[]>([]);
  const [selectedComponents, setSelectedComponents] = useState<string[]>([]);
  const [amounts, setAmounts] = useState<AmountMatrix>({});

  useEffect(() => {
    const init = async () => {
      const user = await getCurrentUser();
      if (!user) { navigate('/login'); return; }
      if (!['ship_manager', 'ship_owner'].includes(user.role || '')) { navigate('/dashboard'); return; }
      await loadData();
    };
    init();
  }, [navigate]);

  const loadData = async () => {
    setLoading(true);
    const [tmpl, comp] = await Promise.all([getSalaryTemplates(), getSalaryComponents()]);
    setTemplates(tmpl);
    setComponents(comp);
    setLoading(false);
  };

  const toggleRank = (rank: string) => {
    setSelectedRanks(prev =>
      prev.includes(rank) ? prev.filter(r => r !== rank) : [...prev, rank]
    );
  };

  const toggleComponent = (compId: string) => {
    setSelectedComponents(prev =>
      prev.includes(compId) ? prev.filter(c => c !== compId) : [...prev, compId]
    );
  };

  const setAmount = (rank: string, compId: string, value: number) => {
    setAmounts(prev => ({
      ...prev,
      [rank]: { ...prev[rank], [compId]: value },
    }));
  };

  const getAmount = (rank: string, compId: string) => amounts[rank]?.[compId] || 0;

  // 급여 구성(earning) / 공제(deduction) 분리
  const earningIds = selectedComponents.filter(cid => {
    const comp = components.find(c => c.id === cid);
    return (comp?.component_type ?? 'earning') === 'earning';
  });
  const deductionIds = selectedComponents.filter(cid => {
    const comp = components.find(c => c.id === cid);
    return comp?.component_type === 'deduction';
  });

  // 월 급여 총액 = earning 합계
  const rankTotal = (rank: string) =>
    earningIds.reduce((s, cid) => s + getAmount(rank, cid), 0);

  // 후불성 합계
  const rankDeferred = (rank: string) =>
    earningIds.filter(cid => {
      const comp = components.find(c => c.id === cid);
      return comp?.payment_type === 'deferred';
    }).reduce((s, cid) => s + getAmount(rank, cid), 0);

  // 공제 합계
  const rankDeduction = (rank: string) =>
    deductionIds.reduce((s, cid) => s + getAmount(rank, cid), 0);

  // 월 실지급액
  const rankMonthlyPay = (rank: string) =>
    rankTotal(rank) - rankDeferred(rank) - rankDeduction(rank);

  const matrixToItems = () => {
    const result: { rank: string; component_id: string; amount: number }[] = [];
    for (const rank of selectedRanks) {
      for (const compId of selectedComponents) {
        result.push({ rank, component_id: compId, amount: getAmount(rank, compId) });
      }
    }
    return result;
  };

  const openAdd = () => {
    setFormData({ name: '', description: '', currency: 'USD', is_active: true });
    setSelectedRanks([]);
    setSelectedComponents([]);
    setAmounts({});
    setFormView({});
  };

  const openEdit = async (template: SalaryTemplate) => {
    const full = await getSalaryTemplateWithItems(template.id);
    if (!full) return;
    setFormData({ name: full.name, description: full.description || '', currency: full.currency, is_active: full.is_active });
    setSelectedRanks(full.ranks);
    const compIds = [...new Set(full.items.map(i => i.component_id))];
    setSelectedComponents(compIds);
    const mat: AmountMatrix = {};
    for (const item of full.items) {
      if (!mat[item.rank || '']) mat[item.rank || ''] = {};
      mat[item.rank || ''][item.component_id] = item.amount;
    }
    setAmounts(mat);
    setFormView({ id: full.id, record: full });
  };

  const toggleExpand = async (id: string) => {
    if (expandedId === id) { setExpandedId(null); setExpandedData(null); return; }
    const full = await getSalaryTemplateWithItems(id);
    setExpandedId(id);
    setExpandedData(full);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) { alert('템플릿명을 입력하세요.'); return; }
    const items = matrixToItems();
    if (formView?.id) {
      await updateSalaryTemplate(formView.id, formData, selectedRanks, items);
    } else {
      await addSalaryTemplate(formData, selectedRanks, items);
    }
    setFormView(null);
    await loadData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return;
    await deleteSalaryTemplate(id);
    await loadData();
  };

  if (loading) {
    return (
      <>
        <div className="flex items-center justify-center h-64">
          <p className="text-sm text-gray-500">로딩 중...</p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              {formView !== null ? (
                <>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" className="gap-1.5 h-8" onClick={() => setFormView(null)}>
                      <ArrowLeft className="h-4 w-4" />뒤로
                    </Button>
                    <CardTitle className="text-base">
                      {formView.id ? '급여 템플릿 수정' : '급여 템플릿 추가'}
                    </CardTitle>
                  </div>
                  <Button size="sm" className="gap-1.5 h-8" type="submit" form="salary-template-form">
                    <Save className="h-4 w-4" />저장
                  </Button>
                </>
              ) : (
                <>
                  <CardTitle className="text-base">급여 템플릿 관리</CardTitle>
                  <Button size="sm" className="gap-1.5 h-8" onClick={openAdd}>
                    <Plus className="h-4 w-4" />템플릿 추가
                  </Button>
                </>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {formView !== null ? (
              /* ── Inline Form ── */
              <form id="salary-template-form" onSubmit={handleSubmit}>
                <div className="space-y-4 py-2">

                  {/* 기본 정보 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-sm">템플릿명 *</Label>
                      <Input
                        value={formData.name}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                        className="h-9 text-sm"
                        placeholder="Standard Officer 2025"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">통화</Label>
                      <Select value={formData.currency} onValueChange={v => setFormData({ ...formData, currency: v })}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">설명</Label>
                    <Textarea
                      value={formData.description}
                      onChange={e => setFormData({ ...formData, description: e.target.value })}
                      rows={2}
                      className="text-sm"
                    />
                  </div>

                  {/* 직급 선택 */}
                  <div className="space-y-1.5">
                    <Label className="text-sm">적용 직급</Label>
                    <div className="grid grid-cols-4 gap-1 p-3 border rounded-md bg-gray-50">
                      {RANKS.map(rank => (
                        <label
                          key={rank}
                          className={`flex items-center gap-1.5 text-xs cursor-pointer px-2 py-1.5 rounded transition-colors
                            ${selectedRanks.includes(rank) ? 'bg-blue-100 text-blue-700 font-medium' : 'hover:bg-gray-100'}`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedRanks.includes(rank)}
                            onChange={() => toggleRank(rank)}
                            className="accent-blue-600"
                          />
                          {rank}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* 급여 항목 선택 */}
                  <div className="space-y-1.5">
                    <Label className="text-sm">급여 항목</Label>
                    <div className="p-3 border rounded-md bg-gray-50 space-y-2">
                      {/* 급여 구성 항목 */}
                      {components.filter(c => (c.component_type ?? 'earning') === 'earning').length > 0 && (
                        <div>
                          <div className="text-xs font-medium text-blue-700 mb-1">급여 구성</div>
                          <div className="flex flex-wrap gap-1">
                            {components.filter(c => (c.component_type ?? 'earning') === 'earning').map(comp => (
                              <label key={comp.id} className={`flex items-center gap-1 text-xs cursor-pointer px-2 py-1 rounded border transition-colors
                                ${selectedComponents.includes(comp.id) ? 'bg-blue-100 text-blue-700 border-blue-300 font-medium' : 'bg-white border-gray-200 hover:bg-gray-100'}`}>
                                <input type="checkbox" checked={selectedComponents.includes(comp.id)} onChange={() => toggleComponent(comp.id)} className="accent-blue-600" />
                                {comp.name}
                                <span className={`text-[10px] ${comp.payment_type === 'deferred' ? 'text-amber-500' : 'text-blue-400'}`}>
                                  {comp.payment_type === 'deferred' ? '후불' : '매월'}
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* 공제 항목 */}
                      {components.filter(c => c.component_type === 'deduction').length > 0 && (
                        <div>
                          <div className="text-xs font-medium text-red-600 mb-1">공제 항목</div>
                          <div className="flex flex-wrap gap-1">
                            {components.filter(c => c.component_type === 'deduction').map(comp => (
                              <label key={comp.id} className={`flex items-center gap-1 text-xs cursor-pointer px-2 py-1 rounded border transition-colors
                                ${selectedComponents.includes(comp.id) ? 'bg-red-100 text-red-700 border-red-300 font-medium' : 'bg-white border-gray-200 hover:bg-gray-100'}`}>
                                <input type="checkbox" checked={selectedComponents.includes(comp.id)} onChange={() => toggleComponent(comp.id)} className="accent-red-600" />
                                {comp.name}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 금액 입력 표 — 좌: 급여구성/공제 입력, 우: 계산결과 */}
                  {selectedRanks.length > 0 && selectedComponents.length > 0 && (
                    <div className="space-y-1.5">
                      <Label className="text-sm">직급별 금액 입력</Label>
                      <div className="overflow-x-auto border rounded-md">
                        <table className="text-xs w-full">
                          <thead>
                            {/* 그룹 헤더 */}
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
                            {/* 컬럼 헤더 */}
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
                              <th className="text-center p-2 font-semibold min-w-24 bg-gray-100 border-l-2 border-l-gray-400">월 급여 총액</th>
                              <th className="text-center p-2 font-semibold min-w-24 bg-blue-100 text-blue-800">월 실지급액</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedRanks.map(rank => (
                              <tr key={rank} className="border-t">
                                <td className="p-2 border-r font-medium text-gray-700 bg-gray-50 sticky left-0">{rank}</td>
                                {earningIds.map(cid => (
                                  <td key={cid} className="p-1 border-r">
                                    <Input type="number" value={getAmount(rank, cid) || ''} onChange={e => setAmount(rank, cid, parseInt(e.target.value) || 0)}
                                      className="h-7 text-xs text-right w-full" placeholder="0" min={0} />
                                  </td>
                                ))}
                                {deductionIds.map((cid, i) => (
                                  <td key={cid} className={`p-1 border-r bg-red-50/20 ${i === 0 ? 'border-l-2 border-l-red-200' : ''}`}>
                                    <Input type="number" value={getAmount(rank, cid) || ''} onChange={e => setAmount(rank, cid, parseInt(e.target.value) || 0)}
                                      className="h-7 text-xs text-right w-full" placeholder="0" min={0} />
                                  </td>
                                ))}
                                <td className="p-2 text-right font-semibold bg-gray-50 border-l-2 border-l-gray-400">
                                  {rankTotal(rank).toLocaleString()}
                                </td>
                                <td className="p-2 text-right font-bold text-blue-700 bg-blue-50">
                                  {rankMonthlyPay(rank).toLocaleString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-xs text-gray-400">월 실지급액 = 급여 구성 합계 − 후불성 − 공제</p>
                    </div>
                  )}

                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <Button type="button" variant="outline" size="sm" onClick={() => setFormView(null)} className="h-8">취소</Button>
                  <Button type="submit" size="sm" className="h-8">저장</Button>
                </div>
              </form>
            ) : (
              /* ── List View ── */
              <>
                {templates.length === 0 ? (
                  <div className="text-center py-6 text-sm text-gray-500">등록된 급여 템플릿이 없습니다.</div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">템플릿명</TableHead>
                          <TableHead className="text-xs">통화</TableHead>
                          <TableHead className="text-xs">설명</TableHead>
                          <TableHead className="text-xs">상태</TableHead>
                          <TableHead className="text-right text-xs">작업</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {templates.map(t => (
                          <>
                            <TableRow key={t.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openEdit(t)}>
                              <TableCell className="font-medium text-sm">
                                <button className="flex items-center gap-1 hover:text-blue-600" onClick={(e) => { e.stopPropagation(); toggleExpand(t.id); }}>
                                  {expandedId === t.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                  {t.name}
                                </button>
                              </TableCell>
                              <TableCell className="text-sm">{t.currency}</TableCell>
                              <TableCell className="text-gray-600 text-sm">{t.description || '-'}</TableCell>
                              <TableCell>
                                <Badge variant={t.is_active ? 'default' : 'secondary'} className="text-xs">
                                  {t.is_active ? '활성' : '비활성'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                                  <Button variant="ghost" size="sm" onClick={() => openEdit(t)} className="gap-1 h-7 px-2">
                                    <Edit2 className="h-3.5 w-3.5" /><span className="text-xs">수정</span>
                                  </Button>
                                  <Button variant="ghost" size="sm" onClick={() => handleDelete(t.id)} className="gap-1 h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50">
                                    <Trash2 className="h-3.5 w-3.5" /><span className="text-xs">삭제</span>
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>

                            {/* 상세 보기 */}
                            {expandedId === t.id && expandedData && (
                              <TableRow key={`${t.id}-exp`}>
                                <TableCell colSpan={5} className="bg-gray-50 p-4">
                                  <div className="text-xs font-medium mb-3 text-gray-600">직급별 급여 현황</div>
                                  {expandedData.ranks.length === 0 ? (
                                    <p className="text-xs text-gray-400">등록된 직급 없음</p>
                                  ) : (
                                    <div className="overflow-x-auto">
                                      <table className="text-xs border rounded w-full bg-white">
                                        <thead>
                                          <tr className="bg-gray-100">
                                            <th className="text-left p-2 border-r font-semibold sticky left-0 bg-gray-100">직급</th>
                                            {[...new Set(expandedData.items.map(i => i.component_id))].map(cid => {
                                              const comp = expandedData.items.find(i => i.component_id === cid)?.component;
                                              return (
                                                <th key={cid} className="text-right p-2 border-r font-semibold min-w-24">{comp?.name || '-'}</th>
                                              );
                                            })}
                                            <th className="text-right p-2 font-semibold min-w-20">합계</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {expandedData.ranks.map(r => {
                                            const compIds = [...new Set(expandedData.items.map(i => i.component_id))];
                                            return (
                                              <tr key={r} className="border-t">
                                                <td className="p-2 border-r font-medium text-gray-700 bg-gray-50 sticky left-0">{r}</td>
                                                {compIds.map(cid => {
                                                  const item = expandedData.items.find(i => i.rank === r && i.component_id === cid);
                                                  return (
                                                    <td key={cid} className="p-2 border-r text-right">
                                                      {item ? item.amount.toLocaleString() : '-'}
                                                    </td>
                                                  );
                                                })}
                                                <td className="p-2 text-right font-semibold text-blue-700">
                                                  {expandedData.items.filter(i => i.rank === r).reduce((s, i) => s + i.amount, 0).toLocaleString()}
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </TableCell>
                              </TableRow>
                            )}
                          </>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
