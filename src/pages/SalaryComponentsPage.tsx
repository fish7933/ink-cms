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
import { Badge } from '@/components/ui/badge';
import { getCurrentUser } from '@/lib/store';
import ProtectedRoute from '@/components/ProtectedRoute';
import { usePermissions } from '@/hooks/usePermissions';
import {
  getSalaryComponents,
  addSalaryComponent,
  updateSalaryComponent,
  deleteSalaryComponent,
  type SalaryComponent,
} from '@/lib/salary-store';
import { SortableTableRow } from '@/components/ui/sortable-table-row';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';

type TabType = 'earning' | 'deduction';

const PAYMENT_TYPE_LABEL: Record<string, string> = {
  monthly: '매월',
  deferred: '후불성',
};

const PAYMENT_TYPE_COLOR: Record<string, string> = {
  monthly: 'bg-blue-50 text-blue-700 border-blue-200',
  deferred: 'bg-amber-50 text-amber-700 border-amber-200',
};

const OWNER_BILLING_LABEL: Record<string, string> = {
  monthly: '매월',
  on_disembark: '하선월',
};

const OWNER_BILLING_COLOR: Record<string, string> = {
  monthly: 'bg-teal-50 text-teal-700 border-teal-200',
  on_disembark: 'bg-orange-50 text-orange-700 border-orange-200',
};

