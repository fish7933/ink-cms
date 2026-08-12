import type { ReactNode, ChangeEvent } from 'react';
import { Trash2, Upload, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AutocompleteInput } from '@/components/ui/autocomplete-input';
import { getFileUrl } from '@/lib/upload';
import type {
  BankAccountWithBalance, CardWithDetails, CashRegisterWithBalance,
  AccountingTransactionType, AccountingPaymentMethod, CashTransactionAttachment,
} from '@/types/accounting';

const NONE = '_none';
const CURRENCIES = ['KRW', 'USD', 'EUR', 'JPY'];

export interface CashTransactionFormState {
  transaction_date: string;
  payment_method: AccountingPaymentMethod;
  bank_account_id: string;
  card_id: string;
  cash_register_id: string;
  transaction_type: AccountingTransactionType;
  category_name: string;
  counterparty: string;
  description: string;
  amount: string;
  currency: string;
  remarks: string;
}

export const emptyCashTransactionForm = (): CashTransactionFormState => ({
  transaction_date: new Date().toISOString().slice(0, 10),
  payment_method: 'bank_account',
  bank_account_id: '', card_id: '', cash_register_id: '',
  transaction_type: 'expense',
  category_name: '', counterparty: '', description: '', amount: '', currency: 'KRW', remarks: '',
});

// 라벨(고정폭)+입력(나머지 전체폭)이 한 줄에 오도록 통일 — 위아래로 쭉 훑으면서 입력할 수
// 있어 항목마다 마우스를 좌우로 옮길 필요가 없다.
function FormRow({ label, required, alignTop, children }: { label: string; required?: boolean; alignTop?: boolean; children: ReactNode }) {
  return (
    <div className={`grid grid-cols-[96px_1fr] gap-3 ${alignTop ? 'items-start' : 'items-center'}`}>
      <Label className={`text-xs text-gray-500 ${alignTop ? 'pt-2' : ''}`}>{label}{required && ' *'}</Label>
      <div>{children}</div>
    </div>
  );
}

interface CashTransactionFormProps {
  form: CashTransactionFormState;
  onChange: (patch: Partial<CashTransactionFormState>) => void;
  onPaymentMethodChange: (v: AccountingPaymentMethod) => void;
  onTypeChange: (v: AccountingTransactionType) => void;
  bankAccounts: BankAccountWithBalance[];
  cards: CardWithDetails[];
  cashRegisters: CashRegisterWithBalance[];
  categoryOptions: string[];
  onDeleteCategoryOption: (name: string) => void;
  counterpartyOptions: string[];
  onDismissCounterparty: (opt: string) => void;
  descriptionOptions: string[];
  onDismissDescription: (opt: string) => void;
  attachments: CashTransactionAttachment[];
  newFiles: File[];
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onRemoveNewFile: (idx: number) => void;
  onRemoveExistingAttachment: (idx: number) => void;
  saving: boolean;
  maxDate: string;
}

