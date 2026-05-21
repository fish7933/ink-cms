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

// items 구조: { rank, component_id, amount, checked }
interface ItemRow {
  rank: string;
  component_id: string;
  amount: number;
  checked: boolean;
}

export default function SalaryTemplatesPage() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<SalaryTemplate[]>([]);
  const [components, setComponents] = useState<SalaryComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SalaryTemplateWithItems | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedData, setExpandedData] = useState<SalaryTemplateWithItems | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    currency: 'USD',
    is_active: true,
  });
  const [selectedRanks, setSelectedRanks] = useState<string[]>([]);
  // rank → component_id → { checked, amount }
  const [itemMatrix, setItemMatrix] = useState<Record<string, Record<string, { checked: boolean; amount: number }>>>({});

  useEffect(() => {
    const init = async () => {
      const user = await getCurrentUser();
      if (!user) { navigate('/login'); return; }
      if (!['ship_manager', 'ship_owner'].includes(user.role || '')) {
        navigate('/dashboard'); return;
      }
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

  // 직급 선택/해제 시 itemMatrix 업데이트
  const toggleRank = (rank: string) => {
    const isSelected = selectedRanks.includes(rank);
    if (isSelected) {
      setSelectedRanks(prev => prev.filter(r => r !== rank));
      setItemMatrix(prev => {
        const next = { ...prev };
        delete next[rank];
        return next;
      });
    } else {
      setSelectedRanks(prev => [...prev, rank]);
      // 새 직급 추가 시 모든 급여항목을 unchecked/0으로 초기화
      setItemMatrix(prev => ({
        ...prev,
        [rank]: Object.fromEntries(
          components.map(c => [c.id, { checked: false, amount: 0 }])
        ),
      }));
    }
  };

  // 항목 체크/해제
  const toggleComponent = (rank: string, compId: string) => {
    setItemMatrix(prev => ({
      ...prev,
      [rank]: {
        ...prev[rank],
        [compId]: {
          ...prev[rank]?.[compId],
          checked: !prev[rank]?.[compId]?.checked,
        },
      },
    }));
  };

  // 금액 변경
  const setAmount = (rank: string, compId: string, amount: number) => {
    setItemMatrix(prev => ({
      ...prev,
      [rank]: {
        ...prev[rank],
        [compId]: {
          ...prev[rank]?.[compId],
          amount,
        },
      },
    }));
  };

  // itemMatrix → items 배열 변환 (checked인 것만)
  const matrixToItems = () => {
    const result: { rank: string; component_id: string; amount: number }[] = [];
    for (const rank of selectedRanks) {
      const rankData = itemMatrix[rank] || {};
      for (const [compId, val] of Object.entries(rankData)) {
        if (val.checked) {
          result.push({ rank, component_id: compId, amount: val.amount });
        }
      }
    }
    return result;
  };

  const openAdd = () => {
    setEditingTemplate(null);
    setFormData({ name: '', description: '', currency: 'USD', is_active: true });
    setSelectedRanks([]);
    setItemMatrix({});
    setDialogOpen(true);
  };

  const openEdit = async (template: SalaryTemplate) => {
    const full = await getSalaryTemplateWithItems(template.id);
    if (!full) return;
    setEditingTemplate(full);
    setFormData({
      name: full.name,
      description: full.description || '',
      currency: full.currency,
      is_active: full.is_active,
    });
    setSelectedRanks(full.ranks);

    // 기존 항목으로 matrix 구성
    const matrix: Record<string, Record<string, { checked: boolean; amount: number }>> = {};
    for (const rank of full.ranks) {
      matrix[rank] = Object.fromEntries(
        components.map(c => {
          const existing = full.items.find(i => i.rank === rank && i.component_id === c.id);
          return [c.id, { checked: !!existing, amount: existing?.amount || 0 }];
        })
      );
    }
    setItemMatrix(matrix);
    setDialogOpen(true);
  };

  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedData(null);
      return;
    }
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
                <Plus className="h-4 w-4" />
                템플릿 추가
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {templates.length === 0 ? (
              <div className="text-center py-6 text-sm text-gray-500">
                등록된 급여 템플릿이 없습니다.
              </div>
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
                            <button
                              className="flex items-center gap-1 hover:text-blue-600"
                              onClick={() => toggleExpand(t.id)}
                            >
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
                          <TableRow key={`${t.id}-detail`}>
                            <TableCell colSpan={5} className="bg-gray-50 p-4">
                              <div className="text-xs font-medium mb-2 text-gray-600">직급별 급여 항목</div>
                              {expandedData.ranks.length === 0 ? (
                                <p className="text-xs text-gray-400">등록된 직급 없음</p>
                              ) : (
                                <div className="grid grid-cols-2 gap-4">
                                  {expandedData.ranks.map(rank => {
                                    const rankItems = expandedData.items.filter(i => i.rank === rank);
                                    return (
                                      <div key={rank} className="border rounded bg-white p-3">
                                        <div className="text-xs font-semibold text-gray-700 mb-2">{rank}</div>
                                        <table className="w-full text-xs">
                                          <thead><tr className="border-b"><th className="text-left pb-1">항목</th><th className="text-right pb-1">금액 ({t.currency})</th></tr></thead>
                                          <tbody>
                                            {rankItems.map(item => (
                                              <tr key={item.id} className="border-t">
                                                <td className="py-1">{item.component?.name || '-'}</td>
                                                <td className="py-1 text-right">{item.amount.toLocaleString()}</td>
                                              </tr>
                                            ))}
                                            <tr className="border-t font-semibold bg-gray-50">
                                              <td className="py-1">합계</td>
                                              <td className="py-1 text-right">{rankItems.reduce((s, i) => s + i.amount, 0).toLocaleString()}</td>
                                            </tr>
                                          </tbody>
                                        </table>
                                      </div>
                                    );
                                  })}
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
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
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
                  <Label className="text-sm">적용 직급 <span className="text-gray-400 font-normal">(선택하면 아래 급여 항목이 자동 생성됩니다)</span></Label>
                  <div className="grid grid-cols-4 gap-1.5 p-3 border rounded-md bg-gray-50">
                    {RANKS.map(rank => (
                      <label key={rank} className={`flex items-center gap-1.5 text-xs cursor-pointer px-2 py-1 rounded ${selectedRanks.includes(rank) ? 'bg-blue-100 text-blue-700 font-medium' : 'hover:bg-gray-100'}`}>
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

                {/* 직급별 급여 항목 */}
                {selectedRanks.length > 0 && (
                  <div className="space-y-1.5">
                    <Label className="text-sm">직급별 급여 항목 <span className="text-gray-400 font-normal">(항목 체크 후 금액 입력)</span></Label>
                    <div className="space-y-3">
                      {selectedRanks.map(rank => (
                        <div key={rank} className="border rounded-md overflow-hidden">
                          <div className="bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 flex items-center justify-between">
                            <span>{rank}</span>
                            <span className="text-gray-500 font-normal">
                              합계: {formData.currency} {
                                Object.entries(itemMatrix[rank] || {})
                                  .filter(([, v]) => v.checked)
                                  .reduce((s, [, v]) => s + (v.amount || 0), 0)
                                  .toLocaleString()
                              }
                            </span>
                          </div>
                          <div className="p-2 grid grid-cols-1 gap-1">
                            {components.map(comp => {
                              const val = itemMatrix[rank]?.[comp.id];
                              return (
                                <div key={comp.id} className={`flex items-center gap-2 px-2 py-1.5 rounded ${val?.checked ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                                  <input
                                    type="checkbox"
                                    checked={val?.checked || false}
                                    onChange={() => toggleComponent(rank, comp.id)}
                                    className="accent-blue-600 flex-shrink-0"
                                  />
                                  <span className="text-xs flex-1 text-gray-700">{comp.name}</span>
                                  {val?.checked && (
                                    <Input
                                      type="number"
                                      value={val.amount || ''}
                                      onChange={e => setAmount(rank, comp.id, parseInt(e.target.value) || 0)}
                                      className="h-7 text-xs w-32 text-right"
                                      placeholder="금액"
                                      min={0}
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
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