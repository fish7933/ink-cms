import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Save, Edit2, ArrowLeft, Receipt, Settings2, ChevronLeft, ChevronRight, Upload, FileText, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AutocompleteInput } from '@/components/ui/autocomplete-input';
import {
  getCashTransactions, addCashTransaction, updateCashTransaction, deleteCashTransaction,
} from '@/services/accounting-cash-transaction.service';
import { getBankAccounts } from '@/services/accounting-bank-account.service';
import { getCards } from '@/services/accounting-card.service';
import { getCashRegisters } from '@/services/accounting-cash-register.service';
import { getCategories, addCategory, deleteCategory } from '@/services/accounting-category.service';
import { getCurrentUser } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import type {
  CashTransactionWithDetails, BankAccountWithBalance, CardWithDetails, CashRegisterWithBalance, AccountingCategory,
  AccountingTransactionType, AccountingPaymentMethod, CashTransactionAttachment,
} from '@/types/accounting';
import type { User } from '@/types/models';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';

const NONE = '_none';
const CURRENCIES = ['KRW', 'USD', 'EUR', 'JPY'];
const PAGE_SIZE = 20;
const PAYMENT_METHOD_LABELS: Record<AccountingPaymentMethod, string> = { bank_account: '통장', card: '카드', cash: '현금' };

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

type DateFilterMode = 'day' | 'month' | 'all';

const emptyForm = {
  transaction_date: new Date().toISOString().slice(0, 10),
  payment_method: 'bank_account' as AccountingPaymentMethod,
  bank_account_id: '', card_id: '', cash_register_id: '',
  transaction_type: 'expense' as AccountingTransactionType,
  category_name: '', counterparty: '', description: '', amount: '', currency: 'KRW',
};

