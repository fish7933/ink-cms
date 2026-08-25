import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { getCurrentUser } from '@/lib/store';
import ProtectedRoute from '@/components/ProtectedRoute';
import { usePermissions } from '@/hooks/usePermissions';
import {
  getManagementFeeItems,
  addManagementFeeItem,
  updateManagementFeeItem,
  deleteManagementFeeItem,
  type ManagementFeeItem,
} from '@/lib/management-fee-store';
import { SortableTableRow } from '@/components/ui/sortable-table-row';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';

const BILLING_BASIS_LABEL: Record<string, string> = {
  monthly: '월정기(일할계산)',
  one_time: '1회성(승선월 전액)',
  actual_cost: '실비(수기입력)',
};

const BILLING_BASIS_COLOR: Record<string, string> = {
  monthly: 'bg-blue-50 text-blue-700 border-blue-200',
  one_time: 'bg-purple-50 text-purple-700 border-purple-200',
  actual_cost: 'bg-gray-50 text-gray-600 border-gray-200',
};

export default function ManagementFeeItemsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<ManagementFeeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [formView, setFormView] = useState<{ id?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    display_order: 0,
    default_billing_basis: 'monthly' as 'monthly' | 'one_time' | 'actual_cost',
  });
  const [error, setError] = useState('');

  const permissions = usePermissions('management_fee_items');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    const loadUser = async () => {
      const user = await getCurrentUser();
      if (!user) { navigate('/login'); return; }
      if (!['ship_manager', 'ship_owner', 'admin', 'system_admin'].includes(user.role ?? '')) { navigate('/dashboard'); return; }
      loadItems();
    };
    loadUser();
  }, [navigate]);

  const loadItems = async () => {
    setLoading(true);
    const data = await getManagementFeeItems();
    setItems(data);
    setLoading(false);
  };

  const openForm = (item?: ManagementFeeItem) => {
    if (item) {
      setFormData({
        name: item.name,
        description: item.description || '',
        display_order: item.display_order,
        default_billing_basis: item.default_billing_basis,
      });
      setFormView({ id: item.id });
    } else {
      setFormData({
        name: '',
        description: '',
        display_order: items.length + 1,
        default_billing_basis: 'monthly',
      });
      setFormView({});
    }
    setError('');
  };

  const closeForm = () => {
    setFormView(null);
    setError('');
  };

  const handleSave = async () => {
    setError('');
    if (!formData.name.trim()) { setError('항목명을 입력해주세요.'); return; }
    try {
      setSaving(true);
      if (formView?.id) {
        const updated = await updateManagementFeeItem(formView.id, formData);
        if (updated) { await loadItems(); closeForm(); }
        else setError('수정에 실패했습니다.');
      } else {
        const added = await addManagementFeeItem({ ...formData, is_active: true });
        if (added) { await loadItems(); closeForm(); }
        else setError('추가에 실패했습니다.');
      }
    } catch { setError('오류가 발생했습니다.'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 청구 항목을 삭제하시겠습니까?')) return;
    const success = await deleteManagementFeeItem(id);
    if (success) await loadItems();
    else alert('삭제에 실패했습니다.');
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex(c => c.id === active.id);
    const newIndex = items.findIndex(c => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const orderValues = items.map(c => c.display_order);
    const reordered = arrayMove(items, oldIndex, newIndex);
    const updates = reordered.map((c, i) => ({ id: c.id, display_order: orderValues[i] }));

    setItems(prev => prev.map(c => {
      const u = updates.find(u => u.id === c.id);
      return u ? { ...c, display_order: u.display_order } : c;
    }));

    try {
      await Promise.all(updates.map(u => updateManagementFeeItem(u.id, { display_order: u.display_order })));
    } catch {
      alert('순서 저장 중 오류가 발생했습니다.');
      await loadItems();
    }
  };

  if (loading) {
    return (
      <ProtectedRoute resource="management_fee_items">
        <div className="flex items-center justify-center h-64">
          <p className="text-sm text-gray-500">로딩 중...</p>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute resource="management_fee_items">
      <div className="max-w-7xl mx-auto px-4 py-4 space-y-4">

        {/* 인라인 폼 */}
        {formView !== null && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">
                  {formView.id ? '청구 항목 수정' : '청구 항목 추가'}
                </CardTitle>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={closeForm}>취소</Button>
                  <Button size="sm" onClick={handleSave} disabled={saving}>
                    <Save className="w-3.5 h-3.5 mr-1" />
                    {saving ? '저장 중...' : '저장'}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">항목명 *</Label>
                <Input
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="예: 대리점비, 통신비, 선발비, 사회보장기금"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">기본 과금 방식</Label>
                <div className="flex gap-2">
                  {(['monthly', 'one_time', 'actual_cost'] as const).map(basis => (
                    <button
                      key={basis}
                      onClick={() => setFormData({ ...formData, default_billing_basis: basis })}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                        formData.default_billing_basis === basis
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      {BILLING_BASIS_LABEL[basis]}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400">템플릿에 항목 추가 시 기본으로 제안될 값이며, 실제 적용 방식은 템플릿 조건 행마다 따로 지정할 수 있습니다.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">설명</Label>
                <Textarea
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="항목에 대한 설명을 입력하세요"
                  rows={2}
                  className="text-sm"
                />
              </div>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription className="text-xs">{error}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

        {/* 목록 카드 */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">관리비 청구 항목</CardTitle>
              {formView === null && permissions.canCreate && (
                <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => openForm()}>
                  <Plus className="w-3.5 h-3.5" />
                  항목 추가
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {items.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-400">
                등록된 관리비 청구 항목이 없습니다. (예: 대리점비, 통신비, 선발비, 사회보장기금)
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 text-xs"></TableHead>
                    <TableHead className="text-xs">항목명</TableHead>
                    <TableHead className="text-xs w-40">기본 과금 방식</TableHead>
                    <TableHead className="text-xs">설명</TableHead>
                    {(permissions.canEdit || permissions.canDelete) && (
                      <TableHead className="text-right text-xs w-16">작업</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={items.map(c => c.id)} strategy={verticalListSortingStrategy}>
                      {items.map(item => (
                        <SortableTableRow key={item.id} id={item.id} onClick={() => openForm(item)}>
                          <TableCell className="font-medium text-sm">{item.name}</TableCell>
                          <TableCell>
                            <span className={`text-xs px-2 py-0.5 rounded border ${BILLING_BASIS_COLOR[item.default_billing_basis]}`}>
                              {BILLING_BASIS_LABEL[item.default_billing_basis]}
                            </span>
                          </TableCell>
                          <TableCell className="text-gray-500 text-xs">{item.description || '-'}</TableCell>
                          {(permissions.canEdit || permissions.canDelete) && (
                            <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                              {permissions.canDelete && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDelete(item.id)}
                                  className="h-6 w-6 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              )}
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
