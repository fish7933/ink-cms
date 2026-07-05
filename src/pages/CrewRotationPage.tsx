import { useState, useEffect, useMemo, Fragment } from 'react';
import { Plus, Ship, Users, Calendar, FileText, CheckCircle, AlertTriangle, X, Trash2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { supabase } from '@/lib/supabase';
import { rotationService } from '@/services/rotation.service';
import type { ContractExpiryInfo } from '@/services/rotation.service';
import type { CrewRotationPlanWithDetails } from '@/types/rotation';
import type { Company, Fleet, Ship as ShipType } from '@/types/models';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useTabContext } from '@/contexts/TabContext';
import { useToast } from '@/hooks/use-toast';

type StatusTab = 'all' | 'draft' | 'pending_approval' | 'approved' | 'executed';

const STATUS_CONFIG: Record<StatusTab, { label: string; color: string }> = {
  all:              { label: '전체',    color: '' },
  draft:            { label: '임시저장', color: 'bg-gray-100 text-gray-700' },
  pending_approval: { label: '결재대기', color: 'bg-yellow-100 text-yellow-700' },
  approved:         { label: '승인됨',  color: 'bg-green-100 text-green-700' },
  executed:         { label: '발령완료', color: 'bg-blue-100 text-blue-700' },
};

