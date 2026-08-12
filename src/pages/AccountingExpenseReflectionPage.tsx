import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardCheck, ArrowLeft, Save, ChevronLeft, ChevronRight, Undo2, FileText, Layers, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AutocompleteInput } from '@/components/ui/autocomplete-input';
import { supabase } from '@/lib/supabase';
import {
  getReflectableExpenseItems, reflectExpenseItem, reflectExpenseItemsBatch, unreflectExpenseItem, type ExpenseReflectionItem,
} from '@/services/accounting-expense-reflection.service';
import { getBankAccounts } from '@/services/accounting-bank-account.service';
import { getCards } from '@/services/accounting-card.service';
import { getCashRegisters } from '@/services/accounting-cash-register.service';
import { getCategories } from '@/services/accounting-category.service';
import { getCurrentUser } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { useTabContext } from '@/contexts/TabContext';
import type { BankAccountWithBalance, CardWithDetails, CashRegisterWithBalance, AccountingCategory, AccountingPaymentMethod } from '@/types/accounting';
import type { User } from '@/types/models';

const NONE = '_none';
const CURRENCIES = ['KRW', 'USD', 'EUR', 'JPY'];
const PAGE_SIZE = 20;

type StatusFilter = 'all' | 'reflected' | 'unreflected';

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function AttachmentLinks({ attachments }: { attachments: { name: string; path: string }[] }) {
  if (attachments.length === 0) return null;
  return (
    <div className="space-y-1">
      {attachments.map((a, i) => {
        const { data } = supabase.storage.from('documents').getPublicUrl(a.path);
        return (
          <a key={i} href={data?.publicUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[11px] text-blue-600 hover:underline">
            <FileText className="h-3 w-3 shrink-0" />{a.name}
          </a>
        );
      })}
    </div>
  );
}

interface DocumentGroup {
  document_id: string;
  document_title: string;
  reference_type: string | null;
  submitted_by_name: string;
  completed_at: string | null;
  items: ExpenseReflectionItem[];
  totalAmount: number;
  reflectedCount: number;
}

const emptyForm = {
  transaction_date: today(),
  payment_method: 'bank_account' as AccountingPaymentMethod,
  bank_account_id: '', card_id: '', cash_register_id: '',
  category_name: '', counterparty: '', description: '', amount: '', currency: 'KRW',
};

// 결재 완료된 지출결의서 항목을 경리 담당자가 검토해서 실제 자산·거래일을 지정해 금전출납
// 거래로 반영한다. 지출결의자가 넣은 분류/지급처/적요/금액은 기본값으로 채워주되, 담당자가
// 본인 편의에 맞게 자유롭게 고칠 수 있다.
export default function AccountingExpenseReflectionPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const permissions = usePermissions('accounting_expense_reflection');
  const { openNewTab } = useTabContext();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [items, setItems] = useState<ExpenseReflectionItem[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccountWithBalance[]>([]);
  const [cards, setCards] = useState<CardWithDetails[]>([]);
  const [cashRegisters, setCashRegisters] = useState<CashRegisterWithBalance[]>([]);
  const [categories, setCategories] = useState<AccountingCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('unreflected');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [itemPage, setItemPage] = useState(1);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [unreflectingBatch, setUnreflectingBatch] = useState(false);

  const [formTarget, setFormTarget] = useState<ExpenseReflectionItem | null>(null);
  const [batchTargets, setBatchTargets] = useState<ExpenseReflectionItem[] | null>(null);
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(new Set());
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [unreflecting, setUnreflecting] = useState<string | null>(null);

  useEffect(() => {
    if (!permissions.loading && !permissions.canView) navigate('/dashboard');
  }, [permissions.loading, permissions.canView, navigate]);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [me, list, accounts, cardList, registers, cats] = await Promise.all([
        getCurrentUser(), getReflectableExpenseItems(), getBankAccounts(), getCards(), getCashRegisters(), getCategories('expense'),
      ]);
      setCurrentUser(me);
      setItems(list);
      setBankAccounts(accounts);
      setCards(cardList);
      setCashRegisters(registers);
      setCategories(cats);
    } finally {
      setLoading(false);
    }
  };

  // 지출결의 한 건은 목록에 한 행으로만 보여준다 — 각 건 안의 여러 항목을 개별로 반영할지는
  // 그 건을 열어서 따로 다룬다(항목별로 목록이 쪼개져 나오면 "이 지출결의가 몇 건 남았는지"를
  // 한눈에 볼 수 없어서 문서 단위로 묶는다).
  const groups = useMemo(() => {
    const byDoc = new Map<string, DocumentGroup>();
    for (const item of items) {
      let g = byDoc.get(item.document_id);
      if (!g) {
        g = {
          document_id: item.document_id, document_title: item.document_title, reference_type: item.reference_type,
          submitted_by_name: item.submitted_by_name, completed_at: item.completed_at,
          items: [], totalAmount: 0, reflectedCount: 0,
        };
        byDoc.set(item.document_id, g);
      }
      g.items.push(item);
      g.totalAmount += item.amount;
      if (item.reflected) g.reflectedCount += 1;
    }
    return [...byDoc.values()];
  }, [items]);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups.filter(g => {
      if (statusFilter === 'reflected' && g.reflectedCount !== g.items.length) return false;
      if (statusFilter === 'unreflected' && g.reflectedCount >= g.items.length) return false;
      if (q && !g.document_title.toLowerCase().includes(q) && !g.submitted_by_name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [groups, statusFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filteredGroups.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedGroups = filteredGroups.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const selectedGroup = selectedDocumentId ? groups.find(g => g.document_id === selectedDocumentId) || null : null;
  const itemTotalPages = Math.max(1, Math.ceil((selectedGroup?.items.length || 0) / PAGE_SIZE));
  const itemCurrentPage = Math.min(itemPage, itemTotalPages);
  const pagedItems = selectedGroup ? selectedGroup.items.slice((itemCurrentPage - 1) * PAGE_SIZE, itemCurrentPage * PAGE_SIZE) : [];

  const changeFilter = (fn: () => void) => { fn(); setPage(1); };

  const categoryOptions = categories.map(c => c.name);

  const openForm = (item: ExpenseReflectionItem) => {
    setError('');
    setForm({
      ...emptyForm,
      transaction_date: item.expense_date || today(),
      category_name: item.category,
      counterparty: item.vendor,
      description: item.purpose,
      amount: String(item.amount),
    });
    setFormTarget(item);
  };
  // 여러 항목을 한 번에 반영할 때는 거래일·자산만 공통으로 지정하고, 분류/지급처/적요/금액/
  // 증빙서류는 각 항목이 가진 값을 그대로 쓴다 — 지출결의자가 넣은 내용이 기본이라는 원칙 유지.
  const openBatchForm = (items: ExpenseReflectionItem[]) => {
    setError('');
    const firstDate = items.find(i => i.expense_date)?.expense_date;
    setForm({ ...emptyForm, transaction_date: firstDate || today() });
    setBatchTargets(items);
  };
  // 반영 폼에서 뒤로가면 목록 전체가 아니라 그 지출결의 건의 항목 화면으로 돌아간다.
  const closeForm = () => { setFormTarget(null); setBatchTargets(null); setError(''); };
  const closeDocument = () => { setSelectedDocumentId(null); setSelectedIndexes(new Set()); setItemPage(1); };
  const openDocument = (documentId: string) => { setSelectedDocumentId(documentId); setSelectedIndexes(new Set()); setItemPage(1); };

  const toggleSelected = (index: number) => {
    setSelectedIndexes(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  };

  const handlePaymentMethodChange = (v: AccountingPaymentMethod) => {
    setForm(prev => ({ ...prev, payment_method: v, bank_account_id: '', card_id: '', cash_register_id: '' }));
  };

  const handleSave = async () => {
    if (!formTarget && !batchTargets) return;
    if (!form.transaction_date) { setError('거래일을 입력하세요.'); return; }
    if (form.payment_method === 'bank_account' && !form.bank_account_id) { setError('계좌를 선택하세요.'); return; }
    if (form.payment_method === 'card' && !form.card_id) { setError('카드를 선택하세요.'); return; }
    if (form.payment_method === 'cash' && !form.cash_register_id) { setError('시재를 선택하세요.'); return; }
    try {
      setSaving(true);
      if (batchTargets) {
        await reflectExpenseItemsBatch(batchTargets.map(item => ({
          documentId: item.document_id,
          itemIndex: item.item_index,
          transactionDate: form.transaction_date,
          paymentMethod: form.payment_method,
          bankAccountId: form.bank_account_id || undefined,
          cardId: form.card_id || undefined,
          cashRegisterId: form.cash_register_id || undefined,
          categoryName: item.category,
          counterparty: item.vendor,
          description: item.purpose,
          amount: item.amount,
          currency: form.currency,
          attachments: item.attachments,
          createdBy: currentUser?.id || null,
        })));
        toast({ title: `${batchTargets.length}건이 금전출납에 반영되었습니다.` });
        setSelectedIndexes(new Set());
      } else if (formTarget) {
        const amount = parseFloat(form.amount);
        if (!amount || amount <= 0) { setError('금액을 확인하세요.'); setSaving(false); return; }
        await reflectExpenseItem({
          documentId: formTarget.document_id,
          itemIndex: formTarget.item_index,
          transactionDate: form.transaction_date,
          paymentMethod: form.payment_method,
          bankAccountId: form.bank_account_id || undefined,
          cardId: form.card_id || undefined,
          cashRegisterId: form.cash_register_id || undefined,
          categoryName: form.category_name,
          counterparty: form.counterparty,
          description: form.description,
          amount,
          currency: form.currency,
          attachments: formTarget.attachments,
          createdBy: currentUser?.id || null,
        });
        toast({ title: '금전출납에 반영되었습니다.' });
      }
      closeForm();
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : '반영 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleUnreflect = async (item: ExpenseReflectionItem) => {
    if (!item.reflected_transaction_id) return;
    if (!confirm('반영을 취소하시겠습니까? 금전출납에 생성된 거래가 삭제됩니다.')) return;
    setUnreflecting(item.reflected_transaction_id);
    try {
      await unreflectExpenseItem(item.reflected_transaction_id);
      toast({ title: '반영이 취소되었습니다.' });
      await loadData();
    } catch (e) {
      toast({ title: '반영 취소 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setUnreflecting(null);
    }
  };

  const handleUnreflectBatch = async (targets: ExpenseReflectionItem[]) => {
    const ids = targets.map(t => t.reflected_transaction_id).filter((id): id is string => !!id);
    if (ids.length === 0) return;
    if (!confirm(`선택한 ${ids.length}건의 반영을 취소하시겠습니까? 금전출납에 생성된 거래가 모두 삭제됩니다.`)) return;
    setUnreflectingBatch(true);
    try {
      for (const id of ids) await unreflectExpenseItem(id);
      toast({ title: `${ids.length}건의 반영이 취소되었습니다.` });
      setSelectedIndexes(new Set());
      await loadData();
    } catch (e) {
      toast({ title: '반영 취소 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setUnreflectingBatch(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="w-6 h-6" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">지출결의 반영</h1>
          <p className="text-sm text-gray-500">결재 완료된 지출결의서 항목을 검토해서 실제 자산·거래일을 지정해 금전출납에 반영합니다.</p>
        </div>
      </div>

      {(formTarget || batchTargets) ? (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={closeForm}><ArrowLeft className="w-4 h-4" /></Button>
                <CardTitle className="text-sm">
                  {batchTargets ? `${batchTargets.length}건 일괄 반영하기` : `${formTarget!.document_title} — 반영하기`}
                </CardTitle>
              </div>
              <Button size="sm" onClick={handleSave} disabled={saving}><Save className="w-3.5 h-3.5 mr-1" />{saving ? '저장 중...' : '반영'}</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {batchTargets ? (
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b">
                    <tr><th className="text-left p-2">지출일</th><th className="text-left p-2">분류</th><th className="text-left p-2">지급처/적요</th><th className="text-right p-2">금액</th></tr>
                  </thead>
                  <tbody>
                    {batchTargets.map(item => (
                      <tr key={item.item_index} className="border-b last:border-0">
                        <td className="p-2 whitespace-nowrap">{item.expense_date || '-'}</td>
                        <td className="p-2">{item.category || '-'}</td>
                        <td className="p-2 text-gray-500">{item.vendor}{item.purpose ? ` / ${item.purpose}` : ''}</td>
                        <td className="p-2 text-right font-mono">{item.amount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 font-semibold"><td className="p-2" colSpan={3}>합계</td><td className="p-2 text-right font-mono">{batchTargets.reduce((s, i) => s + i.amount, 0).toLocaleString()}</td></tr>
                  </tfoot>
                </table>
                <p className="text-[11px] text-gray-400 p-2 border-t bg-gray-50">각 항목의 분류/지급처/적요/금액/증빙서류는 그대로 유지되고, 아래 거래일·자산만 공통으로 적용됩니다.</p>
              </div>
            ) : (
              <div className="p-2.5 bg-gray-50 rounded-md text-xs text-gray-500 space-y-0.5">
                <p>기안자: {formTarget!.submitted_by_name} · 지출일(기안): {formTarget!.expense_date || '-'}</p>
                <p>원본 항목: {formTarget!.category} / {formTarget!.vendor} / {formTarget!.purpose} / {formTarget!.amount.toLocaleString()}원</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">거래일 * <span className="text-gray-400 font-normal">(자산·거래일은 담당자가 지정)</span></Label>
                <Input type="date" value={form.transaction_date} max={today()} onChange={e => setForm({ ...form, transaction_date: e.target.value })} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">통화</Label>
                <Select value={form.currency} onValueChange={v => setForm({ ...form, currency: v })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">결제수단 *</Label>
                <Select value={form.payment_method} onValueChange={v => handlePaymentMethodChange(v as AccountingPaymentMethod)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank_account">통장</SelectItem>
                    <SelectItem value="card">카드</SelectItem>
                    <SelectItem value="cash">현금</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.payment_method === 'bank_account' && (
                <div className="space-y-1.5">
                  <Label className="text-xs">계좌 *</Label>
                  <Select value={form.bank_account_id || NONE} onValueChange={v => setForm({ ...form, bank_account_id: v === NONE ? '' : v })}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="계좌 선택" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>계좌 선택</SelectItem>
                      {bankAccounts.map(a => <SelectItem key={a.id} value={a.id}>{a.bank_name} {a.account_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {form.payment_method === 'card' && (
                <div className="space-y-1.5">
                  <Label className="text-xs">카드 *</Label>
                  <Select value={form.card_id || NONE} onValueChange={v => setForm({ ...form, card_id: v === NONE ? '' : v })}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="카드 선택" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>카드 선택</SelectItem>
                      {cards.map(c => <SelectItem key={c.id} value={c.id}>{c.card_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {form.payment_method === 'cash' && (
                <div className="space-y-1.5">
                  <Label className="text-xs">시재 *</Label>
                  <Select value={form.cash_register_id || NONE} onValueChange={v => setForm({ ...form, cash_register_id: v === NONE ? '' : v })}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="시재 선택" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>시재 선택</SelectItem>
                      {cashRegisters.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {!batchTargets && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">분류</Label>
                    <AutocompleteInput value={form.category_name} onChange={v => setForm({ ...form, category_name: v })} options={categoryOptions} className="h-9 text-sm" placeholder="분류 입력 또는 검색" />
                  </div>
                  <div className="space-y-1.5"><Label className="text-xs">거래처</Label><Input value={form.counterparty} onChange={e => setForm({ ...form, counterparty: e.target.value })} className="h-9 text-sm" /></div>
                </div>
                <div className="space-y-1.5"><Label className="text-xs">적요</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="h-9 text-sm" /></div>
                <div className="space-y-1.5"><Label className="text-xs">금액 *</Label><Input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="h-9 text-sm" /></div>
                {formTarget && formTarget.attachments.length > 0 && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">증빙서류 <span className="text-gray-400 font-normal">(지출결의 항목에 첨부된 파일이 그대로 반영됩니다)</span></Label>
                    <AttachmentLinks attachments={formTarget.attachments} />
                  </div>
                )}
              </>
            )}
            {error && <Alert variant="destructive"><AlertDescription className="text-xs">{error}</AlertDescription></Alert>}
          </CardContent>
        </Card>
      ) : selectedGroup ? (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={closeDocument}><ArrowLeft className="w-4 h-4" /></Button>
                <div>
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    {selectedGroup.document_title}
                    {selectedGroup.reference_type === 'employee_payroll_period' && <Badge className="text-[10px] bg-blue-100 text-blue-700">급여</Badge>}
                    <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[11px] text-gray-400 hover:text-blue-600 gap-1" onClick={() => openNewTab(`/documents/${selectedGroup.document_id}`, selectedGroup.document_title)}>
                      <ExternalLink className="w-3 h-3" />시행문 보기
                    </Button>
                  </CardTitle>
                  <p className="text-xs text-gray-400 mt-0.5">기안자: {selectedGroup.submitted_by_name} · {selectedGroup.reflectedCount}/{selectedGroup.items.length}건 반영됨</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {permissions.canCreate && selectedGroup.items.some(i => selectedIndexes.has(i.item_index) && !i.reflected) && (
                  <Button size="sm" className="gap-1.5" onClick={() => openBatchForm(selectedGroup.items.filter(i => selectedIndexes.has(i.item_index) && !i.reflected))}>
                    <Layers className="w-3.5 h-3.5" />선택 {selectedGroup.items.filter(i => selectedIndexes.has(i.item_index) && !i.reflected).length}건 일괄 반영
                  </Button>
                )}
                {permissions.canDelete && selectedGroup.items.some(i => selectedIndexes.has(i.item_index) && i.reflected) && (
                  <Button size="sm" variant="outline" className="gap-1.5 text-red-600 border-red-200" disabled={unreflectingBatch} onClick={() => handleUnreflectBatch(selectedGroup.items.filter(i => selectedIndexes.has(i.item_index) && i.reflected))}>
                    <Undo2 className="w-3.5 h-3.5" />선택 {selectedGroup.items.filter(i => selectedIndexes.has(i.item_index) && i.reflected).length}건 반영 취소
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <div className="border rounded-md overflow-hidden overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {(permissions.canCreate || permissions.canDelete) && <th className="p-2 w-8"></th>}
                    <th className="text-right p-2 w-10">No.</th>
                    <th className="text-left p-2">지출일</th>
                    <th className="text-left p-2">분류</th>
                    <th className="text-left p-2">지급처 / 적요</th>
                    <th className="text-right p-2">금액</th>
                    <th className="text-left p-2">증빙서류</th>
                    <th className="text-center p-2">상태</th>
                    <th className="p-2 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {pagedItems.map((item, idx) => (
                    <tr key={item.item_index} className="border-b last:border-0 hover:bg-gray-50">
                      {(permissions.canCreate || permissions.canDelete) && (
                        <td className="p-2 text-center">
                          <Checkbox checked={selectedIndexes.has(item.item_index)} onCheckedChange={() => toggleSelected(item.item_index)} />
                        </td>
                      )}
                      <td className="p-2 text-right text-gray-400">{(itemCurrentPage - 1) * PAGE_SIZE + idx + 1}</td>
                      <td className="p-2 whitespace-nowrap">{item.expense_date || '-'}</td>
                      <td className="p-2">{item.category || '-'}</td>
                      <td className="p-2 text-gray-500 truncate max-w-[320px]" title={`${item.vendor} / ${item.purpose}`}>{item.vendor}{item.purpose ? ` / ${item.purpose}` : ''}</td>
                      <td className="p-2 text-right font-mono font-semibold">{item.amount.toLocaleString()}</td>
                      <td className="p-2 min-w-[140px]"><AttachmentLinks attachments={item.attachments} /></td>
                      <td className="p-2 text-center">
                        <Badge className={`text-[10px] ${item.reflected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                          {item.reflected ? '반영됨' : '미반영'}
                        </Badge>
                      </td>
                      <td className="p-2 text-center">
                        {item.reflected ? (
                          permissions.canDelete && (
                            <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 px-1.5" onClick={() => handleUnreflect(item)} disabled={unreflecting === item.reflected_transaction_id}>
                              <Undo2 className="w-3 h-3" />취소
                            </Button>
                          )
                        ) : (
                          permissions.canCreate && (
                            <Button size="sm" className="h-6 text-[10px] px-2" onClick={() => openForm(item)}>반영하기</Button>
                          )
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {itemTotalPages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <Button type="button" size="sm" variant="outline" className="h-7 px-2" disabled={itemCurrentPage <= 1} onClick={() => setItemPage(p => p - 1)}><ChevronLeft className="w-3.5 h-3.5" /></Button>
                <span className="text-xs text-gray-500">{itemCurrentPage} / {itemTotalPages}</span>
                <Button type="button" size="sm" variant="outline" className="h-7 px-2" disabled={itemCurrentPage >= itemTotalPages} onClick={() => setItemPage(p => p + 1)}><ChevronRight className="w-3.5 h-3.5" /></Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">지출결의서 목록</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-md border overflow-hidden">
                {(['unreflected', 'reflected', 'all'] as StatusFilter[]).map(f => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => changeFilter(() => setStatusFilter(f))}
                    className={`h-8 px-2.5 text-xs transition-colors ${statusFilter === f ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  >
                    {f === 'unreflected' ? '미반영' : f === 'reflected' ? '반영됨' : '전체'}
                  </button>
                ))}
              </div>
              <Input placeholder="문서제목/기안자 검색" value={search} onChange={e => changeFilter(() => setSearch(e.target.value))} className="h-8 w-[200px] text-xs" />
              <span className="text-xs text-gray-400 ml-auto">{filteredGroups.length}건</span>
            </div>

            <div className="border rounded-md overflow-hidden overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-right p-2 w-10">No.</th>
                    <th className="text-left p-2">문서</th>
                    <th className="text-left p-2">기안자</th>
                    <th className="text-left p-2">완료일</th>
                    <th className="text-center p-2">항목 수</th>
                    <th className="text-right p-2">총액</th>
                    <th className="text-center p-2">반영 현황</th>
                    <th className="p-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {pagedGroups.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-8 text-gray-400">지출결의서가 없습니다.</td></tr>
                  ) : pagedGroups.map((g, idx) => {
                    const fullyReflected = g.reflectedCount === g.items.length;
                    const partiallyReflected = g.reflectedCount > 0 && !fullyReflected;
                    return (
                      <tr key={g.document_id} className="border-b last:border-0 hover:bg-gray-50 cursor-pointer" onClick={() => openDocument(g.document_id)}>
                        <td className="p-2 text-right text-gray-400">{(currentPage - 1) * PAGE_SIZE + idx + 1}</td>
                        <td className="p-2">
                          <span className="flex items-center gap-1">
                            {g.document_title}
                            {g.reference_type === 'employee_payroll_period' && <Badge className="text-[10px] bg-blue-100 text-blue-700">급여</Badge>}
                          </span>
                        </td>
                        <td className="p-2 whitespace-nowrap">{g.submitted_by_name}</td>
                        <td className="p-2 whitespace-nowrap">{g.completed_at ? new Date(g.completed_at).toLocaleDateString('ko-KR') : '-'}</td>
                        <td className="p-2 text-center">{g.items.length}</td>
                        <td className="p-2 text-right font-mono font-semibold">{g.totalAmount.toLocaleString()}</td>
                        <td className="p-2 text-center">
                          <Badge className={`text-[10px] ${fullyReflected ? 'bg-green-100 text-green-700' : partiallyReflected ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>
                            {g.reflectedCount}/{g.items.length} 반영
                          </Badge>
                        </td>
                        <td className="p-2 text-center" onClick={e => e.stopPropagation()}>
                          <button type="button" className="text-gray-400 hover:text-blue-600 inline-flex" title="시행문 보기" onClick={() => openNewTab(`/documents/${g.document_id}`, g.document_title)}>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <Button type="button" size="sm" variant="outline" className="h-7 px-2" disabled={currentPage <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="w-3.5 h-3.5" /></Button>
                <span className="text-xs text-gray-500">{currentPage} / {totalPages}</span>
                <Button type="button" size="sm" variant="outline" className="h-7 px-2" disabled={currentPage >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="w-3.5 h-3.5" /></Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
