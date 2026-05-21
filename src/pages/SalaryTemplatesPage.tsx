import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit2, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { getCurrentUser } from '@/lib/store';
import Layout from '@/components/Layout';
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

// amounts[rank][component_id] = number
type AmountMatrix = Record<string, Record<string, number>>;

export default function SalaryTemplatesPage() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<SalaryTemplate[]>([]);
  const [components, setComponents] = useState<SalaryComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SalaryTemplateWithItems | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedData, setExpandedData] = useState<SalaryTemplateWithItems | null>(null);

  const [formData, setFormData] = useState({ name: '', description: '', currency: 'USD', is_active: true });
  const [selectedRanks, setSelectedRanks] = useState<string[]>([]);
  const [selectedComponents, setSelectedComponents] = useState<string[]>([]);
  // amounts[rank][component_id] = 금액
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

  const getAmount = (rank: string, compId: string) =>
    amounts[rank]?.[compId] || 0;

  const rankTotal = (rank: string) =>
    selectedComponents.reduce((s, cid) => s + getAmount(rank, cid), 0);

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
    setEditingTemplate(null);
    setFormData({ name: '', description: '', currency: 'USD', is_active: true });
    setSelectedRanks([]);
    setSelectedComponents([]);
    setAmounts({});
    setDialogOpen(true);
  };

  const openEdit = async (template: SalaryTemplate) => {
    const full = await getSalaryTemplateWithItems(template.id);
    if (!full) return;
    setEditingTemplate(full);
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
    setDialogOpen(true);
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
    if (editingTemplate) {
      await updateSalaryTemplate(editingTemplate.id, formData, selectedRanks, items);
    } else {
      await addSalaryTemplate(formData, selectedRanks, items);
    }
    setDialogOpen(false);
    await loadData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return;
    await deleteSalaryTemplate(id);
    await loadData();
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <p className="text-sm text-gray-500">로딩 중...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">급여 템플릿 관리</CardTitle>
              <Button size="sm" className="gap-1.5 h-8" onClick={openAdd}>
                <Plus className="h-4 w-4" />템플릿 추가
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
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
                        <TableRow key={t.id}>
                          <TableCell className="font-medium text-sm">
                            <button className="flex items-center gap-1 hover:text-blue-600" onClick={() => toggleExpand(t.id)}>
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
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="sm" onClick={() => openEdit(t)} className="gap-1 h-7 px-2">
                                <Edit2 className="h-3.5 w-3.5" /><span className="text-xs">수정</span>
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDelete(t.id)} className="gap-1 h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50">
                                <Trash2 className="h-3.5 w-3.5" /><span className="text-xs">삭제</span>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
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
                                        <th className="text-left p-2 border-r font-semibold">급여 항목</th>
                                        {expandedData.ranks.map(r => (
                                          <th key={r} className="text-right p-2 border-r font-semibold min-w-24">{r}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {[...new Set(expandedData.items.map(i => i.component_id))].map(cid => {
                                        const comp = expandedData.items.find(i => i.component_id === cid)?.component;
                                        return (
                                          <tr key={cid} className="border-t">
                                            <td className="p-2 border-r text-gray-700">{comp?.name || '-'}</td>
                                            {expandedData.ranks.map(r => {
                                              const item = expandedData.items.find(i => i.rank === r && i.component_id === cid);
                                              return (
                                                <td key={r} className="p-2 border-r text-right">
                                                  {item ? item.amount.toLocaleString() : '-'}
                                                </td>
                                              );
                                            })}
                                          </tr>
                                        );
                                      })}
                                      <tr className="border-t bg-gray-50 font-semibold">
                                        <td className="p-2 border-r">합계</td>
                                        {expandedData.ranks.map(r => (
                                          <td key={r} className="p-2 border-r text-right">
                                            {expandedData.items.filter(i => i.rank === r).reduce((s, i) => s + i.amount, 0).toLocaleString()}
                                          </td>
                                        ))}
                                      </tr>
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
          </CardContent>
        </Card>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base">
                {editingTemplate ? '급여 템플릿 수정' : '급여 템플릿 추가'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4 py-2">

                {/* 기본 정보 */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-sm">템플릿명 *</Label>
                    <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="h-9 text-sm" placeholder="Standard Officer 2025" />
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
                  <Textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} rows={2} className="text-sm" />
                </div>

                {/* 직급 선택 */}
                <div className="space-y-1.5">
                  <Label className="text-sm">적용 직급</Label>
                  <div className="grid grid-cols-4 gap-1 p-3 border rounded-md bg-gray-50">
                    {RANKS.map(rank => (
                      <label key={rank} className={`flex items-center gap-1.5 text-xs cursor-pointer px-2 py-1.5 rounded transition-colors ${selectedRanks.includes(rank) ? 'bg-blue-100 text-blue-700 font-medium' : 'hover:bg-gray-100'}`}>
                        <input type="checkbox" checked={selectedRanks.includes(rank)} onChange={() => toggleRank(rank)} className="accent-blue-600" />
                        {rank}
                      </label>
                    ))}
                  </div>
                </div>

                {/* 급여 항목 선택 */}
                <div className="space-y-1.5">
                  <Label className="text-sm">급여 항목</Label>
                  <div className="flex flex-wrap gap-1 p-3 border rounded-md bg-gray-50">
                    {components.map(comp => (
                      <label key={comp.id} className={`flex items-center gap-1.5 text-xs cursor-pointer px-2 py-1.5 rounded border transition-colors ${selectedComponents.includes(comp.id) ? 'bg-blue-100 text-blue-700 border-blue-300 font-medium' : 'bg-white border-gray-200 hover:bg-gray-100'}`}>
                        <input type="checkbox" checked={selectedComponents.includes(comp.id)} onChange={() => toggleComponent(comp.id)} className="accent-blue-600" />
                        {comp.name}
                      </label>
                    ))}
                  </div>
                </div>

                {/* 금액 입력 표 */}
                {selectedRanks.length > 0 && selectedComponents.length > 0 && (
                  <div className="space-y-1.5">
                    <Label className="text-sm">직급별 금액 입력</Label>
                    <div className="overflow-x-auto border rounded-md">
                      <table className="text-xs w-full">
                        <thead>
                          <tr className="bg-gray-100">
                            <th className="text-left p-2 border-r font-semibold min-w-32">급여 항목</th>
                            {selectedRanks.map(r => (
                              <th key={r} className="text-center p-2 border-r font-semibold min-w-28">{r}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {selectedComponents.map(cid => {
                            const comp = components.find(c => c.id === cid);
                            return (
                              <tr key={cid} className="border-t">
                                <td className="p-2 border-r font-medium text-gray-700 bg-gray-50">{comp?.name}</td>
                                {selectedRanks.map(rank => (
                                  <td key={rank} className="p-1 border-r">
                                    <Input
                                      type="number"
                                      value={getAmount(rank, cid) || ''}
                                      onChange={e => setAmount(rank, cid, parseInt(e.target.value) || 0)}
                                      className="h-7 text-xs text-right w-full"
                                      placeholder="0"
                                      min={0}
                                    />
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                          <tr className="border-t bg-gray-50 font-semibold">
                            <td className="p-2 border-r text-gray-700">합계</td>
                            {selectedRanks.map(rank => (
                              <td key={rank} className="p-2 border-r text-right text-blue-700">
                                {rankTotal(rank).toLocaleString()}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

              </div>
              <DialogFooter className="mt-4">
                <Button type="button" variant="outline" size="sm" onClick={() => setDialogOpen(false)} className="h-8">취소</Button>
                <Button type="submit" size="sm" className="h-8">저장</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}