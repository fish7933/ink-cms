import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Edit2, Receipt, Settings2, ChevronLeft, ChevronRight, Paperclip, FileDown, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import CashTransactionForm, { emptyCashTransactionForm, type CashTransactionFormState } from '@/components/accounting/CashTransactionForm';
import {
  getCashTransactions, addCashTransaction, deleteCashTransaction,
} from '@/services/accounting-cash-transaction.service';
import { getBankAccounts } from '@/services/accounting-bank-account.service';
import { getCards } from '@/services/accounting-card.service';
import { getCashRegisters } from '@/services/accounting-cash-register.service';
import { getCategories, addCategory, deleteCategory } from '@/services/accounting-category.service';
import { getCurrentUser } from '@/lib/store';
import { uploadCompressed } from '@/lib/upload';
import { exportAccountingLedgerWorkbook, type ExportDateRange } from '@/utils/accounting-excel-export';
import type {
  CashTransactionWithDetails, BankAccountWithBalance, CardWithDetails, CashRegisterWithBalance, AccountingCategory,
  AccountingTransactionType, AccountingPaymentMethod, CashTransactionAttachment,
} from '@/types/accounting';
import type { User } from '@/types/models';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { useTabContext } from '@/contexts/TabContext';

const CURRENCY_LABELS: Record<string, string> = { KRW: '원화', USD: '미화', EUR: '유로', JPY: '엔화' };
const CURRENCY_SYMBOLS: Record<string, string> = { KRW: '₩', USD: '$', EUR: '€', JPY: '¥' };
const CURRENCY_BADGE_COLORS: Record<string, string> = {
  KRW: 'bg-slate-100 text-slate-700 border-slate-300',
  USD: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  EUR: 'bg-indigo-100 text-indigo-700 border-indigo-300',
  JPY: 'bg-amber-100 text-amber-700 border-amber-300',
};
const PAGE_SIZE = 20;
const PAYMENT_METHOD_LABELS: Record<AccountingPaymentMethod, string> = { bank_account: '통장', card: '카드', cash: '현금' };

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// toISOString()은 UTC 기준이라 한국 시간 자정~오전 9시 사이엔 실제 로컬 날짜보다 하루
// 늦게 계산된다 — 로컬 달력 날짜를 직접 조합해서 이 어긋남을 없앤다.
function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function shiftDay(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function lastDayOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m, 0); // 다음달 0일 = 이번달 마지막날
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shiftMonth(month: string, months: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + months, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function currentYear(): string {
  return String(new Date().getFullYear());
}

type DateFilterMode = 'day' | 'month' | 'year' | 'all';

export default function CashbookManagementPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { openNewTab } = useTabContext();
  const permissions = usePermissions('accounting_cashbook');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [transactions, setTransactions] = useState<CashTransactionWithDetails[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccountWithBalance[]>([]);
  const [cards, setCards] = useState<CardWithDetails[]>([]);
  const [cashRegisters, setCashRegisters] = useState<CashRegisterWithBalance[]>([]);
  const [categories, setCategories] = useState<AccountingCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>('day');
  const [monthFilter, setMonthFilter] = useState(currentMonth());
  const [dayFilter, setDayFilter] = useState(today());
  const [yearFilter, setYearFilter] = useState(currentYear());
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<'all' | AccountingPaymentMethod>('all');
  // 통장/카드/현금 필터를 고르면 그 안에서 특정 계좌/카드/시재 하나로 더 좁힐 수 있게 하는 필터.
  const [assetFilter, setAssetFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | AccountingTransactionType>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<CashTransactionFormState>(emptyCashTransactionForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [attachments, setAttachments] = useState<CashTransactionAttachment[]>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);

  const [exporting, setExporting] = useState(false);

  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [categoryFormType, setCategoryFormType] = useState<AccountingTransactionType>('expense');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categorySaving, setCategorySaving] = useState(false);

  // 거래처/적요는 별도 테이블이 없고 과거 거래에서 뽑아낸 값이라 "삭제"는 DB에서 지우는 게
  // 아니라 이 브라우저(계정)의 드롭다운 후보 목록에서만 숨긴다 — DocumentDraftPage의
  // 자주 쓰는 문서 목록 숨기기와 동일한 패턴.
  const [dismissedCounterparties, setDismissedCounterparties] = useState<Set<string>>(new Set());
  const [dismissedDescriptions, setDismissedDescriptions] = useState<Set<string>>(new Set());

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (!currentUser) return;
    try {
      const rawC = localStorage.getItem(`cashbook-counterparty-dismissed:${currentUser.id}`);
      if (rawC) setDismissedCounterparties(new Set(JSON.parse(rawC)));
      const rawD = localStorage.getItem(`cashbook-description-dismissed:${currentUser.id}`);
      if (rawD) setDismissedDescriptions(new Set(JSON.parse(rawD)));
    } catch { /* 무시 */ }
  }, [currentUser]);

  // 거래 수정은 별도 탭(CashTransactionEditPage)에서 이뤄지므로, 그 탭에서 저장/삭제가
  // 일어나면 이 목록도 최신 상태로 다시 불러온다.
  useEffect(() => {
    const handler = () => loadData();
    window.addEventListener('cashbook-data-changed', handler);
    return () => window.removeEventListener('cashbook-data-changed', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dismissCounterparty = (opt: string) => {
    if (!currentUser) return;
    setDismissedCounterparties(prev => {
      const next = new Set(prev).add(opt);
      localStorage.setItem(`cashbook-counterparty-dismissed:${currentUser.id}`, JSON.stringify([...next]));
      return next;
    });
  };
  const dismissDescription = (opt: string) => {
    if (!currentUser) return;
    setDismissedDescriptions(prev => {
      const next = new Set(prev).add(opt);
      localStorage.setItem(`cashbook-description-dismissed:${currentUser.id}`, JSON.stringify([...next]));
      return next;
    });
  };
  const deleteCategoryOption = async (name: string) => {
    const cat = categoriesForType.find(c => c.name === name);
    if (!cat) return;
    if (cat.is_system) { toast({ title: '시스템 기본 분류는 삭제할 수 없습니다.', variant: 'destructive' }); return; }
    try {
      await deleteCategory(cat);
      setCategories(await getCategories());
    } catch (e) {
      toast({ title: '분류 삭제 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

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

  const bankAccountById = useMemo(() => new Map(bankAccounts.map(a => [a.id, a])), [bankAccounts]);
  const cardById = useMemo(() => new Map(cards.map(c => [c.id, c])), [cards]);

  // 거래 하나가 어느 자산에 딸린 건지 찾아 계좌번호/카드번호까지 포함한 검색용 텍스트를 만든다.
  const assetSearchText = (t: CashTransactionWithDetails): string => {
    if (t.payment_method === 'bank_account' && t.bank_account_id) {
      const a = bankAccountById.get(t.bank_account_id);
      return a ? `${a.bank_name} ${a.account_name} ${a.account_number}` : '';
    }
    if (t.payment_method === 'card' && t.card_id) {
      const c = cardById.get(t.card_id);
      return c ? `${c.card_name} ${c.issuer} ${c.card_number_last4 || ''}` : '';
    }
    return '';
  };

  const filtered = useMemo(() => {
    return transactions
      .filter(t => {
        if (dateFilterMode === 'all') return true;
        if (dateFilterMode === 'day') return t.transaction_date === dayFilter;
        if (dateFilterMode === 'year') return t.transaction_date.slice(0, 4) === yearFilter;
        return t.transaction_date.slice(0, 7) === monthFilter;
      })
      .filter(t => paymentMethodFilter === 'all' || t.payment_method === paymentMethodFilter)
      .filter(t => {
        if (!assetFilter) return true;
        if (paymentMethodFilter === 'bank_account') return t.bank_account_id === assetFilter;
        if (paymentMethodFilter === 'card') return t.card_id === assetFilter;
        if (paymentMethodFilter === 'cash') return t.cash_register_id === assetFilter;
        return true;
      })
      .filter(t => typeFilter === 'all' || t.transaction_type === typeFilter)
      .filter(t => {
        if (!search.trim()) return true;
        const q = search.trim().toLowerCase();
        return (t.counterparty || '').toLowerCase().includes(q)
          || (t.description || '').toLowerCase().includes(q)
          || assetSearchText(t).toLowerCase().includes(q);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, dateFilterMode, monthFilter, dayFilter, yearFilter, paymentMethodFilter, assetFilter, typeFilter, search, bankAccountById, cardById]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const changeFilter = (fn: () => void) => { fn(); setPage(1); setSelectedIds(new Set()); };

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      let range: ExportDateRange;
      if (dateFilterMode === 'day') {
        range = { start: dayFilter, end: dayFilter, label: dayFilter };
      } else if (dateFilterMode === 'month') {
        range = { start: `${monthFilter}-01`, end: lastDayOfMonth(monthFilter), label: monthFilter };
      } else if (dateFilterMode === 'year') {
        range = { start: `${yearFilter}-01-01`, end: `${yearFilter}-12-31`, label: yearFilter };
      } else {
        range = { start: null, end: null, label: '전체기간' };
      }
      await exportAccountingLedgerWorkbook(range);
    } catch (e) {
      toast({ title: '엑셀 내보내기 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  // 통화가 다르면 그냥 더하는 게 의미가 없으므로(원화/달러) 통화별로 따로 합산한다.
  // 실제 등록된 계좌가 쓰는 두 통화(KRW/USD)는 그 기간에 거래가 하나도 없어도 0으로 항상 보여준다.
  const currencyTotals = useMemo(() => {
    const map = new Map<string, { income: number; expense: number }>([
      ['KRW', { income: 0, expense: 0 }],
      ['USD', { income: 0, expense: 0 }],
    ]);
    for (const t of filtered) {
      const cur = map.get(t.currency) || { income: 0, expense: 0 };
      if (t.transaction_type === 'income') cur.income += Number(t.amount);
      else cur.expense += Number(t.amount);
      map.set(t.currency, cur);
    }
    return [...map.entries()].sort(([a], [b]) => (a === 'KRW' ? -1 : b === 'KRW' ? 1 : a.localeCompare(b)));
  }, [filtered]);

  // 잔액 칩은 지금까지 계속 "오늘 기준 최신 잔액"만 보여줘서, 월별로 지난 달을 보고 있어도
  // 그 달과 무관한 최신 잔액이 표시되는 문제가 있었다 — 필터 기준에 맞는 날짜(일별=그 날짜,
  // 월별=그 달 말일, 전체=오늘)까지의 거래만 반영한 잔액을 그때그때 다시 계산해서 보여준다.
  const balanceAsOfDate = useMemo(() => {
    if (dateFilterMode === 'day') return dayFilter;
    if (dateFilterMode === 'month') return lastDayOfMonth(monthFilter);
    if (dateFilterMode === 'year') return `${yearFilter}-12-31`;
    return today();
  }, [dateFilterMode, dayFilter, monthFilter, yearFilter]);

  const balanceAsOf = (openingBalance: number, accountId: string, field: 'bank_account_id' | 'cash_register_id') => {
    let balance = openingBalance;
    for (const t of transactions) {
      if (t[field] !== accountId) continue;
      if (t.transaction_date > balanceAsOfDate) continue;
      balance += t.transaction_type === 'income' ? Number(t.amount) : -Number(t.amount);
    }
    return balance;
  };

  const categoriesForType = categories.filter(c => c.transaction_type === form.transaction_type);
  const categoryOptions = categoriesForType.map(c => c.name);

  // 한 번 입력된 거래처는 다음부터 드롭다운으로 골라 쓸 수 있게 하되(datalist), 목록에 없는
  // 이름도 자유롭게 새로 입력할 수 있다.
  const counterpartyOptions = useMemo(
    () => [...new Set(transactions.map(t => t.counterparty).filter((c): c is string => !!c))].filter(c => !dismissedCounterparties.has(c)).sort((a, b) => a.localeCompare(b, 'ko')),
    [transactions, dismissedCounterparties]
  );
  const descriptionOptions = useMemo(
    () => [...new Set(transactions.map(t => t.description).filter((d): d is string => !!d))].filter(d => !dismissedDescriptions.has(d)).sort((a, b) => a.localeCompare(b, 'ko')),
    [transactions, dismissedDescriptions]
  );

  const openAddForm = () => {
    setError('');
    setForm(emptyCashTransactionForm());
    setAttachments([]);
    setNewFiles([]);
    setAdding(true);
  };
  const closeForm = () => { setAdding(false); setError(''); };

  // 기존 거래 수정은 목록에서 벗어나지 않도록 별도 탭으로 연다(CashTransactionEditPage) —
  // 필터/스크롤 위치를 잃지 않고 여러 건을 오가며 볼 수 있다.
  const openEditTab = (t: CashTransactionWithDetails) => {
    openNewTab(`/accounting/cashbook/transaction/${t.id}`, t.description || t.counterparty || '거래 수정');
  };

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
    if (form.transaction_date > today()) { setError('미래 날짜는 입력할 수 없습니다.'); return; }
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
        try {
          uploaded.push(await uploadCompressed('documents', `accounting-receipts/${Date.now()}/`, file));
        } catch {
          throw new Error(`${file.name} 업로드 실패`);
        }
      }
      const mergedAttachments = [...attachments, ...uploaded];

      const data = {
        transaction_date: form.transaction_date, payment_method: form.payment_method,
        bank_account_id: form.payment_method === 'bank_account' ? form.bank_account_id : null,
        card_id: form.payment_method === 'card' ? form.card_id : null,
        cash_register_id: form.payment_method === 'cash' ? form.cash_register_id : null,
        transaction_type: form.transaction_type, category_id: categoryId,
        counterparty: form.counterparty.trim() || null, description: form.description.trim() || null,
        amount, currency: form.currency, attachments: mergedAttachments, remarks: form.remarks.trim() || null,
        created_by: currentUser?.id || null,
      };
      await addCashTransaction({ ...data, source_document_id: null, source_item_index: null });
      await loadData();
      // 같은 통장/카드/시재에 계속 거래를 입력하는 경우가 많아, 날짜·결제수단·계좌 선택은
      // 그대로 두고 거래별로 달라지는 항목(분류/거래처/적요/금액/증빙서류)만 비워 바로 이어서 입력할 수 있게 한다.
      setForm(prev => ({ ...prev, category_name: '', counterparty: '', description: '', amount: '', remarks: '' }));
      setAttachments([]);
      setNewFiles([]);
      toast({ title: '저장되었습니다.', description: '이어서 같은 계좌에 거래를 추가할 수 있습니다.' });
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

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAllOnPage = () => {
    setSelectedIds(prev => {
      const allSelected = paged.length > 0 && paged.every(t => prev.has(t.id));
      if (allSelected) return new Set();
      return new Set(paged.map(t => t.id));
    });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`선택한 ${selectedIds.size}건의 거래 내역을 삭제하시겠습니까?`)) return;
    setBulkDeleting(true);
    try {
      for (const id of selectedIds) await deleteCashTransaction(id);
      toast({ title: `${selectedIds.size}건이 삭제되었습니다.` });
      setSelectedIds(new Set());
      await loadData();
    } catch (e) {
      toast({ title: '삭제 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setBulkDeleting(false);
    }
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
        {!adding && (
          <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={() => setCategoryDialogOpen(true)}>
            <Settings2 className="w-3.5 h-3.5" />분류 관리
          </Button>
        )}
      </div>

      {adding ? (
        // 거래 수정(CashTransactionEditPage, 별도 탭)과 완전히 같은 형식 — 다른 점(이전/다음
        // 거래 탐색, 삭제 버튼)은 새 거래에는 해당하지 않아 자연히 빠진다.
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
            <div />
            <h1 className="text-base font-semibold text-gray-900 truncate text-center">거래 추가</h1>
            <Button variant="ghost" size="sm" onClick={closeForm} className="h-8 px-2 shrink-0"><X className="w-4 h-4 mr-1" />닫기</Button>
          </div>
          <div className="bg-white border rounded-lg p-4 space-y-4">
            <CashTransactionForm
              form={form}
              onChange={patch => setForm(prev => ({ ...prev, ...patch }))}
              onPaymentMethodChange={handlePaymentMethodChange}
              onTypeChange={handleTypeChange}
              bankAccounts={bankAccounts}
              cards={cards}
              cashRegisters={cashRegisters}
              categoryOptions={categoryOptions}
              onDeleteCategoryOption={deleteCategoryOption}
              counterpartyOptions={counterpartyOptions}
              onDismissCounterparty={dismissCounterparty}
              descriptionOptions={descriptionOptions}
              onDismissDescription={dismissDescription}
              attachments={attachments}
              newFiles={newFiles}
              onFileChange={handleFileChange}
              onRemoveNewFile={removeNewFile}
              onRemoveExistingAttachment={removeExistingAttachment}
              saving={saving}
              maxDate={today()}
            />
            {error && <Alert variant="destructive"><AlertDescription className="text-xs">{error}</AlertDescription></Alert>}
            <div className="flex items-center justify-end pt-2 border-t">
              <Button size="sm" onClick={handleSave} disabled={saving}><Save className="w-3.5 h-3.5 mr-1" />{saving ? '저장 중...' : '저장'}</Button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-lg border overflow-hidden bg-white">
            <div className="grid grid-cols-[80px_1fr_1fr_1fr] bg-gray-50 border-b">
              <div className="px-4 py-2 text-xs font-medium text-gray-500">통화</div>
              <div className="px-4 py-2 text-xs font-medium text-gray-500 text-right">기간 내 수입</div>
              <div className="px-4 py-2 text-xs font-medium text-gray-500 text-right">기간 내 지출</div>
              <div className="px-4 py-2 text-xs font-medium text-gray-500 text-right">차액</div>
            </div>
            {currencyTotals.map(([currency, { income, expense }]) => (
              <div key={currency} className="grid grid-cols-[80px_1fr_1fr_1fr] items-center border-b last:border-0 hover:bg-gray-50/60 transition-colors">
                <div className="px-4 py-2.5">
                  <Badge variant="outline" className="text-xs font-medium text-gray-600 border-gray-300">{CURRENCY_LABELS[currency] || currency}</Badge>
                </div>
                <div className="px-4 py-2.5 text-right font-mono font-semibold text-sm text-blue-700">{income.toLocaleString()}</div>
                <div className="px-4 py-2.5 text-right font-mono font-semibold text-sm text-red-600">{expense.toLocaleString()}</div>
                <div className="px-4 py-2.5 text-right font-mono font-semibold text-sm">{(income - expense).toLocaleString()}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-gray-400">{balanceAsOfDate} 기준 잔액</span>
            {bankAccounts.map(a => (
              <div key={a.id} className="px-2.5 py-1 bg-gray-50 border rounded-full text-xs">
                <span className="text-gray-500">{a.account_name}</span> <span className="font-semibold font-mono">{balanceAsOf(Number(a.opening_balance), a.id, 'bank_account_id').toLocaleString()} {a.currency}</span>
              </div>
            ))}
            {cashRegisters.map(r => (
              <div key={r.id} className="px-2.5 py-1 bg-gray-50 border rounded-full text-xs">
                <span className="text-gray-500">{r.name}</span> <span className="font-semibold font-mono">{balanceAsOf(Number(r.opening_balance), r.id, 'cash_register_id').toLocaleString()} {r.currency}</span>
              </div>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base">거래 내역</CardTitle>
                <div className="flex items-center gap-2">
                  {permissions.canDelete && selectedIds.size > 0 && (
                    <Button size="sm" variant="outline" className="gap-1.5 h-8 text-red-600 border-red-200" disabled={bulkDeleting} onClick={handleBulkDelete}>
                      <Trash2 className="w-3.5 h-3.5" />선택 {selectedIds.size}건 삭제
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={handleExportExcel} disabled={exporting}>
                    <FileDown className="w-3.5 h-3.5" />{exporting ? '내보내는 중...' : '엑셀 다운로드'}
                  </Button>
                  {permissions.canCreate && (
                    <Button size="sm" className="gap-1.5 h-8" onClick={openAddForm}><Plus className="w-4 h-4" />거래 추가</Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded-md border overflow-hidden">
                  {(['day', 'month', 'year', 'all'] as DateFilterMode[]).map(mode => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => changeFilter(() => setDateFilterMode(mode))}
                      className={`h-8 px-2.5 text-xs transition-colors ${dateFilterMode === mode ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                    >
                      {mode === 'day' ? '일별' : mode === 'month' ? '월별' : mode === 'year' ? '연도별' : '전체 기간'}
                    </button>
                  ))}
                </div>
                {dateFilterMode === 'day' && (
                  <div className="flex items-center gap-1">
                    <Button type="button" variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => changeFilter(() => setDayFilter(d => shiftDay(d, -1)))}><ChevronLeft className="w-3.5 h-3.5" /></Button>
                    <Input type="date" value={dayFilter} onChange={e => changeFilter(() => setDayFilter(e.target.value))} className="h-8 w-[150px] text-xs" />
                    <Button type="button" variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => changeFilter(() => setDayFilter(d => shiftDay(d, 1)))}><ChevronRight className="w-3.5 h-3.5" /></Button>
                  </div>
                )}
                {dateFilterMode === 'month' && (
                  <div className="flex items-center gap-1">
                    <Button type="button" variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => changeFilter(() => setMonthFilter(m => shiftMonth(m, -1)))}><ChevronLeft className="w-3.5 h-3.5" /></Button>
                    <Input type="month" value={monthFilter} onChange={e => changeFilter(() => setMonthFilter(e.target.value))} className="h-8 w-[150px] text-xs" />
                    <Button type="button" variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => changeFilter(() => setMonthFilter(m => shiftMonth(m, 1)))}><ChevronRight className="w-3.5 h-3.5" /></Button>
                  </div>
                )}
                {dateFilterMode === 'year' && (
                  <div className="flex items-center gap-1">
                    <Button type="button" variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => changeFilter(() => setYearFilter(y => String(Number(y) - 1)))}><ChevronLeft className="w-3.5 h-3.5" /></Button>
                    <Input type="number" value={yearFilter} onChange={e => changeFilter(() => setYearFilter(e.target.value))} className="h-8 w-[90px] text-xs" />
                    <Button type="button" variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => changeFilter(() => setYearFilter(y => String(Number(y) + 1)))}><ChevronRight className="w-3.5 h-3.5" /></Button>
                  </div>
                )}
                <Select value={paymentMethodFilter} onValueChange={v => changeFilter(() => { setPaymentMethodFilter(v as typeof paymentMethodFilter); setAssetFilter(''); })}>
                  <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">전체 수단</SelectItem>
                    <SelectItem value="bank_account" className="text-xs">통장</SelectItem>
                    <SelectItem value="card" className="text-xs">카드</SelectItem>
                    <SelectItem value="cash" className="text-xs">현금</SelectItem>
                  </SelectContent>
                </Select>
                {paymentMethodFilter === 'bank_account' && (
                  <Select value={assetFilter || '_all'} onValueChange={v => changeFilter(() => setAssetFilter(v === '_all' ? '' : v))}>
                    <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue placeholder="전체 계좌" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_all" className="text-xs">전체 계좌</SelectItem>
                      {bankAccounts.map(a => <SelectItem key={a.id} value={a.id} className="text-xs">{a.bank_name} {a.account_name} ({a.account_number})</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                {paymentMethodFilter === 'card' && (
                  <Select value={assetFilter || '_all'} onValueChange={v => changeFilter(() => setAssetFilter(v === '_all' ? '' : v))}>
                    <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue placeholder="전체 카드" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_all" className="text-xs">전체 카드</SelectItem>
                      {cards.map(c => <SelectItem key={c.id} value={c.id} className="text-xs">{c.card_name}{c.card_number_last4 ? ` (**** ${c.card_number_last4})` : ''}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                {paymentMethodFilter === 'cash' && (
                  <Select value={assetFilter || '_all'} onValueChange={v => changeFilter(() => setAssetFilter(v === '_all' ? '' : v))}>
                    <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue placeholder="전체 시재" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_all" className="text-xs">전체 시재</SelectItem>
                      {cashRegisters.map(r => <SelectItem key={r.id} value={r.id} className="text-xs">{r.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                <div className="flex rounded-md border overflow-hidden">
                  {(['all', 'income', 'expense'] as const).map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => changeFilter(() => setTypeFilter(v))}
                      className={`h-8 px-2.5 text-xs transition-colors ${typeFilter === v ? (v === 'income' ? 'bg-blue-600 text-white' : v === 'expense' ? 'bg-red-600 text-white' : 'bg-gray-700 text-white') : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                    >
                      {v === 'all' ? '전체' : v === 'income' ? '수입' : '지출'}
                    </button>
                  ))}
                </div>
                <Input placeholder="거래처/적요/계좌번호 검색" value={search} onChange={e => changeFilter(() => setSearch(e.target.value))} className="h-8 w-[180px] text-xs" />
                <span className="text-xs text-gray-400 ml-auto">{filtered.length}건</span>
              </div>

              <div className="border rounded-md overflow-hidden overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      {permissions.canDelete && (
                        <th className="p-2 w-8 text-center">
                          <Checkbox checked={paged.length > 0 && paged.every(t => selectedIds.has(t.id))} onCheckedChange={toggleSelectAllOnPage} />
                        </th>
                      )}
                      <th className="text-right p-2 w-10">No.</th>
                      <th className="text-left p-2">날짜</th>
                      <th className="text-center p-2">구분</th>
                      <th className="text-left p-2">결제수단</th>
                      <th className="text-left p-2">분류</th>
                      <th className="text-left p-2">거래처</th>
                      <th className="text-left p-2">적요</th>
                      <th className="text-center p-2 w-16">통화</th>
                      <th className="text-right p-2">수입</th>
                      <th className="text-right p-2">지출</th>
                      <th className="text-left p-2">작성자</th>
                      <th className="p-2 w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.length === 0 ? (
                      <tr><td colSpan={permissions.canDelete ? 13 : 12} className="text-center py-8 text-gray-400">내역이 없습니다.</td></tr>
                    ) : paged.map((t, idx) => (
                      <tr key={t.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => openEditTab(t)}>
                        {permissions.canDelete && (
                          <td className="p-2 text-center" onClick={e => e.stopPropagation()}>
                            <Checkbox checked={selectedIds.has(t.id)} onCheckedChange={() => toggleSelected(t.id)} />
                          </td>
                        )}
                        <td className="p-2 text-right text-gray-400">{(currentPage - 1) * PAGE_SIZE + idx + 1}</td>
                        <td className="p-2 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1">
                            {t.transaction_date}
                            {t.attachments && t.attachments.length > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-gray-400" title={`증빙서류 ${t.attachments.length}개`}>
                                <Paperclip className="w-3 h-3" />{t.attachments.length}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="p-2 text-center">
                          <Badge className={`text-[10px] ${t.transaction_type === 'income' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>{t.transaction_type === 'income' ? '수입' : '지출'}</Badge>
                        </td>
                        <td className="p-2 whitespace-nowrap">{t.bank_account_name || t.card_name || t.cash_register_name || PAYMENT_METHOD_LABELS[t.payment_method]}</td>
                        <td className="p-2">{t.category_name || '-'}</td>
                        <td className="p-2">{t.counterparty || '-'}</td>
                        <td className="p-2 text-gray-500">{t.description || '-'}</td>
                        <td className="p-2 text-center">
                          <Badge variant="outline" className={`text-[10px] font-normal ${CURRENCY_BADGE_COLORS[t.currency] || 'bg-gray-100 text-gray-600 border-gray-300'}`}>{CURRENCY_LABELS[t.currency] || t.currency}</Badge>
                        </td>
                        <td className="p-2 text-right font-mono font-semibold text-blue-700">
                          {t.transaction_type === 'income' ? `${CURRENCY_SYMBOLS[t.currency] || ''}${Number(t.amount).toLocaleString()}` : ''}
                        </td>
                        <td className="p-2 text-right font-mono font-semibold text-red-600">
                          {t.transaction_type === 'expense' ? `${CURRENCY_SYMBOLS[t.currency] || ''}${Number(t.amount).toLocaleString()}` : ''}
                        </td>
                        <td className="p-2 text-gray-500">{t.created_by_name || '-'}</td>
                        <td className="p-2 text-center" onClick={e => e.stopPropagation()}>
                          <div className="flex justify-center gap-0.5">
                            {permissions.canEdit && <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => openEditTab(t)}><Edit2 className="h-3 w-3" /></Button>}
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