export default function CashTransactionForm({
  form, onChange, onPaymentMethodChange, onTypeChange, bankAccounts, cards, cashRegisters,
  categoryOptions, onDeleteCategoryOption, counterpartyOptions, onDismissCounterparty,
  descriptionOptions, onDismissDescription, attachments, newFiles, onFileChange,
  onRemoveNewFile, onRemoveExistingAttachment, saving, maxDate,
}: CashTransactionFormProps) {
  return (
    <div className="space-y-2.5">
      <FormRow label="날짜" required>
        <Input type="date" value={form.transaction_date} max={maxDate} onChange={e => onChange({ transaction_date: e.target.value })} className="h-9 text-sm" />
      </FormRow>
      <FormRow label="구분" required>
        <div className="grid grid-cols-2 gap-2 max-w-xs">
          <button type="button" onClick={() => onTypeChange('income')} className={`h-9 rounded-md text-sm border transition-colors ${form.transaction_type === 'income' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>수입</button>
          <button type="button" onClick={() => onTypeChange('expense')} className={`h-9 rounded-md text-sm border transition-colors ${form.transaction_type === 'expense' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>지출</button>
        </div>
      </FormRow>
      <FormRow label="결제수단" required>
        <Select value={form.payment_method} onValueChange={v => onPaymentMethodChange(v as AccountingPaymentMethod)}>
          <SelectTrigger className="h-9 text-sm max-w-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="bank_account">통장</SelectItem>
            <SelectItem value="card">카드</SelectItem>
            <SelectItem value="cash">현금</SelectItem>
          </SelectContent>
        </Select>
      </FormRow>
      {form.payment_method === 'bank_account' && (
        <FormRow label="계좌" required>
          <Select value={form.bank_account_id || NONE} onValueChange={v => onChange({ bank_account_id: v === NONE ? '' : v })}>
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="계좌 선택" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>계좌 선택</SelectItem>
              {bankAccounts.map(a => <SelectItem key={a.id} value={a.id}>{a.bank_name} {a.account_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormRow>
      )}
      {form.payment_method === 'card' && (
        <FormRow label="카드" required>
          <Select value={form.card_id || NONE} onValueChange={v => onChange({ card_id: v === NONE ? '' : v })}>
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="카드 선택" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>카드 선택</SelectItem>
              {cards.map(c => <SelectItem key={c.id} value={c.id}>{c.card_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormRow>
      )}
      {form.payment_method === 'cash' && (
        <FormRow label="시재" required>
          <Select value={form.cash_register_id || NONE} onValueChange={v => onChange({ cash_register_id: v === NONE ? '' : v })}>
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="시재 선택" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>시재 선택</SelectItem>
              {cashRegisters.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormRow>
      )}
      <FormRow label="분류">
        <AutocompleteInput value={form.category_name} onChange={v => onChange({ category_name: v })} options={categoryOptions} onDeleteOption={onDeleteCategoryOption} className="h-9 text-sm" placeholder="분류 입력 또는 검색" />
      </FormRow>
      <FormRow label="거래처">
        <AutocompleteInput value={form.counterparty} onChange={v => onChange({ counterparty: v })} options={counterpartyOptions} onDeleteOption={onDismissCounterparty} className="h-9 text-sm" placeholder="거래처 입력 또는 검색" />
      </FormRow>
      <FormRow label="적요">
        <AutocompleteInput value={form.description} onChange={v => onChange({ description: v })} options={descriptionOptions} onDeleteOption={onDismissDescription} className="h-9 text-sm" placeholder="적요 입력 또는 검색" />
      </FormRow>
      <FormRow label="금액" required>
        <div className="flex gap-2 max-w-xs">
          <Input type="number" step="0.01" value={form.amount} onChange={e => onChange({ amount: e.target.value })} className="h-9 text-sm" />
          <Select value={form.currency} onValueChange={v => onChange({ currency: v })}>
            <SelectTrigger className="h-9 text-sm w-24 shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </FormRow>
      <FormRow label="비고" alignTop>
        <Textarea value={form.remarks} onChange={e => onChange({ remarks: e.target.value })} rows={3} className="text-sm resize-y" placeholder="추가로 남길 메모가 있으면 입력하세요" />
      </FormRow>
      <FormRow label="증빙서류" alignTop>
        <div className="space-y-1.5">
          {(attachments.length > 0 || newFiles.length > 0) && (
            <div className="space-y-1.5">
              {attachments.map((a, idx) => (
                <div key={a.path} className="flex items-center justify-between p-2 bg-gray-50 rounded-md text-sm">
                  <a href={getFileUrl('documents', a.path)} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-blue-600 hover:underline truncate">
                    <FileText className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{a.name}</span>
                  </a>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500 shrink-0" onClick={() => onRemoveExistingAttachment(idx)} disabled={saving}>
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
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500 shrink-0" onClick={() => onRemoveNewFile(idx)} disabled={saving}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <label className="flex items-center justify-center gap-1.5 h-9 border border-dashed rounded-md text-xs text-gray-500 cursor-pointer hover:bg-gray-50">
            <Upload className="w-3.5 h-3.5" />증빙서류 파일 추가 (최대 10MB)
            <input type="file" multiple className="hidden" onChange={onFileChange} disabled={saving} />
          </label>
        </div>
      </FormRow>
    </div>
  );
}
