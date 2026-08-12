import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Save, Edit2, CreditCard } from 'lucide-react';
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
import { getCards, addCard, updateCard, deleteCard } from '@/services/accounting-card.service';
import { getBankAccounts } from '@/services/accounting-bank-account.service';
import { getUsers } from '@/lib/store';
import type { CardWithDetails, BankAccountWithBalance } from '@/types/accounting';
import type { User } from '@/types/models';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';

const NONE = '_none';
const STAFF_ROLES = ['ship_manager', 'admin', 'system_admin'];

const emptyForm = {
  card_name: '', issuer: '', card_number_last4: '', card_type: '', linked_bank_account_id: '',
  holder_user_id: '', credit_limit: '', expiry_date: '', memo: '', is_active: true,
};

export default function CardManagementPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const permissions = usePermissions('accounting_cards');
  const [cards, setCards] = useState<CardWithDetails[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccountWithBalance[]>([]);
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
      const [cardList, accountList, users] = await Promise.all([getCards(), getBankAccounts(), getUsers()]);
      setCards(cardList);
      setBankAccounts(accountList);
      setStaff(users.filter(u => STAFF_ROLES.includes(u.role)));
    } catch (e) {
      toast({ title: '카드 목록을 불러오지 못했습니다.', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const openForm = (c?: CardWithDetails) => {
    setError('');
    if (c) {
      setForm({
        card_name: c.card_name, issuer: c.issuer, card_number_last4: c.card_number_last4 || '', card_type: c.card_type || '',
        linked_bank_account_id: c.linked_bank_account_id || '', holder_user_id: c.holder_user_id || '',
        credit_limit: c.credit_limit != null ? String(c.credit_limit) : '', expiry_date: c.expiry_date || '',
        memo: c.memo || '', is_active: c.is_active,
      });
    } else {
      setForm(emptyForm);
    }
    setFormView({ id: c?.id });
  };
  const closeForm = () => { setFormView(null); setError(''); };

  const handleSave = async () => {
    if (!form.card_name.trim() || !form.issuer.trim()) { setError('카드명과 카드사는 필수입니다.'); return; }
    try {
      setSaving(true);
      const data = {
        card_name: form.card_name.trim(), issuer: form.issuer.trim(), card_number_last4: form.card_number_last4.trim() || null,
        card_type: form.card_type.trim() || null, linked_bank_account_id: form.linked_bank_account_id || null,
        holder_user_id: form.holder_user_id || null, credit_limit: form.credit_limit ? parseFloat(form.credit_limit) : null,
        expiry_date: form.expiry_date.trim() || null, memo: form.memo.trim() || null, is_active: form.is_active,
      };
      if (formView?.id) {
        await updateCard(formView.id, data);
      } else {
        const maxOrder = cards.length > 0 ? Math.max(...cards.map(c => c.display_order)) : 0;
        await addCard({ ...data, display_order: maxOrder + 1 });
      }
      await loadData();
      closeForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (c: CardWithDetails) => {
    if (!confirm(`'${c.card_name}' 카드를 삭제하시겠습니까?`)) return;
    try { await deleteCard(c.id); await loadData(); }
    catch (e) { toast({ title: '삭제 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }); }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = cards.findIndex(c => c.id === active.id);
    const newIndex = cards.findIndex(c => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(cards, oldIndex, newIndex).map((c, i) => ({ ...c, display_order: i + 1 }));
    setCards(reordered);
    try {
      await Promise.all(reordered.map(c => updateCard(c.id, { display_order: c.display_order })));
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
        <CreditCard className="w-6 h-6" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">카드관리</h1>
          <p className="text-sm text-gray-500">회사가 보유한 카드를 등록하고 결제계좌·담당자를 관리합니다.</p>
        </div>
      </div>

      {formView !== null && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">{formView.id ? '카드 수정' : '카드 추가'}</CardTitle>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={closeForm} disabled={saving}>취소</Button>
                <Button size="sm" onClick={handleSave} disabled={saving}><Save className="w-3.5 h-3.5 mr-1" />{saving ? '저장 중...' : '저장'}</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">카드명 *</Label><Input value={form.card_name} onChange={e => setForm({ ...form, card_name: e.target.value })} placeholder="예: 총무부 법인카드" className="h-9 text-sm" /></div>
              <div className="space-y-1.5"><Label className="text-xs">카드사 *</Label><Input value={form.issuer} onChange={e => setForm({ ...form, issuer: e.target.value })} placeholder="예: 신한카드" className="h-9 text-sm" /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">카드번호 뒤4자리</Label><Input value={form.card_number_last4} onChange={e => setForm({ ...form, card_number_last4: e.target.value })} maxLength={4} className="h-9 text-sm" /></div>
              <div className="space-y-1.5"><Label className="text-xs">카드종류</Label><Input value={form.card_type} onChange={e => setForm({ ...form, card_type: e.target.value })} placeholder="예: 법인/신용" className="h-9 text-sm" /></div>
              <div className="space-y-1.5"><Label className="text-xs">유효기한</Label><Input value={form.expiry_date} onChange={e => setForm({ ...form, expiry_date: e.target.value })} placeholder="MM/YY" className="h-9 text-sm" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">결제계좌</Label>
                <Select value={form.linked_bank_account_id || NONE} onValueChange={v => setForm({ ...form, linked_bank_account_id: v === NONE ? '' : v })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="선택 안 함" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>선택 안 함</SelectItem>
                    {bankAccounts.map(a => <SelectItem key={a.id} value={a.id}>{a.bank_name} {a.account_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
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
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">한도</Label><Input type="number" step="0.01" value={form.credit_limit} onChange={e => setForm({ ...form, credit_limit: e.target.value })} className="h-9 text-sm" /></div>
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
              <CardTitle className="text-base">카드 목록</CardTitle>
              <CardDescription className="text-xs mt-1">{cards.length}개 카드</CardDescription>
            </div>
            {formView === null && permissions.canCreate && (
              <Button size="sm" className="gap-1.5 h-8" onClick={() => openForm()}><Plus className="w-4 h-4" />카드 추가</Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {cards.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-400">등록된 카드가 없습니다.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 text-xs"></TableHead>
                  <TableHead className="text-xs">카드명/카드사</TableHead>
                  <TableHead className="text-xs">번호</TableHead>
                  <TableHead className="text-xs">결제계좌</TableHead>
                  <TableHead className="text-xs">담당자</TableHead>
                  <TableHead className="text-right text-xs">누적 사용액</TableHead>
                  <TableHead className="text-xs w-16">상태</TableHead>
                  <TableHead className="text-right text-xs w-20">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
                    {cards.map(c => (
                      <SortableTableRow key={c.id} id={c.id} onClick={() => openForm(c)}>
                        <TableCell className="text-sm">
                          <p className="font-medium">{c.card_name}</p>
                          <p className="text-xs text-gray-500">{c.issuer}</p>
                        </TableCell>
                        <TableCell className="text-sm font-mono">{c.card_number_last4 ? `**** ${c.card_number_last4}` : '-'}</TableCell>
                        <TableCell className="text-sm">{c.linked_bank_account_name || '-'}</TableCell>
                        <TableCell className="text-sm">{c.holder_user_name || '-'}</TableCell>
                        <TableCell className="text-right text-sm font-mono">{c.total_used.toLocaleString()}</TableCell>
                        <TableCell>
                          {c.is_active
                            ? <Badge className="bg-green-100 text-green-700 text-xs">사용중</Badge>
                            : <Badge variant="outline" className="text-xs text-gray-500">중지</Badge>}
                        </TableCell>
                        <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            {permissions.canEdit && <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openForm(c)}><Edit2 className="h-3.5 w-3.5" /></Button>}
                            {permissions.canDelete && <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-600" onClick={() => handleDelete(c)}><Trash2 className="h-3.5 w-3.5" /></Button>}
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