export function CrewRotationPage() {
  const { openNewTab, activeTabId, tabs } = useTabContext();
  const { toast } = useToast();

  const [plans, setPlans] = useState<CrewRotationPlanWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // 필터
  const [owners, setOwners] = useState<Company[]>([]);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [ships, setShips] = useState<ShipType[]>([]);
  const [filterOwner, setFilterOwner] = useState('');
  const [filterFleet, setFilterFleet] = useState('');
  const [filterShip, setFilterShip] = useState('');

  // 계약만료 자동생성 다이얼로그
  const [autoGenOpen, setAutoGenOpen] = useState(false);
  const [expiryThreshold, setExpiryThreshold] = useState(30);
  const [expiryInfo, setExpiryInfo] = useState<ContractExpiryInfo[]>([]);
  const [expiryLoading, setExpiryLoading] = useState(false);
  const [autoGenLoading, setAutoGenLoading] = useState(false);

  useEffect(() => { loadPlans(); loadOwners(); }, []);

  useEffect(() => {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab?.path === '/crew-rotation') loadPlans();
  }, [activeTabId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!filterOwner) { setFleets([]); setFilterFleet(''); return; }
    supabase.from('fleets').select('*').eq('owner_id', filterOwner).order('name')
      .then(({ data }) => setFleets(data || []));
  }, [filterOwner]);

  useEffect(() => {
    if (!filterOwner) { setShips([]); setFilterShip(''); return; }
    let q = supabase.from('ships').select('*').eq('owner_id', filterOwner);
    if (filterFleet) q = q.eq('fleet_id', filterFleet);
    q.order('name').then(({ data }) => setShips(data || []));
  }, [filterOwner, filterFleet]);

  const loadPlans = async () => {
    setLoading(true);
    setPlans(await rotationService.getRotationPlans());
    setLoading(false);
  };

  const loadOwners = async () => {
    const { data } = await supabase.from('companies').select('*').eq('type', 'owner').order('name');
    setOwners(data || []);
  };

  const filteredPlans = useMemo(() => {
    let list = plans;
    if (statusTab !== 'all') list = list.filter(p => p.status === statusTab);
    if (filterOwner) list = list.filter(p => p.owner_id === filterOwner);
    if (filterFleet) list = list.filter(p => p.fleet_id === filterFleet);
    if (filterShip) list = list.filter(p => p.ship_id === filterShip);
    return list;
  }, [plans, statusTab, filterOwner, filterFleet, filterShip]);

  // 교대일(rotation_date) 기준 연/월로 묶어서 표시 — 최신 연월이 위로
  const groupedPlans = useMemo(() => {
    const groups = new Map<string, CrewRotationPlanWithDetails[]>();
    for (const p of filteredPlans) {
      const d = new Date(p.rotation_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    }
    return [...groups.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, list]) => {
        const [y, m] = key.split('-');
        return { key, label: `${y}년 ${m}월`, plans: list };
      });
  }, [filteredPlans]);

  const countByStatus = (s: StatusTab) => s === 'all' ? plans.length : plans.filter(p => p.status === s).length;

  // 결재 상신 전(임시저장) 계획만 삭제 가능 — 발령 없이 계획 단계에서 빠지는 것이므로
  // 삭제되면 그만큼 해당 월/선박의 계획 개수에서도 빠져 번호가 다시 채워진다.
  const deletableIds = useMemo(() => filteredPlans.filter(p => p.status === 'draft').map(p => p.id), [filteredPlans]);

  const toggleSelect = (id: string) =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleSelectAll = (checked: boolean) =>
    setSelectedIds(checked ? deletableIds : []);

  const handleDelete = async (planId: string) => {
    if (!confirm('이 교대 계획서를 삭제하시겠습니까?')) return;
    if (await rotationService.deleteRotationPlan(planId)) loadPlans();
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`선택한 ${selectedIds.length}개의 교대 계획서를 삭제하시겠습니까?`)) return;
    await Promise.all(selectedIds.map(id => rotationService.deleteRotationPlan(id)));
    setSelectedIds([]);
    loadPlans();
  };

  const handleSubmitApproval = async (planId: string) => {
    if (!confirm('결재 상신하시겠습니까?')) return;
    const { error } = await supabase.from('crew_rotation_plans')
      .update({ status: 'pending_approval', updated_at: new Date().toISOString() }).eq('id', planId);
    if (error) { alert('오류가 발생했습니다.'); return; }
    loadPlans();
  };

  const handleApprove = async (planId: string) => {
    if (!confirm('이 교대 계획을 승인하시겠습니까?')) return;
    const { error } = await supabase.from('crew_rotation_plans')
      .update({ status: 'approved', updated_at: new Date().toISOString() }).eq('id', planId);
    if (error) { alert('오류가 발생했습니다.'); return; }
    loadPlans();
  };

  const handleExecute = async (planId: string) => {
    if (!confirm('발령을 실행하시겠습니까? 실행하면 선원 상태가 즉시 변경됩니다.')) return;
    if (await rotationService.executeRotationPlan(planId)) {
      alert('발령이 실행되었습니다. 선원 상태가 업데이트되었습니다.');
      loadPlans();
      // 선원 목록 탭 열기 (미개방 시 신규, 개방 시 활성화 - 재마운트되며 최신 데이터 로딩)
      openNewTab('/crew/management', '선원 목록');
    } else alert('실행 중 오류가 발생했습니다.');
  };

  // 계약만료 하선계획 자동생성
  const openAutoGen = async () => {
    setAutoGenOpen(true);
    setExpiryLoading(true);
    const info = await rotationService.getOnboardContractExpiry();
    setExpiryInfo(info);
    setExpiryLoading(false);
  };

  const expiryFiltered = useMemo(
    () => expiryInfo.filter(e => e.days_until_expiry <= expiryThreshold),
    [expiryInfo, expiryThreshold]
  );

  const handleAutoGenerate = async () => {
    if (expiryFiltered.length === 0) return;
    setAutoGenLoading(true);
    try {
      // 선박별 그룹
      const byShip = new Map<string, ContractExpiryInfo[]>();
      for (const e of expiryFiltered) {
        if (!byShip.has(e.ship_id)) byShip.set(e.ship_id, []);
        byShip.get(e.ship_id)!.push(e);
      }

      let created = 0;
      for (const [shipId, crew] of byShip) {
        const first = crew[0];
        const today = new Date();
        const planName = `${first.ship_name} 계약만료 하선계획 ${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`;
        const plan = await rotationService.createRotationPlan({
          ship_id: shipId,
          owner_id: first.owner_id,
          fleet_id: first.fleet_id || null,
          plan_name: planName,
          rotation_date: crew.map(c => c.expiry_date).sort()[0],
          notes: `계약만료 ${expiryThreshold}일 이내 자동 생성`,
          base_departure_date: null,
          port_id: null,
          assignments: crew.map(c => ({
            off_crew_id: c.crew_id,
            off_rank_id: c.rank_id || null,
            off_rank_grade: null,
            off_disembark_date: c.expiry_date,
            off_return_date: null,
            on_crew_id: null,
            on_rank_id: null,
            on_rank_grade: null,
            on_departure_date: null,
            contract_months: null,
            salary_template_id: null,
            salary_amount: null,
            salary_currency: 'USD',
            embark_date: c.expiry_date,
            notes: `계약만료일: ${c.expiry_date} (${c.embark_date} + ${c.contract_months}개월)`,
          })),
        });
        if (plan) created++;
      }

      toast({ title: `${created}개 선박 하선계획 초안 생성 완료`, description: '교대계획 목록에서 확인하세요.' });
      setAutoGenOpen(false);
      loadPlans();
    } catch (e) {
      toast({ title: '생성 실패', description: String(e), variant: 'destructive' });
    } finally {
      setAutoGenLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const cfg = STATUS_CONFIG[status as StatusTab];
    if (!cfg || status === 'all') return <Badge variant="secondary">{status}</Badge>;
    return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>{cfg.label}</span>;
  };

  const expiryColor = (days: number) =>
    days < 0 ? 'text-red-600 font-bold' : days <= 7 ? 'text-red-500' : days <= 30 ? 'text-orange-500' : 'text-gray-600';

  return (
    <div className="container mx-auto py-6 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-muted-foreground" />선원 교대 발령
          </h1>
          <p className="text-xs text-muted-foreground mt-1">선원 승선/하선 교대 계획을 작성하고 결재를 진행합니다</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={openAutoGen} className="h-8 text-xs gap-1.5 border-orange-300 text-orange-700 hover:bg-orange-50">
            <AlertTriangle className="h-3.5 w-3.5" />계약만료 하선계획 자동생성
          </Button>
          <Button onClick={() => openNewTab('/crew-rotation/new', '교대계획 작성', true)} size="sm" className="h-8">
            <Plus className="mr-2 h-4 w-4" />새 교대 계획 작성
          </Button>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid gap-3 md:grid-cols-5">
        {(['all','draft','pending_approval','approved','executed'] as StatusTab[]).map(s => (
          <Card key={s} className={`cursor-pointer transition-colors ${statusTab === s ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'}`}
            onClick={() => setStatusTab(s)}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground">{STATUS_CONFIG[s].label}</CardTitle>
              {s === 'all' ? <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                : s === 'draft' ? <FileText className="h-3.5 w-3.5 text-gray-400" />
                : s === 'pending_approval' ? <Calendar className="h-3.5 w-3.5 text-yellow-500" />
                : s === 'approved' ? <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                : <Ship className="h-3.5 w-3.5 text-blue-500" />}
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div className="text-2xl font-bold">{countByStatus(s)}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={filterOwner || '_all'} onValueChange={v => { setFilterOwner(v === '_all' ? '' : v); setFilterFleet(''); setFilterShip(''); }}>
          <SelectTrigger className="h-8 text-xs w-32"><SelectValue placeholder="전체 선주사" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">전체 선주사</SelectItem>
            {owners.map(o => <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterFleet || '_all'} onValueChange={v => { setFilterFleet(v === '_all' ? '' : v); setFilterShip(''); }} disabled={!filterOwner}>
          <SelectTrigger className="h-8 text-xs w-28"><SelectValue placeholder="전체 플릿" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">전체 플릿</SelectItem>
            {fleets.map(f => <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterShip || '_all'} onValueChange={v => setFilterShip(v === '_all' ? '' : v)} disabled={!filterOwner}>
          <SelectTrigger className="h-8 text-xs w-28"><SelectValue placeholder="전체 선박" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">전체 선박</SelectItem>
            {ships.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {(filterOwner || filterFleet || filterShip) && (
          <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={() => { setFilterOwner(''); setFilterFleet(''); setFilterShip(''); }}>
            <X className="w-3 h-3" />초기화
          </Button>
        )}
        <span className="text-xs text-muted-foreground ml-auto">{filteredPlans.length}건</span>
      </div>

      {/* 상태 탭 */}
      <Tabs value={statusTab} onValueChange={v => setStatusTab(v as StatusTab)}>
        <TabsList className="h-8 gap-0.5">
          {(['all','draft','pending_approval','approved','executed'] as StatusTab[]).map(s => (
            <TabsTrigger key={s} value={s} className="text-xs h-7 px-3">
              {STATUS_CONFIG[s].label} <span className="ml-1 text-[10px] opacity-70">({countByStatus(s)})</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* 계획 목록 */}
      <Card>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm">교대 계획 목록</CardTitle>
              <CardDescription className="text-xs">작성된 선원 교대 계획서 목록입니다</CardDescription>
            </div>
            {selectedIds.length > 0 && (
              <Button variant="outline" size="sm" className="h-7 text-xs text-red-600 border-red-300 hover:bg-red-50" onClick={handleBulkDelete}>
                <Trash2 className="h-3.5 w-3.5 mr-1" />선택 삭제 ({selectedIds.length})
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">로딩 중...</div>
          ) : filteredPlans.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">교대 계획이 없습니다</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <Checkbox
                      checked={deletableIds.length > 0 && deletableIds.every(id => selectedIds.includes(id))}
                      onCheckedChange={checked => toggleSelectAll(!!checked)}
                      disabled={deletableIds.length === 0}
                    />
                  </TableHead>
                  <TableHead className="text-xs">계획명</TableHead>
                  <TableHead className="text-xs">선주사</TableHead>
                  <TableHead className="text-xs">선박</TableHead>
                  <TableHead className="text-xs">교대일</TableHead>
                  <TableHead className="text-xs">교대인원</TableHead>
                  <TableHead className="text-xs">상태</TableHead>
                  <TableHead className="text-xs">작성일</TableHead>
                  <TableHead className="text-right text-xs">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedPlans.map(group => (
                  <Fragment key={group.key}>
                    <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                      <TableCell colSpan={9} className="text-xs font-semibold text-gray-600 py-1.5">
                        {group.label} <span className="ml-1 font-normal text-gray-400">({group.plans.length}건)</span>
                      </TableCell>
                    </TableRow>
                    {group.plans.map(plan => (
                      <TableRow key={plan.id} className="cursor-pointer" onClick={() => openNewTab(`/crew-rotation/${plan.id}`, plan.plan_name || '교대계획')}>
                        <TableCell onClick={e => e.stopPropagation()}>
                          {plan.status === 'draft' && (
                            <Checkbox checked={selectedIds.includes(plan.id)} onCheckedChange={() => toggleSelect(plan.id)} />
                          )}
                        </TableCell>
                        <TableCell className="font-medium text-xs">{plan.plan_name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{plan.owner_name}</TableCell>
                        <TableCell className="text-xs">
                          <div className="flex items-center gap-1.5">
                            <Ship className="h-3.5 w-3.5 text-muted-foreground" />
                            {plan.ship_name}
                            {plan.fleet_name && <span className="text-muted-foreground">({plan.fleet_name})</span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">{format(new Date(plan.rotation_date), 'yyyy-MM-dd', { locale: ko })}</TableCell>
                        <TableCell className="text-xs">
                          <div className="flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5 text-muted-foreground" />
                            {plan.assignments.length}명
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(plan.status)}</TableCell>
                        <TableCell className="text-xs">{format(new Date(plan.created_at), 'yyyy-MM-dd HH:mm', { locale: ko })}</TableCell>
                        <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            {plan.status === 'draft' && (
                              <>
                                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleDelete(plan.id)}>삭제</Button>
                                <Button variant="outline" size="sm" className="h-7 text-xs text-blue-600 border-blue-300 hover:bg-blue-50" onClick={() => handleSubmitApproval(plan.id)}>결재 상신</Button>
                              </>
                            )}
                            {plan.status === 'pending_approval' && (
                              <Button variant="default" size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={() => handleApprove(plan.id)}>승인</Button>
                            )}
                            {plan.status === 'approved' && (
                              <Button variant="default" size="sm" className="h-7 text-xs" onClick={() => handleExecute(plan.id)}>발령 실행</Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 계약만료 하선계획 자동생성 다이얼로그 */}
      <Dialog open={autoGenOpen} onOpenChange={setAutoGenOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              계약만료 하선계획 자동생성
            </DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-3 py-2 border-b">
            <span className="text-sm text-gray-600">만료 기준:</span>
            <Select value={String(expiryThreshold)} onValueChange={v => setExpiryThreshold(+v)}>
              <SelectTrigger className="h-8 text-xs w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[7, 14, 30, 60, 90].map(d => <SelectItem key={d} value={String(d)}>{d}일 이내</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">
              {expiryLoading ? '조회 중...' : `해당 선원 ${expiryFiltered.length}명`}
            </span>
          </div>

          <div className="overflow-y-auto flex-1">
            {expiryLoading ? (
              <div className="text-center py-8 text-sm text-muted-foreground">조회 중...</div>
            ) : expiryFiltered.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                {expiryThreshold}일 이내 계약 만료 선원이 없습니다
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">선박</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">선원</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">승선일</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">계약개월</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">계약만료일</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">잔여일</th>
                  </tr>
                </thead>
                <tbody>
                  {expiryFiltered.map(e => (
                    <tr key={e.crew_id} className="border-b hover:bg-gray-50">
                      <td className="px-3 py-1.5 font-medium">{e.ship_name}</td>
                      <td className="px-3 py-1.5">{e.crew_name}</td>
                      <td className="px-3 py-1.5">{e.embark_date}</td>
                      <td className="px-3 py-1.5 text-center">{e.contract_months}개월</td>
                      <td className="px-3 py-1.5">{e.expiry_date}</td>
                      <td className={`px-3 py-1.5 font-medium ${expiryColor(e.days_until_expiry)}`}>
                        {e.days_until_expiry < 0 ? `${Math.abs(e.days_until_expiry)}일 초과` : `${e.days_until_expiry}일`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <DialogFooter className="border-t pt-3">
            <Button variant="outline" onClick={() => setAutoGenOpen(false)}>취소</Button>
            <Button
              onClick={handleAutoGenerate}
              disabled={expiryFiltered.length === 0 || autoGenLoading}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {autoGenLoading ? '생성 중...' : `${new Set(expiryFiltered.map(e => e.ship_id)).size}개 선박 하선계획 초안 생성`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
