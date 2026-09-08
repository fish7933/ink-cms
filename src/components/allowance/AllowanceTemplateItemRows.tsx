import { Fragment, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, SlidersHorizontal } from 'lucide-react';
import type { AllowanceItem, AllowanceKind, AllowancePaymentBasis, AllowancePaymentMethod } from '@/types/allowance';
import type { Rank } from '@/types/models';

export interface EditableAllowanceTemplateItem {
  clientId: string;
  allowance_item_id: string;
  rank_id: string | null; // null = 전 직급 공통
  kind: AllowanceKind;
  amount: number;
  currency: string;
  payment_basis: AllowancePaymentBasis;
  payment_method: AllowancePaymentMethod;
  // 지급 조건 — 전부 비우면 조건 없이 무조건 지급. 실제 발령 화면에서 조건 충족 여부를
  // 보여줄 뿐, 최종 적용 여부는 발령자가 결정한다(자동으로 지급을 막지 않음).
  max_payout_count: number | null;
  min_prior_contract_months: number | null;
  max_gap_months: number | null;
  reset_on_owner_change: boolean;
}

export const newClientId = () => `c${Date.now()}${Math.random().toString(36).slice(2, 8)}`;

const BASIS_LABELS: Record<AllowancePaymentBasis, string> = { monthly: '매월 지급', on_embark_once: '승선월 1회', disembark_settlement: '하선 시 정산' };
const METHOD_LABELS: Record<AllowancePaymentMethod, string> = { ship_direct: '본선 직접지급', owner_billed: '선주 청구' };
const ALL_RANKS_VALUE = '__all__';

interface Props {
  allowanceItems: AllowanceItem[];
  ranks: Rank[];
  rows: EditableAllowanceTemplateItem[];
  onChange: (rows: EditableAllowanceTemplateItem[]) => void;
}

