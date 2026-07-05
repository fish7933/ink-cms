import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Coins, Pencil, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { allowanceService } from '@/services/allowance.service';
import type { AllowanceType, AllowanceRankRateWithDetails, AllowancePaymentBasis, AllowancePaymentMethod } from '@/types/allowance';
import type { Rank } from '@/types/models';

const BASIS_LABELS: Record<AllowancePaymentBasis, string> = { monthly: '매월 지급', lump_sum: '일시불' };
const METHOD_LABELS: Record<AllowancePaymentMethod, string> = { ship_direct: '본선 직접지급', owner_billed: '선주 청구' };

interface RateDraft {
  amount: string;
  currency: string;
}

export default function AllowanceTypesManagementPage() {
  const { toast } = useToast();
  const [types, setTypes] = useState<AllowanceType[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string>('');
  const [rates, setRates] = useState<AllowanceRankRateWithDetails[]>([]);
  const [drafts, setDrafts] = useState<Record<string, RateDraft>>({});
  const [loading, setLoading] = useState(true);

  const [typeFormOpen, setTypeFormOpen] = useState(false);
  const [editingType, setEditingType] = useState<AllowanceType | null>(null);
  const [typeForm, setTypeForm] = useState({
    code: '', name: '', description: '',
    payment_basis: 'monthly' as AllowancePaymentBasis,
    payment_method: 'owner_billed' as AllowancePaymentMethod,
  });

  const loadTypes = useCallback(async () => {
    const data = await allowanceService.getTypes(true);
    setTypes(data);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: ranksData }] = await Promise.all([
        supabase.from('ranks').select('*').order('display_order'),
        loadTypes(),
      ]);
      setRanks(ranksData || []);
      setLoading(false);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadRates = useCallback(async () => {
    if (!selectedTypeId) { setRates([]); return; }
    const data = await allowanceService.getRankRates(selectedTypeId);
    setRates(data);
    const nextDrafts: Record<string, RateDraft> = {};
    for (const rank of ranks) {
      const existing = data.find(r => r.rank_id === rank.id);
      nextDrafts[rank.id] = existing
        ? { amount: String(existing.amount), currency: existing.currency }
        : { amount: '', currency: 'USD' };
    }
    setDrafts(nextDrafts);
  }, [selectedTypeId, ranks]);

  useEffect(() => { loadRates(); }, [loadRates]);

  const selectedType = types.find(t => t.id === selectedTypeId);
  const rateCountByType = (typeId: string) => rates.length > 0 && selectedTypeId === typeId ? rates.length : undefined;

  const openNewTypeForm = () => {
    setEditingType(null);
    setTypeForm({ code: '', name: '', description: '', payment_basis: 'monthly', payment_method: 'owner_billed' });
    setTypeFormOpen(true);
  };

  const openEditTypeForm = (t: AllowanceType) => {
    setEditingType(t);
    setTypeForm({ code: t.code, name: t.name, description: t.description || '', payment_basis: t.payment_basis, payment_method: t.payment_method });
    setTypeFormOpen(true);
  };

  const handleSaveType = async () => {
    if (!typeForm.code.trim() || !typeForm.name.trim()) {
      toast({ title: '코드와 이름은 필수입니다', variant: 'destructive' });
      return;
    }
    if (editingType) {
      await allowanceService.updateType(editingType.id, {
        name: typeForm.name,
        description: typeForm.description || undefined,
        payment_basis: typeForm.payment_basis,
        payment_method: typeForm.payment_method,
      });
      toast({ title: '수정되었습니다' });
      await loadTypes();
      setTypeFormOpen(false);
    } else {
      const created = await allowanceService.createType(typeForm);
      if (!created) { toast({ title: '생성 실패', variant: 'destructive' }); return; }
      toast({ title: '수당 유형이 추가되었습니다' });
      setTypeFormOpen(false);
      await loadTypes();
      setSelectedTypeId(created.id);
    }
  };

  const handleToggleActive = async (t: AllowanceType) => {
    await allowanceService.updateType(t.id, { is_active: !t.is_active });
    await loadTypes();
  };

  const handleDeleteType = async (id: string) => {
    if (!confirm('이 수당 유형을 삭제하시겠습니까? 연결된 직급별 기준도 함께 삭제됩니다.')) return;
    await allowanceService.deleteType(id);
    toast({ title: '삭제되었습니다' });
    if (selectedTypeId === id) setSelectedTypeId('');
    await loadTypes();
  };

  const handleSaveRate = async (rankId: string) => {
    if (!selectedTypeId) return;
    const draft = drafts[rankId];
    if (!draft.amount) { toast({ title: '금액을 입력하세요', variant: 'destructive' }); return; }
    await allowanceService.upsertRankRate({
      allowance_type_id: selectedTypeId,
      rank_id: rankId,
      amount: parseFloat(draft.amount),
      currency: draft.currency,
    });
    toast({ title: '저장되었습니다' });
    await loadRates();
  };

  const handleDeleteRate = async (rankId: string) => {
    const existing = rates.find(r => r.rank_id === rankId);
    if (!existing) return;
    await allowanceService.deleteRankRate(existing.id);
    toast({ title: '삭제되었습니다' });
    await loadRates();
  };

  const updateDraft = (rankId: string, field: keyof RateDraft, value: string) => {
    setDrafts(prev => ({ ...prev, [rankId]: { ...prev[rankId], [field]: value } }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><Coins className="w-5 h-5 text-muted-foreground" />수당 기준 관리</h1>
        <p className="text-xs text-muted-foreground mt-1">
          급여표와 별개로 계약에 붙는 수당(재고용수당 등)의 유형과 직급별 기준 금액을 관리합니다. 지급방식/지급주체는 유형 전체에 일괄 적용됩니다.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm">수당 유형 목록</CardTitle>
            <Button size="sm" className="h-8 gap-1.5" onClick={openNewTypeForm}>
              <Plus className="w-4 h-4" />새 수당 유형
            </Button>
          </div>
        </CardHeader>
        {typeFormOpen && (
          <CardContent className="border-b pb-4 grid grid-cols-3 gap-3 items-end">
            <div className="space-y-1.5"><Label className="text-xs">코드 *</Label><Input value={typeForm.code} disabled={!!editingType} onChange={e => setTypeForm(p => ({ ...p, code: e.target.value }))} placeholder="예: overtime_fixed" className="h-9 text-sm" /></div>
            <div className="space-y-1.5"><Label className="text-xs">이름 *</Label><Input value={typeForm.name} onChange={e => setTypeForm(p => ({ ...p, name: e.target.value }))} placeholder="예: 고정 초과근무수당" className="h-9 text-sm" /></div>
            <div className="space-y-1.5"><Label className="text-xs">설명</Label><Input value={typeForm.description} onChange={e => setTypeForm(p => ({ ...p, description: e.target.value }))} className="h-9 text-sm" /></div>
            <div className="space-y-1.5">
              <Label className="text-xs">지급방식 (일괄)</Label>
              <Select value={typeForm.payment_basis} onValueChange={v => setTypeForm(p => ({ ...p, payment_basis: v as AllowancePaymentBasis }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(BASIS_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">지급주체 (일괄)</Label>
              <Select value={typeForm.payment_method} onValueChange={v => setTypeForm(p => ({ ...p, payment_method: v as AllowancePaymentMethod }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(METHOD_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 items-end">
              <Button size="sm" onClick={handleSaveType}>{editingType ? '수정 저장' : '추가'}</Button>
              <Button size="sm" variant="outline" onClick={() => setTypeFormOpen(false)}>취소</Button>
            </div>
          </CardContent>
        )}
        <CardContent className="p-0">
          {types.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">
              <Badge variant="outline" className="mb-2">수당 유형 없음</Badge>
              <p>새 수당 유형을 추가해 직급별 기준을 설정하세요.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs w-8"></TableHead>
                  <TableHead className="text-xs">코드</TableHead>
                  <TableHead className="text-xs">이름</TableHead>
                  <TableHead className="text-xs">지급방식</TableHead>
                  <TableHead className="text-xs">지급주체</TableHead>
                  <TableHead className="text-xs w-24 text-center">직급기준</TableHead>
                  <TableHead className="text-xs w-20 text-center">상태</TableHead>
                  <TableHead className="text-right text-xs w-28">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {types.map(t => (
                  <TableRow
                    key={t.id}
                    className={`cursor-pointer ${selectedTypeId === t.id ? 'bg-blue-50/60' : 'hover:bg-gray-50'}`}
                    onClick={() => setSelectedTypeId(t.id)}
                  >
                    <TableCell>{selectedTypeId === t.id && <ChevronRight className="w-3.5 h-3.5 text-blue-600" />}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{t.code}</TableCell>
                    <TableCell className="text-xs font-medium">
                      {t.name}
                      {t.description && <div className="text-[11px] text-muted-foreground font-normal truncate max-w-[220px]">{t.description}</div>}
                    </TableCell>
                    <TableCell className="text-xs">{BASIS_LABELS[t.payment_basis]}</TableCell>
                    <TableCell className="text-xs">{METHOD_LABELS[t.payment_method]}</TableCell>
                    <TableCell className="text-xs text-center">{rateCountByType(t.id) ?? '-'}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={`text-xs ${t.is_active ? 'text-green-700 border-green-300' : 'text-gray-400'}`}>
                        {t.is_active ? '활성' : '비활성'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditTypeForm(t)}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => handleToggleActive(t)}>{t.is_active ? '비활성화' : '활성화'}</Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => handleDeleteType(t.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {selectedTypeId && selectedType && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <CardTitle className="text-sm">직급별 기준 금액 — {selectedType.name}</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  직급마다 기준 금액만 다르게 설정합니다. 지급방식({BASIS_LABELS[selectedType.payment_basis]})/지급주체({METHOD_LABELS[selectedType.payment_method]})는 이 수당 유형 전체에 일괄 적용되며, 유형 수정에서 변경할 수 있습니다.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">직급</TableHead>
                  <TableHead className="text-xs">금액</TableHead>
                  <TableHead className="text-xs w-24">통화</TableHead>
                  <TableHead className="text-right text-xs w-28">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ranks.map(rank => {
                  const draft = drafts[rank.id] || { amount: '', currency: 'USD' };
                  const hasRate = rates.some(r => r.rank_id === rank.id);
                  return (
                    <TableRow key={rank.id}>
                      <TableCell className="text-xs font-medium">
                        {rank.rank_code} <span className="text-muted-foreground">({rank.name})</span>
                      </TableCell>
                      <TableCell>
                        <Input type="number" value={draft.amount} onChange={e => updateDraft(rank.id, 'amount', e.target.value)} className="h-8 text-xs w-28" placeholder="0" />
                      </TableCell>
                      <TableCell>
                        <Select value={draft.currency} onValueChange={v => updateDraft(rank.id, 'currency', v)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="USD">USD</SelectItem>
                            <SelectItem value="KRW">KRW</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleSaveRate(rank.id)}>저장</Button>
                          {hasRate && (
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" onClick={() => handleDeleteRate(rank.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
