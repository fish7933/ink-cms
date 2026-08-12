import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Save, Edit2, Coins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SortableTableRow } from '@/components/ui/sortable-table-row';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getCashRegisters, addCashRegister, updateCashRegister, deleteCashRegister } from '@/services/accounting-cash-register.service';
import { getUsers } from '@/lib/store';
import type { CashRegisterWithBalance } from '@/types/accounting';
import type { User } from '@/types/models';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';

const NONE = '_none';
const STAFF_ROLES = ['ship_manager', 'admin', 'system_admin'];
const CURRENCIES = ['KRW', 'USD', 'EUR', 'JPY'];

const emptyForm = {
  name: '', holder_user_id: '', location: '', currency: 'KRW', opening_balance: '0', opening_date: '', memo: '', is_active: true,
};

export default function CashRegisterManagementPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const permissions = usePermissions('accounting_cash_registers');
  const [registers, setRegisters] = useState<CashRegisterWithBalance[]>([]);
  const [staff, setStaff] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [formView, setFormView] = useState<{ id?: string } | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (!permissions.loading && !permissions.canView) navigate('/dashboard');
  }, [permissions.loading, permissions.canView, navigate]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [registerList, users] = await Promise.all([getCashRegisters(), getUsers()]);
      setRegisters(registerList);
      setStaff(users.filter(u => STAFF_ROLES.includes(u.role)));
    } catch (e) {
      toast({ title: '시재 목록을 불러오지 못했습니다.', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const openForm = (r?: CashRegisterWithBalance) => {
    setError('');
    if (r) {
      setForm({
        name: r.name, holder_user_id: r.holder_user_id || '', location: r.location || '',
        currency: r.currency || 'KRW', opening_balance: String(r.opening_balance), opening_date: r.opening_date || '',
        memo: r.memo || '', is_active: r.is_active,
      });
    } else {
      setForm(emptyForm);
    }
    setFormView({ id: r?.id });
  };
  const closeForm = () => { setFormView(null); setError(''); };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('시재명을 입력해주세요.'); return; }
    try {
      setSaving(true);
      const data = {
        name: form.name.trim(), holder_user_id: form.holder_user_id || null, location: form.location.trim() || null,
        currency: form.currency, opening_balance: parseFloat(form.opening_balance) || 0, opening_date: form.opening_date || null,
        memo: form.memo.trim() || null, is_active: form.is_active,
      };
      if (formView?.id) {
        await updateCashRegister(formView.id, data);
      } else {
        const maxOrder = registers.length > 0 ? Math.max(...registers.map(r => r.display_order)) : 0;
        await addCashRegister({ ...data, display_order: maxOrder + 1 });
      }
      await loadData();
      closeForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (r: CashRegisterWithBalance) => {
    if (!confirm(`'${r.name}' 시재를 삭제하시겠습니까? 연결된 거래 내역은 삭제되지 않고 시재 연결만 해제됩니다.`)) return;
    try { await deleteCashRegister(r.id); await loadData(); }
    catch (e) { toast({ title: '삭제 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }); }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = registers.findIndex(r => r.id === active.id);
    const newIndex = registers.findIndex(r => r.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(registers, oldIndex, newIndex).map((r, i) => ({ ...r, display_order: i + 1 }));
    setRegisters(reordered);
    try {
      await Promise.all(reordered.map(r => updateCashRegister(r.id, { display_order: r.display_order })));
    } catch {
      toast({ title: '순서 저장 중 오류가 발생했습니다.', variant: 'destructive' });
      await loadData();
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
      <div className="flex items-center gap-2">
        <Coins className="w-6 h-6" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">현금관리</h1>
          <p className="text-sm text-gray-500">시재금(현금함)을 등록하고 잔액을 관리합니다. 현재잔액은 개설잔액에 금전출납의 현금 거래를 반영해 자동 계산됩니다.</p>
        </div>
      </div>

      {formView !== null && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">{formView.id ? '시재 수정' : '시재 추가'}</CardTitle>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={closeForm} disabled={saving}>취소</Button>
                <Button size="sm" onClick={handleSave} disabled={saving}><Save className="w-3.5 h-3.5 mr-1" />{saving ? '저장 중...' : '저장'}</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">시재명 *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="예: 총무부 시재금" className="h-9 text-sm" /></div>
              <div className="space-y-1.5"><Label className="text-xs">보관 위치</Label><Input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="예: 본사 총무팀" className="h-9 text-sm" /></div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">담당자</Label>
                <Select value={form.holder_user_id || NONE} onValueChange={v => setForm({ ...form, holder_user_id: v === NONE ? '' : v })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="선택 안 함" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>선택 안 함</SelectItem>
                    {staff.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">통화</Label>
                <Select value={form.currency} onValueChange={v => setForm({ ...form, currency: v })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label className="text-xs">개설잔액</Label><Input type="number" step="0.01" value={form.opening_balance} onChange={e => setForm({ ...form, opening_balance: e.target.value })} className="h-9 text-sm" /></div>
              <div className="space-y-1.5"><Label className="text-xs">기준일</Label><Input type="date" value={form.opening_date} onChange={e => setForm({ ...form, opening_date: e.target.value })} className="h-9 text-sm" /></div>
            </div>
            <label className="flex items-center gap-2">
              <Checkbox checked={form.is_active} onCheckedChange={c => setForm({ ...form, is_active: c === true })} />
              <span className="text-sm">사용중</span>
            </label>
            <div className="space-y-1.5"><Label className="text-xs">메모</Label><Textarea value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })} rows={2} className="text-sm resize-none" /></div>
            {error && <Alert variant="destructive"><AlertDescription className="text-xs">{error}</AlertDescription></Alert>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">시재 목록</CardTitle>
              <CardDescription className="text-xs mt-1">{registers.length}개 시재</CardDescription>
            </div>
            {formView === null && permissions.canCreate && (
              <Button size="sm" className="gap-1.5 h-8" onClick={() => openForm()}><Plus className="w-4 h-4" />시재 추가</Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {registers.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-400">등록된 시재가 없습니다.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 text-xs"></TableHead>
                  <TableHead className="text-xs">시재명</TableHead>
                  <TableHead className="text-xs">보관 위치</TableHead>
                  <TableHead className="text-xs">담당자</TableHead>
                  <TableHead className="text-xs">통화</TableHead>
                  <TableHead className="text-right text-xs">현재잔액</TableHead>
                  <TableHead className="text-xs w-16">상태</TableHead>
                  <TableHead className="text-right text-xs w-20">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={registers.map(r => r.id)} strategy={verticalListSortingStrategy}>
                    {registers.map(r => (
                      <SortableTableRow key={r.id} id={r.id} onClick={() => openForm(r)}>
                        <TableCell className="text-sm font-medium">{r.name}</TableCell>
                        <TableCell className="text-sm">{r.location || '-'}</TableCell>
                        <TableCell className="text-sm">{r.holder_user_name || '-'}</TableCell>
                        <TableCell className="text-sm font-mono text-gray-500">{r.currency}</TableCell>
                        <TableCell className="text-right text-sm font-mono font-semibold">{r.current_balance.toLocaleString()} {r.currency}</TableCell>
                        <TableCell>
                          {r.is_active
                            ? <Badge className="bg-green-100 text-green-700 text-xs">사용중</Badge>
                            : <Badge variant="outline" className="text-xs text-gray-500">중지</Badge>}
                        </TableCell>
                        <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            {permissions.canEdit && <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openForm(r)}><Edit2 className="h-3.5 w-3.5" /></Button>}
                            {permissions.canDelete && <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-600" onClick={() => handleDelete(r)}><Trash2 className="h-3.5 w-3.5" /></Button>}
                          </div>
                        </TableCell>
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
  );
}
