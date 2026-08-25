import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ManagementFeeItem, ManagementFeeTemplateItemInput } from '@/lib/management-fee-store';
import type { Nationality } from '@/types/nationality';
import type { ShipType } from '@/types/ship-classification';

const CURRENCIES = ['USD', 'EUR', 'KRW', 'JPY', 'IDR', 'MMK', 'PHP', 'CNY'];

const BILLING_BASIS_LABEL: Record<string, string> = {
  monthly: '월정기(일할)',
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
  shipTypes: ShipType[];
  rows: EditableManagementFeeTemplateItem[];
  onChange: (rows: EditableManagementFeeTemplateItem[]) => void;
  templateCurrency: string;
}

export default function ManagementFeeTemplateItemRows({
  feeItems, nationalities, shipTypes, rows, onChange, templateCurrency,
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

  return (
    <div className="space-y-3">
      {groupOrder.length === 0 && (
        <div className="text-center py-6 text-sm text-gray-400 border rounded-md">
          추가된 청구 항목이 없습니다. 아래에서 항목을 선택해 조건을 추가하세요.
        </div>
      )}

      {groupOrder.map(feeItemId => {
        const feeItem = feeItemById.get(feeItemId);
        const groupRows = rows.filter(r => r.fee_item_id === feeItemId);
        const capEnabled = groupRows.some(r => r.ship_cap_amount != null);
        const capAmount = groupRows[0]?.ship_cap_amount ?? 0;
        const capCurrency = groupRows[0]?.currency ?? templateCurrency;

        return (
          <div key={feeItemId} className="border rounded-md overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b">
              <span className="text-sm font-semibold">{feeItem?.name || 'Unknown'}</span>
              <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => addConditionRow(feeItemId)}>
                <Plus className="w-3.5 h-3.5" />조건 추가
              </Button>
            </div>

            <div className="px-3 py-2 border-b bg-amber-50/40 flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <Checkbox checked={capEnabled} onCheckedChange={checked => toggleGroupCap(feeItemId, !!checked)} />
                <span>선박당 월 합계 상한</span>
              </label>
              {capEnabled && (
                <>
                  <Input
                    type="number" min={0} value={capAmount || ''}
                    onChange={e => setGroupCapAmount(feeItemId, parseFloat(e.target.value) || 0)}
                    className="h-7 text-xs w-28"
                  />
                  <Select value={capCurrency} onValueChange={v => setGroupCapCurrency(feeItemId, v)}>
                    <SelectTrigger className="h-7 text-xs w-20"><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}</SelectContent>
                  </Select>
                  <span className="text-[11px] text-amber-700">이 항목의 모든 조건행에 같은 통화·상한이 적용됩니다 (선원 합산 후 상한 초과분은 청구 제외).</span>
                </>
              )}
            </div>

            <div className="divide-y">
              {groupRows.map(row => (
                <div key={row.clientId} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <div className="space-y-0.5">
                    <Label className="text-[10px] text-gray-400">직급구분</Label>
                    <Select value={row.rank_category ?? 'all'} onValueChange={v => updateRow(row.clientId, { rank_category: v === 'all' ? null : v as 'officer' | 'rating' })}>
                      <SelectTrigger className="h-8 text-xs w-24"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all" className="text-xs">전체</SelectItem>
                        <SelectItem value="officer" className="text-xs">사관</SelectItem>
                        <SelectItem value="rating" className="text-xs">부원</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-0.5">
                    <Label className="text-[10px] text-gray-400">국적</Label>
                    <Select value={row.nationality_code ?? 'all'} onValueChange={v => updateRow(row.clientId, { nationality_code: v === 'all' ? null : v })}>
                      <SelectTrigger className="h-8 text-xs w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all" className="text-xs">전체</SelectItem>
                        {nationalities.map(n => <SelectItem key={n.id} value={n.country_code} className="text-xs">{n.country_name_ko}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-0.5">
                    <Label className="text-[10px] text-gray-400">선종</Label>
                    <Select value={row.ship_type ?? 'all'} onValueChange={v => updateRow(row.clientId, { ship_type: v === 'all' ? null : v })}>
                      <SelectTrigger className="h-8 text-xs w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all" className="text-xs">전체</SelectItem>
                        {shipTypes.map(t => <SelectItem key={t.id} value={t.name_ko} className="text-xs">{t.name_ko}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-0.5">
                    <Label className="text-[10px] text-gray-400">과금 방식</Label>
                    <Select value={row.billing_basis} onValueChange={v => updateRow(row.clientId, { billing_basis: v as 'monthly' | 'one_time' | 'actual_cost' })}>
                      <SelectTrigger className="h-8 text-xs w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(['monthly', 'one_time', 'actual_cost'] as const).map(b => (
                          <SelectItem key={b} value={b} className="text-xs">{BILLING_BASIS_LABEL[b]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {row.billing_basis === 'actual_cost' ? (
                    <div className="space-y-0.5">
                      <Label className="text-[10px] text-gray-400">금액</Label>
                      <div className="h-8 flex items-center text-xs text-gray-400 w-40">청구서 작성 시 수기 입력</div>
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      <Label className="text-[10px] text-gray-400">금액</Label>
                      <Input
                        type="number" min={0} value={row.amount || ''}
                        onChange={e => updateRow(row.clientId, { amount: parseFloat(e.target.value) || 0 })}
                        className="h-8 text-xs w-24 text-right"
                      />
                    </div>
                  )}

                  <div className="space-y-0.5">
                    <Label className="text-[10px] text-gray-400">통화</Label>
                    <Select
                      value={row.currency}
                      onValueChange={v => updateRow(row.clientId, { currency: v })}
                      disabled={capEnabled}
                    >
                      <SelectTrigger className="h-8 text-xs w-20"><SelectValue /></SelectTrigger>
                      <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>

                  <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-400 hover:text-red-600 hover:bg-red-50 ml-auto" onClick={() => removeRow(row.clientId)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        );
      })}

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
