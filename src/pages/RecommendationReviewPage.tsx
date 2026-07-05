import { useState, useEffect } from 'react';
import { Search, Filter, Eye, XCircle, Clock, ExternalLink, FileText, Send, CheckCircle2, ChevronRight, ArrowLeft, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { Textarea } from '@/components/ui/textarea';
import { crewRecommendationService } from '@/services/crew-recommendation.service';
import { approvalService } from '@/services/approval.service';
import { supervisorService } from '@/services/supervisor.service';
import { supabase } from '@/lib/supabase';
import { getCurrentUser, getCompanies, getFleets, getShips, getRanks } from '@/lib/store';
import type { CrewRecommendationWithDetails, User, Company, Fleet, Ship, Rank } from '@/types/models';
import type { ApprovalLineWithSteps, CrewRecommendationApprovalWithDetails } from '@/types/approval';

const ITEMS_PER_PAGE = 20;

const calcAge = (birthDate: string): number => {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
};

export default function RecommendationReviewPage() {
  const [loggedUser, setLoggedUser] = useState<User | null>(null);
  const [recommendations, setRecommendations] = useState<CrewRecommendationWithDetails[]>([]);
  const [filtered, setFiltered] = useState<CrewRecommendationWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRec, setSelectedRec] = useState<CrewRecommendationWithDetails | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'detail' | 'approval'>('list');
  const [approvalAction, setApprovalAction] = useState<'accept' | 'reject' | null>(null);
  const [approvalComment, setApprovalComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [approvalMap, setApprovalMap] = useState<Map<string, CrewRecommendationApprovalWithDetails>>(new Map());
  const [supervisorPerms, setSupervisorPerms] = useState<Map<string, boolean>>(new Map());
  const [shipSupervisors, setShipSupervisors] = useState<Map<string, string[]>>(new Map());

  const [approvalLines, setApprovalLines] = useState<ApprovalLineWithSteps[]>([]);
  const [selectedLine, setSelectedLine] = useState('');
  const [saveLineDefault, setSaveLineDefault] = useState(false);
  const [defaultLineId, setDefaultLineId] = useState('');

  const [companies, setCompanies] = useState<Company[]>([]);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [ships, setShips] = useState<Ship[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [agencies, setAgencies] = useState<Company[]>([]);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [stFilter, setStFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [ownerF, setOwnerF] = useState('all');
  const [fleetF, setFleetF] = useState('all');
  const [shipF, setShipF] = useState('all');
  const [rankF, setRankF] = useState('all');
  const [agencyF, setAgencyF] = useState('all');

  useEffect(() => { loadAll(); }, []);
  useEffect(() => { applyFilters(); }, [recommendations, search, stFilter, dateFilter, ownerF, fleetF, shipF, rankF, agencyF]);
  useEffect(() => {
    if (ownerF !== 'all') getFleets(ownerF).then(setFleets).catch(console.error);
    else getFleets().then(setFleets).catch(console.error);
    setFleetF('all');
  }, [ownerF]);
  useEffect(() => {
    getShips().then(all => {
      if (fleetF !== 'all') setShips(all.filter((s: Ship) => s.fleet_id === fleetF));
      else if (ownerF !== 'all') setShips(all.filter((s: Ship) => s.owner_id === ownerF));
      else setShips(all);
    }).catch(console.error);
    setShipF('all');
  }, [fleetF, ownerF]);

  const loadAll = async () => {
    try {
      setLoading(true);
      const fetchedUser = await getCurrentUser();
      console.log('👤 fetchedUser:', fetchedUser?.id, fetchedUser?.role);
      setLoggedUser(fetchedUser);

      const [allCompanies, allFleets, allShips, allRanks] = await Promise.all([
        getCompanies(), getFleets(), getShips(), getRanks(),
      ]);

      setCompanies(allCompanies.filter((c: Company) => c.type === 'owner'));
      setAgencies(allCompanies.filter((c: Company) => c.type === 'manning'));
      setFleets(allFleets);
      setShips(allShips);
      setRanks(allRanks);

      const isAdminUser = fetchedUser?.role === 'admin' || fetchedUser?.role === 'system_admin';
      if (!fetchedUser || (fetchedUser.role !== 'ship_manager' && !isAdminUser)) {
        console.log('⚠️ not ship_manager/admin, skipping');
        setLoading(false);
        return;
      }

      const { data: pref } = await supabase
        .from('users').select('default_approval_line_id').eq('id', fetchedUser.id).single();
      if (pref?.default_approval_line_id) {
        setDefaultLineId(pref.default_approval_line_id);
        setSelectedLine(pref.default_approval_line_id);
      }
      const lines = await approvalService.getApprovalLines(fetchedUser.company_id ?? null);
      setApprovalLines(lines);

      const { data: recs, error } = await supabase
        .from('crew_recommendations').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      if (!recs || recs.length === 0) { setLoading(false); return; }

      const rankIds = [...new Set(recs.map((r: Record<string, string>) => r.rank_id).filter(Boolean))];
      const coIds = [...new Set(recs.map((r: Record<string, string>) => r.company_id).filter(Boolean))];
      const flIds = [...new Set(recs.map((r: Record<string, string>) => r.fleet_id).filter(Boolean))];
      const shIds = [...new Set(recs.map((r: Record<string, string>) => r.ship_id).filter(Boolean))];
      const agIds = [...new Set(recs.map((r: Record<string, string>) => r.manning_agency_id).filter(Boolean))];

      const [rRes, cRes, fRes, sRes, aRes] = await Promise.all([
        rankIds.length > 0 ? supabase.from('ranks').select('id,name,rank_code,department').in('id', rankIds) : { data: [] },
        coIds.length > 0 ? supabase.from('companies').select('id,name').in('id', coIds) : { data: [] },
        flIds.length > 0 ? supabase.from('fleets').select('id,name').in('id', flIds) : { data: [] },
        shIds.length > 0 ? supabase.from('ships').select('id,name').in('id', shIds) : { data: [] },
        agIds.length > 0 ? supabase.from('companies').select('id,name').in('id', agIds) : { data: [] },
      ]);

      type RM = { id: string; name: string; rank_code: string; department: string };
      type NM = { id: string; name: string };

      const rMap = new Map((rRes.data || []).map((r: RM) => [r.id, r]));
      const cMap = new Map((cRes.data || []).map((c: NM) => [c.id, c.name]));
      const fMap = new Map((fRes.data || []).map((f: NM) => [f.id, f.name]));
      const sMap = new Map((sRes.data || []).map((s: NM) => [s.id, s.name]));
      const aMap = new Map((aRes.data || []).map((a: NM) => [a.id, a.name]));

      const enriched = recs.map((rec: Record<string, unknown>) => {
        let rf = rec.resume_files;
        if (typeof rf === 'string') { try { rf = JSON.parse(rf); } catch { rf = []; } }
        if (!Array.isArray(rf)) rf = [];
        const ri = rMap.get(rec.rank_id as string) as RM | undefined;
        return {
          ...rec,
          resume_files: rf,
          manning_agency_name: aMap.get(rec.manning_agency_id as string) || '',
          rank_name: ri?.name || '',
          rank_code: ri?.rank_code || '',
          department: ri?.department || '',
          company_name: cMap.get(rec.company_id as string) || '',
          fleet_name: rec.fleet_id ? fMap.get(rec.fleet_id as string) || '' : '',
          ship_name: sMap.get(rec.ship_id as string) || '',
        };
      });

      setRecommendations(enriched);

      // 결재 진행 현황
      const reviewed = recs.filter((r: Record<string, string>) => r.status === 'reviewed');
      if (reviewed.length > 0) {
        const amap = new Map<string, CrewRecommendationApprovalWithDetails>();
        await Promise.all(reviewed.map(async (r: Record<string, string>) => {
          try {
            const ap = await approvalService.getApprovalsByRecommendation(r.id);
            if (ap.length > 0) amap.set(r.id, ap[0]);
          } catch (e) { console.error(e); }
        }));
        setApprovalMap(amap);
      }

      // supervisor 정보
      const uniqueShips = [...new Set(recs.map((r: Record<string, string>) => r.ship_id).filter(Boolean))];
      const [saRes, suRes, sdRes] = await Promise.all([
        supabase.from('supervisor_assignments').select('supervisor_id,ship_id,fleet_id,owner_id'),
        supabase.from('users').select('id,name'),
        uniqueShips.length > 0 ? supabase.from('ships').select('id,fleet_id,owner_id').in('id', uniqueShips) : { data: [] },
      ]);

      type SA = { supervisor_id: string; ship_id: string; fleet_id: string | null; owner_id: string | null };
      type SU = { id: string; name: string };
      type SD = { id: string; fleet_id: string | null; owner_id: string };

      const suMap = new Map((suRes.data || []).map((u: SU) => [u.id, u.name]));
      const sdMap = new Map((sdRes.data || []).map((s: SD) => [s.id, s]));
      const saList: SA[] = saRes.data || [];

      const supNames = new Map<string, string[]>();
      for (const sid of uniqueShips) {
        const sh = sdMap.get(sid as string);
        const names: string[] = [];
        for (const sa of saList) {
          if (sa.ship_id === sid || (sh?.fleet_id && sa.fleet_id === sh.fleet_id) || (sh?.owner_id && sa.owner_id === sh.owner_id)) {
            const n = suMap.get(sa.supervisor_id);
            if (n && !names.includes(n)) names.push(n);
          }
        }
        supNames.set(sid as string, names);
      }
      setShipSupervisors(supNames);

      const perms = new Map<string, boolean>();
      await Promise.all(uniqueShips.map(async (sid) => {
        const r = await supervisorService.isSupervisorForShip(fetchedUser.id, sid as string);
        perms.set(sid as string, r.is_supervisor);
      }));
      setSupervisorPerms(perms);

    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let data = [...recommendations];
    if (search) {
      const t = search.toLowerCase();
      data = data.filter(r =>
        r.crew_name.toLowerCase().includes(t) ||
        r.ship_name.toLowerCase().includes(t) ||
        r.rank_code?.toLowerCase().includes(t) ||
        r.manning_agency_name.toLowerCase().includes(t)
      );
    }
    if (stFilter !== 'all') data = data.filter(r => r.status === stFilter);
    if (ownerF !== 'all') data = data.filter(r => r.company_id === ownerF);
    if (fleetF !== 'all') data = data.filter(r => r.fleet_id === fleetF);
    if (shipF !== 'all') data = data.filter(r => r.ship_id === shipF);
    if (rankF !== 'all') data = data.filter(r => r.rank_id === rankF);
    if (agencyF !== 'all') data = data.filter(r => r.manning_agency_id === agencyF);
    if (dateFilter !== 'all') {
      const d = new Date();
      if (dateFilter === 'week') d.setDate(d.getDate() - 7);
      else if (dateFilter === 'month') d.setMonth(d.getMonth() - 1);
      else if (dateFilter === 'quarter') d.setMonth(d.getMonth() - 3);
      data = data.filter(r => new Date(r.created_at) >= d);
    }
    setFiltered(data);
    setPage(1);
  };

  const openDetail = (r: CrewRecommendationWithDetails) => { setSelectedRec(r); setViewMode('detail'); };
  const handleDelete = async (r: CrewRecommendationWithDetails) => {
    if (!confirm(`${r.crew_name}님의 추천 건을 완전히 삭제하시겠습니까? 되돌릴 수 없습니다.`)) return;
    try {
      await crewRecommendationService.delete(r.id);
      if (selectedRec?.id === r.id) { setViewMode('list'); setSelectedRec(null); }
      await loadAll();
    } catch (e) {
      console.error(e);
      alert('삭제 중 오류가 발생했습니다.');
    }
  };
  const openApproval = (r: CrewRecommendationWithDetails, action: 'accept' | 'reject') => {
    setSelectedRec(r); setApprovalAction(action); setApprovalComment('');
    setSaveLineDefault(false);
    setSelectedLine(defaultLineId || '');
    setViewMode('approval');
  };

  const submitApproval = async () => {
    if (!selectedRec || !approvalAction || !loggedUser) return;
    try {
      setSubmitting(true);
      if (approvalAction === 'reject') {
        if (!approvalComment.trim()) { alert('거절 사유를 입력해주세요.'); return; }
        await crewRecommendationService.updateStatus(selectedRec.id, 'rejected');
        alert('추천이 거절되었습니다.');
      } else {
        if (!selectedLine) { alert('결재 라인을 선택해주세요.'); return; }
        if (saveLineDefault) {
          await supabase.from('users').update({ default_approval_line_id: selectedLine }).eq('id', loggedUser.id);
          setDefaultLineId(selectedLine);
        }
        await approvalService.createApproval(selectedRec.id, selectedLine, loggedUser.id, approvalComment);
        await crewRecommendationService.updateStatus(selectedRec.id, 'reviewed');
        alert('채용 결재가 요청되었습니다.');
      }
      await loadAll();
      setViewMode('list'); setSelectedRec(null); setApprovalAction(null); setApprovalComment(''); setSaveLineDefault(false);
    } catch (e) { console.error(e); alert('결재 처리에 실패했습니다.'); }
    finally { setSubmitting(false); }
  };

  const openResume = async (r: CrewRecommendationWithDetails) => {
    if (!r.resume_files?.length) { alert('첨부된 이력서가 없습니다.'); return; }
    for (const f of r.resume_files) {
      const { data } = supabase.storage.from('documents').getPublicUrl(f.path);
      if (data?.publicUrl) window.open(data.publicUrl, '_blank');
    }
  };

  const sBadge = (s: string) => {
    if (s === 'pending') return <Badge variant="secondary" className="text-xs">검토대기</Badge>;
    if (s === 'reviewed') return <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-300">결재중</Badge>;
    if (s === 'accepted') return <Badge variant="default" className="text-xs bg-green-600">승인</Badge>;
    if (s === 'rejected') return <Badge variant="destructive" className="text-xs">거절</Badge>;
    return null;
  };

  const dc = (d: string) => {
    if (d === 'deck') return 'bg-blue-100 text-blue-700 border-blue-300';
    if (d === 'engine') return 'bg-green-100 text-green-700 border-green-300';
    if (d === 'catering') return 'bg-orange-100 text-orange-700 border-orange-300';
    return 'bg-gray-100 text-gray-700 border-gray-300';
  };

  const canAp = (r: CrewRecommendationWithDetails) =>
    loggedUser?.role === 'admin' || loggedUser?.role === 'system_admin' || (supervisorPerms.get(r.ship_id) || false);

  const ApProgress = ({ recId }: { recId: string }) => {
    const ap = approvalMap.get(recId);
    if (!ap) return <span className="text-xs text-gray-400">-</span>;
    const steps = ap.approval_line?.steps || [];
    const actions = ap.actions || [];
    return (
      <div className="flex items-center gap-1">
        {steps.map((step, idx) => {
          const act = actions.find(a => a.step_order === step.step_order);
          const isCur = step.step_order === ap.current_step;
          const isDone = act?.action === 'approved';
          const isRej = act?.action === 'rejected';
          return (
            <div key={step.id} className="flex items-center gap-1">
              <div className="flex flex-col items-center">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold border
                  ${isDone ? 'bg-green-500 border-green-500 text-white' : isRej ? 'bg-red-500 border-red-500 text-white' : isCur ? 'bg-yellow-400 border-yellow-400 text-white animate-pulse' : 'bg-gray-100 border-gray-300 text-gray-400'}`}
                  title={`${step.approver_name} (${act ? (act.action === 'approved' ? '승인' : '반려') : isCur ? '대기중' : '미도달'})`}>
                  {isDone ? '✓' : isRej ? '✗' : idx + 1}
                </div>
                <span className="text-xs text-gray-500 mt-0.5 max-w-[40px] truncate text-center">{step.approver_name.split(' ')[0]}</span>
              </div>
              {idx < steps.length - 1 && <ChevronRight className="w-3 h-3 text-gray-300 mb-4" />}
            </div>
          );
        })}
      </div>
    );
  };

  const lineSteps = () => approvalLines.find(l => l.id === selectedLine)?.steps || [];
  const apDisabled = () => approvalAction === 'reject' ? !approvalComment.trim() : !selectedLine || lineSteps().length === 0;

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const pageRecs = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  if (loading) return <><div className="p-8 text-sm text-gray-500">로딩 중...</div></>;

  return (
    <>
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
        <div className="mb-4">
          <h1 className="text-2xl font-bold">선원 추천 검토</h1>
          <p className="text-sm text-muted-foreground mt-1">매닝사가 추천한 선원을 검토하고 채용 결재를 진행합니다</p>
        </div>

        {viewMode === 'list' && (
          <>
            {/* 필터 */}
            <div className="bg-white rounded-lg shadow-sm p-3 mb-3">
              <div className="flex items-center gap-2 mb-2"><Filter className="w-3.5 h-3.5 text-muted-foreground" /><span className="text-sm font-medium">필터</span></div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <div className="md:col-span-4">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input placeholder="선원명, 선박명, 직급, 매닝사 검색..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9 text-sm" />
                  </div>
                </div>
                <Select value={ownerF} onValueChange={setOwnerF}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="선주사" /></SelectTrigger><SelectContent><SelectItem value="all">전체 선주사</SelectItem>{companies.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent></Select>
                <Select value={fleetF} onValueChange={setFleetF} disabled={ownerF === 'all'}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="플릿" /></SelectTrigger><SelectContent><SelectItem value="all">전체 플릿</SelectItem>{fleets.map(f => <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>)}</SelectContent></Select>
                <Select value={shipF} onValueChange={setShipF} disabled={ownerF === 'all'}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="선박" /></SelectTrigger><SelectContent><SelectItem value="all">전체 선박</SelectItem>{ships.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent></Select>
                <Select value={rankF} onValueChange={setRankF}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="직급" /></SelectTrigger><SelectContent><SelectItem value="all">전체 직급</SelectItem>{ranks.map(r => <SelectItem key={r.id} value={String(r.id)}>{r.rank_code} - {r.name}</SelectItem>)}</SelectContent></Select>
                <Select value={agencyF} onValueChange={setAgencyF}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="매닝사" /></SelectTrigger><SelectContent><SelectItem value="all">전체 매닝사</SelectItem>{agencies.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}</SelectContent></Select>
                <Select value={stFilter} onValueChange={setStFilter}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="상태" /></SelectTrigger><SelectContent><SelectItem value="all">전체 상태</SelectItem><SelectItem value="pending">검토대기</SelectItem><SelectItem value="reviewed">결재중</SelectItem><SelectItem value="accepted">승인</SelectItem><SelectItem value="rejected">거절</SelectItem></SelectContent></Select>
                <Select value={dateFilter} onValueChange={setDateFilter}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="기간" /></SelectTrigger><SelectContent><SelectItem value="all">전체 기간</SelectItem><SelectItem value="week">최근 1주일</SelectItem><SelectItem value="month">최근 1개월</SelectItem><SelectItem value="quarter">최근 3개월</SelectItem></SelectContent></Select>
              </div>
            </div>

            {/* 테이블 */}
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="text-xs py-2 w-20">상태</TableHead>
                    <TableHead className="text-xs py-2 w-32">선박</TableHead>
                    <TableHead className="text-xs py-2 w-20">직급</TableHead>
                    <TableHead className="text-xs py-2 w-24">선원명</TableHead>
                    <TableHead className="text-xs py-2 w-12">나이</TableHead>
                    <TableHead className="text-xs py-2 w-28">매닝사</TableHead>
                    <TableHead className="text-xs py-2">희망조건</TableHead>
                    <TableHead className="text-xs py-2 w-24">출국가능일</TableHead>
                    <TableHead className="text-xs py-2">결재 진행 현황</TableHead>
                    <TableHead className="text-xs py-2 w-32">결재 시작 담당자</TableHead>
                    <TableHead className="text-right text-xs py-2 w-36">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRecs.map(rec => (
                    <TableRow key={rec.id} className="hover:bg-muted/50 cursor-pointer" onClick={() => openDetail(rec)}>
                      <TableCell className="py-2">{sBadge(rec.status)}</TableCell>
                      <TableCell className="py-2">
                        <div className="text-sm font-medium truncate max-w-[120px]">{rec.ship_name}</div>
                        {rec.fleet_name && <div className="text-xs text-muted-foreground truncate">{rec.fleet_name}</div>}
                      </TableCell>
                      <TableCell className="py-2">
                        {rec.rank_code
                          ? <Badge variant="outline" className={`text-xs ${dc(rec.department)}`}>{rec.rank_code}</Badge>
                          : <Badge variant="outline" className="text-xs bg-gray-100 text-gray-400">-</Badge>}
                      </TableCell>
                      <TableCell className="py-2"><div className="text-sm font-medium">{rec.crew_name}</div></TableCell>
                      <TableCell className="py-2"><div className="text-xs text-muted-foreground">{calcAge(rec.crew_birth_date)}세</div></TableCell>
                      <TableCell className="py-2"><div className="text-sm truncate max-w-[110px]">{rec.manning_agency_name}</div></TableCell>
                      <TableCell className="py-2">
                        <div className="text-sm">{rec.desired_currency} {rec.desired_salary.toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground">{rec.desired_contract_months}개월</div>
                      </TableCell>
                      <TableCell className="text-xs py-2">
                        {new Date(rec.available_date).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' })}
                      </TableCell>
                      <TableCell className="py-2">
                        {rec.status === 'reviewed' ? <ApProgress recId={rec.id} /> : <span className="text-xs text-gray-300">-</span>}
                      </TableCell>
                      <TableCell className="py-2">
                        {rec.status === 'pending' ? (() => {
                          const names = shipSupervisors.get(rec.ship_id) || [];
                          if (names.length === 0) return <span className="text-xs text-red-400">담당자 미지정</span>;
                          return (
                            <div className="flex flex-wrap gap-1">
                              {names.map(n => (
                                <span key={n} className={`text-xs px-1.5 py-0.5 rounded font-medium ${canAp(rec) && n === loggedUser?.name ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                                  {n}
                                </span>
                              ))}
                            </div>
                          );
                        })() : <span className="text-xs text-gray-300">-</span>}
                      </TableCell>
                      <TableCell className="text-right py-2">
                        <div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
                          <Button variant="outline" size="sm" onClick={() => openDetail(rec)} className="h-7 px-2 text-xs">
                            <Eye className="w-3.5 h-3.5 mr-1" />상세
                          </Button>
                          {rec.status === 'pending' && (
                            <>
                              <Button variant="outline" size="sm" onClick={() => openApproval(rec, 'accept')} disabled={!canAp(rec)} className="h-7 px-2 text-xs text-blue-600 hover:bg-blue-50 disabled:opacity-50">
                                <Send className="w-3.5 h-3.5 mr-1" />결재
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => openApproval(rec, 'reject')} disabled={!canAp(rec)} className="h-7 px-2 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50">
                                <XCircle className="w-3.5 h-3.5 mr-1" />거절
                              </Button>
                            </>
                          )}
                          {rec.status !== 'pending' && (
                            <Button variant="outline" size="sm" onClick={() => handleDelete(rec)} className="h-7 px-2 text-xs text-red-600 hover:bg-red-50">
                              <Trash2 className="w-3.5 h-3.5 mr-1" />삭제
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {pageRecs.length === 0 && (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  {search || stFilter !== 'all' ? '검색 결과가 없습니다.' : '받은 선원 추천이 없습니다.'}
                </div>
              )}
            </div>

            {totalPages > 1 && (
              <div className="mt-3 flex justify-center">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem><PaginationPrevious onClick={() => page > 1 && setPage(page - 1)} className={page === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'} /></PaginationItem>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => {
                      if (p === 1 || p === totalPages || (p >= page - 1 && p <= page + 1)) {
                        return <PaginationItem key={p}><PaginationLink onClick={() => setPage(p)} isActive={page === p} className="cursor-pointer">{p}</PaginationLink></PaginationItem>;
                      } else if (p === page - 2 || p === page + 2) {
                        return <PaginationItem key={p}><span className="px-4">...</span></PaginationItem>;
                      }
                      return null;
                    })}
                    <PaginationItem><PaginationNext onClick={() => page < totalPages && setPage(page + 1)} className={page === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'} /></PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </>
        )}

        {/* 상세 인라인 뷰 */}
        {viewMode === 'detail' && selectedRec && (() => {
          const ap = approvalMap.get(selectedRec.id);
          const names = shipSupervisors.get(selectedRec.ship_id) || [];
          return (
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center gap-3 mb-6 justify-between">
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="sm" onClick={() => { setViewMode('list'); setSelectedRec(null); }} className="h-8 px-2">
                    <ArrowLeft className="w-4 h-4 mr-1" />목록
                  </Button>
                  <h2 className="text-lg font-semibold">추천 선원 상세 정보</h2>
                </div>
                {selectedRec.status !== 'pending' && (
                  <Button variant="outline" size="sm" onClick={() => handleDelete(selectedRec)} className="h-8 px-2 text-xs text-red-600 hover:bg-red-50">
                    <Trash2 className="w-3.5 h-3.5 mr-1" />삭제
                  </Button>
                )}
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                  <span className="text-sm font-medium">현재 상태</span>{sBadge(selectedRec.status)}
                </div>

                {selectedRec.status === 'reviewed' && ap && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                    <div className="text-sm font-semibold text-yellow-800 mb-3 flex items-center gap-2">
                      <Clock className="w-4 h-4" />결재 진행 현황 — {ap.approval_line?.name}
                    </div>
                    <div className="flex items-start gap-3 flex-wrap">
                      {(ap.approval_line?.steps || []).map((step, idx) => {
                        const act = ap.actions?.find(a => a.step_order === step.step_order);
                        const isCur = step.step_order === ap.current_step;
                        const isDone = act?.action === 'approved';
                        const isRej = act?.action === 'rejected';
                        return (
                          <div key={step.id} className="flex items-center gap-2">
                            <div className="flex flex-col items-center">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 ${isDone ? 'bg-green-500 border-green-500 text-white' : isRej ? 'bg-red-500 border-red-500 text-white' : isCur ? 'bg-yellow-400 border-yellow-400 text-white' : 'bg-white border-gray-300 text-gray-400'}`}>
                                {isDone ? <CheckCircle2 className="w-4 h-4" /> : isRej ? '✗' : idx + 1}
                              </div>
                              <div className="text-xs mt-1 text-center">
                                <div className="font-medium text-gray-700">{step.approver_name}</div>
                                <div className={isDone ? 'text-green-600' : isRej ? 'text-red-600' : isCur ? 'text-yellow-600 font-semibold' : 'text-gray-400'}>
                                  {isDone ? '승인' : isRej ? '반려' : isCur ? '대기중' : '미도달'}
                                </div>
                                {act?.comment && <div className="text-gray-400 italic">"{act.comment}"</div>}
                              </div>
                            </div>
                            {idx < (ap.approval_line?.steps || []).length - 1 && <ChevronRight className="w-4 h-4 text-gray-300 mt-[-16px]" />}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {selectedRec.status === 'pending' && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                    <div className="text-sm font-semibold text-blue-800 mb-2">결재 시작 담당자</div>
                    {names.length === 0
                      ? <span className="text-sm text-red-500">담당자가 지정되지 않았습니다.</span>
                      : <div className="flex flex-wrap gap-2">{names.map(n => (
                          <span key={n} className={`text-sm px-2 py-1 rounded font-medium ${canAp(selectedRec) && n === loggedUser?.name ? 'bg-blue-600 text-white' : 'bg-white text-blue-700 border border-blue-300'}`}>
                            {n}{canAp(selectedRec) && n === loggedUser?.name ? ' (본인)' : ''}
                          </span>
                        ))}</div>}
                  </div>
                )}

                <div>
                  <h3 className="text-sm font-semibold mb-2">선원 정보</h3>
                  <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-md">
                    <div><span className="text-xs text-gray-600">직급</span><div className="mt-1">{selectedRec.rank_code ? <Badge className={dc(selectedRec.department)}>{selectedRec.rank_code}</Badge> : '-'}</div></div>
                    <div><span className="text-xs text-gray-600">성명</span><p className="text-sm font-medium">{selectedRec.crew_name}</p></div>
                    <div><span className="text-xs text-gray-600">생년월일</span><p className="text-sm font-medium">{new Date(selectedRec.crew_birth_date).toLocaleDateString('ko-KR')}</p></div>
                    <div><span className="text-xs text-gray-600">나이</span><p className="text-sm font-medium">{calcAge(selectedRec.crew_birth_date)}세</p></div>
                    <div><span className="text-xs text-gray-600">출국 가능일</span><p className="text-sm font-medium">{new Date(selectedRec.available_date).toLocaleDateString('ko-KR')}</p></div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold mb-2">선박 정보</h3>
                  <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-md">
                    <div><span className="text-xs text-gray-600">선주사</span><p className="text-sm font-medium">{selectedRec.company_name}</p></div>
                    <div><span className="text-xs text-gray-600">선박명</span><p className="text-sm font-medium">{selectedRec.ship_name}</p></div>
                    {selectedRec.fleet_name && <div><span className="text-xs text-gray-600">선대</span><p className="text-sm font-medium">{selectedRec.fleet_name}</p></div>}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold mb-2">추천 매닝사</h3>
                  <div className="p-3 bg-gray-50 rounded-md"><p className="text-sm font-medium">{selectedRec.manning_agency_name}</p></div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold mb-2">희망 계약 조건</h3>
                  <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-md">
                    <div><span className="text-xs text-gray-600">희망 급여</span><p className="text-sm font-medium">{selectedRec.desired_currency} {selectedRec.desired_salary.toLocaleString()}</p></div>
                    <div><span className="text-xs text-gray-600">희망 계약기간</span><p className="text-sm font-medium">{selectedRec.desired_contract_months}개월</p></div>
                  </div>
                </div>

                {selectedRec.remarks && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2">비고</h3>
                    <div className="p-3 bg-gray-50 rounded-md"><p className="text-sm whitespace-pre-wrap">{selectedRec.remarks}</p></div>
                  </div>
                )}

                {selectedRec.resume_files?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2">첨부 이력서</h3>
                    <div className="space-y-2">
                      {selectedRec.resume_files.map((f: { name: string; size: number; path: string }, i: number) => (
                        <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-gray-500" />
                            <span className="text-sm">{f.name}</span>
                            <span className="text-xs text-gray-500">({(f.size / 1024).toFixed(1)} KB)</span>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => openResume(selectedRec)} className="h-7">
                            <ExternalLink className="w-3.5 h-3.5 mr-1" />열기
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedRec.status === 'pending' && (
                  <div className="flex justify-end gap-2 pt-4 border-t">
                    <Button variant="outline" onClick={() => openApproval(selectedRec, 'reject')} disabled={!canAp(selectedRec)} className="text-red-600 hover:bg-red-50 disabled:opacity-50">
                      <XCircle className="w-4 h-4 mr-2" />거절
                    </Button>
                    <Button onClick={() => openApproval(selectedRec, 'accept')} disabled={!canAp(selectedRec)} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
                      <Send className="w-4 h-4 mr-2" />채용 결재 요청
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* 결재 인라인 뷰 */}
        {viewMode === 'approval' && selectedRec && (
          <div className="bg-white rounded-lg shadow-sm p-6 max-w-xl">
            <div className="flex items-center gap-3 mb-6">
              <Button variant="ghost" size="sm" onClick={() => setViewMode('detail')} className="h-8 px-2">
                <ArrowLeft className="w-4 h-4 mr-1" />상세
              </Button>
              <h2 className="text-lg font-semibold">{approvalAction === 'accept' ? '채용 결재 요청' : '선원 추천 거절'}</h2>
            </div>

            <div className="space-y-4">
              <div className="p-3 bg-gray-50 rounded-md text-sm space-y-1">
                <div><span className="font-medium">선원:</span> {selectedRec.crew_name}</div>
                <div><span className="font-medium">직급:</span> {selectedRec.rank_code}</div>
                <div><span className="font-medium">선박:</span> {selectedRec.ship_name}</div>
              </div>

              {approvalAction === 'accept' && (
                <div>
                  <label className="text-sm font-medium mb-2 block">결재 라인 선택 *</label>
                  <Select value={selectedLine} onValueChange={setSelectedLine}>
                    <SelectTrigger><SelectValue placeholder="결재 라인을 선택하세요" /></SelectTrigger>
                    <SelectContent>
                      {approvalLines.length === 0
                        ? <SelectItem value="none" disabled>등록된 결재 라인이 없습니다</SelectItem>
                        : approvalLines.map(l => <SelectItem key={l.id} value={String(l.id)}>{l.name} ({l.steps.length}단계)</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {selectedLine && lineSteps().length > 0 && (
                    <>
                      <div className="mt-2 p-2 bg-blue-50 rounded-md">
                        <p className="text-xs font-medium text-blue-900 mb-1">결재 순서:</p>
                        {lineSteps().map((s, i) => (
                          <div key={s.id} className="text-xs text-blue-700">{i + 1}. {s.approver_name} ({s.approver_role || '담당자'})</div>
                        ))}
                      </div>
                      <div className="flex items-center space-x-2 mt-3">
                        <Checkbox id="future" checked={saveLineDefault} onCheckedChange={c => setSaveLineDefault(c as boolean)} />
                        <label htmlFor="future" className="text-sm text-gray-700 cursor-pointer">앞으로도 해당 결재 라인 이용</label>
                      </div>
                    </>
                  )}
                </div>
              )}

              <div>
                <label className="text-sm font-medium mb-2 block">{approvalAction === 'accept' ? '요청 사유 (선택)' : '거절 사유 (필수)'}</label>
                <Textarea value={approvalComment} onChange={e => setApprovalComment(e.target.value)} placeholder={approvalAction === 'accept' ? '요청 사유를 입력하세요...' : '거절 사유를 입력하세요...'} className="min-h-[100px]" />
              </div>

              <div className={`border rounded-md p-3 ${approvalAction === 'accept' ? 'bg-blue-50 border-blue-200' : 'bg-yellow-50 border-yellow-200'}`}>
                <div className="flex items-start gap-2">
                  <Clock className={`w-4 h-4 mt-0.5 ${approvalAction === 'accept' ? 'text-blue-600' : 'text-yellow-600'}`} />
                  <p className={`text-xs ${approvalAction === 'accept' ? 'text-blue-800' : 'text-yellow-800'}`}>
                    {approvalAction === 'accept' ? '채용 결재 요청 시 선택한 결재 라인을 따라 순차적으로 결재가 진행됩니다.' : '거절 시 매닝사에 즉시 통보되며, 거절 사유가 전달됩니다.'}
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setViewMode('detail')} disabled={submitting}>취소</Button>
                <Button onClick={submitApproval} disabled={submitting || apDisabled()} className={approvalAction === 'accept' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'}>
                  {submitting ? '처리 중...' : approvalAction === 'accept' ? '결재 요청' : '거절 확정'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
