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
  const [items, setItems] = useState<{ rank: string; component_id: string; amount: number }[]>([]);

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

  const openAdd = () => {
    setEditingTemplate(null);
    setFormData({ name: '', description: '', currency: 'USD', is_active: true });
    setSelectedRanks([]);
    setItems([]);
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
    setItems(full.items.map(i => ({
      rank: i.rank || '',
      component_id: i.component_id,
      amount: i.amount,
    })));
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

  const addItem = () => {
    setItems([...items, { rank: selectedRanks[0] || '', component_id: components[0]?.id || '', amount: 0 }]);
  };

  const removeItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  const updateItem = (idx: number, field: string, value: string | number) => {
    setItems(items.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) { alert('템플릿명을 입력하세요.'); return; }
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
                                expandedData.ranks.map(rank => {
                                  const rankItems = expandedData.items.filter(i => i.rank === rank);
                                  return (
                                    <div key={rank} className="mb-3">
                                      <div className="text-xs font-semibold text-gray-700 mb-1">{rank}</div>
                                      <table className="w-full text-xs border rounded">
                                        <thead><tr className="bg-gray-100"><th className="text-left p-1.5">항목</th><th className="text-right p-1.5">금액 ({t.currency})</th></tr></thead>
                                        <tbody>
                                          {rankItems.map(item => (
                                            <tr key={item.id} className="border-t">
                                              <td className="p-1.5">{item.component?.name || '-'}</td>
                                              <td className="p-1.5 text-right">{item.amount.toLocaleString()}</td>
                                            </tr>
                                          ))}
                                          <tr className="border-t font-semibold bg-gray-50">
                                            <td className="p-1.5">합계</td>
                                            <td className="p-1.5 text-right">{rankItems.reduce((s, i) => s + i.amount, 0).toLocaleString()}</td>
                                          </tr>
                                        </tbody>
                                      </table>
                                    </div>
                                  );
                                })
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
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base">
                {editingTemplate ? '급여 템플릿 수정' : '급여 템플릿 추가'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4 py-2">
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
                <div className="space-y-1.5">
                  <Label className="text-sm">적용 직급</Label>
                  <div className="grid grid-cols-4 gap-1.5 p-2 border rounded-md">
                    {RANKS.map(rank => (
                      <label key={rank} className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedRanks.includes(rank)}
                          onChange={e => setSelectedRanks(e.target.checked ? [...selectedRanks, rank] : selectedRanks.filter(r => r !== rank))}
                        />
                        {rank}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">급여 항목</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addItem} className="h-7 text-xs">
                      <Plus className="h-3 w-3 mr-1" />항목 추가
                    </Button>
                  </div>
                  {items.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-2">항목 추가 버튼을 눌러 급여 항목을 추가하세요.</p>
                  ) : (
                    <div className="space-y-2">
                      {items.map((item, idx) => (
                        <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                          <div className="col-span-3">
                            <Select value={item.rank} onValueChange={v => updateItem(idx, 'rank', v)}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="직급" /></SelectTrigger>
                              <SelectContent>{selectedRanks.map(r => <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-4">
                            <Select value={item.component_id} onValueChange={v => updateItem(idx, 'component_id', v)}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="항목" /></SelectTrigger>
                              <SelectContent>{components.map(c => <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-4">
                            <Input type="number" value={item.amount} onChange={e => updateItem(idx, 'amount', parseInt(e.target.value) || 0)} className="h-8 text-xs" placeholder="금액" />
                          </div>
                          <div className="col-span-1">
                            <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(idx)} className="h-8 w-8 p-0 text-red-500">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter>
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