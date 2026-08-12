import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import {
  getPayrollEligibleEmployees,
  getEmployeeSalaryItems,
  addEmployeeSalaryItem,
  updateEmployeeSalaryItem,
  deleteEmployeeSalaryItem,
  getSalaryItemCatalog,
  updateEmployeeSalaryBankAccount,
} from '@/services/employee-salary.service';
import type { EmployeeSalaryItem, EmployeeSalaryItemCatalogEntry, EmployeeSalaryItemCategory, PayrollEmployee } from '@/types/employee-salary';

const CATEGORY_LABELS: Record<EmployeeSalaryItemCategory, string> = { base: '기본급', allowance: '수당', deduction: '공제' };
const CATEGORIES: EmployeeSalaryItemCategory[] = ['base', 'allowance', 'deduction'];

const fmt = (n: number) => n.toLocaleString('ko-KR');

// 직원별 급여표 — 회사 공통 급여 항목 카탈로그(EmployeeSalaryCatalogSection)에서 항목을 골라
// 개인별 금액을 입력한다. 카탈로그에 없는 일회성 항목은 "직접 입력"으로도 추가할 수 있다.
export default function EmployeeSalaryItemsSection() {
  const { toast } = useToast();
  const permissions = usePermissions('employee_salary');

  const [employees, setEmployees] = useState<PayrollEmployee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [items, setItems] = useState<EmployeeSalaryItem[]>([]);
  const [catalog, setCatalog] = useState<EmployeeSalaryItemCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [itemsLoading, setItemsLoading] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<EmployeeSalaryItem | null>(null);
  const [dialogCategory, setDialogCategory] = useState<EmployeeSalaryItemCategory>('base');
  const [useCustomName, setUseCustomName] = useState(false);
  const [selectedCatalogId, setSelectedCatalogId] = useState('');
  const [form, setForm] = useState({ name: '', amount: '' });
  const [saving, setSaving] = useState(false);

  // 급여 지급계좌 — 지출결의서 항목 적요("이름 (은행 계좌번호)") 자동 생성에 쓰인다.
  const [bankForm, setBankForm] = useState({ salary_bank_name: '', salary_bank_account: '' });
  const [bankSaving, setBankSaving] = useState(false);

  useEffect(() => {
    Promise.all([getPayrollEligibleEmployees(), getSalaryItemCatalog()]).then(([list, catalogList]) => {
      setEmployees(list);
      if (list[0]) setSelectedEmployeeId(list[0].id);
      setCatalog(catalogList);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!selectedEmployeeId) { setItems([]); return; }
    setItemsLoading(true);
    getEmployeeSalaryItems(selectedEmployeeId).then(list => { setItems(list); setItemsLoading(false); });
  }, [selectedEmployeeId]);

  useEffect(() => {
    const emp = employees.find(e => e.id === selectedEmployeeId);
    setBankForm({ salary_bank_name: emp?.salary_bank_name || '', salary_bank_account: emp?.salary_bank_account || '' });
  }, [selectedEmployeeId, employees]);

  const bankFormDirty = (() => {
    const emp = employees.find(e => e.id === selectedEmployeeId);
    return bankForm.salary_bank_name !== (emp?.salary_bank_name || '') || bankForm.salary_bank_account !== (emp?.salary_bank_account || '');
  })();

  const handleSaveBankAccount = async () => {
    if (!selectedEmployeeId) return;
    setBankSaving(true);
    try {
      const data = { salary_bank_name: bankForm.salary_bank_name.trim() || null, salary_bank_account: bankForm.salary_bank_account.trim() || null };
      await updateEmployeeSalaryBankAccount(selectedEmployeeId, data);
      setEmployees(prev => prev.map(e => (e.id === selectedEmployeeId ? { ...e, ...data } : e)));
      toast({ title: '급여 지급계좌가 저장되었습니다.' });
    } catch (e) {
      toast({ title: '저장 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setBankSaving(false);
    }
  };

  const reloadItems = () => {
    if (!selectedEmployeeId) return;
    getEmployeeSalaryItems(selectedEmployeeId).then(setItems);
  };

  const availableCatalogEntries = (category: EmployeeSalaryItemCategory) => {
    const usedCatalogIds = new Set(items.filter(i => i.category === category && i.catalog_id).map(i => i.catalog_id));
    return catalog.filter(c => c.category === category && !usedCatalogIds.has(c.id));
  };

  const openAddDialog = (category: EmployeeSalaryItemCategory) => {
    setEditingItem(null);
    setDialogCategory(category);
    const options = availableCatalogEntries(category);
    setUseCustomName(options.length === 0);
    setSelectedCatalogId(options[0]?.id || '');
    setForm({ name: '', amount: '' });
    setDialogOpen(true);
  };

  const openEditDialog = (item: EmployeeSalaryItem) => {
    setEditingItem(item);
    setDialogCategory(item.category);
    setUseCustomName(!item.catalog_id);
    setSelectedCatalogId(item.catalog_id || '');
    setForm({ name: item.name, amount: String(item.amount) });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const amount = Number(form.amount);
    if (!Number.isFinite(amount)) { toast({ title: '금액을 올바르게 입력해주세요.', variant: 'destructive' }); return; }

    let name = form.name.trim();
    let catalogId: string | null = null;
    let payGroup: EmployeeSalaryItem['pay_group'] = null;
    if (!editingItem || !editingItem.catalog_id) {
      if (useCustomName) {
        if (!name) { toast({ title: '항목명을 입력해주세요.', variant: 'destructive' }); return; }
      } else {
        const entry = catalog.find(c => c.id === selectedCatalogId);
        if (!entry) { toast({ title: '항목을 선택해주세요.', variant: 'destructive' }); return; }
        name = entry.name;
        catalogId = entry.id;
        payGroup = entry.pay_group;
      }
    } else {
      // 카탈로그 항목 편집 — 이름/구분은 카탈로그 기준을 그대로 유지하고 금액만 바꾼다.
      name = editingItem.name;
      catalogId = editingItem.catalog_id;
      payGroup = editingItem.pay_group;
    }

    try {
      setSaving(true);
      if (editingItem) {
        await updateEmployeeSalaryItem(editingItem.id, { amount });
      } else {
        const displayOrder = items.filter(i => i.category === dialogCategory).length;
        await addEmployeeSalaryItem({ user_id: selectedEmployeeId, catalog_id: catalogId, pay_group: payGroup, category: dialogCategory, name, amount, display_order: displayOrder, is_active: true });
      }
      toast({ title: '저장되었습니다.' });
      setDialogOpen(false);
      reloadItems();
    } catch (e) {
      toast({ title: '저장 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: EmployeeSalaryItem) => {
    if (!confirm(`"${item.name}" 항목을 삭제하시겠습니까?`)) return;
    try {
      await deleteEmployeeSalaryItem(item.id);
      toast({ title: '삭제되었습니다.' });
      reloadItems();
    } catch (e) {
      toast({ title: '삭제 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  const totalByCategory = (category: EmployeeSalaryItemCategory) => items.filter(i => i.category === category).reduce((sum, i) => sum + i.amount, 0);
  const netTotal = totalByCategory('base') + totalByCategory('allowance') - totalByCategory('deduction');

  if (loading) return <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;

  return (
    <div className="space-y-2">
      <div className="max-w-xs space-y-1">
        <Label className="text-xs">직원 선택</Label>
        <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="직원 선택" /></SelectTrigger>
          <SelectContent>
            {employees.length === 0
              ? <div className="px-2 py-1.5 text-sm text-gray-500">등록된 직원이 없습니다</div>
              : employees.map(e => <SelectItem key={e.id} value={e.id} className="text-sm">{e.name}{e.position_name ? ` · ${e.position_name}` : ''}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {selectedEmployeeId && (
        <div className="max-w-md space-y-1.5 rounded-md border p-2.5 bg-gray-50/50">
          <div className="flex items-center justify-between">
            <Label className="text-xs">급여 지급계좌 <span className="text-gray-400 font-normal">(지출결의서 적요에 자동으로 반영됩니다)</span></Label>
            {bankFormDirty && (
              <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={handleSaveBankAccount} disabled={bankSaving}>
                {bankSaving ? '저장 중...' : '계좌 저장'}
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input value={bankForm.salary_bank_name} onChange={e => setBankForm(prev => ({ ...prev, salary_bank_name: e.target.value }))} placeholder="은행명 (예: 우리은행)" className="h-8 text-xs" />
            <Input value={bankForm.salary_bank_account} onChange={e => setBankForm(prev => ({ ...prev, salary_bank_account: e.target.value }))} placeholder="계좌번호" className="h-8 text-xs" />
          </div>
        </div>
      )}

      {!selectedEmployeeId ? (
        <div className="text-center py-6 text-xs text-gray-400">직원을 선택해주세요.</div>
      ) : itemsLoading ? (
        <div className="flex items-center justify-center py-6"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" /></div>
      ) : (
        <>
          {CATEGORIES.map(category => {
            const categoryItems = items.filter(i => i.category === category);
            return (
              <div key={category} className="rounded-md border overflow-hidden">
                <div className="flex items-center justify-between bg-gray-50 border-b px-2.5 py-1.5">
                  <span className="text-xs font-semibold">{CATEGORY_LABELS[category]}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-mono ${category === 'deduction' ? 'text-red-600' : 'text-gray-700'}`}>
                      {category === 'deduction' ? '-' : ''}{fmt(totalByCategory(category))}원
                    </span>
                    {permissions.canCreate && (
                      <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs gap-1" onClick={() => openAddDialog(category)}>
                        <Plus className="w-3 h-3" />추가
                      </Button>
                    )}
                  </div>
                </div>
                {categoryItems.length === 0 ? (
                  <div className="text-center py-2.5 text-xs text-gray-400">등록된 항목이 없습니다.</div>
                ) : (
                  <table className="w-full text-xs">
                    <tbody>
                      {categoryItems.map(item => (
                        <tr key={item.id} className="border-b last:border-b-0 hover:bg-gray-50">
                          <td className="py-1 px-2.5">
                            {item.name}
                            {!item.catalog_id && <span className="ml-1.5 text-[10px] text-gray-400 align-middle">(직접입력)</span>}
                          </td>
                          <td className="py-1 px-2 text-right font-mono">{fmt(item.amount)}원</td>
                          <td className="py-1 px-2 text-right w-16">
                            <div className="flex justify-end gap-0.5">
                              {permissions.canEdit && (
                                <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-gray-400 hover:text-gray-700" onClick={() => openEditDialog(item)}>
                                  <Pencil className="w-3 h-3" />
                                </Button>
                              )}
                              {permissions.canDelete && (
                                <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-red-400 hover:text-red-600" onClick={() => handleDelete(item)}>
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}

          <div className="rounded-md border bg-blue-50 border-blue-200 px-2.5 py-1.5 flex items-center justify-between">
            <span className="text-xs font-semibold text-blue-900">월 예상 실지급액 (기본급+수당-공제)</span>
            <span className="text-sm font-bold font-mono text-blue-900">{fmt(netTotal)}원</span>
          </div>
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={o => !saving && setDialogOpen(o)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">
              {CATEGORY_LABELS[dialogCategory]} {editingItem ? '수정' : '추가'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {editingItem?.catalog_id ? (
              <div className="space-y-1.5">
                <Label className="text-xs">항목명</Label>
                <p className="text-sm px-3 py-2 rounded-md bg-gray-50 border">{editingItem.name}</p>
              </div>
            ) : (
              <>
                {!editingItem && (
                  <div className="flex items-center gap-2">
                    <Checkbox id="custom-name" checked={useCustomName} onCheckedChange={c => setUseCustomName(!!c)} disabled={saving} />
                    <Label htmlFor="custom-name" className="text-xs font-normal cursor-pointer">카탈로그에 없는 항목 직접 입력</Label>
                  </div>
                )}
                {useCustomName ? (
                  <div className="space-y-1.5">
                    <Label className="text-xs">항목명 *</Label>
                    <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="예: 이번 달 특별 수당" className="h-9 text-sm" disabled={saving} />
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label className="text-xs">항목 선택 *</Label>
                    {availableCatalogEntries(dialogCategory).length === 0 ? (
                      <p className="text-xs text-gray-400">추가할 수 있는 카탈로그 항목이 없습니다. "급여 항목 관리"에서 먼저 등록해주세요.</p>
                    ) : (
                      <Select value={selectedCatalogId} onValueChange={setSelectedCatalogId} disabled={saving}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="항목 선택" /></SelectTrigger>
                        <SelectContent>
                          {availableCatalogEntries(dialogCategory).map(c => <SelectItem key={c.id} value={c.id} className="text-sm">{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}
              </>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">금액 *</Label>
              <Input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0" className="h-9 text-sm" disabled={saving} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setDialogOpen(false)} disabled={saving}>취소</Button>
            <Button type="button" size="sm" onClick={handleSave} disabled={saving}>{saving ? '저장 중...' : '저장'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
