import { useState, useEffect } from 'react';
import { Landmark, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { exchangeRateService, type RequiredCurrency } from '@/services/exchange-rate.service';

const currentYearMonth = () => new Date().toISOString().slice(0, 7);

// 그 달 승선 중인 선원의 국적에서 자동으로 필요한 통화를 뽑아 보여준다(원화는 항상 포함).
// 매월 한 번 입력해두면 관리비 청구서의 비USD 항목 환산과 원화 총액 계산에 그대로 쓰인다.
export default function ExchangeRateManagementPage() {
  const { toast } = useToast();
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [currencies, setCurrencies] = useState<RequiredCurrency[]>([]);
  const [rates, setRates] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [required, saved] = await Promise.all([
          exchangeRateService.getRequiredCurrenciesForMonth(yearMonth),
          exchangeRateService.getExchangeRates(yearMonth),
        ]);
        setCurrencies(required);
        const initial: Record<string, string> = {};
        for (const c of required) {
          initial[c.currency_code] = saved[c.currency_code] != null ? String(saved[c.currency_code]) : '';
        }
        setRates(initial);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [yearMonth]);

  const handleSave = async () => {
    const toSave = currencies
      .map(c => ({ currency_code: c.currency_code, rate_to_usd: parseFloat(rates[c.currency_code]) }))
      .filter(r => !isNaN(r.rate_to_usd) && r.rate_to_usd > 0);
    if (toSave.length === 0) { toast({ title: '입력된 환율이 없습니다.', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const success = await exchangeRateService.saveExchangeRates(yearMonth, toSave);
      if (success) toast({ title: '저장 완료' });
      else toast({ title: '저장 실패', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><Landmark className="w-5 h-5 text-muted-foreground" />환율 관리</h1>
        <p className="text-xs text-muted-foreground mt-1">
          그 달 승선 중인 선원의 국적을 기준으로 필요한 통화를 자동으로 보여줍니다(원화는 항상 포함). 매월 한 번 입력해두면 관리비 청구서 작성 시 자동으로 적용됩니다.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">월별 환율 (1 USD 당)</CardTitle>
            <Input type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)} className="h-9 text-sm w-40" />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-sm text-gray-400">불러오는 중...</div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">통화</TableHead>
                      <TableHead className="text-xs text-right">환율 (1 USD = ?)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currencies.map(c => (
                      <TableRow key={c.currency_code}>
                        <TableCell className="text-sm font-medium">{c.label}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number" min={0} step="0.0001"
                            value={rates[c.currency_code] || ''}
                            onChange={e => setRates(prev => ({ ...prev, [c.currency_code]: e.target.value }))}
                            className="h-8 text-sm w-32 ml-auto text-right"
                            placeholder="예: 1330"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-end">
                <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={saving}>
                  <Save className="h-4 w-4" />{saving ? '저장 중...' : '저장'}
                </Button>
              </div>
              <p className="text-xs text-gray-400">
                이 달에 값을 입력하지 않은 통화는 청구서 작성 시 가장 최근에 입력된 이전 달 환율을 대신 사용합니다. 그마저도 없으면 해당 항목은 환산되지 않고 경고로 표시됩니다.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
