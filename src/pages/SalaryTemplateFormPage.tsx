import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import BadgeSelect from '@/components/ui/BadgeSelect';
import type { BadgeSelectItem, BadgeSelectGroup } from '@/components/ui/BadgeSelect';
import { useTabContext } from '@/contexts/TabContext';
import {
  getSalaryComponents,
  getSalaryTemplateWithItems,
  addSalaryTemplate,
  updateSalaryTemplate,
  type SalaryComponent,
} from '@/lib/salary-store';
import { getRanks } from '@/lib/store';
import type { Rank } from '@/types/models';

const CURRENCIES = ['USD', 'EUR', 'KRW', 'JPY'];
type AmountMatrix = Record<string, Record<string, number>>;

export default function SalaryTemplateFormPage() {
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { closeTab, activeTabId, updateTab } = useTabContext();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [components, setComponents] = useState<SalaryComponent[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);

  const [formData, setFormData] = useState({ name: '', description: '', currency: 'USD' });
  const [selectedRanks, setSelectedRanks] = useState<string[]>([]);
  const [selectedComponents, setSelectedComponents] = useState<string[]>([]);
  const [amounts, setAmounts] = useState<AmountMatrix>({});

  useEffect(() => {
    const init = async () => {
      const [compsData, ranksData] = await Promise.all([getSalaryComponents(), getRanks()]);
      setComponents(compsData);
      setRanks(ranksData);

      if (isEdit && id) {
        const tmpl = await getSalaryTemplateWithItems(id);
        if (tmpl) {
          setFormData({ name: tmpl.name, description: tmpl.description || '', currency: tmpl.currency });
          setSelectedRanks(tmpl.ranks);
          const compIds = [...new Set(tmpl.items.map(i => i.component_id))];
          setSelectedComponents(compIds);
          const mat: AmountMatrix = {};
          for (const item of tmpl.items) {
            const r = item.rank || '';
            if (!mat[r]) mat[r] = {};
            mat[r][item.component_id] = item.amount;
          }
          setAmounts(mat);
          if (activeTabId) updateTab(activeTabId, { title: `템플릿 수정: ${tmpl.name}` });
        }
      } else {
        // 신규: 전체 항목 기본 선택
        const allRanks = ranksData.map(r => r.name);
        const allComps = compsData.map(c => c.id);
        setSelectedRanks(allRanks);
        setSelectedComponents(allComps);
      }
      setLoading(false);
    };
    init();
  }, [id]);

  const getAmount = (rank: string, cid: string) => amounts[rank]?.[cid] || 0;
  const setAmount = (rank: string, cid: string, val: number) =>
    setAmounts(prev => ({ ...prev, [rank]: { ...prev[rank], [cid]: val } }));

  // 분리 계산
  const earningIds = selectedComponents.filter(cid => {
    const c = components.find(x => x.id === cid);
    return (c?.component_type ?? 'earning') === 'earning';
  });
  const deductionIds = selectedComponents.filter(cid => {
    const c = components.find(x => x.id === cid);
    return c?.component_type === 'deduction';
  });
  const rankTotal = (rank: string) => earningIds.reduce((s, cid) => s + getAmount(rank, cid), 0);
  const rankDeferred = (rank: string) =>
    earningIds.filter(cid => components.find(x => x.id === cid)?.payment_type === 'deferred')
              .reduce((s, cid) => s + getAmount(rank, cid), 0);
  const rankDeduction = (rank: string) => deductionIds.reduce((s, cid) => s + getAmount(rank, cid), 0);
  const rankMonthlyPay = (rank: string) => rankTotal(rank) - rankDeferred(rank) - rankDeduction(rank);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) { toast({ title: '템플릿명을 입력하세요.', variant: 'destructive' }); return; }
    if (selectedRanks.length === 0) { toast({ title: '직급을 1개 이상 선택하세요.', variant: 'destructive' }); return; }

    const items = selectedRanks.flatMap(rank =>
      selectedComponents.map(cid => ({ rank, component_id: cid, amount: getAmount(rank, cid) }))
    );

    setSaving(true);
    try {
      if (isEdit && id) {
        await updateSalaryTemplate(id, { ...formData, is_active: true }, selectedRanks, items);
        toast({ title: '수정 완료' });
      } else {
        await addSalaryTemplate({ ...formData, is_active: true }, selectedRanks, items);
        toast({ title: '저장 완료' });
      }
      // 현재 탭 닫고 목록으로
      if (activeTabId) closeTab(activeTabId);
      else navigate('/salary/templates');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-gray-500">로딩 중...</p>
      </div>
    );
  }

  const rankItems = ranks.map(r => ({ value: r.name, label: r.rank_code || r.name } as BadgeSelectItem));

  const compGroups: BadgeSelectGroup[] = [
    {
      label: '급여 구성',
      color: 'blue',
      items: components
        .filter(c => (c.component_type ?? 'earning') === 'earning')
        .map(c => ({
          value: c.id,
          label: c.name,
          sublabel: c.payment_type === 'deferred' ? '후불' : '매월',
          color: c.payment_type === 'deferred' ? 'amber' : 'blue',
        } as BadgeSelectItem)),
    },
    {
      label: '공제 항목',
      color: 'red',
      items: components
        .filter(c => c.component_type === 'deduction')
        .map(c => ({ value: c.id, label: c.name, color: 'red' } as BadgeSelectItem)),
    },
  ].filter(g => g.items.length > 0);

  return (
    <div className="max-w-7xl mx-auto px-4 py-4">
      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {isEdit ? '급여 템플릿 수정' : '급여 템플릿 추가'}
              </CardTitle>
              <Button type="submit" size="sm" className="gap-1.5 h-8" disabled={saving}>
                <Save className="h-4 w-4" />
                {saving ? '저장 중...' : '저장'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* 기본 정보 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">템플릿명 *</Label>
                <Input
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="h-9 text-sm"
                  placeholder="Standard Officer 2025"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">통화</Label>
                <Select value={formData.currency} onValueChange={v => setFormData({ ...formData, currency: v })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {/* 직급 선택 */}
            <BadgeSelect
              label="적용 직급"
              items={rankItems}
              selected={selectedRanks}
              onChange={setSelectedRanks}
            />

            {/* 급여 항목 선택 */}
            <BadgeSelect
              label="급여 항목"
              groups={compGroups}
              selected={selectedComponents}
              onChange={setSelectedComponents}
            />

            {/* 금액 입력 표 */}
            {selectedRanks.length > 0 && selectedComponents.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-sm">직급별 금액 입력</Label>
                <div className="overflow-x-auto border rounded-md">
                  <table className="text-xs w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        <th className="sticky left-0 bg-gray-50 border-r p-1" />
                        {earningIds.length > 0 && (
                          <th colSpan={earningIds.length} className="text-center py-1 px-2 text-blue-700 font-semibold border-r bg-blue-50/50">
                            ← 급여 구성 항목
                          </th>
                        )}
                        {deductionIds.length > 0 && (
                          <th colSpan={deductionIds.length} className="text-center py-1 px-2 text-red-600 font-semibold border-r bg-red-50/50">
                            공제 항목
                          </th>
                        )}
                        <th colSpan={2} className="text-center py-1 px-2 text-gray-600 font-semibold bg-gray-100">
                          계산 결과
                        </th>
                      </tr>
                      <tr className="bg-gray-100">
                        <th className="text-left p-2 border-r font-semibold sticky left-0 bg-gray-100 min-w-32">직급</th>
                        {earningIds.map(cid => {
                          const comp = components.find(c => c.id === cid);
                          return (
                            <th key={cid} className="text-center p-1 border-r font-semibold min-w-24 bg-blue-50/30">
                              <div>{comp?.name}</div>
                              <div className={`text-[10px] font-normal ${comp?.payment_type === 'deferred' ? 'text-amber-500' : 'text-blue-400'}`}>
                                {comp?.payment_type === 'deferred' ? '후불성' : '매월'}
                              </div>
                            </th>
                          );
                        })}
                        {deductionIds.map((cid, i) => {
                          const comp = components.find(c => c.id === cid);
                          return (
                            <th key={cid} className={`text-center p-1 border-r font-semibold min-w-24 bg-red-50/30 ${i === 0 ? 'border-l-2 border-l-red-200' : ''}`}>
                              <div>{comp?.name}</div>
                              <div className="text-[10px] font-normal text-red-400">공제</div>
                            </th>
                          );
                        })}
                        <th className="text-center p-2 font-semibold min-w-24 bg-gray-100 border-l-2 border-l-gray-400">월 급여 총액</th>
                        <th className="text-center p-2 font-semibold min-w-24 bg-blue-100 text-blue-800">월 실지급액</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRanks.map(rank => (
                        <tr key={rank} className="border-t">
                          <td className="p-2 border-r font-medium text-gray-700 bg-gray-50 sticky left-0">{rank}</td>
                          {earningIds.map(cid => (
                            <td key={cid} className="p-1 border-r">
                              <Input type="number" value={getAmount(rank, cid) || ''} onChange={e => setAmount(rank, cid, parseInt(e.target.value) || 0)}
                                className="h-7 text-xs text-right w-full" placeholder="0" min={0} />
                            </td>
                          ))}
                          {deductionIds.map((cid, i) => (
                            <td key={cid} className={`p-1 border-r bg-red-50/20 ${i === 0 ? 'border-l-2 border-l-red-200' : ''}`}>
                              <Input type="number" value={getAmount(rank, cid) || ''} onChange={e => setAmount(rank, cid, parseInt(e.target.value) || 0)}
                                className="h-7 text-xs text-right w-full" placeholder="0" min={0} />
                            </td>
                          ))}
                          <td className="p-2 text-right font-semibold bg-gray-50 border-l-2 border-l-gray-400">
                            {rankTotal(rank).toLocaleString()}
                          </td>
                          <td className="p-2 text-right font-bold text-blue-700 bg-blue-50">
                            {rankMonthlyPay(rank).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-400">월 실지급액 = 급여 구성 합계 − 후불성 − 공제</p>
              </div>
            )}

            {/* 설명 (맨 아래) */}
            <div className="space-y-1.5">
              <Label className="text-sm">설명</Label>
              <Textarea
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                rows={2}
                className="text-sm"
                placeholder="템플릿에 대한 설명을 입력하세요"
              />
            </div>

          </CardContent>
        </Card>
      </form>
    </div>
  );
}
