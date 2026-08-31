import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { ManagementFeeItem, ManagementFeeTemplateItemInput } from '@/lib/management-fee-store';
import type { Nationality } from '@/types/nationality';

const CURRENCIES = ['USD', 'EUR', 'KRW', 'JPY', 'IDR', 'MMK', 'PHP', 'CNY'];

const BILLING_BASIS_LABEL: Record<string, string> = {
  monthly: '월정기(일할)',
  monthly_flat: '월정기(전액)',
  one_time: '1회성(승선월)',
  actual_cost: '실비(수기)',
};

export type EditableManagementFeeTemplateItem = ManagementFeeTemplateItemInput & { clientId: string };

let clientIdSeq = 0;
export function newClientId() {
  clientIdSeq += 1;
  return `new-${Date.now()}-${clientIdSeq}`;
}

interface ManagementFeeTemplateItemRowsProps {
  feeItems: ManagementFeeItem[];
  nationalities: Nationality[];
  rows: EditableManagementFeeTemplateItem[];
  onChange: (rows: EditableManagementFeeTemplateItem[]) => void;
  templateCurrency: string;
}

// 청구 항목 구성 전체를 하나의 표로 편집한다 — 같은 fee_item_id끼리는 시각적으로 묶어 보여주되
// (첫 행에만 항목명 표시 + 굵은 상단 테두리), 상한/부가세는 그 그룹 전체에 적용되는 값이라
// 어느 행에서 바꿔도 같은 fee_item_id의 모든 행에 동일하게 반영된다.
export default function ManagementFeeTemplateItemRows({
  feeItems, nationalities, rows, onChange, templateCurrency,
}: ManagementFeeTemplateItemRowsProps) {
  const [addFeeItemId, setAddFeeItemId] = useState('');

  const feeItemById = new Map(feeItems.map(f => [f.id, f]));
  const usedFeeItemIds = new Set(rows.map(r => r.fee_item_id));
  const availableFeeItems = feeItems.filter(f => !usedFeeItemIds.has(f.id));

  // 카탈로그 순서(display_order)를 그대로 그룹 표시 순서로 사용
  const groupOrder = feeItems.map(f => f.id).filter(id => usedFeeItemIds.has(id));

  const updateRow = (clientId: string, patch: Partial<EditableManagementFeeTemplateItem>) => {
    onChange(rows.map(r => r.clientId === clientId ? { ...r, ...patch } : r));
  };

  const removeRow = (clientId: string) => {
    onChange(rows.filter(r => r.clientId !== clientId));
  };

  const addGroup = () => {
    if (!addFeeItemId) return;
    const feeItem = feeItemById.get(addFeeItemId);
    if (!feeItem) return;
    onChange([...rows, {
      clientId: newClientId(),
      fee_item_id: addFeeItemId,
      rank_category: null,
      nationality_code: null,
      ship_type: null,
      billing_basis: feeItem.default_billing_basis,
      amount: 0,
      currency: templateCurrency,
      ship_cap_amount: null,
      is_vat_applicable: false,
    }]);
    setAddFeeItemId('');
  };

  const addConditionRow = (feeItemId: string) => {
    const groupRows = rows.filter(r => r.fee_item_id === feeItemId);
    const template = groupRows[0];
    const feeItem = feeItemById.get(feeItemId);
    onChange([...rows, {
      clientId: newClientId(),
      fee_item_id: feeItemId,
      rank_category: null,
      nationality_code: null,
      ship_type: null,
      billing_basis: template?.billing_basis ?? feeItem?.default_billing_basis ?? 'monthly',
      amount: 0,
      currency: template?.currency ?? templateCurrency,
      ship_cap_amount: template?.ship_cap_amount ?? null,
      is_vat_applicable: template?.is_vat_applicable ?? false,
    }]);
  };

  const toggleGroupCap = (feeItemId: string, enabled: boolean) => {
    const groupRows = rows.filter(r => r.fee_item_id === feeItemId);
    const sharedCurrency = groupRows[0]?.currency ?? templateCurrency;
    onChange(rows.map(r => r.fee_item_id === feeItemId
      ? { ...r, ship_cap_amount: enabled ? 0 : null, currency: enabled ? sharedCurrency : r.currency }
      : r));
  };

  const setGroupCapAmount = (feeItemId: string, amount: number) => {
    onChange(rows.map(r => r.fee_item_id === feeItemId ? { ...r, ship_cap_amount: amount } : r));
  };

  const setGroupCapCurrency = (feeItemId: string, currency: string) => {
    onChange(rows.map(r => r.fee_item_id === feeItemId ? { ...r, currency } : r));
  };

  const toggleGroupVat = (feeItemId: string, enabled: boolean) => {
    onChange(rows.map(r => r.fee_item_id === feeItemId ? { ...r, is_vat_applicable: enabled } : r));
  };

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <div className="text-center py-6 text-sm text-gray-400 border rounded-md">
          추가된 청구 항목이 없습니다. 아래에서 항목을 선택해 조건을 추가하세요.
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-[10px] h-8 px-2">청구 항목</TableHead>
                <TableHead className="text-[10px] h-8 px-2">직급구분</TableHead>
                <TableHead className="text-[10px] h-8 px-2">국적</TableHead>
                <TableHead className="text-[10px] h-8 px-2">과금 방식</TableHead>
                <TableHead className="text-[10px] h-8 px-2 text-right">금액</TableHead>
                <TableHead className="text-[10px] h-8 px-2">통화</TableHead>
                <TableHead className="text-[10px] h-8 px-2">선박당 월 상한</TableHead>
                <TableHead className="text-[10px] h-8 px-2">부가세</TableHead>
                <TableHead className="text-[10px] h-8 px-2 w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groupOrder.map(feeItemId => {
                const feeItem = feeItemById.get(feeItemId);
                const groupRows = rows.filter(r => r.fee_item_id === feeItemId);
                const capEnabled = groupRows.some(r => r.ship_cap_amount != null);
                const capAmount = groupRows[0]?.ship_cap_amount ?? 0;
                const capCurrency = groupRows[0]?.currency ?? templateCurrency;
                const vatEnabled = groupRows.some(r => r.is_vat_applicable);

                return groupRows.map((row, idx) => (
                  <TableRow key={row.clientId} className={idx === 0 ? 'border-t-2' : ''}>
                    <TableCell className="p-1.5 align-top">
                      {idx === 0 && (
                        <div className="flex items-center justify-between gap-1 pt-1">
                          <span className="text-xs font-semibold whitespace-nowrap">{feeItem?.name || 'Unknown'}</span>
                          <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-400 hover:text-gray-700" onClick={() => addConditionRow(feeItemId)} title="조건 추가">
                            <Plus className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="p-1">
                      <Select value={row.rank_category ?? 'all'} onValueChange={v => updateRow(row.clientId, { rank_category: v === 'all' ? null : v as 'officer' | 'rating' })}>
                        <SelectTrigger className="h-7 text-xs w-24"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all" className="text-xs">전체</SelectItem>
                          <SelectItem value="officer" className="text-xs">사관</SelectItem>
                          <SelectItem value="rating" className="text-xs">부원</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="p-1">
                      <Select value={row.nationality_code ?? 'all'} onValueChange={v => updateRow(row.clientId, { nationality_code: v === 'all' ? null : v })}>
                        <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all" className="text-xs">전체</SelectItem>
                          {nationalities.map(n => <SelectItem key={n.id} value={n.country_code} className="text-xs">{n.country_name_ko}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="p-1">
                      <Select value={row.billing_basis} onValueChange={v => updateRow(row.clientId, { billing_basis: v as 'monthly' | 'monthly_flat' | 'one_time' | 'actual_cost' })}>
                        <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(['monthly', 'monthly_flat', 'one_time', 'actual_cost'] as const).map(b => (
                            <SelectItem key={b} value={b} className="text-xs">{BILLING_BASIS_LABEL[b]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="p-1">
                      {row.billing_basis === 'actual_cost' ? (
                        <div className="h-7 flex items-center justify-end text-xs text-gray-400 w-24">수기 입력</div>
                      ) : (
                        <Input
                          type="number" min={0} value={row.amount || ''}
                          onChange={e => updateRow(row.clientId, { amount: parseFloat(e.target.value) || 0 })}
                          className="h-7 text-xs text-right w-24"
                        />
                      )}
                    </TableCell>
                    <TableCell className="p-1">
                      <Select
                        value={row.currency}
                        onValueChange={v => updateRow(row.clientId, { currency: v })}
                        disabled={capEnabled}
                      >
                        <SelectTrigger className="h-7 text-xs w-20"><SelectValue /></SelectTrigger>
                        <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}</SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="p-1 align-top">
                      {idx === 0 && (
                        <div className="flex items-center gap-1.5 pt-1.5">
                          <Checkbox checked={capEnabled} onCheckedChange={checked => toggleGroupCap(feeItemId, !!checked)} />
                          {capEnabled && (
                            <>
                              <Input
                                type="number" min={0} value={capAmount || ''}
                                onChange={e => setGroupCapAmount(feeItemId, parseFloat(e.target.value) || 0)}
                                className="h-6 text-xs w-16"
                              />
                              <Select value={capCurrency} onValueChange={v => setGroupCapCurrency(feeItemId, v)}>
                                <SelectTrigger className="h-6 text-xs w-14"><SelectValue /></SelectTrigger>
                                <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}</SelectContent>
                              </Select>
                            </>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="p-1 align-top">
                      {idx === 0 && (
                        <div className="pt-1.5">
                          <Checkbox checked={vatEnabled} onCheckedChange={checked => toggleGroupVat(feeItemId, !!checked)} />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="p-1">
                      <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => removeRow(row.clientId)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ));
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {availableFeeItems.length > 0 && (
        <div className="flex items-center gap-2 pt-1">
          <Select value={addFeeItemId} onValueChange={setAddFeeItemId}>
            <SelectTrigger className="h-8 text-xs w-56"><SelectValue placeholder="추가할 청구 항목 선택" /></SelectTrigger>
            <SelectContent>
              {availableFeeItems.map(f => <SelectItem key={f.id} value={f.id} className="text-xs">{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button type="button" size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={addGroup} disabled={!addFeeItemId}>
            <Plus className="w-3.5 h-3.5" />항목 추가
          </Button>
        </div>
      )}
    </div>
  );
}
