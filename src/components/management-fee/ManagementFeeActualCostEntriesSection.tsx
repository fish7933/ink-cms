import { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import BadgeSelect from '@/components/ui/BadgeSelect';
import { supabase } from '@/lib/supabase';
import { crewDisplayName } from '@/lib/utils';
import {
  getEffectiveTemplateForShip,
  addActualCostEntry,
  updateActualCostEntry,
  deleteActualCostEntry,
  type ManagementFeeItem,
} from '@/lib/management-fee-store';
import type { ManagementFeeLedgerActualCostEntry } from '@/services/management-fee-calc.service';

const CURRENCIES = ['USD', 'EUR', 'KRW', 'JPY', 'IDR', 'MMK', 'PHP', 'CNY'];

interface CrewOption {
  id: string;
  name: string;
  rankCode: string;
  rankGrade: string;
  rankOrder: number;
  embarkDate: string;
  disembarkDate: string | null;
}

interface ManagementFeeActualCostEntriesSectionProps {
  periodId: string;
  shipId: string;
  yearMonth: string;
  entries: ManagementFeeLedgerActualCostEntry[];
  onChanged: () => void;
}

const fmt = (n: number) => n.toLocaleString('en-US');
// 선원 표시는 항상 "직급(등급) 이름" 순서 — 직급이 이름 뒤로 가면 안 된다.
const crewRank = (c: CrewOption) => (c.rankCode ? `${c.rankCode}${c.rankGrade ? `(${c.rankGrade})` : ''}` : '');
const crewOptionLabel = (c: CrewOption) => (crewRank(c) ? `${crewRank(c)} ${c.name}` : c.name);
// 관련 선원을 고르면 비고에도 "직급(등급) 이름"을 쉼표로 이어붙여 자동으로 채운다 —
// 청구서에는 이 비고 내용만 노출되므로, 선원을 고른 시점에 바로 그 문구가 만들어져야 한다.
const buildRemarkFromCrew = (ids: string[], options: CrewOption[]) =>
  ids.map(id => options.find(c => c.id === id)).filter((c): c is CrewOption => !!c).map(crewOptionLabel).join(', ');

function monthRange(yearMonth: string): { start: string; end: string } {
  const [y, m] = yearMonth.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return { start: `${yearMonth}-01`, end: `${yearMonth}-${String(lastDay).padStart(2, '0')}` };
}

// "승하선 비용상세" 시트와 1:1 대응 — actual_cost(실비) 청구항목은 승선기록마다 자동으로
// 라인이 생기지 않으므로, 그 달에 실제로 발생한 건만 여기서 직접 기록한다.
export default function ManagementFeeActualCostEntriesSection({ periodId, shipId, yearMonth, entries, onChanged }: ManagementFeeActualCostEntriesSectionProps) {
  const [availableFeeItems, setAvailableFeeItems] = useState<ManagementFeeItem[]>([]);
  const [crewOptions, setCrewOptions] = useState<CrewOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [feeItemId, setFeeItemId] = useState('');
  const [crewMemberIds, setCrewMemberIds] = useState<string[]>([]);
  const [currency, setCurrency] = useState('USD');
  const [unitPrice, setUnitPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [amountUsd, setAmountUsd] = useState('');
  const [remark, setRemark] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFeeItemId, setEditFeeItemId] = useState('');
  const [editCrewMemberIds, setEditCrewMemberIds] = useState<string[]>([]);
  const [editCurrency, setEditCurrency] = useState('USD');
  const [editUnitPrice, setEditUnitPrice] = useState('');
  const [editQuantity, setEditQuantity] = useState('');
  const [editAmountUsd, setEditAmountUsd] = useState('');
  const [editRemark, setEditRemark] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // 이 달에 승선 중이었거나 이 달에 하선한 선원 모두 대상 — 하선 항공권/송환비처럼
        // 하선을 근거로 청구하는 실비 항목도 있어, 이미 하선한 선원도 골라야 할 수 있다.
        const { start, end } = monthRange(yearMonth);
        const [template, { data: crewRows }] = await Promise.all([
          getEffectiveTemplateForShip(shipId),
          supabase
            .from('crew_embarkation_records')
            .select('crew_member_id, rank_grade, embark_date, disembark_date, crew_members!crew_member_id(name, name_english), ranks!crew_embarkation_records_rank_id_fkey(rank_code, display_order)')
            .eq('ship_id', shipId)
            .lte('embark_date', end)
            .or(`disembark_date.is.null,disembark_date.gte.${start}`),
        ]);

        const actualCostItems = new Map<string, ManagementFeeItem>();
        for (const item of template?.items || []) {
          if (item.billing_basis === 'actual_cost') actualCostItems.set(item.fee_item_id, item.fee_item);
        }
        setAvailableFeeItems([...actualCostItems.values()].sort((a, b) => a.display_order - b.display_order));

        const crew = (crewRows || []).map(r => {
          const c = r.crew_members as { name?: string; name_english?: string } | null;
          const rank = r.ranks as { rank_code?: string; display_order?: number } | null;
          const rec = r as { rank_grade?: string | null; embark_date: string; disembark_date: string | null };
          return {
            id: String(r.crew_member_id),
            name: c ? crewDisplayName(c) : '',
            rankCode: rank?.rank_code || '',
            rankGrade: rec.rank_grade || '',
            rankOrder: rank?.display_order ?? Number.MAX_SAFE_INTEGER,
            embarkDate: rec.embark_date,
            disembarkDate: rec.disembark_date,
          };
        });
        crew.sort((a, b) => a.rankOrder - b.rankOrder);
        setCrewOptions(crew);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [shipId, yearMonth]);

  // 관련 선원 배지에도 이 달 승선/하선 여부를 표시 — 하선 비용처럼 하선을 근거로
  // 청구하는 항목도 있어, 누가 이 달에 하선했는지 여기서도 바로 알 수 있어야 한다.
  const crewBadgeItems = useMemo(() => {
    const { start, end } = monthRange(yearMonth);
    return crewOptions.map(c => {
      const isEmbarked = c.embarkDate >= start && c.embarkDate <= end;
      const isDisembarked = !!c.disembarkDate && c.disembarkDate >= start && c.disembarkDate <= end;
      return {
        value: c.id,
        label: crewOptionLabel(c),
        sublabel: isDisembarked ? '하선' : isEmbarked ? '승선' : undefined,
        sublabelColor: (isDisembarked ? 'amber' : isEmbarked ? 'blue' : undefined) as 'amber' | 'blue' | undefined,
      };
    });
  }, [crewOptions, yearMonth]);

  const resetForm = () => {
    setFeeItemId('');
    setCrewMemberIds([]);
    setCurrency('USD');
    setUnitPrice('');
    setQuantity('1');
    setAmountUsd('');
    setRemark('');
  };

  const handleAdd = async () => {
    if (!feeItemId) { alert('청구 항목을 선택하세요.'); return; }
    const amount = parseFloat(amountUsd);
    if (!amount || amount <= 0) { alert('USD 청구 금액을 입력하세요.'); return; }
    setSaving(true);
    try {
      const added = await addActualCostEntry({
        period_id: periodId,
        fee_item_id: feeItemId,
        crew_member_ids: crewMemberIds,
        currency,
        unit_price: unitPrice ? parseFloat(unitPrice) : null,
        quantity: quantity ? parseFloat(quantity) : null,
        amount_usd: amount,
        remark: remark || null,
      });
      if (added) { resetForm(); onChanged(); }
      else alert('추가에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 기록을 삭제하시겠습니까?')) return;
    setDeletingId(id);
    try {
      const success = await deleteActualCostEntry(id);
      if (success) onChanged();
      else alert('삭제에 실패했습니다.');
    } finally {
      setDeletingId(null);
    }
  };

  const startEdit = (e: ManagementFeeLedgerActualCostEntry) => {
    setEditingId(e.id);
    setEditFeeItemId(e.fee_item_id);
    setEditCrewMemberIds(e.crew.map(c => c.id));
    setEditCurrency(e.currency);
    setEditUnitPrice(e.unit_price != null ? String(e.unit_price) : '');
    setEditQuantity(e.quantity != null ? String(e.quantity) : '');
    setEditAmountUsd(String(e.amount_usd));
    setEditRemark(e.remark || '');
  };

  const cancelEdit = () => setEditingId(null);

  const handleSaveEdit = async () => {
    if (!editingId) return;
    const amount = parseFloat(editAmountUsd);
    if (!amount || amount <= 0) { alert('USD 청구 금액을 입력하세요.'); return; }
    setEditSaving(true);
    try {
      const updated = await updateActualCostEntry(editingId, {
        fee_item_id: editFeeItemId,
        crew_member_ids: editCrewMemberIds,
        currency: editCurrency,
        unit_price: editUnitPrice ? parseFloat(editUnitPrice) : null,
        quantity: editQuantity ? parseFloat(editQuantity) : null,
        amount_usd: amount,
        remark: editRemark || null,
      });
      if (updated) { setEditingId(null); onChanged(); }
      else alert('수정에 실패했습니다.');
    } finally {
      setEditSaving(false);
    }
  };

  if (loading) {
    return <div className="text-center py-4 text-xs text-gray-400">불러오는 중...</div>;
  }

  return (
    <div className="space-y-3">
      {availableFeeItems.length === 0 ? (
        <p className="text-xs text-gray-400">이 선박의 관리비 템플릿에 실비(수기입력) 항목이 배정되어 있지 않습니다.</p>
      ) : (
        <div className="p-3 bg-gray-50 rounded-md border space-y-2.5">
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-0.5">
            <Label className="text-[10px] text-gray-400">청구 항목</Label>
            <Select value={feeItemId} onValueChange={setFeeItemId}>
              <SelectTrigger className="h-8 text-xs w-44"><SelectValue placeholder="항목 선택" /></SelectTrigger>
              <SelectContent>
                {availableFeeItems.map(f => <SelectItem key={f.id} value={f.id} className="text-xs">{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-0.5">
            <Label className="text-[10px] text-gray-400">원 화폐</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="h-8 text-xs w-20"><SelectValue /></SelectTrigger>
              <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-0.5">
            <Label className="text-[10px] text-gray-400">단가(원 화폐, 참고용)</Label>
            <Input type="number" min={0} value={unitPrice} onChange={e => setUnitPrice(e.target.value)} className="h-8 text-xs w-28" />
          </div>
          <div className="space-y-0.5">
            <Label className="text-[10px] text-gray-400">개수/인원</Label>
            <Input type="number" min={0} value={quantity} onChange={e => setQuantity(e.target.value)} className="h-8 text-xs w-16" />
          </div>
          <div className="space-y-0.5">
            <Label className="text-[10px] text-gray-400">청구 금액(USD) *</Label>
            <Input type="number" min={0} value={amountUsd} onChange={e => setAmountUsd(e.target.value)} className="h-8 text-xs w-24" />
          </div>
          <Button size="sm" className="h-8 gap-1 text-xs" onClick={handleAdd} disabled={saving}>
            <Plus className="w-3.5 h-3.5" />{saving ? '추가 중...' : '추가'}
          </Button>
        </div>
        {crewOptions.length > 0 && (
          <BadgeSelect
            label="관련 선원"
            items={crewBadgeItems}
            selected={crewMemberIds}
            onChange={ids => { setCrewMemberIds(ids); setRemark(buildRemarkFromCrew(ids, crewOptions)); }}
            compact
          />
        )}
        <div className="space-y-0.5">
          <Label className="text-[10px] text-gray-400">비고</Label>
          <Textarea value={remark} onChange={e => setRemark(e.target.value)} rows={2} className="min-h-0 text-xs resize-y" />
        </div>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="text-center py-4 text-xs text-gray-400">기록된 실비 항목이 없습니다.</div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">항목</TableHead>
                <TableHead className="text-xs">관련 선원</TableHead>
                <TableHead className="text-xs text-right">단가</TableHead>
                <TableHead className="text-xs text-center">개수</TableHead>
                <TableHead className="text-xs text-right">청구 금액(USD)</TableHead>
                <TableHead className="text-xs">비고</TableHead>
                <TableHead className="text-xs w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map(e => editingId === e.id ? (
                <TableRow key={e.id} className="bg-blue-50/40 hover:bg-blue-50/40">
                  <TableCell colSpan={7} className="p-3">
                    {/* 실비 청구 항목 추가와 동일한 배치 — 짧은 필드는 한 줄, 관련 선원/비고는 각각 전체 폭 */}
                    <div className="space-y-2.5">
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="space-y-0.5">
                          <Label className="text-[10px] text-gray-400">청구 항목</Label>
                          <Select value={editFeeItemId} onValueChange={setEditFeeItemId}>
                            <SelectTrigger className="h-8 text-xs w-44"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {availableFeeItems.map(f => <SelectItem key={f.id} value={f.id} className="text-xs">{f.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-0.5">
                          <Label className="text-[10px] text-gray-400">원 화폐</Label>
                          <Select value={editCurrency} onValueChange={setEditCurrency}>
                            <SelectTrigger className="h-8 text-xs w-20"><SelectValue /></SelectTrigger>
                            <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-0.5">
                          <Label className="text-[10px] text-gray-400">단가(원 화폐, 참고용)</Label>
                          <Input type="number" min={0} value={editUnitPrice} onChange={ev => setEditUnitPrice(ev.target.value)} className="h-8 text-xs w-28" />
                        </div>
                        <div className="space-y-0.5">
                          <Label className="text-[10px] text-gray-400">개수/인원</Label>
                          <Input type="number" min={0} value={editQuantity} onChange={ev => setEditQuantity(ev.target.value)} className="h-8 text-xs w-16" />
                        </div>
                        <div className="space-y-0.5">
                          <Label className="text-[10px] text-gray-400">청구 금액(USD) *</Label>
                          <Input type="number" min={0} value={editAmountUsd} onChange={ev => setEditAmountUsd(ev.target.value)} className="h-8 text-xs w-24" />
                        </div>
                        <div className="flex items-center gap-0.5">
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={handleSaveEdit} disabled={editSaving}>
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-gray-400 hover:text-gray-600" onClick={cancelEdit} disabled={editSaving}>
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      {crewOptions.length > 0 && (
                        <BadgeSelect
                          label="관련 선원"
                          items={crewBadgeItems}
                          selected={editCrewMemberIds}
                          onChange={ids => { setEditCrewMemberIds(ids); setEditRemark(buildRemarkFromCrew(ids, crewOptions)); }}
                          compact
                        />
                      )}
                      <div className="space-y-0.5">
                        <Label className="text-[10px] text-gray-400">비고</Label>
                        <Textarea value={editRemark} onChange={ev => setEditRemark(ev.target.value)} rows={2} className="min-h-0 text-xs resize-y" />
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow key={e.id}>
                  <TableCell className="text-xs font-medium">{e.fee_item_name}</TableCell>
                  <TableCell className="text-xs">
                    {e.crew.length === 0 ? '-' : (
                      <div className="flex flex-wrap gap-1">
                        {e.crew.map(c => (
                          <span key={c.id} className="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                            {c.rank_code && <span className="text-gray-400 mr-1">{c.rank_code}</span>}{c.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-right font-mono">{e.unit_price != null ? `${fmt(e.unit_price)} ${e.currency}` : '-'}</TableCell>
                  <TableCell className="text-xs text-center">{e.quantity ?? '-'}</TableCell>
                  <TableCell className="text-xs text-right font-mono font-semibold">{fmt(e.amount_usd)}</TableCell>
                  <TableCell className="text-xs text-gray-500 whitespace-pre-wrap min-w-40 max-w-64">{e.remark || '-'}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-0.5">
                      <Button
                        variant="ghost" size="sm"
                        className="h-6 w-6 p-0 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                        onClick={() => startEdit(e)}
                        disabled={editingId !== null || deletingId === e.id}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="sm"
                        className="h-6 w-6 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                        onClick={() => handleDelete(e.id)}
                        disabled={editingId !== null || deletingId === e.id}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
