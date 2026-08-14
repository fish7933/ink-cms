import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Save, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import CashTransactionForm, { type CashTransactionFormState } from '@/components/accounting/CashTransactionForm';
import {
  getCashTransactions, updateCashTransaction, deleteCashTransaction,
} from '@/services/accounting-cash-transaction.service';
import { getBankAccounts } from '@/services/accounting-bank-account.service';
import { getCards } from '@/services/accounting-card.service';
import { getCashRegisters } from '@/services/accounting-cash-register.service';
import { getCategories, addCategory, deleteCategory } from '@/services/accounting-category.service';
import { getCurrentUser } from '@/lib/store';
import { uploadCompressed } from '@/lib/upload';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { useTabContext } from '@/contexts/TabContext';
import type {
  CashTransactionWithDetails, BankAccountWithBalance, CardWithDetails, CashRegisterWithBalance, AccountingCategory,
  CashTransactionAttachment,
} from '@/types/accounting';
import type { User } from '@/types/models';

// toISOString()은 UTC 기준이라 한국 시간 자정~오전 9시 사이엔 실제 로컬 날짜보다 하루
// 늦게 계산된다 — 로컬 달력 날짜를 직접 조합해서 이 어긋남을 없앤다.
function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// 금전출납 거래 하나를 별도 탭에서 수정하는 화면 — 목록 화면과 달리 이전/다음 거래로 바로
// 넘나들 수 있고, 상단에 적요가 바로 보여 지금 무슨 거래를 보고 있는지 탭을 오가도 헷갈리지 않는다.
export default function CashTransactionEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const permissions = usePermissions('accounting_cashbook');
  const { activeTabId, closeTab, updateTab } = useTabContext();

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [transactions, setTransactions] = useState<CashTransactionWithDetails[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccountWithBalance[]>([]);
  const [cards, setCards] = useState<CardWithDetails[]>([]);
  const [cashRegisters, setCashRegisters] = useState<CashRegisterWithBalance[]>([]);
  const [categories, setCategories] = useState<AccountingCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState<CashTransactionFormState | null>(null);
  const [attachments, setAttachments] = useState<CashTransactionAttachment[]>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const [dismissedCounterparties, setDismissedCounterparties] = useState<Set<string>>(new Set());
  const [dismissedDescriptions, setDismissedDescriptions] = useState<Set<string>>(new Set());

  const closeThisTab = () => { if (activeTabId) closeTab(activeTabId); else navigate('/accounting/cashbook'); };

  const loadAll = async () => {
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

      const t = txns.find(x => x.id === id);
      if (t) {
        setForm({
          transaction_date: t.transaction_date, payment_method: t.payment_method,
          bank_account_id: t.bank_account_id || '', card_id: t.card_id || '', cash_register_id: t.cash_register_id || '',
          transaction_type: t.transaction_type, category_name: t.category_name || '',
          counterparty: t.counterparty || '', description: t.description || '',
          amount: String(t.amount), currency: t.currency, remarks: t.remarks || '',
        });
        setAttachments(t.attachments || []);
        setNewFiles([]);
      }

      if (me) {
        try {
          const rawC = localStorage.getItem(`cashbook-counterparty-dismissed:${me.id}`);
          if (rawC) setDismissedCounterparties(new Set(JSON.parse(rawC)));
          const rawD = localStorage.getItem(`cashbook-description-dismissed:${me.id}`);
          if (rawD) setDismissedDescriptions(new Set(JSON.parse(rawD)));
        } catch { /* 무시 */ }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const categoriesForType = categories.filter(c => c.transaction_type === form?.transaction_type);
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
  const counterpartyOptions = [...new Set(transactions.map(t => t.counterparty).filter((c): c is string => !!c))].filter(c => !dismissedCounterparties.has(c)).sort((a, b) => a.localeCompare(b, 'ko'));
  const descriptionOptions = [...new Set(transactions.map(t => t.description).filter((d): d is string => !!d))].filter(d => !dismissedDescriptions.has(d)).sort((a, b) => a.localeCompare(b, 'ko'));

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

  const handlePaymentMethodChange = (v: CashTransactionFormState['payment_method']) => {
    setForm(prev => prev && ({ ...prev, payment_method: v, bank_account_id: '', card_id: '', cash_register_id: '' }));
  };
  const handleTypeChange = (v: CashTransactionFormState['transaction_type']) => {
    setForm(prev => prev && ({ ...prev, transaction_type: v, category_name: '' }));
  };

  const resolveCategoryId = async (): Promise<string | null> => {
    if (!form) return null;
    const name = form.category_name.trim();
    if (!name) return null;
    const existing = categories.find(c => c.transaction_type === form.transaction_type && c.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing.id;
    const created = await addCategory({ name, transaction_type: form.transaction_type, display_order: categoriesForType.length + 1 });
    setCategories(prev => [...prev, created]);
    return created.id;
  };

  const handleSave = async () => {
    if (!form || !id) return;
    if (!form.transaction_date) { setError('날짜를 입력하세요.'); return; }
    if (form.transaction_date > today()) { setError('미래 날짜는 입력할 수 없습니다.'); return; }
    if (form.payment_method === 'bank_account' && !form.bank_account_id) { setError('계좌를 선택하세요.'); return; }
    if (form.payment_method === 'card' && !form.card_id) { setError('카드를 선택하세요.'); return; }
    if (form.payment_method === 'cash' && !form.cash_register_id) { setError('시재를 선택하세요.'); return; }
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) { setError('금액을 확인하세요.'); return; }
    setError('');
    try {
      setSaving(true);
      const categoryId = await resolveCategoryId();

      const uploaded: CashTransactionAttachment[] = [];
      for (const file of newFiles) {
        try {
          uploaded.push(await uploadCompressed('documents', `accounting-receipts/${id}/`, file));
        } catch {
          throw new Error(`${file.name} 업로드 실패`);
        }
      }
      const mergedAttachments = [...attachments, ...uploaded];

      // 수정 저장은 부분 업데이트라 source_document_id/source_item_index는 건드리지 않는다 —
      // 지출결의 반영으로 생긴 거래를 여기서 고쳐도 "반영됨" 연결이 끊기면 안 된다.
      await updateCashTransaction(id, {
        transaction_date: form.transaction_date, payment_method: form.payment_method,
        bank_account_id: form.payment_method === 'bank_account' ? form.bank_account_id : null,
        card_id: form.payment_method === 'card' ? form.card_id : null,
        cash_register_id: form.payment_method === 'cash' ? form.cash_register_id : null,
        transaction_type: form.transaction_type, category_id: categoryId,
        counterparty: form.counterparty.trim() || null, description: form.description.trim() || null,
        amount, currency: form.currency, attachments: mergedAttachments, remarks: form.remarks.trim() || null,
      });
      setAttachments(mergedAttachments);
      setNewFiles([]);
      toast({ title: '저장되었습니다.' });
      window.dispatchEvent(new CustomEvent('cashbook-data-changed'));
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    if (!confirm('이 거래 내역을 삭제하시겠습니까?')) return;
    setDeleting(true);
    try {
      await deleteCashTransaction(id, isSystemAdmin);
      toast({ title: '삭제되었습니다.' });
      window.dispatchEvent(new CustomEvent('cashbook-data-changed'));
      closeThisTab();
    } catch (e) {
      toast({ title: '삭제 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const isSystemAdmin = currentUser?.role === 'system_admin';
  const currentIndex = transactions.findIndex(t => t.id === id);
  const currentTransaction = currentIndex >= 0 ? transactions[currentIndex] : null;
  // 지출결의 반영으로 생성된 거래는 시스템관리자만 지울 수 있다(지출결의 반영 화면의
  // "반영 취소"와 동일한 제한 — 여기서 직접 지워버리면 그 제한을 그대로 우회하게 된다).
  const canDeleteThisTransaction = permissions.canDelete && (isSystemAdmin || !currentTransaction?.source_document_id);
  // 이 앱의 탭은 TabContext에 저장된 path로 렌더링을 고정하기 때문에(TabPageRenderer가
  // <Routes location={tab.path}>로 그림), navigate()만 호출하면 브라우저 주소는 바뀌어도
  // 이 탭에 실제로 그려지는 내용은 그대로다 — updateTab으로 탭의 path/title도 같이 갱신해야
  // 실제로 다음/이전 거래로 화면이 넘어간다(CrewDetailPage 등과 동일한 패턴).
  const goToRelative = (offset: number) => {
    const target = transactions[currentIndex + offset];
    if (!target) return;
    const path = `/accounting/cashbook/transaction/${target.id}`;
    if (activeTabId) updateTab(activeTabId, { path, title: target.description || target.counterparty || '거래 수정' });
    navigate(path, { replace: true });
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>;
  }

  if (!form) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6">
        <Button variant="ghost" size="sm" onClick={closeThisTab} className="h-8 px-2 mb-3"><X className="w-4 h-4 mr-1" />닫기</Button>
        <p className="text-sm text-gray-400 text-center py-12">거래 내역을 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
        <div className="flex items-center gap-1 shrink-0">
          <Button type="button" variant="outline" size="sm" className="h-8 w-8 p-0" title="이전 거래" disabled={currentIndex <= 0} onClick={() => goToRelative(-1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-xs text-gray-400 px-1">{currentIndex + 1} / {transactions.length}</span>
          <Button type="button" variant="outline" size="sm" className="h-8 w-8 p-0" title="다음 거래" disabled={currentIndex === -1 || currentIndex >= transactions.length - 1} onClick={() => goToRelative(1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <h1 className="text-base font-semibold text-gray-900 truncate text-center">{form.description || '(적요 없음)'}</h1>
        <Button variant="ghost" size="sm" onClick={closeThisTab} className="h-8 px-2 shrink-0"><X className="w-4 h-4 mr-1" />닫기</Button>
      </div>

      <div className="bg-white border rounded-lg p-4 space-y-4">
        <CashTransactionForm
          form={form}
          onChange={patch => setForm(prev => prev && ({ ...prev, ...patch }))}
          onPaymentMethodChange={handlePaymentMethodChange}
          onTypeChange={handleTypeChange}
          bankAccounts={bankAccounts}
          cards={cards}
          cashRegisters={cashRegisters}
          categoryOptions={categoriesForType.map(c => c.name)}
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
        <div className="flex items-center justify-between pt-2 border-t">
          {canDeleteThisTransaction ? (
            <Button variant="outline" size="sm" className="gap-1.5 text-red-600 border-red-200" disabled={deleting} onClick={handleDelete}>
              <Trash2 className="w-3.5 h-3.5" />삭제
            </Button>
          ) : permissions.canDelete && currentTransaction?.source_document_id ? (
            <span className="text-[11px] text-gray-400">지출결의 반영으로 생성된 거래 — 반영 취소는 지출결의 반영 화면에서(시스템관리자)</span>
          ) : <span />}
          <Button size="sm" onClick={handleSave} disabled={saving || !permissions.canEdit}>
            <Save className="w-3.5 h-3.5 mr-1" />{saving ? '저장 중...' : '저장'}
          </Button>
        </div>
      </div>
    </div>
  );
}
