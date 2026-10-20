import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import en from '@/i18n/locales/pages/AllowanceTemplateFormPage/en.json';
import { Save, ChevronDown, ChevronRight, Ship as ShipIcon, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useTabContext } from '@/contexts/TabContext';
import { allowanceService } from '@/services/allowance.service';
import type { AllowanceTemplate, AllowanceTemplateWithItems, AllowanceItem } from '@/types/allowance';
import { getRanks } from '@/services/rank.service';
import { sortRanksByDisplayOrder } from '@/lib/rank-order';
import { getShips } from '@/services/ship.service';
import type { Rank } from '@/types/models';
import AllowanceTemplateItemRows, { newClientId, type EditableAllowanceTemplateItem } from '@/components/allowance/AllowanceTemplateItemRows';
import AllowanceTemplateItemsSummary from '@/components/allowance/AllowanceTemplateItemsSummary';

i18n.addResourceBundle('en', 'AllowanceTemplateFormPage', en, true, true);

export default function AllowanceTemplateFormPage() {
  const { t } = useTranslation('AllowanceTemplateFormPage');
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { closeTab, activeTabId, updateTab } = useTabContext();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [allowanceItems, setAllowanceItems] = useState<AllowanceItem[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);

  const [formData, setFormData] = useState({ name: '', description: '' });
  const [effectiveFrom, setEffectiveFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [effectiveUntil, setEffectiveUntil] = useState<string | null>(null);
  const [rows, setRows] = useState<EditableAllowanceTemplateItem[]>([]);
  const [error, setError] = useState('');

  const [assignedShips, setAssignedShips] = useState<string[]>([]);
  const [history, setHistory] = useState<AllowanceTemplate[]>([]);
  const [historyDetails, setHistoryDetails] = useState<Record<string, AllowanceTemplateWithItems | null>>({});
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        const [itemsData, ranksData] = await Promise.all([allowanceService.getItems(), getRanks()]);
        setAllowanceItems(itemsData);
        setRanks(sortRanksByDisplayOrder(ranksData));

        if (isEdit && id) {
          const tmpl = await allowanceService.getTemplateWithItems(id);
          if (tmpl) {
            setFormData({ name: tmpl.name, description: tmpl.description || '' });
            setEffectiveFrom(tmpl.effective_from);
            setEffectiveUntil(tmpl.effective_until ?? null);
            setRows(tmpl.items.map(i => ({
              clientId: newClientId(),
              allowance_item_id: i.allowance_item_id,
              rank_id: i.rank_id ?? null,
              kind: i.kind,
              amount: Number(i.amount),
              currency: i.currency,
              payment_basis: i.payment_basis,
              payment_method: i.payment_method,
              max_payout_count: i.max_payout_count ?? null,
              min_prior_contract_months: i.min_prior_contract_months ?? null,
              max_gap_months: i.max_gap_months ?? null,
              reset_on_owner_change: i.reset_on_owner_change,
            })));
            if (activeTabId) updateTab(activeTabId, { title: t('템플릿 수정: {{name}}', { name: tmpl.name }) });

            const ships = await getShips();
            const templateMap = await allowanceService.getEffectiveTemplateMapForShips(ships);
            setAssignedShips(ships.filter(s => templateMap[s.id]?.id === id && s.is_active !== false).map(s => s.name));

            const hist = await allowanceService.getTemplateHistory(id);
            setHistory(hist.filter(h => h.id !== id));
          }
        }
      } catch (e) {
        console.error(e);
        toast({ title: t('불러오기 실패'), variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleHistory = async (h: AllowanceTemplate) => {
    if (expandedHistoryId === h.id) { setExpandedHistoryId(null); return; }
    setExpandedHistoryId(h.id);
    if (!historyDetails[h.id]) {
      const full = await allowanceService.getTemplateWithItems(h.id);
      setHistoryDetails(prev => ({ ...prev, [h.id]: full }));
    }
  };

  const handleDeleteHistory = async (h: AllowanceTemplate) => {
    if (!confirm(t('{{from}} ~ {{until}} 버전을 삭제하시겠습니까?\n앞뒤 버전의 유효기간이 자동으로 이어붙습니다.', { from: h.effective_from, until: h.effective_until }))) return;
    const ok = await allowanceService.deleteTemplateHistoryVersion(h.id);
    if (!ok) {
      toast({ title: t('삭제 실패'), variant: 'destructive' });
      return;
    }
    toast({ title: t('삭제 완료') });
    window.dispatchEvent(new CustomEvent('allowance-template-data-changed'));
    if (expandedHistoryId === h.id) setExpandedHistoryId(null);
    setHistoryDetails(prev => { const next = { ...prev }; delete next[h.id]; return next; });
    if (id) {
      const [tmpl, hist] = await Promise.all([allowanceService.getTemplateWithItems(id), allowanceService.getTemplateHistory(id)]);
      if (tmpl) setEffectiveUntil(tmpl.effective_until ?? null);
      setHistory(hist.filter(x => x.id !== id));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!formData.name.trim()) { setError(t('템플릿명을 입력하세요.')); return; }
    if (rows.length === 0) { setError(t('항목을 1개 이상 추가하세요.')); return; }

    const items = rows.map(({ clientId: _clientId, ...rest }) => rest);

    setSaving(true);
    try {
      if (isEdit && id) {
        const result = await allowanceService.updateTemplate(id, { ...formData, is_active: true, effective_from: effectiveFrom }, items);
        if (!result) {
          setError(t('수정에 실패했습니다. 적용 시작일은 이전 버전의 적용 시작일보다 뒤여야 합니다.'));
          return;
        }
        toast({ title: t('수정 완료') });
      } else {
        const result = await allowanceService.addTemplate({ ...formData, is_active: true, effective_from: effectiveFrom }, items);
        if (!result) { setError(t('저장에 실패했습니다.')); return; }
        toast({ title: t('저장 완료') });
      }
      window.dispatchEvent(new CustomEvent('allowance-template-data-changed'));
      if (activeTabId) closeTab(activeTabId);
      else navigate('/allowance-templates');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-gray-500">{t('로딩 중...')}</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-4">
      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">
                  {isEdit ? (formData.name || t('템플릿 수정')) : t('수당/공제 템플릿 추가')}
                </CardTitle>
                {isEdit && (
                  <Badge variant={!effectiveUntil ? 'default' : 'secondary'} className="text-xs">
                    {!effectiveUntil ? t('활성') : t('종료된 버전')}
                  </Badge>
                )}
              </div>
              <Button type="submit" size="sm" className="gap-1.5 h-8" disabled={saving || (isEdit && !!effectiveUntil)}>
                <Save className="h-4 w-4" />
                {saving ? t('저장 중...') : t('저장')}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* 기본 정보 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">{t('템플릿명 *')}</Label>
                <Input
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="h-9 text-sm"
                  placeholder={t('예: 하나마린 수당/공제 2026')}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">{t('적용 시작일')} {isEdit && <span className="text-gray-400 font-normal">{t('(~ {{until}})', { until: effectiveUntil || t('현재') })}</span>}</Label>
                <Input
                  type="date"
                  value={effectiveFrom}
                  onChange={e => setEffectiveFrom(e.target.value)}
                  className="h-9 text-sm"
                  disabled={isEdit && !!effectiveUntil}
                />
              </div>
            </div>
            {isEdit && effectiveUntil && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                {t('종료된 과거 버전입니다 (이력 열람 전용). 요율 변경 등은 목록의 "갱신"으로 새 버전을 만들어 반영하세요.')}
              </p>
            )}
            {isEdit && !effectiveUntil && (
              <p className="text-xs text-gray-400">
                {t('적용 시작일을 변경하면 이전 버전의 종료일도 하루 전으로 자동 조정됩니다.')}
              </p>
            )}

            {/* 설명 */}
            <div className="space-y-1.5">
              <Label className="text-sm">{t('설명')}</Label>
              <Textarea
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                rows={2}
                className="text-sm"
                placeholder={t('템플릿에 대한 설명을 입력하세요')}
              />
            </div>

            {/* 항목 구성 */}
            <div className="space-y-1.5">
              <Label className="text-sm">{t('항목 구성')}</Label>
              {allowanceItems.length === 0 ? (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                  {t('등록된 수당/공제 항목이 없습니다. 먼저 수당/공제 항목 관리에서 항목을 추가하세요.')}
                </p>
              ) : (
                <AllowanceTemplateItemRows allowanceItems={allowanceItems} ranks={ranks} rows={rows} onChange={setRows} />
              )}
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription className="text-xs whitespace-pre-line">{error}</AlertDescription>
              </Alert>
            )}

            {/* 할당된 선박 */}
            {isEdit && (
              <div>
                <Label className="text-sm flex items-center gap-1.5">
                  <ShipIcon className="h-3.5 w-3.5" />{t('할당된 선박 ({{count}})', { count: assignedShips.length })}
                </Label>
                <div className="mt-1.5">
                  {assignedShips.length === 0 ? (
                    <p className="text-xs text-gray-400">{t('할당된 선박이 없습니다.')}</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {assignedShips.map(name => (
                        <Badge key={name} variant="outline" className="text-xs">{name}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

          </CardContent>
        </Card>
      </form>

      {/* 갱신 히스토리 */}
      {isEdit && (
        <Card className="mt-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('갱신 히스토리 ({{count}})', { count: history.length })}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {history.length === 0 ? (
              <p className="text-xs text-gray-400 py-2 text-center">{t('이전 버전이 없습니다.')}</p>
            ) : (
              history.map(h => (
                <div key={h.id} className="border rounded-md">
                  <div className="w-full flex items-center justify-between p-2.5 text-sm hover:bg-gray-50">
                    <button type="button" onClick={() => toggleHistory(h)} className="flex items-center gap-1.5 flex-1 text-left">
                      {expandedHistoryId === h.id ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      {h.effective_from} ~ {h.effective_until}
                    </button>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">{t('종료된 버전')}</Badge>
                      <button
                        type="button"
                        onClick={() => handleDeleteHistory(h)}
                        className="text-gray-400 hover:text-red-600"
                        title={t('이 버전 삭제')}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  {expandedHistoryId === h.id && (
                    <div className="p-2.5 pt-0">
                      {historyDetails[h.id] ? (
                        <AllowanceTemplateItemsSummary items={historyDetails[h.id]!.items} ranks={ranks} />
                      ) : (
                        <p className="text-xs text-gray-400 py-2 text-center">{t('불러오는 중...')}</p>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
