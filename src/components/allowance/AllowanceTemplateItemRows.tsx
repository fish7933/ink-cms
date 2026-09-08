import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2 } from 'lucide-react';
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
// (항목, 직급, 금액, 지급방식, 지급주체)를 자유롭게 설정하는 목록형 편집기. 직급을
// "전 직급 공통"으로 두면 그 항목이 지정한 직급이 없는 모든 대상에게 적용된다.
export default function AllowanceTemplateItemRows({ allowanceItems, ranks, rows, onChange }: Props) {
  const itemById = new Map(allowanceItems.map(i => [i.id, i]));

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
    }]);
  };

  const updateRow = (clientId: string, patch: Partial<EditableAllowanceTemplateItem>) => {
    onChange(rows.map(r => r.clientId === clientId ? { ...r, ...patch } : r));
  };

  const removeRow = (clientId: string) => onChange(rows.filter(r => r.clientId !== clientId));

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
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(row => {
                const item = itemById.get(row.allowance_item_id);
                return (
                  <TableRow key={row.clientId}>
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
                      <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-600" onClick={() => removeRow(row.clientId)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
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