export default function CashbookManagementPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const permissions = usePermissions('accounting_cashbook');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [transactions, setTransactions] = useState<CashTransactionWithDetails[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccountWithBalance[]>([]);
  const [cards, setCards] = useState<CardWithDetails[]>([]);
  const [cashRegisters, setCashRegisters] = useState<CashRegisterWithBalance[]>([]);
  const [categories, setCategories] = useState<AccountingCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>('month');
  const [monthFilter, setMonthFilter] = useState(currentMonth());
  const [dayFilter, setDayFilter] = useState(today());
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<'all' | AccountingPaymentMethod>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | AccountingTransactionType>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [formView, setFormView] = useState<{ id?: string } | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [attachments, setAttachments] = useState<CashTransactionAttachment[]>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);

  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [categoryFormType, setCategoryFormType] = useState<AccountingTransactionType>('expense');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categorySaving, setCategorySaving] = useState(false);

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (!permissions.loading && !permissions.canView) navigate('/dashboard');
  }, [permissions.loading, permissions.canView, navigate]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [me, txns, accounts, cardList, registers, cats] = await Promise.all([
        getCurrentUser(), getCashTransactions(), getBankAccounts(), getCards(), getCashRegisters(), getCategories(),
      ]);
      setCurrentUser(me);
      setTransactions(txns);
      setBankAccounts(accounts);
      setCards(cardList);
      setCashRegisters(registers);
      setCategories(cats);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    return transactions
      .filter(t => {
        if (dateFilterMode === 'all') return true;
        if (dateFilterMode === 'day') return t.transaction_date === dayFilter;
        return t.transaction_date.slice(0, 7) === monthFilter;
      })
      .filter(t => paymentMethodFilter === 'all' || t.payment_method === paymentMethodFilter)
      .filter(t => typeFilter === 'all' || t.transaction_type === typeFilter)
      .filter(t => {
        if (!search.trim()) return true;
        const q = search.trim().toLowerCase();
        return (t.counterparty || '').toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q);
      });
  }, [transactions, dateFilterMode, monthFilter, dayFilter, paymentMethodFilter, typeFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const changeFilter = (fn: () => void) => { fn(); setPage(1); };

  // 통화가 다르면 그냥 더하는 게 의미가 없으므로(원화/달러) 통화별로 따로 합산한다.
  const currencyTotals = useMemo(() => {
    const map = new Map<string, { income: number; expense: number }>();
    for (const t of filtered) {
      const cur = map.get(t.currency) || { income: 0, expense: 0 };
      if (t.transaction_type === 'income') cur.income += Number(t.amount);
      else cur.expense += Number(t.amount);
      map.set(t.currency, cur);
    }
    return [...map.entries()].sort(([a], [b]) => (a === 'KRW' ? -1 : b === 'KRW' ? 1 : a.localeCompare(b)));
  }, [filtered]);

  const categoriesForType = categories.filter(c => c.transaction_type === form.transaction_type);
  const categoryOptions = categoriesForType.map(c => c.name);

  // 한 번 입력된 거래처는 다음부터 드롭다운으로 골라 쓸 수 있게 하되(datalist), 목록에 없는
  // 이름도 자유롭게 새로 입력할 수 있다.
  const counterpartyOptions = useMemo(
    () => [...new Set(transactions.map(t => t.counterparty).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, 'ko')),
    [transactions]
  );
  const descriptionOptions = useMemo(
    () => [...new Set(transactions.map(t => t.description).filter((d): d is string => !!d))].sort((a, b) => a.localeCompare(b, 'ko')),
    [transactions]
  );

  const openForm = (t?: CashTransactionWithDetails) => {
    setError('');
    if (t) {
      setForm({
        transaction_date: t.transaction_date, payment_method: t.payment_method,
        bank_account_id: t.bank_account_id || '', card_id: t.card_id || '', cash_register_id: t.cash_register_id || '',
        transaction_type: t.transaction_type, category_name: t.category_name || '',
        counterparty: t.counterparty || '', description: t.description || '',
        amount: String(t.amount), currency: t.currency,
      });
      setAttachments(t.attachments || []);
    } else {
      setForm(emptyForm);
      setAttachments([]);
    }
    setNewFiles([]);
    setFormView({ id: t?.id });
  };
  const closeForm = () => { setFormView(null); setError(''); };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files).filter(f => {
      if (f.size > 10 * 1024 * 1024) { toast({ title: `${f.name}은 10MB를 초과합니다.`, variant: 'destructive' }); return false; }
      return true;
    });
    setNewFiles(prev => [...prev, ...files]);
    e.target.value = '';
  };
  const removeNewFile = (idx: number) => setNewFiles(prev => prev.filter((_, i) => i !== idx));
  const removeExistingAttachment = (idx: number) => setAttachments(prev => prev.filter((_, i) => i !== idx));
  const getAttachmentUrl = (path: string) => supabase.storage.from('documents').getPublicUrl(path).data.publicUrl;

  const handlePaymentMethodChange = (v: AccountingPaymentMethod) => {
    setForm(prev => ({ ...prev, payment_method: v, bank_account_id: '', card_id: '', cash_register_id: '' }));
  };
  const handleTypeChange = (v: AccountingTransactionType) => {
    setForm(prev => ({ ...prev, transaction_type: v, category_name: '' }));
  };

  // 분류도 거래처/적요처럼 한 번 입력하면 저장돼 드롭다운으로 나오게 한다 — 이미 있는 이름이면
  // 그 분류를 쓰고, 없는 이름이면 새 분류로 즉시 등록해서 앞으로도 재사용할 수 있게 한다.
  const resolveCategoryId = async (): Promise<string | null> => {
    const name = form.category_name.trim();
    if (!name) return null;
    const existing = categories.find(c => c.transaction_type === form.transaction_type && c.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing.id;
    const created = await addCategory({ name, transaction_type: form.transaction_type, display_order: categoriesForType.length + 1 });
    setCategories(prev => [...prev, created]);
    return created.id;
  };

  const handleSave = async () => {
    if (!form.transaction_date) { setError('날짜를 입력하세요.'); return; }
    if (form.payment_method === 'bank_account' && !form.bank_account_id) { setError('계좌를 선택하세요.'); return; }
    if (form.payment_method === 'card' && !form.card_id) { setError('카드를 선택하세요.'); return; }
    if (form.payment_method === 'cash' && !form.cash_register_id) { setError('시재를 선택하세요.'); return; }
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) { setError('금액을 확인하세요.'); return; }
    try {
      setSaving(true);
      const categoryId = await resolveCategoryId();

      const uploaded: CashTransactionAttachment[] = [];
      for (const file of newFiles) {
        const ext = file.name.split('.').pop();
        const path = `accounting-receipts/${formView?.id || Date.now()}/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
        const { error: upErr } = await supabase.storage.from('documents').upload(path, file);
        if (upErr) throw new Error(`${file.name} 업로드 실패`);
        uploaded.push({ name: file.name, path, size: file.size, type: file.type });
      }
      const mergedAttachments = [...attachments, ...uploaded];

      const data = {
        transaction_date: form.transaction_date, payment_method: form.payment_method,
        bank_account_id: form.payment_method === 'bank_account' ? form.bank_account_id : null,
        card_id: form.payment_method === 'card' ? form.card_id : null,
        cash_register_id: form.payment_method === 'cash' ? form.cash_register_id : null,
        transaction_type: form.transaction_type, category_id: categoryId,
        counterparty: form.counterparty.trim() || null, description: form.description.trim() || null,
        amount, currency: form.currency, attachments: mergedAttachments, created_by: currentUser?.id || null,
      };
      if (formView?.id) {
        await updateCashTransaction(formView.id, data);
        await loadData();
        closeForm();
      } else {
        await addCashTransaction(data);
        await loadData();
        // 같은 통장/카드/시재에 계속 거래를 입력하는 경우가 많아, 날짜·결제수단·계좌 선택은
        // 그대로 두고 거래별로 달라지는 항목(분류/거래처/적요/금액/영수증)만 비워 바로 이어서 입력할 수 있게 한다.
        setForm(prev => ({ ...prev, category_name: '', counterparty: '', description: '', amount: '' }));
        setAttachments([]);
        setNewFiles([]);
        toast({ title: '저장되었습니다.', description: '이어서 같은 계좌에 거래를 추가할 수 있습니다.' });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (t: CashTransactionWithDetails) => {
    if (!confirm('이 거래 내역을 삭제하시겠습니까?')) return;
    try { await deleteCashTransaction(t.id); await loadData(); }
    catch (e) { toast({ title: '삭제 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }); }
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      setCategorySaving(true);
      await addCategory({ name: newCategoryName.trim(), transaction_type: categoryFormType, display_order: categories.filter(c => c.transaction_type === categoryFormType).length + 1 });
      setNewCategoryName('');
      setCategories(await getCategories());
    } catch (e) {
      toast({ title: '분류 추가 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setCategorySaving(false);
    }
  };

  const handleDeleteCategory = async (cat: AccountingCategory) => {
    if (!confirm(`'${cat.name}' 분류를 삭제하시겠습니까?`)) return;
    try {
      await deleteCategory(cat);
      setCategories(await getCategories());
    } catch (e) {
      toast({ title: '삭제 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Receipt className="w-6 h-6" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">금전출납</h1>
            <p className="text-sm text-gray-500">통장·카드·현금의 입출금 내역을 기록하고 관리합니다.</p>
          </div>
        </div>
        {formView === null && (
          <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={() => setCategoryDialogOpen(true)}>
            <Settings2 className="w-3.5 h-3.5" />분류 관리
          </Button>
        )}
      </div>

      {formView !== null ? (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={closeForm}><ArrowLeft className="w-4 h-4" /></Button>
                <CardTitle className="text-sm">{formView.id ? '거래 수정' : '거래 추가'}</CardTitle>
              </div>
              <Button size="sm" onClick={handleSave} disabled={saving}><Save className="w-3.5 h-3.5 mr-1" />{saving ? '저장 중...' : '저장'}</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">날짜 *</Label><Input type="date" value={form.transaction_date} onChange={e => setForm({ ...form, transaction_date: e.target.value })} className="h-9 text-sm" /></div>
              <div className="space-y-1.5">
                <Label className="text-xs">구분 *</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => handleTypeChange('income')} className={`h-9 rounded-md text-sm border transition-colors ${form.transaction_type === 'income' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>수입</button>
                  <button type="button" onClick={() => handleTypeChange('expense')} className={`h-9 rounded-md text-sm border transition-colors ${form.transaction_type === 'expense' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>지출</button>
                </div>
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">분류</Label>
                <AutocompleteInput value={form.category_name} onChange={v => setForm({ ...form, category_name: v })} options={categoryOptions} className="h-9 text-sm" placeholder="분류 입력 또는 검색" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">거래처</Label>
                <AutocompleteInput value={form.counterparty} onChange={v => setForm({ ...form, counterparty: v })} options={counterpartyOptions} className="h-9 text-sm" placeholder="거래처 입력 또는 검색" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">적요</Label>
              <AutocompleteInput value={form.description} onChange={v => setForm({ ...form, description: v })} options={descriptionOptions} className="h-9 text-sm" placeholder="적요 입력 또는 검색" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">금액 *</Label><Input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="h-9 text-sm" /></div>
              <div className="space-y-1.5">
                <Label className="text-xs">통화</Label>
                <Select value={form.currency} onValueChange={v => setForm({ ...form, currency: v })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">영수증</Label>
              {(attachments.length > 0 || newFiles.length > 0) && (
                <div className="space-y-1.5">
                  {attachments.map((a, idx) => (
                    <div key={a.path} className="flex items-center justify-between p-2 bg-gray-50 rounded-md text-sm">
                      <a href={getAttachmentUrl(a.path)} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-blue-600 hover:underline truncate">
                        <FileText className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{a.name}</span>
                      </a>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500 shrink-0" onClick={() => removeExistingAttachment(idx)} disabled={saving}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                  {newFiles.map((f, idx) => (
                    <div key={`${f.name}-${idx}`} className="flex items-center justify-between p-2 bg-blue-50 rounded-md text-sm">
                      <span className="flex items-center gap-2 text-blue-700 truncate">
                        <FileText className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{f.name}</span>
                        <span className="text-xs text-blue-400 shrink-0">(신규)</span>
                      </span>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500 shrink-0" onClick={() => removeNewFile(idx)} disabled={saving}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <label className="flex items-center justify-center gap-1.5 h-9 border border-dashed rounded-md text-xs text-gray-500 cursor-pointer hover:bg-gray-50">
                <Upload className="w-3.5 h-3.5" />영수증 파일 추가 (최대 10MB)
                <input type="file" multiple className="hidden" onChange={handleFileChange} disabled={saving} />
              </label>
            </div>
            {error && <Alert variant="destructive"><AlertDescription className="text-xs">{error}</AlertDescription></Alert>}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-2">
            {currencyTotals.length === 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Card><CardContent className="pt-4 pb-3 text-center"><p className="text-xs text-gray-500">기간 내 수입</p><p className="text-lg font-bold text-blue-700">0</p></CardContent></Card>
                <Card><CardContent className="pt-4 pb-3 text-center"><p className="text-xs text-gray-500">기간 내 지출</p><p className="text-lg font-bold text-red-600">0</p></CardContent></Card>
                <Card><CardContent className="pt-4 pb-3 text-center"><p className="text-xs text-gray-500">차액</p><p className="text-lg font-bold">0</p></CardContent></Card>
              </div>
            ) : currencyTotals.map(([currency, { income, expense }]) => (
              <div key={currency}>
                {currencyTotals.length > 1 && <p className="text-xs font-semibold text-gray-500 mb-1">{currency}</p>}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <Card><CardContent className="pt-4 pb-3 text-center">
                    <p className="text-xs text-gray-500">기간 내 수입</p>
                    <p className="text-lg font-bold text-blue-700">{income.toLocaleString()} <span className="text-xs font-normal text-gray-400">{currency}</span></p>
                  </CardContent></Card>
                  <Card><CardContent className="pt-4 pb-3 text-center">
                    <p className="text-xs text-gray-500">기간 내 지출</p>
                    <p className="text-lg font-bold text-red-600">{expense.toLocaleString()} <span className="text-xs font-normal text-gray-400">{currency}</span></p>
                  </CardContent></Card>
                  <Card><CardContent className="pt-4 pb-3 text-center">
                    <p className="text-xs text-gray-500">차액</p>
                    <p className="text-lg font-bold">{(income - expense).toLocaleString()} <span className="text-xs font-normal text-gray-400">{currency}</span></p>
                  </CardContent></Card>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {bankAccounts.map(a => (
              <div key={a.id} className="px-2.5 py-1 bg-gray-50 border rounded-full text-xs">
                <span className="text-gray-500">{a.account_name}</span> <span className="font-semibold font-mono">{a.current_balance.toLocaleString()} {a.currency}</span>
              </div>
            ))}
            {cashRegisters.map(r => (
              <div key={r.id} className="px-2.5 py-1 bg-gray-50 border rounded-full text-xs">
                <span className="text-gray-500">{r.name}</span> <span className="font-semibold font-mono">{r.current_balance.toLocaleString()}</span>
              </div>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base">거래 내역</CardTitle>
                {permissions.canCreate && (
                  <Button size="sm" className="gap-1.5 h-8" onClick={() => openForm()}><Plus className="w-4 h-4" />거래 추가</Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded-md border overflow-hidden">
                  {(['day', 'month', 'all'] as DateFilterMode[]).map(mode => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => changeFilter(() => setDateFilterMode(mode))}
                      className={`h-8 px-2.5 text-xs transition-colors ${dateFilterMode === mode ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                    >
                      {mode === 'day' ? '일별' : mode === 'month' ? '월별' : '전체 기간'}
                    </button>
                  ))}
                </div>
                {dateFilterMode === 'day' && (
                  <Input type="date" value={dayFilter} onChange={e => changeFilter(() => setDayFilter(e.target.value))} className="h-8 w-[150px] text-xs" />
                )}
                {dateFilterMode === 'month' && (
                  <Input type="month" value={monthFilter} onChange={e => changeFilter(() => setMonthFilter(e.target.value))} className="h-8 w-[150px] text-xs" />
                )}
                <Select value={paymentMethodFilter} onValueChange={v => changeFilter(() => setPaymentMethodFilter(v as typeof paymentMethodFilter))}>
                  <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">전체 수단</SelectItem>
                    <SelectItem value="bank_account" className="text-xs">통장</SelectItem>
                    <SelectItem value="card" className="text-xs">카드</SelectItem>
                    <SelectItem value="cash" className="text-xs">현금</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={v => changeFilter(() => setTypeFilter(v as typeof typeFilter))}>
                  <SelectTrigger className="h-8 w-[100px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">전체 구분</SelectItem>
                    <SelectItem value="income" className="text-xs">수입</SelectItem>
                    <SelectItem value="expense" className="text-xs">지출</SelectItem>
                  </SelectContent>
                </Select>
                <Input placeholder="거래처/적요 검색" value={search} onChange={e => changeFilter(() => setSearch(e.target.value))} className="h-8 w-[160px] text-xs" />
                <span className="text-xs text-gray-400 ml-auto">{filtered.length}건</span>
              </div>

              <div className="border rounded-md overflow-hidden overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left p-2">날짜</th>
                      <th className="text-center p-2">구분</th>
                      <th className="text-left p-2">결제수단</th>
                      <th className="text-left p-2">분류</th>
                      <th className="text-left p-2">거래처</th>
                      <th className="text-left p-2">적요</th>
                      <th className="text-right p-2">수입</th>
                      <th className="text-right p-2">지출</th>
                      <th className="text-left p-2">작성자</th>
                      <th className="p-2 w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.length === 0 ? (
                      <tr><td colSpan={10} className="text-center py-8 text-gray-400">내역이 없습니다.</td></tr>
                    ) : paged.map(t => (
                      <tr key={t.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => openForm(t)}>
                        <td className="p-2 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1">
                            {t.transaction_date}
                            {t.attachments && t.attachments.length > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-gray-400" title={`영수증 ${t.attachments.length}개`}>
                                <Paperclip className="w-3 h-3" />{t.attachments.length}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="p-2 text-center">
                          <Badge className={`text-[10px] ${t.transaction_type === 'income' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>{t.transaction_type === 'income' ? '수입' : '지출'}</Badge>
                        </td>
                        <td className="p-2 whitespace-nowrap">{PAYMENT_METHOD_LABELS[t.payment_method]}{t.bank_account_name ? ` · ${t.bank_account_name}` : ''}{t.card_name ? ` · ${t.card_name}` : ''}{t.cash_register_name ? ` · ${t.cash_register_name}` : ''}</td>
                        <td className="p-2">{t.category_name || '-'}</td>
                        <td className="p-2">{t.counterparty || '-'}</td>
                        <td className="p-2 text-gray-500">{t.description || '-'}</td>
                        <td className="p-2 text-right font-mono font-semibold text-blue-700">
                          {t.transaction_type === 'income' ? Number(t.amount).toLocaleString() : ''}
                        </td>
                        <td className="p-2 text-right font-mono font-semibold text-red-600">
                          {t.transaction_type === 'expense' ? Number(t.amount).toLocaleString() : ''}
                        </td>
                        <td className="p-2 text-gray-500">{t.created_by_name || '-'}</td>
                        <td className="p-2 text-center" onClick={e => e.stopPropagation()}>
                          <div className="flex justify-center gap-0.5">
                            {permissions.canEdit && <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => openForm(t)}><Edit2 className="h-3 w-3" /></Button>}
                            {permissions.canDelete && <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400 hover:text-red-600" onClick={() => handleDelete(t)}><Trash2 className="h-3 w-3" /></Button>}
                          </div>
                        </td>
                      </tr>
                    ))}
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
        </>
      )}

      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>분류(계정과목) 관리</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setCategoryFormType('expense')} className={`h-8 rounded-md text-sm border transition-colors ${categoryFormType === 'expense' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-200'}`}>지출 분류</button>
              <button type="button" onClick={() => setCategoryFormType('income')} className={`h-8 rounded-md text-sm border transition-colors ${categoryFormType === 'income' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200'}`}>수입 분류</button>
            </div>
            <div className="flex gap-2">
              <Input value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} placeholder="새 분류명" className="h-9 text-sm" disabled={categorySaving} />
              <Button size="sm" className="h-9" onClick={handleAddCategory} disabled={categorySaving || !newCategoryName.trim()}>추가</Button>
            </div>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {categories.filter(c => c.transaction_type === categoryFormType).map(c => (
                <div key={c.id} className="flex items-center justify-between px-2.5 py-1.5 bg-gray-50 rounded-md text-sm">
                  <span>{c.name}</span>
                  {!c.is_system && (
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400 hover:text-red-600" onClick={() => handleDeleteCategory(c)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  )}
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoryDialogOpen(false)}>닫기</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
