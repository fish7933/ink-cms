import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Edit2, RefreshCw, ChevronDown, ChevronRight, Ship as ShipIcon, Printer, FileSpreadsheet, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useTabContext } from '@/contexts/TabContext';
import {
  getSalaryTemplateWithItems,
  getSalaryComponents,
  getSalaryTemplateHistory,
  deleteSalaryTemplateHistoryVersion,
  renewSalaryTemplate,
  getEffectiveTemplateMapForShips,
  type SalaryTemplateWithItems,
  type SalaryComponent,
  type SalaryTemplate,
} from '@/lib/salary-store';
import { getRanks } from '@/lib/store';
import { getShips } from '@/services/ship.service';
import type { Rank } from '@/types/models';
import SalaryTemplateMatrixTable from '@/components/salary/SalaryTemplateMatrixTable';
import SalaryTemplatePrintDialog from '@/components/salary/SalaryTemplatePrintDialog';
import { exportSalaryTemplateToExcel } from '@/utils/salary-template-export';

export default function SalaryTemplateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { openNewTab, activeTabId, updateTab } = useTabContext();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SalaryTemplateWithItems | null>(null);
  const [components, setComponents] = useState<SalaryComponent[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [assignedShips, setAssignedShips] = useState<string[]>([]);

  const [history, setHistory] = useState<SalaryTemplate[]>([]);
  const [historyDetails, setHistoryDetails] = useState<Record<string, SalaryTemplateWithItems | null>>({});
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  const [renewOpen, setRenewOpen] = useState(false);
  const [renewDate, setRenewDate] = useState('');
  const [renewing, setRenewing] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);

  const loadData = async (templateId: string, isInitial = false) => {
    setLoading(true);
    try {
      // 다른 탭에서 이 템플릿을 갱신했다면 URL의 id는 이미 종료된 과거 버전일 수 있음 —
      // 항상 같은 계보의 실제 현재(활성) 버전을 찾아 표시 대상으로 삼는다 (탭 열어둔 채로 갱신 시
      // "종료된 버전"과 "갱신된 버전"이 뒤바뀌어 보이던 문제 방지).
      const hist = await getSalaryTemplateHistory(templateId);
      const currentInLineage = hist.find(h => h.effective_until === null);
      const resolvedId = currentInLineage ? currentInLineage.id : templateId;

      const [full, comp, rnk, ships] = await Promise.all([
        getSalaryTemplateWithItems(resolvedId),
        getSalaryComponents(),
        getRanks(),
        getShips(),
      ]);
      setData(full);
      setComponents(comp);
      setRanks(rnk);
      // 탭 제목 갱신은 최초 로드시에만 — 다른 탭이 활성화된 상태에서 이 이벤트가 발생하면
      // activeTabId가 이 페이지의 탭이 아닐 수 있어, 매번 갱신하면 엉뚱한(현재 활성) 탭의 제목이 바뀌어버림.
      if (isInitial && activeTabId && full) updateTab(activeTabId, { title: `급여 템플릿 상세: ${full.name}` });

      const templateMap = await getEffectiveTemplateMapForShips(ships);
      setAssignedShips(
        ships.filter(s => templateMap[s.id]?.id === resolvedId).map(s => s.name)
      );

      // 현재 버전을 제외한 과거 버전만 히스토리로 표시
      setHistory(hist.filter(h => h.id !== resolvedId));
    } catch (e) {
      console.error(e);
      toast({ title: '불러오기 실패', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) loadData(id, true);
  }, [id]);

  useEffect(() => {
    const handler = () => { if (id) loadData(id); };
    window.addEventListener('salary-template-data-changed', handler);
    return () => window.removeEventListener('salary-template-data-changed', handler);
  }, [id]);

  const toggleHistory = async (h: SalaryTemplate) => {
    if (expandedHistoryId === h.id) { setExpandedHistoryId(null); return; }
    setExpandedHistoryId(h.id);
    if (!historyDetails[h.id]) {
      const full = await getSalaryTemplateWithItems(h.id);
      setHistoryDetails(prev => ({ ...prev, [h.id]: full }));
    }
  };

  const handleDeleteHistory = async (h: SalaryTemplate) => {
    if (!confirm(`${h.effective_from} ~ ${h.effective_until} 버전을 삭제하시겠습니까?\n앞뒤 버전의 유효기간이 자동으로 이어붙습니다.`)) return;
    const ok = await deleteSalaryTemplateHistoryVersion(h.id);
    if (!ok) {
      toast({ title: '삭제 실패', variant: 'destructive' });
      return;
    }
    toast({ title: '삭제 완료' });
    window.dispatchEvent(new CustomEvent('salary-template-data-changed'));
  };

  const openRenew = () => {
    setRenewDate(new Date().toISOString().slice(0, 10));
    setRenewOpen(true);
  };

  const handleRenew = async () => {
    if (!data || !renewDate) return;
    setRenewing(true);
    try {
      const newTemplate = await renewSalaryTemplate(data.id, renewDate);
      if (!newTemplate) {
        toast({ title: '갱신 실패', description: '적용 시작일은 기존 유효기간 이후여야 합니다.', variant: 'destructive' });
        return;
      }
      toast({ title: '갱신 완료', description: '새 버전이 생성되었습니다. 인상분 금액을 수정해주세요.' });
      window.dispatchEvent(new CustomEvent('salary-template-data-changed'));
      setRenewOpen(false);
      openNewTab(`/salary/templates/${newTemplate.id}/edit`, `템플릿 수정: ${newTemplate.name}`);
    } finally {
      setRenewing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-gray-500">로딩 중...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-gray-500">템플릿을 찾을 수 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-4 space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{data.name}</CardTitle>
            <div className="flex gap-2">
              <Button
                size="sm" variant="outline" className="gap-1.5 h-8"
                onClick={() => setPrintOpen(true)}
              >
                <Printer className="h-4 w-4" />인쇄
              </Button>
              <Button
                size="sm" variant="outline" className="gap-1.5 h-8"
                onClick={() => exportSalaryTemplateToExcel(data, components, ranks)}
              >
                <FileSpreadsheet className="h-4 w-4" />엑셀 다운로드
              </Button>
              <Button
                size="sm" variant="outline" className="gap-1.5 h-8"
                onClick={() => openNewTab(`/salary/templates/${data.id}/edit`, `템플릿 수정: ${data.name}`)}
              >
                <Edit2 className="h-4 w-4" />수정
              </Button>
              <Button size="sm" className="gap-1.5 h-8" onClick={openRenew}>
                <RefreshCw className="h-4 w-4" />갱신
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 기본 정보 */}
          <div className="grid grid-cols-4 gap-3 text-sm">
            <div>
              <Label className="text-xs text-gray-500">통화</Label>
              <div className="mt-0.5">{data.currency}</div>
            </div>
            <div className="col-span-2">
              <Label className="text-xs text-gray-500">유효기간</Label>
              <div className="mt-0.5">{data.effective_from} ~ {data.effective_until || '현재'}</div>
            </div>
            <div>
              <Label className="text-xs text-gray-500">상태</Label>
              <div className="mt-0.5">
                <Badge variant={data.is_active ? 'default' : 'secondary'} className="text-xs">
                  {data.is_active ? '활성' : '비활성'}
                </Badge>
              </div>
            </div>
          </div>
          {data.description && (
            <div>
              <Label className="text-xs text-gray-500">설명</Label>
              <div className="mt-0.5 text-sm text-gray-700">{data.description}</div>
            </div>
          )}

          {/* 급여 매트릭스 */}
          <div>
            <Label className="text-sm">직급별 급여 현황</Label>
            <div className="mt-1.5"><SalaryTemplateMatrixTable template={data} components={components} ranks={ranks} /></div>
          </div>

          {/* 할당된 선박 */}
          <div>
            <Label className="text-sm flex items-center gap-1.5">
              <ShipIcon className="h-3.5 w-3.5" />할당된 선박 ({assignedShips.length})
            </Label>
            <div className="mt-1.5">
              {assignedShips.length === 0 ? (
                <p className="text-xs text-gray-400">할당된 선박이 없습니다.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {assignedShips.map(name => (
                    <Badge key={name} variant="outline" className="text-xs">{name}</Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 갱신 히스토리 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">갱신 히스토리 ({history.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {history.length === 0 ? (
            <p className="text-xs text-gray-400 py-2 text-center">이전 버전이 없습니다.</p>
          ) : (
            history.map(h => (
              <div key={h.id} className="border rounded-md">
                <div className="w-full flex items-center justify-between p-2.5 text-sm hover:bg-gray-50">
                  <button type="button" onClick={() => toggleHistory(h)} className="flex items-center gap-1.5 flex-1 text-left">
                    {expandedHistoryId === h.id ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    {h.effective_from} ~ {h.effective_until}
                  </button>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">종료된 버전</Badge>
                    <button
                      type="button"
                      onClick={() => handleDeleteHistory(h)}
                      className="text-gray-400 hover:text-red-600"
                      title="이 버전 삭제"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {expandedHistoryId === h.id && (
                  <div className="p-2.5 pt-0">
                    {historyDetails[h.id] ? (
                      <SalaryTemplateMatrixTable template={historyDetails[h.id]!} components={components} ranks={ranks} />
                    ) : (
                      <p className="text-xs text-gray-400 py-2 text-center">불러오는 중...</p>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* 갱신 다이얼로그 */}
      <Dialog open={renewOpen} onOpenChange={setRenewOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">템플릿 갱신 — {data.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-gray-500">
              새 유효기간 버전을 생성합니다. 기존 금액이 그대로 복사되며, 이 템플릿을 사용 중인 선박/플릿/선주 배정은 자동으로 새 버전으로 이전됩니다.
            </p>
            <div className="space-y-1.5">
              <Label className="text-sm">적용 시작일</Label>
              <Input type="date" value={renewDate} onChange={e => setRenewDate(e.target.value)} className="h-9 text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRenewOpen(false)}>취소</Button>
            <Button size="sm" onClick={handleRenew} disabled={renewing || !renewDate}>
              {renewing ? '갱신 중...' : '갱신'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SalaryTemplatePrintDialog
        open={printOpen}
        onOpenChange={setPrintOpen}
        template={data}
        components={components}
        ranks={ranks}
      />
    </div>
  );
}
