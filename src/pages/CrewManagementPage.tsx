import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { msg } from '@/lib/messages';
import {
  Plus, Search, X, ChevronLeft, ChevronRight, Trash2,
  ArrowUpCircle, Ship, Users, UserCheck, UserMinus,
} from 'lucide-react';
import { useTabContext } from '@/contexts/TabContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { crewService, type CrewWithDetails } from '@/services/crew.service';
import { supabase } from '@/lib/supabase';
import type { Rank, Company, Fleet, Ship as ShipType } from '@/types/models';
import type { RegistrationSource } from '@/types/dispatch';
import { REGISTRATION_SOURCE_LABELS, CREW_CATEGORY_LABELS } from '@/types/dispatch';
import { useToast } from '@/hooks/use-toast';

type CategoryTab = 'registered' | 'standby' | 'onboard' | 'disembarked';

const CATEGORY_STATUS_MAP: Record<CategoryTab, string[]> = {
  registered:   ['registered', 'under_review', 'sent_to_owner', 'owner_approved', 'owner_rejected'],
  standby:      ['deployment_decided', 'standby'],
  onboard:      ['onboard'],
  disembarked:  ['standby'],
};

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  registered:        { label: '등록',      color: 'bg-gray-100 text-gray-700' },
  under_review:      { label: '검토중',    color: 'bg-blue-100 text-blue-700' },
  sent_to_owner:     { label: '선주송부',  color: 'bg-purple-100 text-purple-700' },
  owner_approved:    { label: '선주승인',  color: 'bg-green-100 text-green-700' },
  owner_rejected:    { label: '선주거절',  color: 'bg-red-100 text-red-700' },
  deployment_decided:{ label: '승선결정',  color: 'bg-emerald-100 text-emerald-700' },
  onboard:           { label: '승선중',    color: 'bg-cyan-100 text-cyan-700' },
  standby:           { label: '대기',      color: 'bg-yellow-100 text-yellow-700' },
};

