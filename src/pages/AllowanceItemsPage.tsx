import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Save, Coins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { usePermissions } from '@/hooks/usePermissions';
import ProtectedRoute from '@/components/ProtectedRoute';
import { allowanceService } from '@/services/allowance.service';
import { SortableTableRow } from '@/components/ui/sortable-table-row';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { AllowanceItem, AllowanceKind, AllowancePaymentBasis, AllowancePaymentMethod } from '@/types/allowance';

const BASIS_LABELS: Record<AllowancePaymentBasis, string> = { monthly: '매월 지급', on_embark_once: '승선월 1회', disembark_settlement: '하선 시 정산' };
const METHOD_LABELS: Record<AllowancePaymentMethod, string> = { ship_direct: '본선 직접지급', owner_billed: '선주 청구' };
const KIND_LABELS: Record<AllowanceKind, string> = { allowance: '수당', deduction: '공제' };

export default function AllowanceItemsPage() {
  const navigate = useNavigate();
  const permissions = usePermissions('allowance_items');
  const [items, setItems] = useState<AllowanceItem[]>([]);
  const [kindFilter, setKindFilter] = useState<AllowanceKind>('allowance');
  const [loading, setLoading] = useState(true);
  const [formView, setFormView] = useState<{ id?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    code: '', name: '', description: '',
    payment_basis: 'monthly' as AllowancePaymentBasis,
    payment_method: 'owner_billed' as AllowancePaymentMethod,
  });
  const [error, setError] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (!permissions.loading && !permissions.canView) { navigate('/dashboard'); return; }
    if (!permissions.loading) loadItems();
  }, [permissions.loading, permissions.canView, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadItems = async () => {
    setLoading(true);
    const data = await allowanceService.getItems(true);
    setItems(data);
    setLoading(false);
  };

  const tabItems = items.filter(i => i.kind === kindFilter);

  const openForm = (item?: AllowanceItem) => {
    if (item) {
      setFormData({ code: item.code, name: item.name, description: item.description || '', payment_basis: item.payment_basis, payment_method: item.payment_method });
      setFormView({ id: item.id });
    } else {
      setFormData({ code: '', name: '', description: '', payment_basis: 'monthly', payment_method: 'owner_billed' });
      setFormView({});
    }
    setError('');
  };

  const closeForm = () => { setFormView(null); setError(''); };

  const handleSave = async () => {
    setError('');
    if (!formData.code.trim() || !formData.name.trim()) { setError('코드와 이름을 입력해주세요.'); return; }
    try {
      setSaving(true);
      if (formView?.id) {
        await allowanceService.updateItem(formView.id, {
          name: formData.name, description: formData.description || undefined,
          payment_basis: formData.payment_basis, payment_method: formData.payment_method,
        });
        await loadItems();
        closeForm();
      } else {
        const created = await allowanceService.createItem({
          ...formData, kind: kindFilter, display_order: tabItems.length,
        });
        if (created) { await loadItems(); closeForm(); }
        else setError('추가에 실패했습니다.');
      }
    } catch { setError('오류가 발생했습니다.'); }
    finally { setSaving(false); }
  };

  const handleToggleActive = async (item: AllowanceItem) => {
    await allowanceService.updateItem(item.id, { is_active: !item.is_active });
    await loadItems();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 항목을 삭제하시겠습니까? 이 항목을 참조하는 템플릿 행도 함께 삭제됩니다.')) return;
    await allowanceService.deleteItem(id);
    await loadItems();
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = tabItems.findIndex(i => i.id === active.id);
    const newIndex = tabItems.findIndex(i => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const orderValues = tabItems.map(i => i.display_order);
    const reordered = arrayMove(tabItems, oldIndex, newIndex).map((i, idx) => ({ ...i, display_order: orderValues[idx] }));
    const updates = reordered.map(i => ({ id: i.id, display_order: i.display_order }));

    // filter()로 탭별 화면을 그리므로, display_order 값만 바꿔서는 화면 순서가 안 바뀐다 — 이
    // 탭에 속한 항목들을 실제로 새 순서(reordered)로 재배치해서 배열 자체를 갱신해야 한다.
    setItems(prev => {
      const others = prev.filter(i => i.kind !== kindFilter);
      return [...others, ...reordered].sort((a, b) => a.display_order - b.display_order);
    });

    try {
      await Promise.all(updates.map(u => allowanceService.updateItem(u.id, { display_order: u.display_order })));
    } catch {
      alert('순서 저장 중 오류가 발생했습니다.');
      await loadItems();
    }
  };

  if (loading) {
    return (
      <ProtectedRoute resource="allowance_items">
        <div className="flex items-center justify-center h-64">
          <p className="text-sm text-gray-500">로딩 중...</p>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute resource="allowance_items">
      <div className="max-w-7xl mx-auto px-4 py-4 space-y-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Coins className="w-5 h-5 text-muted-foreground" />수당/공제 항목 관리</h1>
          <p className="text-xs text-muted-foreground mt-1">
            급여표와 별개로 계약에 붙는 수당/공제(재고용수당 등)의 이름과 종류만 관리합니다.
            선주별 실제 금액·지급방식·지급주체는 수당/공제 템플릿 관리에서 설정합니다.
          </p>
        </div>

        <div className="flex gap-1.5">
          {(Object.entries(KIND_LABELS) as [AllowanceKind, string][]).map(([k, l]) => (
            <Button key={k} size="sm" variant={kindFilter === k ? 'default' : 'outline'} className="h-8" onClick={() => { setKindFilter(k); setFormView(null); }}>
              {l}
            </Button>
          ))}
        </div>

        {formView !== null && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">{formView.id ? `${KIND_LABELS[kindFilter]} 항목 수정` : `${KIND_LABELS[kindFilter]} 항목 추가`}</CardTitle>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={closeForm}>취소</Button>
                  <Button size="sm" onClick={handleSave} disabled={saving}>
                    <Save className="w-3.5 h-3.5 mr-1" />{saving ? '저장 중...' : '저장'}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">코드 *</Label>
                  <Input value={formData.code} disabled={!!formView.id} onChange={e => setFormData({ ...formData, code: e.target.value })} placeholder="예: rehire" className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">이름 *</Label>
                  <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="예: 재고용수당" className="h-8 text-sm" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">기본 제안 지급방식 / 지급주체</Label>
                <div className="flex gap-2 flex-wrap">
                  {(Object.entries(BASIS_LABELS) as [AllowancePaymentBasis, string][]).map(([v, l]) => (
                    <button key={v} onClick={() => setFormData({ ...formData, payment_basis: v })}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${formData.payment_basis === v ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}>
                      {l}
                    </button>
                  ))}
                  {kindFilter === 'allowance' && (Object.entries(METHOD_LABELS) as [AllowancePaymentMethod, string][]).map(([v, l]) => (
                    <button key={v} onClick={() => setFormData({ ...formData, payment_method: v })}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${formData.payment_method === v ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}>
                      {l}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400">템플릿에 이 항목을 추가할 때 기본으로 제안될 값일 뿐입니다. 실제 적용 값은 선주/플릿/선박별 템플릿에서 따로 지정합니다.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">설명</Label>
                <Textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} rows={2} className="text-sm" />
              </div>
              {error && <Alert variant="destructive"><AlertDescription className="text-xs">{error}</AlertDescription></Alert>}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">{KIND_LABELS[kindFilter]} 항목 목록</CardTitle>
              {formView === null && permissions.canCreate && (
                <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => openForm()}>
                  <Plus className="w-3.5 h-3.5" />항목 추가
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {tabItems.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-400">등록된 {KIND_LABELS[kindFilter]} 항목이 없습니다.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 text-xs"></TableHead>
                    <TableHead className="text-xs">코드</TableHead>
                    <TableHead className="text-xs">이름</TableHead>
                    <TableHead className="text-xs w-20 text-center">상태</TableHead>
                    <TableHead className="text-xs">설명</TableHead>
                    {(permissions.canEdit || permissions.canDelete) && <TableHead className="text-right text-xs w-28">작업</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={tabItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
                      {tabItems.map(item => (
                        <SortableTableRow key={item.id} id={item.id} onClick={() => openForm(item)}>
                          <TableCell className="text-xs font-mono text-muted-foreground">{item.code}</TableCell>
                          <TableCell className="font-medium text-sm">{item.name}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className={`text-xs ${item.is_active ? 'text-green-700 border-green-300' : 'text-gray-400'}`}>
                              {item.is_active ? '활성' : '비활성'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-gray-500 text-xs">{item.description || '-'}</TableCell>
                          {(permissions.canEdit || permissions.canDelete) && (
                            <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                              <div className="flex justify-end gap-1">
                                {permissions.canEdit && (
                                  <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => handleToggleActive(item)}>{item.is_active ? '비활성화' : '활성화'}</Button>
                                )}
                                {permissions.canDelete && (
                                  <Button variant="ghost" size="sm" onClick={() => handleDelete(item.id)} className="h-6 w-6 p-0 text-red-400 hover:text-red-600 hover:bg-red-50">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          )}
                        </SortableTableRow>
                      ))}
                    </SortableContext>
                  </DndContext>
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  );
}
