import { useState, useEffect } from 'react';
import { Search, Filter, Eye, XCircle, Clock, ExternalLink, FileText, Send, CheckCircle2, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Pagination, PaginationContent, PaginationItem,
  PaginationLink, PaginationNext, PaginationPrevious,
} from '@/components/ui/pagination';
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
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
  return age;
};

export default function RecommendationReviewPage() {
  const [recommendations, setRecommendations] = useState<CrewRecommendationWithDetails[]>([]);
  const [filteredRecommendations, setFilteredRecommendations] = useState<CrewRecommendationWithDetails[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRecommendation, setSelectedRecommendation] = useState<CrewRecommendationWithDetails | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [approvalAction, setApprovalAction] = useState<'accept' | 'reject' | null>(null);
  const [approvalComment, setApprovalComment] = useState('');
  const [submittingApproval, setSubmittingApproval] = useState(false);

  // 결재 상태 맵: recommendationId -> approvalDetails
  const [approvalMap, setApprovalMap] = useState<Map<string, CrewRecommendationApprovalWithDetails>>(new Map());

  const [supervisorPermissions, setSupervisorPermissions] = useState<Map<string, boolean>>(new Map());
  const [approvalLines, setApprovalLines] = useState<ApprovalLineWithSteps[]>([]);
  const [selectedApprovalLine, setSelectedApprovalLine] = useState<string>('');
  const [useApprovalLineForFuture, setUseApprovalLineForFuture] = useState(false);
  const [defaultApprovalLineId, setDefaultApprovalLineId] = useState<string>('');

  const [companies, setCompanies] = useState<Company[]>([]);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [ships, setShips] = useState<Ship[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [manningAgencies, setManningAgencies] = useState<Company[]>([]);

  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [fleetFilter, setFleetFilter] = useState<string>('all');
  const [shipFilter, setShipFilter] = useState<string>('all');
  const [rankFilter, setRankFilter] = useState<string>('all');
  const [agencyFilter, setAgencyFilter] = useState<string>('all');
  const [shipSupervisorMap, setShipSupervisorMap] = useState<Map<string, string[]>>(new Map());

  useEffect(() => { loadData(); }, []);
  useEffect(() => { applyFilters(); }, [recommendations, searchTerm, statusFilter, dateFilter, ownerFilter, fleetFilter, shipFilter, rankFilter, agencyFilter]);
  useEffect(() => {
    if (ownerFilter && ownerFilter !== 'all') loadFleetsByOwner(ownerFilter);
    else loadAllFleets();
    setFleetFilter('all');
  }, [ownerFilter]);
  useEffect(() => {
    if (fleetFilter && fleetFilter !== 'all') loadShipsByFleet(fleetFilter);
    else if (ownerFilter && ownerFilter !== 'all') loadShipsByOwner(ownerFilter);
    else loadAllShips();
    setShipFilter('all');
  }, [fleetFilter, ownerFilter]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [user, companiesData, fleetsData, shipsData, ranksData] = await Promise.all([
        getCurrentUser(), getCompanies(), getFleets(), getShips(), getRanks(),
      ]);

      setCurrentUser(user);
      setCompanies(companiesData.filter(c => c.type === 'owner'));
      setManningAgencies(companiesData.filter(c => c.type === 'manning'));
      setFleets(fleetsData);
      setShips(shipsData);
      setRanks(ranksData);

      if (!user || user.role !== 'ship_manager') return;

      const { data: preference } = await supabase
        .from('users').select('default_approval_line_id').eq('id', user.id).single();

      if (preference?.default_approval_line_id) {
        setDefaultApprovalLineId(preference.default_approval_line_id);
        setSelectedApprovalLine(preference.default_approval_line_id);
      }

      if (user.company_id) {
        const lines = await approvalService.getApprovalLines(user.company_id);
        setApprovalLines(lines);
        if (!preference?.default_approval_line_id && lines.length > 0) setSelectedApprovalLine('');
      }

      const { data: allRecs, error } = await supabase
        .from('crew_recommendations').select('*').order('created_at', { ascending: false });

      if (error) throw error;

      if (allRecs && allRecs.length > 0) {
        const rankIds = [...new Set(allRecs.map(r => r.rank_id))];
        const companyIds = [...new Set(allRecs.map(r => r.company_id))];
        const fleetIds = [...new Set(allRecs.map(r => r.fleet_id).filter(Boolean))];
        const shipIds = [...new Set(allRecs.map(r => r.ship_id))];
        const agencyIds = [...new Set(allRecs.map(r => r.manning_agency_id))];

        const [ranksRes, companiesRes, fleetsRes, shipsRes, agenciesRes] = await Promise.all([
          supabase.from('ranks').select('id, name, rank_code, department').in('id', rankIds),
          supabase.from('companies').select('id, name').in('id', companyIds),
          fleetIds.length > 0 ? supabase.from('fleets').select('id, name').in('id', fleetIds) : { data: [] },
          supabase.from('ships').select('id, name').in('id', shipIds),
          supabase.from('companies').select('id, name').in('id', agencyIds),
        ]);

        const ranksMap = new Map((ranksRes.data || []).map(r => [r.id, r]));
        const companiesMap = new Map((companiesRes.data || []).map(c => [c.id, c]));
        const fleetsMap = new Map((fleetsRes.data || []).map(f => [f.id, f]));
        const shipsMap = new Map((shipsRes.data || []).map(s => [s.id, s]));
        const agenciesMap = new Map((agenciesRes.data || []).map(a => [a.id, a]));

       const enrichedRecs = allRecs.map(rec => {
          let resumeFiles = rec.resume_files;
          if (typeof resumeFiles === 'string') {
            try { resumeFiles = JSON.parse(resumeFiles); } catch { resumeFiles = []; }
          }
          if (!Array.isArray(resumeFiles)) resumeFiles = [];

          return {
            ...rec,
            resume_files: resumeFiles,
            manning_agency_name: agenciesMap.get(rec.manning_agency_id)?.name || '',
            rank_name: ranksMap.get(rec.rank_id)?.name || '',
            rank_code: ranksMap.get(rec.rank_id)?.rank_code || '',
            department: ranksMap.get(rec.rank_id)?.department || '',
            company_name: companiesMap.get(rec.company_id)?.name || '',
            fleet_name: rec.fleet_id ? fleetsMap.get(rec.fleet_id)?.name || '' : '',
            ship_name: shipsMap.get(rec.ship_id)?.name || '',
          };
        });

        setRecommendations(enrichedRecs);

        // 결재 상태 로드 (reviewed 상태인 것만)
        const reviewedRecs = allRecs.filter(r => r.status === 'reviewed');
        if (reviewedRecs.length > 0) {
          const newApprovalMap = new Map<string, CrewRecommendationApprovalWithDetails>();
          await Promise.all(
            reviewedRecs.map(async (rec) => {
              try {
                const approvals = await approvalService.getApprovalsByRecommendation(rec.id);
                if (approvals.length > 0) {
                  newApprovalMap.set(rec.id, approvals[0]);
                }
              } catch (e) {
                console.error('Failed to load approval for', rec.id, e);
              }
            })
          );
          setApprovalMap(newApprovalMap);
        }

        const uniqueShipIds = [...new Set(allRecs.map(r => r.ship_id))];
        const permissionsMap = new Map<string, boolean>();
        const supervisorNamesMap = new Map<string, string[]>();

        // 선박별 담당 supervisor 조회
        const { data: allSupervisorAssignments } = await supabase
          .from('supervisor_assignments')
          .select('supervisor_id, ship_id, fleet_id, owner_id');

        const { data: allSupervisorUsers } = await supabase
          .from('users')
          .select('id, name');

        const supervisorUserMap = new Map((allSupervisorUsers || []).map(u => [u.id, u.name]));

        // 각 선박별 supervisor 이름 목록 구성
        for (const shipId of uniqueShipIds) {
          const ship = shipsMap.get(shipId);
          const names: string[] = [];

          for (const sa of allSupervisorAssignments || []) {
            const isForShip = sa.ship_id === shipId;
            const isForFleet = ship && sa.fleet_id && sa.fleet_id === ship.fleet_id;
            const isForOwner = ship && sa.owner_id && sa.owner_id === ship.owner_id;
            if (isForShip || isForFleet || isForOwner) {
              const name = supervisorUserMap.get(sa.supervisor_id);
              if (name && !names.includes(name)) names.push(name);
            }
          }

          supervisorNamesMap.set(shipId, names);
        }

        setShipSupervisorMap(supervisorNamesMap);

        await Promise.all(
          uniqueShipIds.map(async (shipId) => {
            const result = await supervisorService.isSupervisorForShip(user.id, shipId);
            permissionsMap.set(shipId, result.is_supervisor);
          })
        );
        setSupervisorPermissions(permissionsMap);
      }
    } catch (error) {
      console.error('Failed to load recommendations:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAllFleets = async () => { try { setFleets(await getFleets()); } catch (e) { console.error(e); } };
  const loadFleetsByOwner = async (ownerId: string) => { try { setFleets(await getFleets(ownerId)); } catch (e) { console.error(e); } };
  const loadAllShips = async () => { try { setShips(await getShips()); } catch (e) { console.error(e); } };
  const loadShipsByFleet = async (fleetId: string) => { try { const all = await getShips(); setShips(all.filter(s => s.fleet_id === fleetId)); } catch (e) { console.error(e); } };
  const loadShipsByOwner = async (ownerId: string) => { try { const all = await getShips(); setShips(all.filter(s => s.owner_id === ownerId)); } catch (e) { console.error(e); } };

  const applyFilters = () => {
    let filtered = [...recommendations];
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(r =>
        r.crew_name.toLowerCase().includes(term) ||
        r.ship_name.toLowerCase().includes(term) ||
        (r.rank_code && r.rank_code.toLowerCase().includes(term)) ||
        r.manning_agency_name.toLowerCase().includes(term)
      );
    }
    if (statusFilter !== 'all') filtered = filtered.filter(r => r.status === statusFilter);
    if (ownerFilter !== 'all') filtered = filtered.filter(r => r.company_id === ownerFilter);
    if (fleetFilter !== 'all') filtered = filtered.filter(r => r.fleet_id === fleetFilter);
    if (shipFilter !== 'all') filtered = filtered.filter(r => r.ship_id === shipFilter);
    if (rankFilter !== 'all') filtered = filtered.filter(r => r.rank_id === rankFilter);
    if (agencyFilter !== 'all') filtered = filtered.filter(r => r.manning_agency_id === agencyFilter);
    if (dateFilter !== 'all') {
      const filterDate = new Date();
      if (dateFilter === 'week') filterDate.setDate(filterDate.getDate() - 7);
      else if (dateFilter === 'month') filterDate.setMonth(filterDate.getMonth() - 1);
      else if (dateFilter === 'quarter') filterDate.setMonth(filterDate.getMonth() - 3);
      filtered = filtered.filter(r => new Date(r.created_at) >= filterDate);
    }
    setFilteredRecommendations(filtered);
    setCurrentPage(1);
  };

  const handleViewDetail = (rec: CrewRecommendationWithDetails) => {
    setSelectedRecommendation(rec);
    setDetailDialogOpen(true);
  };

  const handleOpenApprovalDialog = (rec: CrewRecommendationWithDetails, action: 'accept' | 'reject') => {
    setSelectedRecommendation(rec);
    setApprovalAction(action);
    setApprovalComment('');
    setUseApprovalLineForFuture(false);
    if (defaultApprovalLineId) setSelectedApprovalLine(defaultApprovalLineId);
    setApprovalDialogOpen(true);
  };

  const handleSubmitApproval = async () => {
    if (!selectedRecommendation || !approvalAction || !currentUser) return;
    try {
      setSubmittingApproval(true);
      if (approvalAction === 'reject') {
        if (!approvalComment.trim()) { alert('거절 사유를 입력해주세요.'); return; }
        await crewRecommendationService.updateStatus(selectedRecommendation.id, 'rejected');
        alert('추천이 거절되었습니다.');
      } else {
        if (!selectedApprovalLine) { alert('결재 라인을 선택해주세요.'); return; }
        if (useApprovalLineForFuture) {
          await supabase.from('users').update({ default_approval_line_id: selectedApprovalLine }).eq('id', currentUser.id);
          setDefaultApprovalLineId(selectedApprovalLine);
        }
        await approvalService.createApproval(selectedRecommendation.id, selectedApprovalLine, currentUser.id, approvalComment);
        await crewRecommendationService.updateStatus(selectedRecommendation.id, 'reviewed');
        alert('채용 결재가 요청되었습니다.');
      }
      await loadData();
      setApprovalDialogOpen(false);
      setSelectedRecommendation(null);
      setApprovalAction(null);
      setApprovalComment('');
      setUseApprovalLineForFuture(false);
    } catch (error) {
      console.error('Failed to submit approval:', error);
      alert('결재 처리에 실패했습니다.');
    } finally {
      setSubmittingApproval(false);
    }
  };

  const handleOpenResume = async (rec: CrewRecommendationWithDetails) => {
    if (!rec.resume_files || rec.resume_files.length === 0) { alert('첨부된 이력서가 없습니다.'); return; }
    try {
      for (const file of rec.resume_files) {
        const { data } = supabase.storage.from('documents').getPublicUrl(file.path);
        if (data?.publicUrl) window.open(data.publicUrl, '_blank');
      }
    } catch (e) { console.error(e); alert('이력서 열기에 실패했습니다.'); }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <Badge variant="secondary" className="text-xs">검토대기</Badge>;
      case 'reviewed': return <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-300">결재중</Badge>;
      case 'accepted': return <Badge variant="default" className="text-xs bg-green-600">승인</Badge>;
      case 'rejected': return <Badge variant="destructive" className="text-xs">거절</Badge>;
      default: return null;
    }
  };

  const getDeptColor = (dept: string) => {
    switch (dept) {
      case 'deck': return 'bg-blue-100 text-blue-700 border-blue-300';
      case 'engine': return 'bg-green-100 text-green-700 border-green-300';
      case 'catering': return 'bg-orange-100 text-orange-700 border-orange-300';
      default: return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  // 결재 진행 상태 표시 컴포넌트
  const ApprovalProgress = ({ recId }: { recId: string }) => {
    const approval = approvalMap.get(recId);
    if (!approval) return <span className="text-xs text-gray-400">-</span>;

    const steps = approval.approval_line?.steps || [];
    const actions = approval.actions || [];
    const currentStep = approval.current_step;

    return (
      <div className="flex items-center gap-1">
        {steps.map((step, idx) => {
          const action = actions.find(a => a.step_order === step.step_order);
          const isCurrent = step.step_order === currentStep;
          const isDone = action?.action === 'approved';
          const isRejected = action?.action === 'rejected';

          return (
            <div key={step.id} className="flex items-center gap-1">
              <div className={`flex flex-col items-center`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold border
                  ${isDone ? 'bg-green-500 border-green-500 text-white'
                    : isRejected ? 'bg-red-500 border-red-500 text-white'
                    : isCurrent ? 'bg-yellow-400 border-yellow-400 text-white animate-pulse'
                    : 'bg-gray-100 border-gray-300 text-gray-400'}`}
                  title={`${step.approver_name} (${action ? (action.action === 'approved' ? '승인' : '반려') : isCurrent ? '대기중' : '미도달'})`}
                >
                  {isDone ? '✓' : isRejected ? '✗' : idx + 1}
                </div>
                <span className="text-xs text-gray-500 mt-0.5 max-w-[40px] truncate text-center" title={step.approver_name}>
                  {step.approver_name.split(' ')[0]}
                </span>
              </div>
              {idx < steps.length - 1 && (
                <ChevronRight className="w-3 h-3 text-gray-300 mb-4" />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const canApproveRecommendation = (rec: CrewRecommendationWithDetails) =>
    supervisorPermissions.get(rec.ship_id) || false;

  const getSelectedApprovalLineSteps = () => {
    if (!selectedApprovalLine) return [];
    return approvalLines.find(l => l.id === selectedApprovalLine)?.steps || [];
  };

  const isApprovalRequestDisabled = () => {
    if (approvalAction === 'reject') return !approvalComment.trim();
    if (!selectedApprovalLine) return true;
    return getSelectedApprovalLineSteps().length === 0;
  };

  const totalPages = Math.ceil(filteredRecommendations.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const currentRecommendations = filteredRecommendations.slice(startIndex, startIndex + ITEMS_PER_PAGE);

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
          <div className="flex items-center gap-2 mb-2">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-sm font-medium">필터</span>
          </div>
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
                <TableHead className="text-xs py-2 w-16">나이</TableHead>
                <TableHead className="text-xs py-2 w-28">매닝사</TableHead>
                <TableHead className="text-xs py-2">희망조건</TableHead>
                <TableHead className="text-xs py-2 w-24">출국가능일</TableHead>
                <TableHead className="text-xs py-2">결재 진행 현황</TableHead>
                <TableHead className="text-xs py-2 w-32">결재 시작 담당자</TableHead>
                <TableHead className="text-right text-xs py-2 w-40">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentRecommendations.map(rec => {
                const canApprove = canApproveRecommendation(rec);
                return (
                  <TableRow key={rec.id} className="hover:bg-muted/50">
                    <TableCell className="py-2">{getStatusBadge(rec.status)}</TableCell>
                    <TableCell className="py-2">
                      <div className="text-sm font-medium truncate max-w-[120px]" title={rec.ship_name}>{rec.ship_name}</div>
                      {rec.fleet_name && <div className="text-xs text-muted-foreground truncate max-w-[120px]">{rec.fleet_name}</div>}
                    </TableCell>
                    <TableCell className="py-2">
                      {rec.rank_code
                        ? <Badge variant="outline" className={`text-xs ${getDeptColor(rec.department)}`}>{rec.rank_code}</Badge>
                        : <Badge variant="outline" className="text-xs bg-gray-100 text-gray-400">-</Badge>}
                    </TableCell>
                    <TableCell className="py-2"><div className="text-sm font-medium">{rec.crew_name}</div></TableCell>
                    <TableCell className="py-2"><div className="text-xs text-muted-foreground">{calculateAge(rec.crew_birth_date)}세</div></TableCell>
                    <TableCell className="py-2"><div className="text-sm truncate max-w-[110px]" title={rec.manning_agency_name}>{rec.manning_agency_name}</div></TableCell>
                    <TableCell className="py-2">
                      <div className="text-sm">{rec.desired_currency} {rec.desired_salary.toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">{rec.desired_contract_months}개월</div>
                    </TableCell>
                    <TableCell className="text-xs py-2">
                      {new Date(rec.available_date).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' })}
                    </TableCell>
                    <TableCell className="py-2">
                      {rec.status === 'reviewed'
                        ? <ApprovalProgress recId={rec.id} />
                        : <span className="text-xs text-gray-300">-</span>}
                    </TableCell>
                    <TableCell className="py-2">
                      {rec.status === 'pending' ? (
                        (() => {
                          const names = shipSupervisorMap.get(rec.ship_id) || [];
                          if (names.length === 0) {
                            return <span className="text-xs text-red-400">담당자 미지정</span>;
                          }
                          return (
                            <div className="flex flex-wrap gap-1">
                              {names.map(name => (
                                <span key={name} className={`text-xs px-1.5 py-0.5 rounded font-medium
                                  ${canApproveRecommendation(rec) && name === currentUser?.name
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-gray-100 text-gray-600'}`}>
                                  {name}
                                </span>
                              ))}
                            </div>
                          );
                        })()
                      ) : (
                        <span className="text-xs text-gray-300">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right py-2">
                      <div className="flex justify-end gap-1">
                        <Button variant="outline" size="sm" onClick={() => handleViewDetail(rec)} className="h-7 px-2 text-xs">
                          <Eye className="w-3.5 h-3.5 mr-1" />상세
                        </Button>
                        {rec.status === 'pending' && (
                          <>
                            <Button variant="outline" size="sm" onClick={() => handleOpenApprovalDialog(rec, 'accept')} disabled={!canApprove}
                              className="h-7 px-2 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 disabled:opacity-50" title={!canApprove ? '해당 선박의 감독이 아닙니다' : ''}>
                              <Send className="w-3.5 h-3.5 mr-1" />결재
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handleOpenApprovalDialog(rec, 'reject')} disabled={!canApprove}
                              className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 disabled:opacity-50" title={!canApprove ? '해당 선박의 감독이 아닙니다' : ''}>
                              <XCircle className="w-3.5 h-3.5 mr-1" />거절
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {currentRecommendations.length === 0 && (
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
        <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>추천 선원 상세 정보</DialogTitle></DialogHeader>
            {selectedRecommendation && (() => {
              const canApprove = canApproveRecommendation(selectedRecommendation);
              const approval = approvalMap.get(selectedRecommendation.id);
              return (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                    <span className="text-sm font-medium">현재 상태</span>
                    {getStatusBadge(selectedRecommendation.status)}
                  </div>

                  {/* 결재 진행 현황 */}
                  {selectedRecommendation.status === 'reviewed' && approval && (
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                      <div className="text-sm font-semibold text-yellow-800 mb-3 flex items-center gap-2">
                        <Clock className="w-4 h-4" />결재 진행 현황
                      </div>
                      <div className="text-xs text-yellow-700 mb-2">결재선: {approval.approval_line?.name}</div>
                      <div className="flex items-start gap-3 flex-wrap">
                        {(approval.approval_line?.steps || []).map((step, idx) => {
                          const action = approval.actions?.find(a => a.step_order === step.step_order);
                          const isCurrent = step.step_order === approval.current_step;
                          const isDone = action?.action === 'approved';
                          const isRejected = action?.action === 'rejected';
                          return (
                            <div key={step.id} className="flex items-center gap-2">
                              <div className="flex flex-col items-center">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2
                                  ${isDone ? 'bg-green-500 border-green-500 text-white'
                                    : isRejected ? 'bg-red-500 border-red-500 text-white'
                                    : isCurrent ? 'bg-yellow-400 border-yellow-400 text-white'
                                    : 'bg-white border-gray-300 text-gray-400'}`}>
                                  {isDone ? <CheckCircle2 className="w-4 h-4" /> : isRejected ? '✗' : idx + 1}
                                </div>
                                <div className="text-xs mt-1 text-center max-w-[60px]">
                                  <div className="font-medium text-gray-700 truncate">{step.approver_name}</div>
                                  <div className={`${isDone ? 'text-green-600' : isRejected ? 'text-red-600' : isCurrent ? 'text-yellow-600 font-semibold' : 'text-gray-400'}`}>
                                    {isDone ? '승인' : isRejected ? '반려' : isCurrent ? '대기중' : '미도달'}
                                  </div>
                                  {action?.comment && (
                                    <div className="text-gray-500 text-xs italic mt-0.5 max-w-[80px] truncate" title={action.comment}>
                                      "{action.comment}"
                                    </div>
                                  )}
                                </div>
                              </div>
                              {idx < (approval.approval_line?.steps || []).length - 1 && (
                                <ChevronRight className="w-4 h-4 text-gray-300 mt-[-16px]" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div>
                    <h3 className="text-sm font-semibold mb-2">선원 정보</h3>
                    <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-md">
                      <div><span className="text-xs text-gray-600">직급</span><div className="mt-1">{selectedRecommendation.rank_code ? <Badge className={getDeptColor(selectedRecommendation.department)}>{selectedRecommendation.rank_code}</Badge> : <span className="text-xs text-gray-400">-</span>}</div></div>
                      <div><span className="text-xs text-gray-600">성명</span><p className="text-sm font-medium">{selectedRecommendation.crew_name}</p></div>
                      <div><span className="text-xs text-gray-600">생년월일</span><p className="text-sm font-medium">{new Date(selectedRecommendation.crew_birth_date).toLocaleDateString('ko-KR')}</p></div>
                      <div><span className="text-xs text-gray-600">나이</span><p className="text-sm font-medium">{calculateAge(selectedRecommendation.crew_birth_date)}세</p></div>
                      <div><span className="text-xs text-gray-600">출국 가능일</span><p className="text-sm font-medium">{new Date(selectedRecommendation.available_date).toLocaleDateString('ko-KR')}</p></div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold mb-2">선박 정보</h3>
                    <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-md">
                      <div><span className="text-xs text-gray-600">선주사</span><p className="text-sm font-medium">{selectedRecommendation.company_name}</p></div>
                      <div><span className="text-xs text-gray-600">선박명</span><p className="text-sm font-medium">{selectedRecommendation.ship_name}</p></div>
                      {selectedRecommendation.fleet_name && <div><span className="text-xs text-gray-600">선대</span><p className="text-sm font-medium">{selectedRecommendation.fleet_name}</p></div>}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold mb-2">추천 매닝사</h3>
                    <div className="p-3 bg-gray-50 rounded-md"><p className="text-sm font-medium">{selectedRecommendation.manning_agency_name}</p></div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold mb-2">희망 계약 조건</h3>
                    <div className="grid grid-cols-3 gap-3 p-3 bg-gray-50 rounded-md">
                      <div><span className="text-xs text-gray-600">희망 급여</span><p className="text-sm font-medium">{selectedRecommendation.desired_currency} {selectedRecommendation.desired_salary.toLocaleString()}</p></div>
                      <div><span className="text-xs text-gray-600">희망 계약기간</span><p className="text-sm font-medium">{selectedRecommendation.desired_contract_months}개월</p></div>
                    </div>
                  </div>

                  {selectedRecommendation.remarks && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2">비고</h3>
                      <div className="p-3 bg-gray-50 rounded-md"><p className="text-sm whitespace-pre-wrap">{selectedRecommendation.remarks}</p></div>
                    </div>
                  )}

                  {selectedRecommendation.resume_files && selectedRecommendation.resume_files.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2">첨부 이력서</h3>
                      <div className="space-y-2">
                        {selectedRecommendation.resume_files.map((file, index) => (
                          <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4 text-gray-500" />
                              <span className="text-sm">{file.name}</span>
                              <span className="text-xs text-gray-500">({(file.size / 1024).toFixed(1)} KB)</span>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => handleOpenResume(selectedRecommendation)} className="h-7">
                              <ExternalLink className="w-3.5 h-3.5 mr-1" />열기
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedRecommendation.status === 'pending' && (
                    <div className="flex justify-end gap-2 pt-4 border-t">
                      <Button variant="outline" onClick={() => { setDetailDialogOpen(false); handleOpenApprovalDialog(selectedRecommendation, 'reject'); }} disabled={!canApprove} className="text-red-600 hover:text-red-700 hover:bg-red-50 disabled:opacity-50">
                        <XCircle className="w-4 h-4 mr-2" />거절
                      </Button>
                      <Button onClick={() => { setDetailDialogOpen(false); handleOpenApprovalDialog(selectedRecommendation, 'accept'); }} disabled={!canApprove} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
                        <Send className="w-4 h-4 mr-2" />채용 결재 요청
                      </Button>
                    </div>
                  )}

                  <div className="flex justify-end pt-2">
                    <Button onClick={() => setDetailDialogOpen(false)}>닫기</Button>
                  </div>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* 결재 다이얼로그 */}
        <Dialog open={approvalDialogOpen} onOpenChange={setApprovalDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{approvalAction === 'accept' ? '채용 결재 요청' : '선원 추천 거절'}</DialogTitle></DialogHeader>
            {selectedRecommendation && (
              <div className="space-y-4">
                <div className="p-3 bg-gray-50 rounded-md text-sm space-y-1">
                  <div><span className="font-medium">선원:</span> {selectedRecommendation.crew_name}</div>
                  <div><span className="font-medium">직급:</span> {selectedRecommendation.rank_code}</div>
                  <div><span className="font-medium">선박:</span> {selectedRecommendation.ship_name}</div>
                </div>

                {approvalAction === 'accept' && (
                  <div>
                    <label className="text-sm font-medium mb-2 block">결재 라인 선택 *</label>
                    <Select value={selectedApprovalLine} onValueChange={setSelectedApprovalLine}>
                      <SelectTrigger><SelectValue placeholder="결재 라인을 선택하세요" /></SelectTrigger>
                      <SelectContent>
                        {approvalLines.length === 0
                          ? <SelectItem value="none" disabled>등록된 결재 라인이 없습니다</SelectItem>
                          : approvalLines.map(line => <SelectItem key={line.id} value={String(line.id)}>{line.name} ({line.steps.length}단계)</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {selectedApprovalLine && getSelectedApprovalLineSteps().length > 0 && (
                      <>
                        <div className="mt-2 p-2 bg-blue-50 rounded-md">
                          <p className="text-xs font-medium text-blue-900 mb-1">결재 순서:</p>
                          {getSelectedApprovalLineSteps().map((step, idx) => (
                            <div key={step.id} className="text-xs text-blue-700">{idx + 1}. {step.approver_name} ({step.approver_role || '담당자'})</div>
                          ))}
                        </div>
                        <div className="flex items-center space-x-2 mt-3">
                          <Checkbox id="use-for-future" checked={useApprovalLineForFuture} onCheckedChange={c => setUseApprovalLineForFuture(c as boolean)} />
                          <label htmlFor="use-for-future" className="text-sm text-gray-700 cursor-pointer">앞으로도 해당 결재 라인 이용</label>
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
              <Button variant="outline" onClick={() => setApprovalDialogOpen(false)} disabled={submittingApproval}>취소</Button>
              <Button onClick={handleSubmitApproval} disabled={submittingApproval || isApprovalRequestDisabled()} className={approvalAction === 'accept' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'}>
                {submittingApproval ? '처리 중...' : approvalAction === 'accept' ? '결재 요청' : '거절 확정'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}