export function CrewManagementPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { openNewTab } = useTabContext();

  const [crew, setCrew] = useState<CrewWithDetails[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [owners, setOwners] = useState<Company[]>([]);
  const [manningAgencies, setManningAgencies] = useState<Company[]>([]);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [ships, setShips] = useState<ShipType[]>([]);
  const [loading, setLoading] = useState(true);

  const [category, setCategory] = useState<CategoryTab>('registered');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOwner, setFilterOwner] = useState('all');
  const [filterFleet, setFilterFleet] = useState('all');
  const [filterShip, setFilterShip] = useState('all');
  const [filterRank, setFilterRank] = useState('all');
  const [filterManning, setFilterManning] = useState('all');
  const [filterSource, setFilterSource] = useState('all');

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  useEffect(() => { loadData(); }, []);
  useEffect(() => { setCurrentPage(1); setSelectedIds([]); }, [category, searchTerm, filterOwner, filterFleet, filterShip, filterRank, filterManning, filterSource]);
  useEffect(() => {
    if (filterOwner !== 'all') supabase.from('fleets').select('*').eq('owner_id', filterOwner).then(({ data }) => setFleets(data || []));
    else { setFleets([]); setFilterFleet('all'); }
  }, [filterOwner]);
  useEffect(() => {
    if (filterFleet !== 'all') supabase.from('ships').select('*').eq('fleet_id', filterFleet).then(({ data }) => setShips(data || []));
    else if (filterOwner !== 'all') supabase.from('ships').select('*').eq('owner_id', filterOwner).then(({ data }) => setShips(data || []));
    else { setShips([]); setFilterShip('all'); }
  }, [filterFleet, filterOwner]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [crewData, ranksRes, companiesRes] = await Promise.all([
        crewService.getAllWithDetails(),
        supabase.from('ranks').select('*').order('display_order'),
        supabase.from('companies').select('*'),
      ]);
      setCrew(crewData);
      if (ranksRes.data) setRanks(ranksRes.data);
      if (companiesRes.data) {
        setOwners(companiesRes.data.filter((c: Company) => c.type === 'owner'));
        setManningAgencies(companiesRes.data.filter((c: Company) => c.type === 'manning'));
      }
    } finally { setLoading(false); }
  };

  const filtered = useMemo(() => {
    const statuses = CATEGORY_STATUS_MAP[category];
    let list = crew.filter(c => {
      const st = (c as CrewWithDetails & { status?: string }).status || c.current_status || '';
      if (category === 'disembarked') return st === 'standby';
      if (category === 'standby') return statuses.includes(st);
      return statuses.includes(st);
    });
    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      list = list.filter(c =>
        c.name?.toLowerCase().includes(t) ||
        c.rank_name?.toLowerCase().includes(t) ||
        c.passport_number?.toLowerCase().includes(t) ||
        c.seaman_book_number?.toLowerCase().includes(t)
      );
    }
    if (filterOwner !== 'all') list = list.filter(c => c.owner_id === filterOwner);
    if (filterFleet !== 'all') list = list.filter(c => c.fleet_id === filterFleet);
    if (filterShip !== 'all') list = list.filter(c => c.current_ship_id === filterShip);
    if (filterRank !== 'all') list = list.filter(c => c.rank_id === filterRank);
    if (filterManning !== 'all') list = list.filter(c => c.manning_agency_id === filterManning);
    if (filterSource !== 'all') list = list.filter(c => (c as CrewWithDetails & { registration_source?: string }).registration_source === filterSource);
    return list;
  }, [crew, category, searchTerm, filterOwner, filterFleet, filterShip, filterRank, filterManning, filterSource]);

  const countOf = (cat: CategoryTab) => {
    const statuses = CATEGORY_STATUS_MAP[cat];
    return crew.filter(c => {
      const st = (c as CrewWithDetails & { status?: string }).status || c.current_status || '';
      if (cat === 'disembarked') return st === 'standby';
      return statuses.includes(st);
    }).length;
  };

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const goToPage = (p: number) => setCurrentPage(Math.max(1, Math.min(p, totalPages)));

  const toggleSelect = (id: string) =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleAll = (checked: boolean) =>
    setSelectedIds(checked ? paginated.map(c => c.id) : []);

  const openRotationPlan = (mode: 'boarding' | 'disembark') => {
    if (selectedIds.length === 0) { toast({ title: '선원을 선택하세요', variant: 'destructive' }); return; }
    const param = selectedIds.join(',');
    openNewTab(`/crew-rotation/new?${mode}=${param}`, '교대계획 작성', true);
  };

  const openDispatchOrder = () => {
    if (selectedIds.length === 0) { toast({ title: '선원을 선택하세요', variant: 'destructive' }); return; }
    openNewTab(`/crew-dispatch/new?crew=${selectedIds.join(',')}`, '승진/강등 발령', true);
  };

  const confirmDelete = async () => {
    const { error } = await supabase.from('crew_members').delete().in('id', selectedIds);
    if (error) { toast({ title: '삭제 실패', variant: 'destructive' }); return; }
    toast({ title: '삭제 완료', description: `${selectedIds.length}명 삭제됨` });
    setSelectedIds([]); setShowDeleteDialog(false); await loadData();
  };

  const isFiltered = filterOwner !== 'all' || filterFleet !== 'all' || filterShip !== 'all' ||
    filterRank !== 'all' || filterManning !== 'all' || filterSource !== 'all';

  const clearFilters = () => {
    setFilterOwner('all'); setFilterFleet('all'); setFilterShip('all');
    setFilterRank('all'); setFilterManning('all'); setFilterSource('all'); setSearchTerm('');
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3" />
        <p className="text-sm text-gray-600">로딩 중...</p>
      </div>
    </div>
  );

  return (
    <>
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-base">선원 관리</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">등록부터 하선까지 선원 현황을 관리합니다</p>
              </div>
              <div className="flex gap-2">
                {selectedIds.length > 0 && (
                  <>
                    {category === 'standby' && (
                      <Button onClick={() => openRotationPlan('boarding')} size="sm" className="gap-1.5 h-8 bg-emerald-600 hover:bg-emerald-700">
                        <Ship className="w-4 h-4" />교대계획(승선) ({selectedIds.length})
                      </Button>
                    )}
                    {category === 'onboard' && (
                      <>
                        <Button onClick={() => openRotationPlan('disembark')} size="sm" className="gap-1.5 h-8 bg-orange-500 hover:bg-orange-600">
                          <UserMinus className="w-4 h-4" />교대계획(하선) ({selectedIds.length})
                        </Button>
                        <Button onClick={openDispatchOrder} size="sm" variant="outline" className="gap-1.5 h-8">
                          <ArrowUpCircle className="w-4 h-4" />승진/강등 발령
                        </Button>
                      </>
                    )}
                    <Button onClick={() => setShowDeleteDialog(true)} size="sm" variant="destructive" className="gap-1.5 h-8">
                      <Trash2 className="w-4 h-4" />삭제 ({selectedIds.length})
                    </Button>
                  </>
                )}
                <Button onClick={() => openNewTab('/crew/new', '선원 등록', true)} size="sm" className="gap-1.5 h-8">
                  <Plus className="w-4 h-4" />선원 등록
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-0 space-y-3">
            {/* 검색 */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="이름, 직급, 여권번호, 선원수첩번호로 검색..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-10 h-9 text-sm"
              />
            </div>

            {/* 필터 */}
            <div className="flex flex-wrap gap-2">
              <Select value={filterOwner} onValueChange={setFilterOwner}>
                <SelectTrigger className="h-8 text-xs w-32"><SelectValue placeholder="선주사" /></SelectTrigger>
                <SelectContent><SelectItem value="all">전체 선주사</SelectItem>{owners.map(o => <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={filterFleet} onValueChange={setFilterFleet} disabled={filterOwner === 'all'}>
                <SelectTrigger className="h-8 text-xs w-28"><SelectValue placeholder="플릿" /></SelectTrigger>
                <SelectContent><SelectItem value="all">전체 플릿</SelectItem>{fleets.map(f => <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={filterShip} onValueChange={setFilterShip} disabled={filterOwner === 'all'}>
                <SelectTrigger className="h-8 text-xs w-28"><SelectValue placeholder="선박" /></SelectTrigger>
                <SelectContent><SelectItem value="all">전체 선박</SelectItem>{ships.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={filterRank} onValueChange={setFilterRank}>
                <SelectTrigger className="h-8 text-xs w-28"><SelectValue placeholder="직급" /></SelectTrigger>
                <SelectContent><SelectItem value="all">전체 직급</SelectItem>{ranks.map(r => <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={filterManning} onValueChange={setFilterManning}>
                <SelectTrigger className="h-8 text-xs w-28"><SelectValue placeholder="매닝사" /></SelectTrigger>
                <SelectContent><SelectItem value="all">전체 매닝사</SelectItem>{manningAgencies.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}</SelectContent>
              </Select>
              {category === 'registered' && (
                <Select value={filterSource} onValueChange={setFilterSource}>
                  <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="등록출처" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체 출처</SelectItem>
                    {(Object.keys(REGISTRATION_SOURCE_LABELS) as RegistrationSource[]).map(s => (
                      <SelectItem key={s} value={s}>{REGISTRATION_SOURCE_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {isFiltered && (
                <Button variant="outline" size="sm" onClick={clearFilters} className="h-8 text-xs gap-1">
                  <X className="w-3 h-3" />초기화
                </Button>
              )}
            </div>

            {/* 4단계 탭 */}
            <Tabs value={category} onValueChange={v => setCategory(v as CategoryTab)}>
              <TabsList className="h-9 gap-1">
                <TabsTrigger value="registered" className="text-xs h-8 gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  {CREW_CATEGORY_LABELS.registered}
                  <Badge variant="secondary" className="text-xs px-1.5 py-0 h-4">{countOf('registered')}</Badge>
                </TabsTrigger>
                <TabsTrigger value="standby" className="text-xs h-8 gap-1.5">
                  <UserCheck className="w-3.5 h-3.5" />
                  {CREW_CATEGORY_LABELS.standby}
                  <Badge variant="secondary" className="text-xs px-1.5 py-0 h-4">{countOf('standby')}</Badge>
                </TabsTrigger>
                <TabsTrigger value="onboard" className="text-xs h-8 gap-1.5">
                  <Ship className="w-3.5 h-3.5" />
                  {CREW_CATEGORY_LABELS.onboard}
                  <Badge variant="secondary" className="text-xs px-1.5 py-0 h-4">{countOf('onboard')}</Badge>
                </TabsTrigger>
                <TabsTrigger value="disembarked" className="text-xs h-8 gap-1.5">
                  <UserMinus className="w-3.5 h-3.5" />
                  {CREW_CATEGORY_LABELS.disembarked}
                  <Badge variant="secondary" className="text-xs px-1.5 py-0 h-4">{countOf('disembarked')}</Badge>
                </TabsTrigger>
              </TabsList>

              {(['registered','standby','onboard','disembarked'] as CategoryTab[]).map(cat => (
                <TabsContent key={cat} value={cat} className="mt-3">
                  {/* 카운트 + 페이지당 설정 */}
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-xs text-gray-500">
                      총 {filtered.length}명
                      {selectedIds.length > 0 && msg.crew.selectedCount(selectedIds.length)}
                    </p>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">페이지당:</Label>
                      <Select value={itemsPerPage.toString()} onValueChange={v => { setItemsPerPage(+v); setCurrentPage(1); }}>
                        <SelectTrigger className="h-7 w-16 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[10,20,50,100].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* 테이블 */}
                  <div className="border rounded-md overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="w-8 px-3 py-2">
                            <Checkbox
                              checked={paginated.length > 0 && paginated.every(c => selectedIds.includes(c.id))}
                              onCheckedChange={checked => toggleAll(!!checked)}
                            />
                          </th>
                          <th className="w-8 px-2 py-2 text-center text-xs font-medium text-gray-400">#</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">이름</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">직급</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">국적</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">
                            {cat === 'onboard' ? '승선 선박' : cat === 'disembarked' ? '하선 선박' : cat === 'standby' ? '배정 선박' : '추천 선박'}
                          </th>
                          {cat === 'registered' && <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">등록출처</th>}
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">상태</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">Grade</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginated.length === 0 ? (
                          <tr><td colSpan={cat === 'registered' ? 10 : 9} className="text-center py-8 text-sm text-gray-400">선원이 없습니다</td></tr>
                        ) : paginated.map((c, idx) => {
                          const crewExt = c as CrewWithDetails & { status?: string; registration_source?: string; current_grade?: string };
                          const statusKey = crewExt.status || '';
                          const badge = (cat === 'disembarked' && statusKey === 'standby')
                            ? { label: '휴가중', color: 'bg-sky-100 text-sky-700' }
                            : STATUS_BADGE[statusKey];
                          const shipParts = [crewExt.owner_name, crewExt.fleet_name, crewExt.current_ship_name].filter(Boolean);
                          const shipDisplay = (cat === 'registered' && crewExt.registration_source !== 'job_posting')
                            ? '-'
                            : shipParts.length > 0 ? shipParts.join(' › ') : '-';
                          return (
                            <tr key={c.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => toggleSelect(c.id)}>
                              <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                                <Checkbox checked={selectedIds.includes(c.id)} onCheckedChange={() => toggleSelect(c.id)} />
                              </td>
                              <td className="px-2 py-2 text-center text-xs text-gray-400">{(currentPage - 1) * itemsPerPage + idx + 1}</td>
                              <td className="px-3 py-2 font-medium">{c.name}</td>
                              <td className="px-3 py-2 text-gray-600">{c.rank_name || '-'}</td>
                              <td className="px-3 py-2 text-gray-600">{c.nationality || '-'}</td>
                              <td className="px-3 py-2 text-xs text-gray-600 max-w-[200px] truncate" title={shipDisplay !== '-' ? shipDisplay : undefined}>{shipDisplay}</td>
                              {cat === 'registered' && (
                                <td className="px-3 py-2 text-xs text-gray-500">
                                  {crewExt.registration_source ? REGISTRATION_SOURCE_LABELS[crewExt.registration_source as RegistrationSource] : '-'}
                                </td>
                              )}
                              <td className="px-3 py-2">
                                {badge && (
                                  <span className={`text-xs px-2 py-0.5 rounded-full ${badge.color}`}>{badge.label}</span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                {crewExt.current_grade ? (
                                  <span className="text-xs font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{crewExt.current_grade}급</span>
                                ) : '-'}
                              </td>
                              <td className="px-3 py-2 text-right" onClick={e => e.stopPropagation()}>
                                <Button
                                  size="sm" variant="ghost" className="h-7 text-xs"
                                  onClick={() => openNewTab(`/crew/${c.id}`, c.name || '선원 정보')}
                                >
                                  열람
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* 페이지네이션 */}
                  {totalPages > 1 && (
                    <div className="flex justify-center items-center gap-2 pt-3">
                      <Button variant="outline" size="sm" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1} className="h-8">
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        const p = totalPages <= 5 ? i + 1
                          : currentPage <= 3 ? i + 1
                          : currentPage >= totalPages - 2 ? totalPages - 4 + i
                          : currentPage - 2 + i;
                        return (
                          <Button key={p} variant={currentPage === p ? 'default' : 'outline'} size="sm"
                            onClick={() => goToPage(p)} className="h-8 w-8 p-0">{p}</Button>
                        );
                      })}
                      <Button variant="outline" size="sm" onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages} className="h-8">
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>선원 삭제 확인</AlertDialogTitle>
            <AlertDialogDescription>
              선택한 {selectedIds.length}명의 선원을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default CrewManagementPage;
