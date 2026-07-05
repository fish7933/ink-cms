import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Coins } from 'lucide-react';
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
  default_payment_basis: AllowancePaymentBasis;
  default_payment_method: AllowancePaymentMethod;
}

export default function AllowanceTypesManagementPage() {
  const { toast } = useToast();
  const [types, setTypes] = useState<AllowanceType[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string>('');
  const [rates, setRates] = useState<AllowanceRankRateWithDetails[]>([]);
  const [drafts, setDrafts] = useState<Record<string, RateDraft>>({});
  const [loading, setLoading] = useState(true);
  const [newTypeOpen, setNewTypeOpen] = useState(false);
  const [newType, setNewType] = useState({ code: '', name: '', description: '' });

  const loadTypes = useCallback(async () => {
    const data = await allowanceService.getTypes(true);
    setTypes(data);
    if (!selectedTypeId && data.length > 0) setSelectedTypeId(data[0].id);
  }, [selectedTypeId]);

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
        ? { amount: String(existing.amount), currency: existing.currency, default_payment_basis: existing.default_payment_basis, default_payment_method: existing.default_payment_method }
        : { amount: '', currency: 'USD', default_payment_basis: 'monthly', default_payment_method: 'owner_billed' };
    }
    setDrafts(nextDrafts);
  }, [selectedTypeId, ranks]);

  useEffect(() => { loadRates(); }, [loadRates]);

  const selectedType = types.find(t => t.id === selectedTypeId);

  const handleCreateType = async () => {
    if (!newType.code.trim() || !newType.name.trim()) {
      toast({ title: '코드와 이름은 필수입니다', variant: 'destructive' });
      return;
    }
    const created = await allowanceService.createType(newType);
    if (!created) { toast({ title: '생성 실패', variant: 'destructive' }); return; }
    toast({ title: '수당 유형이 추가되었습니다' });
    setNewType({ code: '', name: '', description: '' });
    setNewTypeOpen(false);
    await loadTypes();
    setSelectedTypeId(created.id);
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
      default_payment_basis: draft.default_payment_basis,
      default_payment_method: draft.default_payment_method,
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
          급여표와 별개로 계약에 붙는 수당(재고용수당 등)의 직급별 기준 금액과 지급방식을 관리합니다.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Select value={selectedTypeId} onValueChange={setSelectedTypeId}>
                <SelectTrigger className="h-9 text-sm w-56"><SelectValue placeholder="수당 유형 선택" /></SelectTrigger>
                <SelectContent>
                  {types.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}{!t.is_active && ' (비활성)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedType && (
                <Button variant="ghost" size="sm" className="h-8 text-red-500" onClick={() => handleDeleteType(selectedType.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
            <Button size="sm" className="h-8 gap-1.5" onClick={() => setNewTypeOpen(v => !v)}>
              <Plus className="w-4 h-4" />새 수당 유형
            </Button>
          </div>
          {selectedType?.description && (
            <CardDescription className="text-xs pt-1">{selectedType.description}</CardDescription>
          )}
        </CardHeader>
        {newTypeOpen && (
          <CardContent className="border-t pt-4 grid grid-cols-3 gap-3 items-end">
            <div className="space-y-1.5"><Label className="text-xs">코드 *</Label><Input value={newType.code} onChange={e => setNewType(p => ({ ...p, code: e.target.value }))} placeholder="예: overtime_fixed" className="h-9 text-sm" /></div>
            <div className="space-y-1.5"><Label className="text-xs">이름 *</Label><Input value={newType.name} onChange={e => setNewType(p => ({ ...p, name: e.target.value }))} placeholder="예: 고정 초과근무수당" className="h-9 text-sm" /></div>
            <div className="space-y-1.5"><Label className="text-xs">설명</Label><Input value={newType.description} onChange={e => setNewType(p => ({ ...p, description: e.target.value }))} className="h-9 text-sm" /></div>
            <div className="col-span-3"><Button size="sm" onClick={handleCreateType}>추가</Button></div>
          </CardContent>
        )}
      </Card>

      {selectedTypeId && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">직급별 기준</CardTitle>
            <CardDescription className="text-xs">직급마다 기준 금액과 기본 지급방식/지급주체를 설정합니다. 계약에 부여할 때 이 값이 기본으로 채워지며, 계약별로 재정의할 수 있습니다.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">직급</TableHead>
                  <TableHead className="text-xs">금액</TableHead>
                  <TableHead className="text-xs w-24">통화</TableHead>
                  <TableHead className="text-xs w-40">지급방식</TableHead>
                  <TableHead className="text-xs w-40">지급주체</TableHead>
                  <TableHead className="text-right text-xs w-28">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ranks.map(rank => {
                  const draft = drafts[rank.id] || { amount: '', currency: 'USD', default_payment_basis: 'monthly' as const, default_payment_method: 'owner_billed' as const };
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
                      <TableCell>
                        <Select value={draft.default_payment_basis} onValueChange={v => updateDraft(rank.id, 'default_payment_basis', v)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(BASIS_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select value={draft.default_payment_method} onValueChange={v => updateDraft(rank.id, 'default_payment_method', v)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(METHOD_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
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

      {types.length === 0 && (
        <div className="text-center py-12 text-sm text-muted-foreground">
          <Badge variant="outline" className="mb-2">수당 유형 없음</Badge>
          <p>새 수당 유형을 추가해 직급별 기준을 설정하세요.</p>
        </div>
      )}
    </div>
  );
}
