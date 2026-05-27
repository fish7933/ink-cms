import { useState, useEffect } from 'react';
import { Search, Filter, Eye, XCircle, Clock, ExternalLink, FileText, Send, CheckCircle2, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { Textarea } from '@/components/ui/textarea';
import { crewRecommendationService } from '@/services/crew-recommendation.service';
import { approvalService } from '@/services/approval.service';
import { supervisorService } from '@/services/supervisor.service';
import { supabase } from '@/lib/supabase';
import { getCurrentUser, getCompanies, getFleets, getShips, getRanks } from '@/lib/store';
import Layout from '@/components/Layout';
import type { CrewRecommendationWithDetails, User, Company, Fleet, Ship, Rank } from '@/types/models';
import type { ApprovalLineWithSteps, CrewRecommendationApprovalWithDetails } from '@/types/approval';

const ITEMS_PER_PAGE = 20;

const calculateAge = (birthDate: string): number => {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
};

export default function RecommendationReviewPage() {
  const [recommendations, setRecommendations] = useState<CrewRecommendationWithDetails[]>([]);
  const [filteredRecommendations, setFilteredRecommendations] = useState<CrewRecommendationWithDetails[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRec, setSelectedRec] = useState<CrewRecommendationWithDetails | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [approvalAction, setApprovalAction] = useState<'accept' | 'reject' | null>(null);
  const [approvalComment, setApprovalComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [approvalMap, setApprovalMap] = useState<Map<string, CrewRecommendationApprovalWithDetails>>(new Map());
  const [supervisorPermissions, setSupervisorPermissions] = useState<Map<string, boolean>>(new Map());
  const [shipSupervisorMap, setShipSupervisorMap] = useState<Map<string, string[]>>(new Map());

  const [approvalLines, setApprovalLines] = useState<ApprovalLineWithSteps[]>([]);
  const [selectedApprovalLine, setSelectedApprovalLine] = useState('');
  const [useApprovalLineForFuture, setUseApprovalLineForFuture] = useState(false);
  const [defaultApprovalLineId, setDefaultApprovalLineId] = useState('');

  const [companies, setCompanies] = useState<Company[]>([]);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [ships, setShips] = useState<Ship[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [manningAgencies, setManningAgencies] = useState<Company[]>([]);

  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [fleetFilter, setFleetFilter] = useState('all');
  const [shipFilter, setShipFilter] = useState('all');
  const [rankFilter, setRankFilter] = useState('all');
  const [agencyFilter, setAgencyFilter] = useState('all');

  useEffect(() => { loadData(); }, []);
  useEffect(() => { applyFilters(); }, [recommendations, searchTerm, statusFilter, dateFilter, ownerFilter, fleetFilter, shipFilter, rankFilter, agencyFilter]);
  useEffect(() => {
    if (ownerFilter !== 'all') loadFleetsByOwner(ownerFilter); else loadAllFleets();
    setFleetFilter('all');
  }, [ownerFilter]);
  useEffect(() => {
    if (fleetFilter !== 'all') loadShipsByFleet(fleetFilter);
    else if (ownerFilter !== 'all') loadShipsByOwner(ownerFilter);
    else loadAllShips();
    setShipFilter('all');
  }, [fleetFilter, ownerFilter]);

  const loadData = async () => {
    try {
      setLoading(true);

      const currentUserData = await getCurrentUser();
      console.log('👤 getCurrentUser result:', currentUserData);

      const [companiesData, fleetsData, shipsData, ranksData] = await Promise.all([
        getCompanies(), getFleets(), getShips(), getRanks(),
      ]);

      setCurrentUser(currentUserData);
      setCompanies(companiesData.filter((c: Company) => c.type === 'owner'));
      setManningAgencies(companiesData.filter((c: Company) => c.type === 'manning'));
      setFleets(fleetsData);
      setShips(shipsData);
      setRanks(ranksData);

      if (!currentUserData) {
        console.log('❌ currentUserData is null - not logged in');
        return;
      }
      if (currentUserData.role !== 'ship_manager') {
        console.log('❌ role is not ship_manager:', currentUserData.role);
        return;
      }

      // 기본 결재선 로드
      const { data: pref } = await supabase
        .from('users').select('default_approval_line_id').eq('id', currentUserData.id).single();
      if (pref?.default_approval_line_id) {
        setDefaultApprovalLineId(pref.default_approval_line_id);
        setSelectedApprovalLine(pref.default_approval_line_id);
      }
      if (currentUserData.company_id) {
        const lines = await approvalService.getApprovalLines(currentUserData.company_id);
        setApprovalLines(lines);
        if (!pref?.default_approval_line_id) setSelectedApprovalLine('');
      }

      // 추천 목록 로드
      const { data: allRecs, error } = await supabase
        .from('crew_recommendations').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      if (!allRecs || allRecs.length === 0) { setLoading(false); return; }

      // 관련 데이터 배치 조회
      const rankIds = [...new Set(allRecs.map((r: { rank_id: string }) => r.rank_id).filter(Boolean))];
      const companyIds = [...new Set(allRecs.map((r: { company_id: string }) => r.company_id).filter(Boolean))];
      const fleetIds = [...new Set(allRecs.map((r: { fleet_id: string | null }) => r.fleet_id).filter(Boolean))];
      const shipIds = [...new Set(allRecs.map((r: { ship_id: string }) => r.ship_id).filter(Boolean))];
      const agencyIds = [...new Set(allRecs.map((r: { manning_agency_id: string }) => r.manning_agency_id).filter(Boolean))];

      const [ranksRes, companiesRes, fleetsRes, shipsRes, agenciesRes] = await Promise.all([
        rankIds.length > 0 ? supabase.from('ranks').select('id, name, rank_code, department').in('id', rankIds) : { data: [] },
        companyIds.length > 0 ? supabase.from('companies').select('id, name').in('id', companyIds) : { data: [] },
        fleetIds.length > 0 ? supabase.from('fleets').select('id, name').in('id', fleetIds) : { data: [] },
        shipIds.length > 0 ? supabase.from('ships').select('id, name').in('id', shipIds) : { data: [] },
        agencyIds.length > 0 ? supabase.from('companies').select('id, name').in('id', agencyIds) : { data: [] },
      ]);

      const ranksMap = new Map((ranksRes.data || []).map((r: { id: string; name: string; rank_code: string; department: string }) => [r.id, r]));
      const companiesMap = new Map((companiesRes.data || []).map((c: { id: string; name: string }) => [c.id, c]));
      const fleetsMap = new Map((fleetsRes.data || []).map((f: { id: string; name: string }) => [f.id, f]));
      const shipsMap = new Map((shipsRes.data || []).map((s: { id: string; name: string }) => [s.id, s]));
      const agenciesMap = new Map((agenciesRes.data || []).map((a: { id: string; name: string }) => [a.id, a]));

      const enrichedRecs = allRecs.map((rec: Record<string, unknown>) => {
        let resumeFiles = rec.resume_files;
        if (typeof resumeFiles === 'string') {
          try { resumeFiles = JSON.parse(resumeFiles); } catch { resumeFiles = []; }
        }
        if (!Array.isArray(resumeFiles)) resumeFiles = [];
        return {
          ...rec,
          resume_files: resumeFiles,
          manning_agency_name: (agenciesMap.get(rec.manning_agency_id as string) as { name: string } | undefined)?.name || '',
          rank_name: (ranksMap.get(rec.rank_id as string) as { name: string } | undefined)?.name || '',
          rank_code: (ranksMap.get(rec.rank_id as string) as { rank_code: string } | undefined)?.rank_code || '',
          department: (ranksMap.get(rec.rank_id as string) as { department: string } | undefined)?.department || '',
          company_name: (companiesMap.get(rec.company_id as string) as { name: string } | undefined)?.name || '',
          fleet_name: rec.fleet_id ? (fleetsMap.get(rec.fleet_id as string) as { name: string } | undefined)?.name || '' : '',
          ship_name: (shipsMap.get(rec.ship_id as string) as { name: string } | undefined)?.name || '',
        };
      });

      setRecommendations(enrichedRecs);

      // 결재 진행 현황 로드
      const reviewedRecs = allRecs.filter((r: { status: string }) => r.status === 'reviewed');
      if (reviewedRecs.length > 0) {
        const newApprovalMap = new Map<string, CrewRecommendationApprovalWithDetails>();
        await Promise.all(reviewedRecs.map(async (rec: { id: string }) => {
          try {
            const approvals = await approvalService.getApprovalsByRecommendation(rec.id);
            if (approvals.length > 0) newApprovalMap.set(rec.id, approvals[0]);
          } catch (e) { console.error('approval load error', e); }
        }));
        setApprovalMap(newApprovalMap);
      }

      // 선박별 supervisor 정보 로드
      const uniqueShipIds = [...new Set(allRecs.map((r: { ship_id: string }) => r.ship_id).filter(Boolean))];

      const [saRes, suRes, shipsDetailRes] = await Promise.all([
        supabase.from('supervisor_assignments').select('supervisor_id, ship_id, fleet_id, owner_id'),
        supabase.from('users').select('id, name'),
        shipIds.length > 0 ? supabase.from('ships').select('id, fleet_id, owner_id').in('id', uniqueShipIds) : { data: [] },
      ]);

      const supervisorUserMap = new Map((suRes.data || []).map((u: { id: string; name: string }) => [u.id, u.name]));
      const shipsDetailMap = new Map((shipsDetailRes.data || []).map((s: { id: string; fleet_id: string | null; owner_id: string }) => [s.id, s]));
      const allSA = saRes.data || [];

      const supervisorNamesMap = new Map<string, string[]>();
      for (const shipId of uniqueShipIds) {
        const ship = shipsDetailMap.get(shipId as string);
        const names: string[] = [];
        for (const sa of allSA) {
          const isForShip = sa.ship_id === shipId;
          const isForFleet = ship?.fleet_id && sa.fleet_id === ship.fleet_id;
          const isForOwner = ship?.owner_id && sa.owner_id === ship.owner_id;
          if (isForShip || isForFleet || isForOwner) {
            const name = supervisorUserMap.get(sa.supervisor_id);
            if (name && !names.includes(name as string)) names.push(name as string);
          }
        }
        supervisorNamesMap.set(shipId as string, names);
      }
      setShipSupervisorMap(supervisorNamesMap);

      // supervisor 권한 확인
      const permissionsMap = new Map<string, boolean>();
      await Promise.all(uniqueShipIds.map(async (shipId) => {
        const result = await supervisorService.isSupervisorForShip(currentUserData.id, shipId as string);
        permissionsMap.set(shipId as string, result.is_supervisor);
      }));
      setSupervisorPermissions(permissionsMap);

    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAllFleets = async () => { try { setFleets(await getFleets()); } catch (e) { console.error(e); } };
  const loadFleetsByOwner = async (ownerId: string) => { try { setFleets(await getFleets(ownerId)); } catch (e) { console.error(e); } };
  const loadAllShips = async () => { try { setShips(await getShips()); } catch (e) { console.error(e); } };
  const loadShipsByFleet = async (fleetId: string) => { try { const all = await getShips(); setShips(all.filter((s: Ship) => s.fleet_id === fleetId)); } catch (e) { console.error(e); } };
  const loadShipsByOwner = async (ownerId: string) => { try { const all = await getShips(); setShips(all.filter((s: Ship) => s.owner_id === ownerId)); } catch (e) { console.error(e); } };

  const applyFilters = () => {
    let filtered = [...recommendations];
    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      filtered = filtered.filter(r =>
        r.crew_name.toLowerCase().includes(t) ||
        r.ship_name.toLowerCase().includes(t) ||
        r.rank_code?.toLowerCase().includes(t) ||
        r.manning_agency_name.toLowerCase().includes(t)
      );
    }
    if (statusFilter !== 'all') filtered = filtered.filter(r => r.status === statusFilter);
    if (ownerFilter !== 'all') filtered = filtered.filter(r => r.company_id === ownerFilter);
    if (fleetFilter !== 'all') filtered = filtered.filter(r => r.fleet_id === fleetFilter);
    if (shipFilter !== 'all') filtered = filtered.filter(r => r.ship_id === shipFilter);
    if (rankFilter !== 'all') filtered = filtered.filter(r => r.rank_id === rankFilter);
    if (agencyFilter !== 'all') filtered = filtered.filter(r => r.manning_agency_id === agencyFilter);
    if (dateFilter !== 'all') {
      const d = new Date();
      if (dateFilter === 'week') d.setDate(d.getDate() - 7);
      else if (dateFilter === 'month') d.setMonth(d.getMonth() - 1);
      else if (dateFilter === 'quarter') d.setMonth(d.getMonth() - 3);
      filtered = filtered.filter(r => new Date(r.created_at) >= d);
    }
    setFilteredRecommendations(filtered);
    setCurrentPage(1);
  };

  const openDetail = (rec: CrewRecommendationWithDetails) => { setSelectedRec(rec); setDetailOpen(true); };
  const openApproval = (rec: CrewRecommendationWithDetails, action: 'accept' | 'reject') => {
    setSelectedRec(rec); setApprovalAction(action); setApprovalComment('');
    setUseApprovalLineForFuture(false);
    if (defaultApprovalLineId) setSelectedApprovalLine(defaultApprovalLineId);
    setApprovalOpen(true);
  };

  const handleSubmitApproval = async () => {
    if (!selectedRec || !approvalAction || !currentUser) return;
    try {
      setSubmitting(true);
      if (approvalAction === 'reject') {
        if (!approvalComment.trim()) { alert('거절 사유를 입력해주세요.'); return; }
        await crewRecommendationService.updateStatus(selectedRec.id, 'rejected');
        alert('추천이 거절되었습니다.');
      } else {
        if (!selectedApprovalLine) { alert('결재 라인을 선택해주세요.'); return; }
        if (useApprovalLineForFuture) {
          await supabase.from('users').update({ default_approval_line_id: selectedApprovalLine }).eq('id', currentUser.id);
          setDefaultApprovalLineId(selectedApprovalLine);
        }
        await approvalService.createApproval(selectedRec.id, selectedApprovalLine, currentUser.id, approvalComment);
        await crewRecommendationService.updateStatus(selectedRec.id, 'reviewed');
        alert('채용 결재가 요청되었습니다.');
      }
      await loadData();
      setApprovalOpen(false); setSelectedRec(null); setApprovalAction(null); setApprovalComment(''); setUseApprovalLineForFuture(false);
    } catch (e) { console.error(e); alert('결재 처리에 실패했습니다.'); }
    finally { setSubmitting(false); }
  };

  const openResume = async (rec: CrewRecommendationWithDetails) => {
    if (!rec.resume_files?.length) { alert('첨부된 이력서가 없습니다.'); return; }
    for (const file of rec.resume_files) {
      const { data } = supabase.storage.from('documents').getPublicUrl(file.path);
      if (data?.publicUrl) window.open(data.publicUrl, '_blank');
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <Badge variant="secondary" className="text-xs">검토대기</Badge>;
      case 'reviewed': return <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-300">결재중</Badge>;
      case 'accepted': return <Badge variant="default" className="text-xs bg-green-600">승인</Badge>;
      case 'rejected': return <Badge variant="destructive" className="text-xs">거절</Badge>;
      default: return null;
    }
  };

  const deptColor = (d: string) => {
    if (d === 'deck') return 'bg-blue-100 text-blue-700 border-blue-300';
    if (d === 'engine') return 'bg-green-100 text-green-700 border-green-300';
    if (d === 'catering') return 'bg-orange-100 text-orange-700 border-orange-300';
    return 'bg-gray-100 text-gray-700 border-gray-300';
  };

  const canApprove = (rec: CrewRecommendationWithDetails) => supervisorPermissions.get(rec.ship_id) || false;

  const ApprovalProgress = ({ recId }: { recId: string }) => {
    const approval = approvalMap.get(recId);
    if (!approval) return <span className="text-xs text-gray-400">-</span>;
    const steps = approval.approval_line?.steps || [];
    const actions = approval.actions || [];
    return (
      <div className="flex items-center gap-1">
        {steps.map((step, idx) => {
          const action = actions.find(a => a.step_order === step.step_order);
          const isCurrent = step.step_order === approval.current_step;
          const isDone = action?.action === 'approved';
          const isRejected = action?.action === 'rejected';
          return (
            <div key={step.id} className="flex items-center gap-1">
              <div className="flex flex-col items-center">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold border
                  ${isDone ? 'bg-green-500 border-green-500 text-white'
                    : isRejected ? 'bg-red-500 border-red-500 text-white'
                    : isCurrent ? 'bg-yellow-400 border-yellow-400 text-white animate-pulse'
                    : 'bg-gray-100 border-gray-300 text-gray-400'}`}
                  title={`${step.approver_name} (${action ? (action.action === 'approved' ? '승인' : '반려') : isCurrent ? '대기중' : '미도달'})`}
                >
                  {isDone ? '✓' : isRejected ? '✗' : idx + 1}
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

  const getApprovalLineSteps = () => approvalLines.find(l => l.id === selectedApprovalLine)?.steps || [];
  const isApprovalDisabled = () => {
    if (approvalAction === 'reject') return !approvalComment.trim();
    if (!selectedApprovalLine) return true;
    return getApprovalLineSteps().length === 0;
  };

  const totalPages = Math.ceil(filteredRecommendations.length / ITEMS_PER_PAGE);
  const currentRecs = filteredRecommendations.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  if (loading) return <Layout><div className="p-8">로딩 중...</div></Layout>;

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
        <div className="mb-4">
          <h1 className="text-2xl font-bold">선원 추천 검토</h1>
          <p className="text-sm text-muted-foreground mt-1">매닝사가 추천한 선원을 검토하고 채용 결재를 진행합니다</p>
        </div>

        {/* 필터 */}
        <div className="bg-white rounded-lg shadow-sm p-3 mb-3">
          <div className="flex items-center gap-2 mb-2"><Filter className="w-3.5 h-3.5 text-muted-foreground" /><span className="text-sm font-medium">필터</span></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <div className="md:col-span-4">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input placeholder="선원명, 선박명, 직급, 매닝사 검색..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-8 h-9 text-sm" />
              </div>
            </div>
            <Select value={ownerFilter} onValueChange={setOwnerFilter}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="선주사" /></SelectTrigger><SelectContent><SelectItem value="all">전체 선주사</SelectItem>{companies.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent></Select>
            <Select value={fleetFilter} onValueChange={setFleetFilter} disabled={ownerFilter === 'all'}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="플릿" /></SelectTrigger><SelectContent><SelectItem value="all">전체 플릿</SelectItem>{fleets.map(f => <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>)}</SelectContent></Select>
            <Select value={shipFilter} onValueChange={setShipFilter} disabled={ownerFilter === 'all'}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="선박" /></SelectTrigger><SelectContent><SelectItem value="all">전체 선박</SelectItem>{ships.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent></Select>
            <Select value={rankFilter} onValueChange={setRankFilter}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="직급" /></SelectTrigger><SelectContent><SelectItem value="all">전체 직급</SelectItem>{ranks.map(r => <SelectItem key={r.id} value={String(r.id)}>{r.rank_code} - {r.name}</SelectItem>)}</SelectContent></Select>
            <Select value={agencyFilter} onValueChange={setAgencyFilter}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="매닝사" /></SelectTrigger><SelectContent><SelectItem value="all">전체 매닝사</SelectItem>{manningAgencies.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}</SelectContent></Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="상태" /></SelectTrigger><SelectContent><SelectItem value="all">전체 상태</SelectItem><SelectItem value="pending">검토대기</SelectItem><SelectItem value="reviewed">결재중</SelectItem><SelectItem value="accepted">승인</SelectItem><SelectItem value="rejected">거절</SelectItem></SelectContent></Select>
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
              {currentRecs.map(rec => (
                <TableRow key={rec.id} className="hover:bg-muted/50">
                  <TableCell className="py-2">{statusBadge(rec.status)}</TableCell>
                  <TableCell className="py-2">
                    <div className="text-sm font-medium truncate max-w-[120px]">{rec.ship_name}</div>
                    {rec.fleet_name && <div className="text-xs text-muted-foreground truncate">{rec.fleet_name}</div>}
                  </TableCell>
                  <TableCell className="py-2">
                    {rec.rank_code
                      ? <Badge variant="outline" className={`text-xs ${deptColor(rec.department)}`}>{rec.rank_code}</Badge>
                      : <Badge variant="outline" className="text-xs bg-gray-100 text-gray-400">-</Badge>}
                  </TableCell>
                  <TableCell className="py-2"><div className="text-sm font-medium">{rec.crew_name}</div></TableCell>
                  <TableCell className="py-2"><div className="text-xs text-muted-foreground">{calculateAge(rec.crew_birth_date)}세</div></TableCell>
                  <TableCell className="py-2"><div className="text-sm truncate max-w-[110px]">{rec.manning_agency_name}</div></TableCell>
                  <TableCell className="py-2">
                    <div className="text-sm">{rec.desired_currency} {rec.desired_salary.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">{rec.desired_contract_months}개월</div>
                  </TableCell>
                  <TableCell className="text-xs py-2">
                    {new Date(rec.available_date).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' })}
                  </TableCell>
                  <TableCell className="py-2">
                    {rec.status === 'reviewed' ? <ApprovalProgress recId={rec.id} /> : <span className="text-xs text-gray-300">-</span>}
                  </TableCell>
                  <TableCell className="py-2">
                    {rec.status === 'pending' ? (() => {
                      const names = shipSupervisorMap.get(rec.ship_id) || [];
                      if (names.length === 0) return <span className="text-xs text-red-400">담당자 미지정</span>;
                      return (
                        <div className="flex flex-wrap gap-1">
                          {names.map(name => (
                            <span key={name} className={`text-xs px-1.5 py-0.5 rounded font-medium
                              ${canApprove(rec) && name === currentUser?.name
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-gray-100 text-gray-600'}`}>
                              {name}
                            </span>
                          ))}
                        </div>
                      );
                    })() : <span className="text-xs text-gray-300">-</span>}
                  </TableCell>
                  <TableCell className="text-right py-2">
                    <div className="flex justify-end gap-1">
                      <Button variant="outline" size="sm" onClick={() => openDetail(rec)} className="h-7 px-2 text-xs">
                        <Eye className="w-3.5 h-3.5 mr-1" />상세
                      </Button>
                      {rec.status === 'pending' && (
                        <>
                          <Button variant="outline" size="sm" onClick={() => openApproval(rec, 'accept')} disabled={!canApprove(rec)}
                            className="h-7 px-2 text-xs text-blue-600 hover:bg-blue-50 disabled:opacity-50" title={!canApprove(rec) ? '해당 선박의 감독이 아닙니다' : ''}>
                            <Send className="w-3.5 h-3.5 mr-1" />결재
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => openApproval(rec, 'reject')} disabled={!canApprove(rec)}
                            className="h-7 px-2 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50" title={!canApprove(rec) ? '해당 선박의 감독이 아닙니다' : ''}>
                            <XCircle className="w-3.5 h-3.5 mr-1" />거절
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {currentRecs.length === 0 && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {searchTerm || statusFilter !== 'all' ? '검색 결과가 없습니다.' : '받은 선원 추천이 없습니다.'}
            </div>
          )}
        </div>

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div className="mt-3 flex justify-center">
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious onClick={() => currentPage > 1 && setCurrentPage(currentPage - 1)} className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'} />
                </PaginationItem>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
                  if (page === 1 || page === totalPages || (page >= currentPage - 1 && page <= currentPage + 1)) {
                    return <PaginationItem key={page}><PaginationLink onClick={() => setCurrentPage(page)} isActive={currentPage === page} className="cursor-pointer">{page}</PaginationLink></PaginationItem>;
                  } else if (page === currentPage - 2 || page === currentPage + 2) {
                    return <PaginationItem key={page}><span className="px-4">...</span></PaginationItem>;
                  }
                  return null;
                })}
                <PaginationItem>
                  <PaginationNext onClick={() => currentPage < totalPages && setCurrentPage(currentPage + 1)} className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'} />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}

        {/* 상세 다이얼로그 */}
        <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>추천 선원 상세 정보</DialogTitle></DialogHeader>
            {selectedRec && (() => {
              const approval = approvalMap.get(selectedRec.id);
              return (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                    <span className="text-sm font-medium">현재 상태</span>
                    {statusBadge(selectedRec.status)}
                  </div>

                  {selectedRec.status === 'reviewed' && approval && (
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                      <div className="text-sm font-semibold text-yellow-800 mb-3 flex items-center gap-2">
                        <Clock className="w-4 h-4" />결재 진행 현황 — {approval.approval_line?.name}
                      </div>
                      <div className="flex items-start gap-3 flex-wrap">
                        {(approval.approval_line?.steps || []).map((step, idx) => {
                          const action = approval.actions?.find(a => a.step_order === step.step_order);
                          const isCurrent = step.step_order === approval.current_step;
                          const isDone = action?.action === 'approved';
                          const isRejected = action?.action === 'rejected';
                          return (
                            <div key={step.id} className="flex items-center gap-2">
                              <div className="flex flex-col items-center">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2
                                  ${isDone ? 'bg-green-500 border-green-500 text-white'
                                    : isRejected ? 'bg-red-500 border-red-500 text-white'
                                    : isCurrent ? 'bg-yellow-400 border-yellow-400 text-white'
                                    : 'bg-white border-gray-300 text-gray-400'}`}>
                                  {isDone ? <CheckCircle2 className="w-4 h-4" /> : isRejected ? '✗' : idx + 1}
                                </div>
                                <div className="text-xs mt-1 text-center">
                                  <div className="font-medium text-gray-700">{step.approver_name}</div>
                                  <div className={isDone ? 'text-green-600' : isRejected ? 'text-red-600' : isCurrent ? 'text-yellow-600 font-semibold' : 'text-gray-400'}>
                                    {isDone ? '승인' : isRejected ? '반려' : isCurrent ? '대기중' : '미도달'}
                                  </div>
                                  {action?.comment && <div className="text-gray-400 italic">"{action.comment}"</div>}
                                </div>
                              </div>
                              {idx < (approval.approval_line?.steps || []).length - 1 && <ChevronRight className="w-4 h-4 text-gray-300 mt-[-16px]" />}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {selectedRec.status === 'pending' && (() => {
                    const names = shipSupervisorMap.get(selectedRec.ship_id) || [];
                    return (
                      <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                        <div className="text-sm font-semibold text-blue-800 mb-2">결재 시작 담당자</div>
                        {names.length === 0
                          ? <span className="text-sm text-red-500">담당자가 지정되지 않았습니다.</span>
                          : <div className="flex flex-wrap gap-2">{names.map(name => (
                              <span key={name} className={`text-sm px-2 py-1 rounded font-medium
                                ${canApprove(selectedRec) && name === currentUser?.name
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-white text-blue-700 border border-blue-300'}`}>
                                {name}{canApprove(selectedRec) && name === currentUser?.name ? ' (본인)' : ''}
                              </span>
                            ))}</div>}
                      </div>
                    );
                  })()}

                  <div>
                    <h3 className="text-sm font-semibold mb-2">선원 정보</h3>
                    <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-md">
                      <div><span className="text-xs text-gray-600">직급</span><div className="mt-1">{selectedRec.rank_code ? <Badge className={deptColor(selectedRec.department)}>{selectedRec.rank_code}</Badge> : '-'}</div></div>
                      <div><span className="text-xs text-gray-600">성명</span><p className="text-sm font-medium">{selectedRec.crew_name}</p></div>
                      <div><span className="text-xs text-gray-600">생년월일</span><p className="text-sm font-medium">{new Date(selectedRec.crew_birth_date).toLocaleDateString('ko-KR')}</p></div>
                      <div><span className="text-xs text-gray-600">나이</span><p className="text-sm font-medium">{calculateAge(selectedRec.crew_birth_date)}세</p></div>
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
                        {selectedRec.resume_files.map((file: { name: string; size: number; path: string }, index: number) => (
                          <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4 text-gray-500" />
                              <span className="text-sm">{file.name}</span>
                              <span className="text-xs text-gray-500">({(file.size / 1024).toFixed(1)} KB)</span>
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
                      <Button variant="outline" onClick={() => { setDetailOpen(false); openApproval(selectedRec, 'reject'); }} disabled={!canApprove(selectedRec)} className="text-red-600 hover:bg-red-50 disabled:opacity-50">
                        <XCircle className="w-4 h-4 mr-2" />거절
                      </Button>
                      <Button onClick={() => { setDetailOpen(false); openApproval(selectedRec, 'accept'); }} disabled={!canApprove(selectedRec)} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
                        <Send className="w-4 h-4 mr-2" />채용 결재 요청
                      </Button>
                    </div>
                  )}

                  <div className="flex justify-end pt-2">
                    <Button onClick={() => setDetailOpen(false)}>닫기</Button>
                  </div>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* 결재 다이얼로그 */}
        <Dialog open={approvalOpen} onOpenChange={setApprovalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{approvalAction === 'accept' ? '채용 결재 요청' : '선원 추천 거절'}</DialogTitle></DialogHeader>
            {selectedRec && (
              <div className="space-y-4">
                <div className="p-3 bg-gray-50 rounded-md text-sm space-y-1">
                  <div><span className="font-medium">선원:</span> {selectedRec.crew_name}</div>
                  <div><span className="font-medium">직급:</span> {selectedRec.rank_code}</div>
                  <div><span className="font-medium">선박:</span> {selectedRec.ship_name}</div>
                </div>

                {approvalAction === 'accept' && (
                  <div>
                    <label className="text-sm font-medium mb-2 block">결재 라인 선택 *</label>
                    <Select value={selectedApprovalLine} onValueChange={setSelectedApprovalLine}>
                      <SelectTrigger><SelectValue placeholder="결재 라인을 선택하세요" /></SelectTrigger>
                      <SelectContent>
                        {approvalLines.length === 0
                          ? <SelectItem value="none" disabled>등록된 결재 라인이 없습니다</SelectItem>
                          : approvalLines.map(l => <SelectItem key={l.id} value={String(l.id)}>{l.name} ({l.steps.length}단계)</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {selectedApprovalLine && getApprovalLineSteps().length > 0 && (
                      <>
                        <div className="mt-2 p-2 bg-blue-50 rounded-md">
                          <p className="text-xs font-medium text-blue-900 mb-1">결재 순서:</p>
                          {getApprovalLineSteps().map((step, idx) => (
                            <div key={step.id} className="text-xs text-blue-700">{idx + 1}. {step.approver_name} ({step.approver_role || '담당자'})</div>
                          ))}
                        </div>
                        <div className="flex items-center space-x-2 mt-3">
                          <Checkbox id="future" checked={useApprovalLineForFuture} onCheckedChange={c => setUseApprovalLineForFuture(c as boolean)} />
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
                      {approvalAction === 'accept'
                        ? '채용 결재 요청 시 선택한 결재 라인을 따라 순차적으로 결재가 진행됩니다.'
                        : '거절 시 매닝사에 즉시 통보되며, 거절 사유가 전달됩니다.'}
                    </p>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setApprovalOpen(false)} disabled={submitting}>취소</Button>
              <Button onClick={handleSubmitApproval} disabled={submitting || isApprovalDisabled()} className={approvalAction === 'accept' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'}>
                {submitting ? '처리 중...' : approvalAction === 'accept' ? '결재 요청' : '거절 확정'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}