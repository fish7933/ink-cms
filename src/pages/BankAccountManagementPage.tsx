import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Save, Edit2, Landmark } from 'lucide-react';
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
import { getBankAccounts, addBankAccount, updateBankAccount, deleteBankAccount } from '@/services/accounting-bank-account.service';
import type { BankAccountWithBalance } from '@/types/accounting';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';

const CURRENCIES = ['KRW', 'USD', 'EUR', 'JPY'];

const emptyForm = {
  bank_name: '', account_name: '', account_number: '', account_holder: '',
  account_type: '', currency: 'KRW', opening_balance: '0', opening_date: '', memo: '', is_active: true,
};

export default function BankAccountManagementPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const permissions = usePermissions('accounting_bank_accounts');
  const [accounts, setAccounts] = useState<BankAccountWithBalance[]>([]);
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
    setAccounts(await getBankAccounts());
    setLoading(false);
  };

  const openForm = (a?: BankAccountWithBalance) => {
    setError('');
    if (a) {
      setForm({
        bank_name: a.bank_name, account_name: a.account_name, account_number: a.account_number, account_holder: a.account_holder,
        account_type: a.account_type || '', currency: a.currency, opening_balance: String(a.opening_balance), opening_date: a.opening_date || '',
        memo: a.memo || '', is_active: a.is_active,
      });
    } else {
      setForm(emptyForm);
    }
    setFormView({ id: a?.id });
  };
  const closeForm = () => { setFormView(null); setError(''); };

  const handleSave = async () => {
    if (!form.bank_name.trim() || !form.account_name.trim() || !form.account_number.trim() || !form.account_holder.trim()) {
      setError('은행명, 계좌명, 계좌번호, 예금주는 필수입니다.');
      return;
    }
    try {
      setSaving(true);
      const data = {
        bank_name: form.bank_name.trim(), account_name: form.account_name.trim(), account_number: form.account_number.trim(),
        account_holder: form.account_holder.trim(), account_type: form.account_type.trim() || null, currency: form.currency,
        opening_balance: parseFloat(form.opening_balance) || 0, opening_date: form.opening_date || null,
        memo: form.memo.trim() || null, is_active: form.is_active,
      };
      if (formView?.id) {
        await updateBankAccount(formView.id, data);
      } else {
        const maxOrder = accounts.length > 0 ? Math.max(...accounts.map(a => a.display_order)) : 0;
        await addBankAccount({ ...data, display_order: maxOrder + 1 });
      }
      await loadData();
      closeForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (a: BankAccountWithBalance) => {
    if (!confirm(`'${a.account_name}' 계좌를 삭제하시겠습니까? 연결된 거래 내역은 삭제되지 않고 계좌 연결만 해제됩니다.`)) return;
    try { await deleteBankAccount(a.id); await loadData(); }
    catch (e) { toast({ title: '삭제 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }); }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = accounts.findIndex(a => a.id === active.id);
    const newIndex = accounts.findIndex(a => a.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(accounts, oldIndex, newIndex).map((a, i) => ({ ...a, display_order: i + 1 }));
    setAccounts(reordered);
    try {
      await Promise.all(reordered.map(a => updateBankAccount(a.id, { display_order: a.display_order })));
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
        <Landmark className="w-6 h-6" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">통장관리</h1>
          <p className="text-sm text-gray-500">회사가 보유한 은행 계좌를 등록하고 잔액을 관리합니다. 현재잔액은 개설잔액에 금전출납 거래를 반영해 자동 계산됩니다.</p>
        </div>
      </div>

      {formView !== null && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">{formView.id ? '계좌 수정' : '계좌 추가'}</CardTitle>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={closeForm} disabled={saving}>취소</Button>
                <Button size="sm" onClick={handleSave} disabled={saving}><Save className="w-3.5 h-3.5 mr-1" />{saving ? '저장 중...' : '저장'}</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">은행명 *</Label><Input value={form.bank_name} onChange={e => setForm({ ...form, bank_name: e.target.value })} className="h-9 text-sm" /></div>
              <div className="space-y-1.5"><Label className="text-xs">계좌명(용도) *</Label><Input value={form.account_name} onChange={e => setForm({ ...form, account_name: e.target.value })} placeholder="예: 운영자금 계좌" className="h-9 text-sm" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">계좌번호 *</Label><Input value={form.account_number} onChange={e => setForm({ ...form, account_number: e.target.value })} className="h-9 text-sm" /></div>
              <div className="space-y-1.5"><Label className="text-xs">예금주 *</Label><Input value={form.account_holder} onChange={e => setForm({ ...form, account_holder: e.target.value })} className="h-9 text-sm" /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">계좌종류</Label><Input value={form.account_type} onChange={e => setForm({ ...form, account_type: e.target.value })} placeholder="예: 보통예금" className="h-9 text-sm" /></div>
              <div className="space-y-1.5">
                <Label className="text-xs">통화</Label>
                <Select value={form.currency} onValueChange={v => setForm({ ...form, currency: v })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label className="text-xs">개설잔액</Label><Input type="number" step="0.01" value={form.opening_balance} onChange={e => setForm({ ...form, opening_balance: e.target.value })} className="h-9 text-sm" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">기준일</Label><Input type="date" value={form.opening_date} onChange={e => setForm({ ...form, opening_date: e.target.value })} className="h-9 text-sm" /></div>
              <label className="flex items-center gap-2 pt-6">
                <Checkbox checked={form.is_active} onCheckedChange={c => setForm({ ...form, is_active: c === true })} />
                <span className="text-sm">사용중</span>
              </label>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">메모</Label><Textarea value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })} rows={2} className="text-sm resize-none" /></div>
            {error && <Alert variant="destructive"><AlertDescription className="text-xs">{error}</AlertDescription></Alert>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">계좌 목록</CardTitle>
              <CardDescription className="text-xs mt-1">{accounts.length}개 계좌</CardDescription>
            </div>
            {formView === null && permissions.canCreate && (
              <Button size="sm" className="gap-1.5 h-8" onClick={() => openForm()}><Plus className="w-4 h-4" />계좌 추가</Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {accounts.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-400">등록된 계좌가 없습니다.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 text-xs"></TableHead>
                  <TableHead className="text-xs">은행/계좌명</TableHead>
                  <TableHead className="text-xs">계좌번호</TableHead>
                  <TableHead className="text-xs">예금주</TableHead>
                  <TableHead className="text-xs">통화</TableHead>
                  <TableHead className="text-right text-xs">현재잔액</TableHead>
                  <TableHead className="text-xs w-16">상태</TableHead>
                  <TableHead className="text-right text-xs w-20">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={accounts.map(a => a.id)} strategy={verticalListSortingStrategy}>
                    {accounts.map(a => (
                      <SortableTableRow key={a.id} id={a.id} onClick={() => openForm(a)}>
                        <TableCell className="text-sm">
                          <p className="font-medium">{a.bank_name}</p>
                          <p className="text-xs text-gray-500">{a.account_name}</p>
                        </TableCell>
                        <TableCell className="text-sm font-mono">{a.account_number}</TableCell>
                        <TableCell className="text-sm">{a.account_holder}</TableCell>
                        <TableCell className="text-sm">{a.currency}</TableCell>
                        <TableCell className="text-right text-sm font-mono font-semibold">{a.current_balance.toLocaleString()}</TableCell>
                        <TableCell>
                          {a.is_active
                            ? <Badge className="bg-green-100 text-green-700 text-xs">사용중</Badge>
                            : <Badge variant="outline" className="text-xs text-gray-500">중지</Badge>}
                        </TableCell>
                        <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            {permissions.canEdit && <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openForm(a)}><Edit2 className="h-3.5 w-3.5" /></Button>}
                            {permissions.canDelete && <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-600" onClick={() => handleDelete(a)}><Trash2 className="h-3.5 w-3.5" /></Button>}
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