export default function SalaryComponentsPage() {
  const navigate = useNavigate();
  const [components, setComponents] = useState<SalaryComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('earning');
  const [formView, setFormView] = useState<{ id?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    display_order: 0,
    component_type: 'earning' as 'earning' | 'deduction',
    payment_type: 'monthly' as 'monthly' | 'deferred',
    owner_billing_basis: 'monthly' as 'monthly' | 'on_disembark',
    skip_deduction_on_partial_month: false,
  });
  const [error, setError] = useState('');

  const permissions = usePermissions('salary_components');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    const loadUser = async () => {
      const user = await getCurrentUser();
      if (!user) { navigate('/login'); return; }
      if (!['ship_manager', 'ship_owner', 'admin', 'system_admin'].includes(user.role ?? '')) { navigate('/dashboard'); return; }
      loadComponents();
    };
    loadUser();
  }, [navigate]);

  const loadComponents = async () => {
    setLoading(true);
    const data = await getSalaryComponents();
    setComponents(data);
    setLoading(false);
  };

  const tabComponents = components.filter(c => c.component_type === activeTab);

  // 자동 계산
  const earningComponents = components.filter(c => c.component_type === 'earning');
  const deductionComponents = components.filter(c => c.component_type === 'deduction');
  const monthlyEarningCount = earningComponents.filter(c => c.payment_type === 'monthly').length;
  const deferredEarningCount = earningComponents.filter(c => c.payment_type === 'deferred').length;

  const openForm = (component?: SalaryComponent) => {
    if (component) {
      setFormData({
        name: component.name,
        description: component.description || '',
        display_order: component.display_order,
        component_type: component.component_type,
        payment_type: component.payment_type,
        owner_billing_basis: component.owner_billing_basis || 'monthly',
        skip_deduction_on_partial_month: component.skip_deduction_on_partial_month || false,
      });
      setFormView({ id: component.id });
    } else {
      const typeComponents = components.filter(c => c.component_type === activeTab);
      setFormData({
        name: '',
        description: '',
        display_order: typeComponents.length + 1,
        component_type: activeTab,
        payment_type: 'monthly',
        owner_billing_basis: 'monthly',
        skip_deduction_on_partial_month: false,
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
        const updated = await updateSalaryComponent(formView.id, formData);
        if (updated) { await loadComponents(); closeForm(); }
        else setError('수정에 실패했습니다.');
      } else {
        const added = await addSalaryComponent({ ...formData, is_active: true });
        if (added) { await loadComponents(); closeForm(); }
        else setError('추가에 실패했습니다.');
      }
    } catch { setError('오류가 발생했습니다.'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 항목을 삭제하시겠습니까?')) return;
    const success = await deleteSalaryComponent(id);
    if (success) await loadComponents();
    else alert('삭제에 실패했습니다.');
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = tabComponents.findIndex(c => c.id === active.id);
    const newIndex = tabComponents.findIndex(c => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const orderValues = tabComponents.map(c => c.display_order);
    const reordered = arrayMove(tabComponents, oldIndex, newIndex);
    const updates = reordered.map((c, i) => ({ id: c.id, display_order: orderValues[i] }));

    setComponents(prev => prev.map(c => {
      const u = updates.find(u => u.id === c.id);
      return u ? { ...c, display_order: u.display_order } : c;
    }));

    try {
      await Promise.all(updates.map(u => updateSalaryComponent(u.id, { display_order: u.display_order })));
    } catch {
      alert('순서 저장 중 오류가 발생했습니다.');
      await loadComponents();
    }
  };

  if (loading) {
    return (
      <ProtectedRoute resource="salary_components">
        <div className="flex items-center justify-center h-64">
          <p className="text-sm text-gray-500">로딩 중...</p>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute resource="salary_components">
      <div className="max-w-7xl mx-auto px-4 py-4 space-y-4">

        {/* 상단 탭 */}
        <div className="flex border-b">
          <button
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'earning'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => { setActiveTab('earning'); setFormView(null); }}
          >
            급여 구성
            <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
              {earningComponents.length}
            </span>
          </button>
          <button
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'deduction'
                ? 'border-red-500 text-red-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => { setActiveTab('deduction'); setFormView(null); }}
          >
            공제 항목
            <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
              {deductionComponents.length}
            </span>
          </button>
        </div>

        {/* 인라인 폼 */}
        {formView !== null && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">
                  {formView.id
                    ? (activeTab === 'earning' ? '급여 항목 수정' : '공제 항목 수정')
                    : (activeTab === 'earning' ? '급여 항목 추가' : '공제 항목 추가')}
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
                  placeholder={activeTab === 'earning' ? '예: 기본급, 시간외 수당' : '예: 본선불, 노조비'}
                  className="h-8 text-sm"
                />
              </div>
              {activeTab === 'earning' && (
                <div className="space-y-1.5">
                  <Label className="text-xs">지급 방식 (선원 기준)</Label>
                  <div className="flex gap-2">
                    {(['monthly', 'deferred'] as const).map(type => (
                      <button
                        key={type}
                        onClick={() => setFormData({ ...formData, payment_type: type })}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                          formData.payment_type === type
                            ? type === 'monthly'
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-amber-500 text-white border-amber-500'
                            : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                        }`}
                      >
                        {type === 'monthly' ? '매월 지급' : '후불성 (하선 후)'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {activeTab === 'earning' && (
                <div className="space-y-1.5">
                  <Label className="text-xs">선주 청구 시점</Label>
                  <div className="flex gap-2">
                    {(['monthly', 'on_disembark'] as const).map(basis => (
                      <button
                        key={basis}
                        onClick={() => setFormData({ ...formData, owner_billing_basis: basis })}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                          formData.owner_billing_basis === basis
                            ? basis === 'monthly'
                              ? 'bg-teal-600 text-white border-teal-600'
                              : 'bg-orange-500 text-white border-orange-500'
                            : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                        }`}
                      >
                        {OWNER_BILLING_LABEL[basis]}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400">
                    선원 지급 방식과 독립적인 설정입니다. 예: L/P는 선원에게는 하선 후 지급(후불성)이지만 선주에게는 매달 적립분을 청구합니다.
                  </p>
                </div>
              )}
              {activeTab === 'deduction' && (
                <label className="flex items-start gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.skip_deduction_on_partial_month}
                    onChange={e => setFormData({ ...formData, skip_deduction_on_partial_month: e.target.checked })}
                    className="mt-0.5 accent-red-600 w-3.5 h-3.5"
                  />
                  <span>
                    <span className="font-medium">승/하선 등 부분월에는 공제 안 함</span>
                    <span className="block text-gray-400 mt-0.5">체크하면 일할계산 대신 승선/하선 달(일부만 근무한 달)에는 이 항목을 0원으로 처리합니다.</span>
                  </span>
                </label>
              )}
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
              <CardTitle className="text-sm">
                {activeTab === 'earning' ? '급여 구성 항목' : '공제 항목'}
              </CardTitle>
              {formView === null && permissions.canCreate && (
                <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => openForm()}>
                  <Plus className="w-3.5 h-3.5" />
                  항목 추가
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {tabComponents.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-400">
                {activeTab === 'earning'
                  ? '등록된 급여 구성 항목이 없습니다.'
                  : '등록된 공제 항목이 없습니다. (예: 본선불, 노조비)'}
              </div>
            ) : (
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 text-xs"></TableHead>
                    <TableHead className="text-xs">항목명</TableHead>
                    {activeTab === 'earning' && (
                      <TableHead className="text-xs w-24 whitespace-nowrap">지급 방식</TableHead>
                    )}
                    {activeTab === 'earning' && (
                      <TableHead className="text-xs w-24 whitespace-nowrap">선주 청구</TableHead>
                    )}
                    {activeTab === 'deduction' && (
                      <TableHead className="text-xs w-32">부분월 처리</TableHead>
                    )}
                    <TableHead className="text-xs">설명</TableHead>
                    {(permissions.canEdit || permissions.canDelete) && (
                      <TableHead className="text-right text-xs w-16">작업</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={tabComponents.map(c => c.id)} strategy={verticalListSortingStrategy}>
                      {tabComponents.map(component => (
                        <SortableTableRow key={component.id} id={component.id} onClick={() => openForm(component)}>
                          <TableCell className="font-medium text-sm">{component.name}</TableCell>
                          {activeTab === 'earning' && (
                            <TableCell>
                              <span className={`text-xs px-2 py-0.5 rounded border whitespace-nowrap ${PAYMENT_TYPE_COLOR[component.payment_type]}`}>
                                {PAYMENT_TYPE_LABEL[component.payment_type]}
                              </span>
                            </TableCell>
                          )}
                          {activeTab === 'earning' && (
                            <TableCell>
                              <span className={`text-xs px-2 py-0.5 rounded border whitespace-nowrap ${OWNER_BILLING_COLOR[component.owner_billing_basis || 'monthly']}`}>
                                {OWNER_BILLING_LABEL[component.owner_billing_basis || 'monthly']}
                              </span>
                            </TableCell>
                          )}
                          {activeTab === 'deduction' && (
                            <TableCell>
                              {component.skip_deduction_on_partial_month ? (
                                <span className="text-xs px-2 py-0.5 rounded border bg-gray-50 text-gray-600 border-gray-200">부분월 미공제</span>
                              ) : (
                                <span className="text-xs text-gray-400">일할계산</span>
                              )}
                            </TableCell>
                          )}
                          <TableCell className="text-gray-500 text-xs">{component.description || '-'}</TableCell>
                          {(permissions.canEdit || permissions.canDelete) && (
                            <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                              {permissions.canDelete && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDelete(component.id)}
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
              </div>
            )}
          </CardContent>
        </Card>

        {/* 급여 구조 요약 */}
        <Card className="border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-600">급여 구조 요약</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-700">{monthlyEarningCount}</div>
                <div className="text-xs text-blue-600 mt-0.5">매월 지급 항목</div>
              </div>
              <div className="text-center p-3 bg-amber-50 rounded-lg">
                <div className="text-2xl font-bold text-amber-700">{deferredEarningCount}</div>
                <div className="text-xs text-amber-600 mt-0.5">후불성 항목 (하선 후)</div>
              </div>
              <div className="text-center p-3 bg-red-50 rounded-lg">
                <div className="text-2xl font-bold text-red-700">{deductionComponents.length}</div>
                <div className="text-xs text-red-600 mt-0.5">공제 항목</div>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0"></span>
                <span><strong>월 실지급액</strong> = 매월 지급 항목 합계 − 공제 항목 합계</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-gray-400 shrink-0"></span>
                <span>후불성 항목은 월 급여 총액에는 포함되지만 매월 실지급에서는 제외됩니다.</span>
              </div>
              <div className="flex items-center gap-2 pt-1 text-gray-400">
                <span className="w-2 h-2 rounded-full bg-gray-300 shrink-0"></span>
                <span>실제 금액은 <strong>급여 템플릿</strong>에서 항목별 금액 설정 후 자동 계산됩니다.</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  );
}
