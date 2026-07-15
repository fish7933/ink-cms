import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { SortableTableRow } from '@/components/ui/sortable-table-row';
import { useDragReorder } from '@/hooks/useDragReorder';
import { DndContext } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import {
  getSalaryItemCatalog,
  addSalaryItemCatalogEntry,
  updateSalaryItemCatalogEntry,
  deactivateSalaryItemCatalogEntry,
} from '@/services/employee-salary.service';
import type { EmployeeSalaryItemCatalogEntry, EmployeeSalaryItemCategory, EmployeeSalaryItemPayGroup } from '@/types/employee-salary';

const CATEGORY_LABELS: Record<EmployeeSalaryItemCategory, string> = { base: '고정급여(기본급)', allowance: '수당/비과세/기타급여', deduction: '공제' };
const CATEGORIES: EmployeeSalaryItemCategory[] = ['base', 'allowance', 'deduction'];
const PAY_GROUP_LABELS: Record<EmployeeSalaryItemPayGroup, string> = { variable: '수당(변동)', nontax: '비과세', other: '기타급여' };

// 회사 공통 급여 항목 카탈로그 관리 — 여기서 정의한 항목을 "직원별 급여표"에서 골라 쓴다.
// 선원 급여의 salary_components 카탈로그와 같은 성격(src/pages/ShorePositionsPage.tsx와 동일한
// Table + 드래그 재정렬 + Dialog 패턴). 삭제는 항상 소프트 삭제(비활성화).
export default function EmployeeSalaryCatalogSection() {
  const { toast } = useToast();
  const permissions = usePermissions('employee_salary');

  const [entries, setEntries] = useState<EmployeeSalaryItemCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<EmployeeSalaryItemCatalogEntry | null>(null);
  const [dialogCategory, setDialogCategory] = useState<EmployeeSalaryItemCategory>('base');
  const [form, setForm] = useState<{ name: string; pay_group: EmployeeSalaryItemPayGroup }>({ name: '', pay_group: 'variable' });
  const [saving, setSaving] = useState(false);

  const loadData = () => { setLoading(true); getSalaryItemCatalog().then(list => { setEntries(list); setLoading(false); }); };
  useEffect(loadData, []);

  const openAddDialog = (category: EmployeeSalaryItemCategory) => {
    setEditingEntry(null);
    setDialogCategory(category);
    setForm({ name: '', pay_group: 'variable' });
    setDialogOpen(true);
  };

  const openEditDialog = (entry: EmployeeSalaryItemCatalogEntry) => {
    setEditingEntry(entry);
    setDialogCategory(entry.category);
    setForm({ name: entry.name, pay_group: entry.pay_group || 'variable' });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast({ title: '항목명을 입력해주세요.', variant: 'destructive' }); return; }
    try {
      setSaving(true);
      const payGroup = dialogCategory === 'allowance' ? form.pay_group : null;
      if (editingEntry) {
        await updateSalaryItemCatalogEntry(editingEntry.id, { name: form.name.trim(), pay_group: payGroup });
      } else {
        const categoryEntries = entries.filter(e => e.category === dialogCategory);
        const nextOrder = categoryEntries.length > 0 ? Math.max(...categoryEntries.map(e => e.display_order)) + 1 : 0;
        await addSalaryItemCatalogEntry({ category: dialogCategory, pay_group: payGroup, name: form.name.trim(), display_order: nextOrder, is_active: true });
      }
      toast({ title: '저장되었습니다.' });
      setDialogOpen(false);
      loadData();
    } catch (e) {
      toast({ title: '저장 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (entry: EmployeeSalaryItemCatalogEntry) => {
    if (!confirm(`"${entry.name}" 항목을 삭제하시겠습니까? 이미 직원에게 배정된 항목은 그대로 유지되고, 새로 선택할 수 없게 됩니다.`)) return;
    try {
      await deactivateSalaryItemCatalogEntry(entry.id);
      toast({ title: '삭제되었습니다.' });
      loadData();
    } catch (e) {
      toast({ title: '삭제 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  if (loading) return <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;

  return (
    <div className="space-y-2">
      {CATEGORIES.map(category => (
        <CategoryCatalogTable
          key={category}
          category={category}
          entries={entries.filter(e => e.category === category)}
          setEntries={updated => setEntries(prev => [...prev.filter(e => e.category !== category), ...updated])}
          canCreate={permissions.canCreate}
          canEdit={permissions.canEdit}
          canDelete={permissions.canDelete}
          onAdd={() => openAddDialog(category)}
          onEdit={openEditDialog}
          onDelete={handleDeactivate}
          onReorderError={loadData}
        />
      ))}

      <Dialog open={dialogOpen} onOpenChange={o => !saving && setDialogOpen(o)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">{CATEGORY_LABELS[dialogCategory]} 항목 {editingEntry ? '수정' : '추가'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs">항목명 *</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="예: 직책수당" className="h-9 text-sm" disabled={saving} />
            </div>
            {dialogCategory === 'allowance' && (
              <div className="space-y-1.5">
                <Label className="text-xs">구분</Label>
                <Select value={form.pay_group} onValueChange={v => setForm({ ...form, pay_group: v as EmployeeSalaryItemPayGroup })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PAY_GROUP_LABELS) as EmployeeSalaryItemPayGroup[]).map(g => (
                      <SelectItem key={g} value={g} className="text-sm">{PAY_GROUP_LABELS[g]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
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

interface CategoryCatalogTableProps {
  category: EmployeeSalaryItemCategory;
  entries: EmployeeSalaryItemCatalogEntry[];
  setEntries: (entries: EmployeeSalaryItemCatalogEntry[]) => void;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onAdd: () => void;
  onEdit: (entry: EmployeeSalaryItemCatalogEntry) => void;
  onDelete: (entry: EmployeeSalaryItemCatalogEntry) => void;
  onReorderError: () => void;
}

function CategoryCatalogTable({ category, entries, setEntries, canCreate, canEdit, canDelete, onAdd, onEdit, onDelete, onReorderError }: CategoryCatalogTableProps) {
  const { sensors, collisionDetection, handleDragEnd } = useDragReorder(
    entries,
    setEntries,
    (id, display_order) => updateSalaryItemCatalogEntry(id, { display_order }),
    onReorderError
  );

  return (
    <div className="rounded-md border overflow-hidden">
      <div className="flex items-center justify-between bg-gray-50 border-b px-2.5 py-1.5">
        <span className="text-xs font-semibold">{CATEGORY_LABELS[category]}</span>
        {canCreate && (
          <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs gap-1" onClick={onAdd}>
            <Plus className="w-3 h-3" />추가
          </Button>
        )}
      </div>
      {entries.length === 0 ? (
        <div className="text-center py-2.5 text-xs text-gray-400">등록된 항목이 없습니다.</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs h-7 px-2 w-8"></TableHead>
              <TableHead className="text-xs h-7 px-2">항목명</TableHead>
              {category === 'allowance' && <TableHead className="text-xs h-7 px-2 w-24">구분</TableHead>}
              <TableHead className="text-right text-xs h-7 px-2 w-16">작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragEnd={handleDragEnd}>
              <SortableContext items={entries.map(e => e.id)} strategy={verticalListSortingStrategy}>
                {entries.map(entry => (
                  <SortableTableRow key={entry.id} id={entry.id} onClick={() => canEdit && onEdit(entry)}>
                    <TableCell className="text-xs font-medium py-1 px-2">{entry.name}</TableCell>
                    {category === 'allowance' && (
                      <TableCell className="text-xs text-gray-500 py-1 px-2">{entry.pay_group ? PAY_GROUP_LABELS[entry.pay_group] : '수당(변동)'}</TableCell>
                    )}
                    <TableCell className="text-right py-1 px-2" onClick={e => e.stopPropagation()}>
                      {canDelete && (
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-400 hover:text-red-600" onClick={() => onDelete(entry)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </TableCell>
                  </SortableTableRow>
                ))}
              </SortableContext>
            </DndContext>
          </TableBody>
        </Table>
      )}
    </div>
  );
}