// 수당/공제 템플릿의 항목 구성 편집 — 급여표처럼 매트릭스를 강제하지 않고, 행마다
// (항목, 직급, 금액, 지급방식, 지급주체, 지급 조건)를 자유롭게 설정하는 목록형 편집기. 직급을
// "전 직급 공통"으로 두면 그 항목이 지정한 직급이 없는 모든 대상에게 적용된다.
export default function AllowanceTemplateItemRows({ allowanceItems, ranks, rows, onChange }: Props) {
  const itemById = new Map(allowanceItems.map(i => [i.id, i]));
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpanded = (clientId: string) =>
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId); else next.add(clientId);
      return next;
    });

  const addRow = () => {
    const first = allowanceItems[0];
    if (!first) return;
    onChange([...rows, {
      clientId: newClientId(),
      allowance_item_id: first.id,
      rank_id: null,
      kind: first.kind,
      amount: 0,
      currency: 'USD',
      payment_basis: first.payment_basis,
      payment_method: first.payment_method,
      max_payout_count: null,
      min_prior_contract_months: null,
      max_gap_months: null,
      reset_on_owner_change: true,
    }]);
  };

  const updateRow = (clientId: string, patch: Partial<EditableAllowanceTemplateItem>) => {
    onChange(rows.map(r => r.clientId === clientId ? { ...r, ...patch } : r));
  };

  const removeRow = (clientId: string) => onChange(rows.filter(r => r.clientId !== clientId));

  const hasConditions = (row: EditableAllowanceTemplateItem) =>
    row.max_payout_count != null || row.min_prior_contract_months != null || row.max_gap_months != null;

  return (
    <div className="space-y-2">
      {rows.length === 0 ? (
        <div className="text-center py-6 text-sm text-gray-400 border rounded-md">등록된 항목이 없습니다. 아래에서 행을 추가하세요.</div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs w-48">항목</TableHead>
                <TableHead className="text-xs w-40">직급</TableHead>
                <TableHead className="text-xs w-32">금액</TableHead>
                <TableHead className="text-xs w-24">통화</TableHead>
                <TableHead className="text-xs w-36">지급방식</TableHead>
                <TableHead className="text-xs w-36">지급주체</TableHead>
                <TableHead className="w-10"></TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(row => {
                const item = itemById.get(row.allowance_item_id);
                const expanded = expandedIds.has(row.clientId);
                return (
                  <Fragment key={row.clientId}>
                    <TableRow>
                      <TableCell>
                        <Select
                          value={row.allowance_item_id}
                          onValueChange={v => {
                            const nextItem = itemById.get(v);
                            updateRow(row.clientId, { allowance_item_id: v, kind: nextItem?.kind || 'allowance' });
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {allowanceItems.map(i => <SelectItem key={i.id} value={i.id} className="text-xs">{i.name} ({i.kind === 'deduction' ? '공제' : '수당'})</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={row.rank_id ?? ALL_RANKS_VALUE}
                          onValueChange={v => updateRow(row.clientId, { rank_id: v === ALL_RANKS_VALUE ? null : v })}
                        >
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={ALL_RANKS_VALUE} className="text-xs">전 직급 공통</SelectItem>
                            {ranks.map(r => <SelectItem key={r.id} value={r.id} className="text-xs">{r.rank_code} ({r.name})</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input type="number" value={row.amount} onChange={e => updateRow(row.clientId, { amount: Number(e.target.value) })} className="h-8 text-xs" />
                      </TableCell>
                      <TableCell>
                        <Select value={row.currency} onValueChange={v => updateRow(row.clientId, { currency: v })}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="USD" className="text-xs">USD</SelectItem>
                            <SelectItem value="KRW" className="text-xs">KRW</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select value={row.payment_basis} onValueChange={v => updateRow(row.clientId, { payment_basis: v as AllowancePaymentBasis })}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>{Object.entries(BASIS_LABELS).map(([v, l]) => <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>)}</SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {(item?.kind ?? row.kind) === 'allowance' ? (
                          <Select value={row.payment_method} onValueChange={v => updateRow(row.clientId, { payment_method: v as AllowancePaymentMethod })}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>{Object.entries(METHOD_LABELS).map(([v, l]) => <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>)}</SelectContent>
                          </Select>
                        ) : <span className="text-xs text-gray-400">-</span>}
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button" variant="ghost" size="sm"
                          className={`h-7 w-7 p-0 ${hasConditions(row) ? 'text-blue-600' : 'text-gray-400'} hover:text-blue-700`}
                          onClick={() => toggleExpanded(row.clientId)}
                          title="지급 조건"
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                      <TableCell>
                        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-600" onClick={() => removeRow(row.clientId)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                    {expanded && (
                      <TableRow className="bg-gray-50/60">
                        <TableCell colSpan={8}>
                          <div className="grid grid-cols-4 gap-3 py-1">
                            <div className="space-y-1">
                              <Label className="text-[11px] text-gray-500">최대 지급 횟수</Label>
                              <Input
                                type="number" placeholder="무제한"
                                value={row.max_payout_count ?? ''}
                                onChange={e => updateRow(row.clientId, { max_payout_count: e.target.value === '' ? null : Number(e.target.value) })}
                                className="h-8 text-xs"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-gray-500">직전 계약 최소 개월</Label>
                              <Input
                                type="number" placeholder="조건 없음"
                                value={row.min_prior_contract_months ?? ''}
                                onChange={e => updateRow(row.clientId, { min_prior_contract_months: e.target.value === '' ? null : Number(e.target.value) })}
                                className="h-8 text-xs"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-gray-500">재승선 인정 기간(개월)</Label>
                              <Input
                                type="number" placeholder="제한 없음"
                                value={row.max_gap_months ?? ''}
                                onChange={e => updateRow(row.clientId, { max_gap_months: e.target.value === '' ? null : Number(e.target.value) })}
                                className="h-8 text-xs"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-gray-500">선주 변경 시 초기화</Label>
                              <div className="flex items-center h-8">
                                <Checkbox
                                  checked={row.reset_on_owner_change}
                                  onCheckedChange={c => updateRow(row.clientId, { reset_on_owner_change: c === true })}
                                />
                              </div>
                            </div>
                          </div>
                          <p className="text-[11px] text-gray-400 pb-1">조건을 비워두면 무조건 지급됩니다. 조건은 발령 화면에서 지급 대상 여부를 보여줄 뿐, 최종 적용은 발령자가 결정합니다.</p>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={addRow} disabled={allowanceItems.length === 0}>
        <Plus className="w-3.5 h-3.5" />행 추가
      </Button>
    </div>
  );
}
