import { useState, useEffect } from 'react';
import { Search, Filter, Eye, CheckCircle, XCircle, Clock, ExternalLink, FileText, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Textarea } from '@/components/ui/textarea';
import { crewRecommendationService } from '@/services/crew-recommendation.service';
import { approvalService } from '@/services/approval.service';
import { supervisorService } from '@/services/supervisor.service';
import { supabase } from '@/lib/supabase';
import { getCurrentUser, getCompanies, getFleets, getShips, getRanks } from '@/lib/store';
import Layout from '@/components/Layout';
import type { CrewRecommendationWithDetails, User, Company, Fleet, Ship, Rank } from '@/types/models';
import type { ApprovalLineWithSteps } from '@/types/approval';

const ITEMS_PER_PAGE = 20;

// Helper function to calculate age from birth date
const calculateAge = (birthDate: string): number => {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  
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
  
  // Supervisor permissions map: shipId -> isSupervisor
  const [supervisorPermissions, setSupervisorPermissions] = useState<Map<string, boolean>>(new Map());
  
  // Approval lines
  const [approvalLines, setApprovalLines] = useState<ApprovalLineWithSteps[]>([]);
  const [selectedApprovalLine, setSelectedApprovalLine] = useState<string>('');
  const [useApprovalLineForFuture, setUseApprovalLineForFuture] = useState(false);
  const [defaultApprovalLineId, setDefaultApprovalLineId] = useState<string>('');
  
  // Filter data
  const [companies, setCompanies] = useState<Company[]>([]);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [ships, setShips] = useState<Ship[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [manningAgencies, setManningAgencies] = useState<Company[]>([]);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [fleetFilter, setFleetFilter] = useState<string>('all');
  const [shipFilter, setShipFilter] = useState<string>('all');
  const [rankFilter, setRankFilter] = useState<string>('all');
  const [agencyFilter, setAgencyFilter] = useState<string>('all');

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [recommendations, searchTerm, statusFilter, dateFilter, ownerFilter, fleetFilter, shipFilter, rankFilter, agencyFilter]);

  // Load fleets when owner changes
  useEffect(() => {
    if (ownerFilter && ownerFilter !== 'all') {
      loadFleetsByOwner(ownerFilter);
    } else {
      loadAllFleets();
    }
    setFleetFilter('all');
  }, [ownerFilter]);

  // Load ships when fleet changes
  useEffect(() => {
    if (fleetFilter && fleetFilter !== 'all') {
      loadShipsByFleet(fleetFilter);
    } else if (ownerFilter && ownerFilter !== 'all') {
      loadShipsByOwner(ownerFilter);
    } else {
      loadAllShips();
    }
    setShipFilter('all');
  }, [fleetFilter, ownerFilter]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [user, companiesData, fleetsData, shipsData, ranksData] = await Promise.all([
        getCurrentUser(),
        getCompanies(),
        getFleets(),
        getShips(),
        getRanks(),
      ]);
      
      setCurrentUser(user);
      
      // Filter companies by type
      const ownerCompanies = companiesData.filter(c => c.type === 'owner');
      const manningCompanies = companiesData.filter(c => c.type === 'manning');
      
      setCompanies(ownerCompanies);
      setManningAgencies(manningCompanies);
      setFleets(fleetsData);
      setShips(shipsData);
      setRanks(ranksData);

      if (!user || user.role !== 'ship_manager') {
        console.error('Access denied: Only ship managers can access this page');
        return;
      }

      // Load default approval line preference
      const { data: preference } = await supabase
        .from('users')
        .select('default_approval_line_id')
        .eq('id', user.id)
        .single();

      if (preference?.default_approval_line_id) {
        setDefaultApprovalLineId(preference.default_approval_line_id);
        setSelectedApprovalLine(preference.default_approval_line_id);
      }

      // Load approval lines for user's company
      if (user.company_id) {
        const lines = await approvalService.getApprovalLines(user.company_id);
        setApprovalLines(lines);
        
        // If no default set but lines exist, don't auto-select
        if (!preference?.default_approval_line_id && lines.length > 0) {
          setSelectedApprovalLine('');
        }
      }

      // Load ALL recommendations for ship manager (no company_id filter)
      // Ship managers can see all recommendations from all manning agencies
      const { data: allRecs, error } = await supabase
        .from('crew_recommendations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (allRecs && allRecs.length > 0) {
        // Get unique IDs for batch fetching
        const rankIds = [...new Set(allRecs.map(r => r.rank_id))];
        const companyIds = [...new Set(allRecs.map(r => r.company_id))];
        const fleetIds = [...new Set(allRecs.map(r => r.fleet_id).filter(Boolean))];
        const shipIds = [...new Set(allRecs.map(r => r.ship_id))];
        const agencyIds = [...new Set(allRecs.map(r => r.manning_agency_id))];

        // Batch fetch all related data
        const [ranksRes, companiesRes, fleetsRes, shipsRes, agenciesRes] = await Promise.all([
          supabase.from('ranks').select('id, name, rank_code, department').in('id', rankIds),
          supabase.from('companies').select('id, name').in('id', companyIds),
          fleetIds.length > 0 ? supabase.from('fleets').select('id, name').in('id', fleetIds) : { data: [] },
          supabase.from('ships').select('id, name').in('id', shipIds),
          supabase.from('companies').select('id, name').in('id', agencyIds),
        ]);

        // Create lookup maps
        const ranksMap = new Map((ranksRes.data || []).map(r => [r.id, r]));
        const companiesMap = new Map((companiesRes.data || []).map(c => [c.id, c]));
        const fleetsMap = new Map((fleetsRes.data || []).map(f => [f.id, f]));
        const shipsMap = new Map((shipsRes.data || []).map(s => [s.id, s]));
        const agenciesMap = new Map((agenciesRes.data || []).map(a => [a.id, a]));

        // Map recommendations with joined data
        const enrichedRecs = allRecs.map(rec => {
          const rank = ranksMap.get(rec.rank_id);
          const company = companiesMap.get(rec.company_id);
          const fleet = rec.fleet_id ? fleetsMap.get(rec.fleet_id) : null;
          const ship = shipsMap.get(rec.ship_id);
          const agency = agenciesMap.get(rec.manning_agency_id);

          return {
            ...rec,
            manning_agency_name: agency?.name || '',
            rank_name: rank?.name || '',
            rank_code: rank?.rank_code || '',
            department: rank?.department || '',
            company_name: company?.name || '',
            fleet_name: fleet?.name || '',
            ship_name: ship?.name || '',
          };
        });

        setRecommendations(enrichedRecs);

        // Check supervisor permissions for each unique ship
        const uniqueShipIds = [...new Set(allRecs.map(r => r.ship_id))];
        const permissionsMap = new Map<string, boolean>();
        
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

  const loadAllFleets = async () => {
    try {
      const fleetsData = await getFleets();
      setFleets(fleetsData);
    } catch (error) {
      console.error('Failed to load fleets:', error);
    }
  };

  const loadFleetsByOwner = async (ownerId: string) => {
    try {
      const fleetsData = await getFleets(ownerId);
      setFleets(fleetsData);
    } catch (error) {
      console.error('Failed to load fleets:', error);
    }
  };

  const loadAllShips = async () => {
    try {
      const shipsData = await getShips();
      setShips(shipsData);
    } catch (error) {
      console.error('Failed to load ships:', error);
    }
  };

  const loadShipsByFleet = async (fleetId: string) => {
    try {
      const allShips = await getShips();
      const filteredShips = allShips.filter(ship => ship.fleet_id === fleetId);
      setShips(filteredShips);
    } catch (error) {
      console.error('Failed to load ships:', error);
    }
  };

  const loadShipsByOwner = async (ownerId: string) => {
    try {
      const allShips = await getShips();
      const filteredShips = allShips.filter(ship => ship.owner_id === ownerId);
      setShips(filteredShips);
    } catch (error) {
      console.error('Failed to load ships:', error);
    }
  };

  const applyFilters = () => {
    let filtered = [...recommendations];

    // Search filter (crew name, ship name, rank code, agency name)
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.crew_name.toLowerCase().includes(term) ||
          r.ship_name.toLowerCase().includes(term) ||
          (r.rank_code && r.rank_code.toLowerCase().includes(term)) ||
          r.manning_agency_name.toLowerCase().includes(term)
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((r) => r.status === statusFilter);
    }

    // Owner filter
    if (ownerFilter !== 'all') {
      filtered = filtered.filter((r) => r.company_id === ownerFilter);
    }

    // Fleet filter
    if (fleetFilter !== 'all') {
      filtered = filtered.filter((r) => r.fleet_id === fleetFilter);
    }

    // Ship filter
    if (shipFilter !== 'all') {
      filtered = filtered.filter((r) => r.ship_id === shipFilter);
    }

    // Rank filter
    if (rankFilter !== 'all') {
      filtered = filtered.filter((r) => r.rank_id === rankFilter);
    }

    // Agency filter
    if (agencyFilter !== 'all') {
      filtered = filtered.filter((r) => r.manning_agency_id === agencyFilter);
    }

    // Date filter
    if (dateFilter !== 'all') {
      const now = new Date();
      const filterDate = new Date();
      
      switch (dateFilter) {
        case 'week':
          filterDate.setDate(now.getDate() - 7);
          break;
        case 'month':
          filterDate.setMonth(now.getMonth() - 1);
          break;
        case 'quarter':
          filterDate.setMonth(now.getMonth() - 3);
          break;
      }
      
      filtered = filtered.filter((r) => new Date(r.created_at) >= filterDate);
    }

    setFilteredRecommendations(filtered);
    setCurrentPage(1);
  };

  const handleViewDetail = (recommendation: CrewRecommendationWithDetails) => {
    setSelectedRecommendation(recommendation);
    setDetailDialogOpen(true);
  };

  const handleOpenApprovalDialog = (recommendation: CrewRecommendationWithDetails, action: 'accept' | 'reject') => {
    setSelectedRecommendation(recommendation);
    setApprovalAction(action);
    setApprovalComment('');
    
    // Reset checkbox state
    setUseApprovalLineForFuture(false);
    
    // If there's a default approval line, use it
    if (defaultApprovalLineId) {
      setSelectedApprovalLine(defaultApprovalLineId);
    }
    
    setApprovalDialogOpen(true);
  };

  const handleApprovalLineChange = (value: string) => {
    setSelectedApprovalLine(value);
  };

  const handleSubmitApproval = async () => {
    if (!selectedRecommendation || !approvalAction || !currentUser) return;

    try {
      setSubmittingApproval(true);

      if (approvalAction === 'reject') {
        // Direct rejection - no approval process needed
        if (!approvalComment.trim()) {
          alert('거절 사유를 입력해주세요.');
          return;
        }
        
        await crewRecommendationService.updateStatus(selectedRecommendation.id, 'rejected');
        alert('추천이 거절되었습니다.');
      } else {
        // Accept - create approval request
        if (!selectedApprovalLine) {
          alert('결재 라인을 선택해주세요.');
          return;
        }

        // Save default approval line if checkbox is checked
        if (useApprovalLineForFuture) {
          await supabase
            .from('users')
            .update({ default_approval_line_id: selectedApprovalLine })
            .eq('id', currentUser.id);
          
          setDefaultApprovalLineId(selectedApprovalLine);
        }

        await approvalService.createApproval(
          selectedRecommendation.id,
          selectedApprovalLine,
          currentUser.id,
          approvalComment
        );

        // Update recommendation status to reviewed (valid status from the check constraint)
        await crewRecommendationService.updateStatus(selectedRecommendation.id, 'reviewed');
        
        alert('채용 결재가 요청되었습니다.');
      }

      // Reload data
      await loadData();

      // Close dialog
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

  const handleOpenResume = async (recommendation: CrewRecommendationWithDetails) => {
    if (!recommendation.resume_files || recommendation.resume_files.length === 0) {
      alert('첨부된 이력서가 없습니다.');
      return;
    }

    try {
      for (const file of recommendation.resume_files) {
        const { data } = supabase.storage
          .from('documents')
          .getPublicUrl(file.path);

        if (data?.publicUrl) {
          window.open(data.publicUrl, '_blank');
        }
      }
    } catch (error) {
      console.error('Failed to open resume:', error);
      alert('이력서 열기에 실패했습니다.');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary" className="text-xs">검토대기</Badge>;
      case 'reviewed':
        return <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-300">결재중</Badge>;
      case 'accepted':
        return <Badge variant="default" className="text-xs bg-green-600">승인</Badge>;
      case 'rejected':
        return <Badge variant="destructive" className="text-xs">거절</Badge>;
      default:
        return null;
    }
  };

  const getDepartmentColor = (department: string) => {
    switch (department) {
      case 'deck':
        return 'bg-blue-100 text-blue-700 border-blue-300';
      case 'engine':
        return 'bg-green-100 text-green-700 border-green-300';
      case 'catering':
        return 'bg-orange-100 text-orange-700 border-orange-300';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  // Check if user has supervisor permission for a recommendation
  const canApproveRecommendation = (recommendation: CrewRecommendationWithDetails): boolean => {
    return supervisorPermissions.get(recommendation.ship_id) || false;
  };

  // Get selected approval line details
  const getSelectedApprovalLineSteps = () => {
    if (!selectedApprovalLine) return [];
    const line = approvalLines.find(l => l.id === selectedApprovalLine);
    return line?.steps || [];
  };

  // Check if approval request button should be disabled
  const isApprovalRequestDisabled = () => {
    if (approvalAction === 'reject') {
      return !approvalComment.trim();
    }
    
    // For accept action, require approval line selection and valid steps
    if (!selectedApprovalLine) return true;
    
    const steps = getSelectedApprovalLineSteps();
    return steps.length === 0;
  };

  // Pagination calculations
  const totalPages = Math.ceil(filteredRecommendations.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentRecommendations = filteredRecommendations.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading) {
    return (
      <Layout>
        <div className="p-8">로딩 중...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
        <div className="mb-4">
          <h1 className="text-2xl font-bold">선원 추천 검토</h1>
          <p className="text-sm text-muted-foreground mt-1">
            매닝사가 추천한 선원을 검토하고 채용 결재를 진행합니다
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm p-3 mb-3">
          <div className="flex items-center gap-2 mb-2">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-sm font-medium">필터</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <div className="md:col-span-4">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="선원명, 선박명, 직급, 매닝사 검색..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 h-9 text-sm"
                />
              </div>
            </div>
            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="선주사" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 선주사</SelectItem>
                {companies.map(owner => (
                  <SelectItem key={owner.id} value={String(owner.id)}>
                    {owner.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={fleetFilter} onValueChange={setFleetFilter} disabled={ownerFilter === 'all'}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="플릿" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 플릿</SelectItem>
                {fleets.map(fleet => (
                  <SelectItem key={fleet.id} value={String(fleet.id)}>
                    {fleet.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={shipFilter} onValueChange={setShipFilter} disabled={ownerFilter === 'all'}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="선박" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 선박</SelectItem>
                {ships.map(ship => (
                  <SelectItem key={ship.id} value={String(ship.id)}>
                    {ship.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={rankFilter} onValueChange={setRankFilter}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="직급" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 직급</SelectItem>
                {ranks.map(rank => (
                  <SelectItem key={rank.id} value={String(rank.id)}>
                    {rank.rank_code} - {rank.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={agencyFilter} onValueChange={setAgencyFilter}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="매닝사" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 매닝사</SelectItem>
                {manningAgencies.map(agency => (
                  <SelectItem key={agency.id} value={String(agency.id)}>
                    {agency.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="상태" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 상태</SelectItem>
                <SelectItem value="pending">검토대기</SelectItem>
                <SelectItem value="reviewed">결재중</SelectItem>
                <SelectItem value="accepted">승인</SelectItem>
                <SelectItem value="rejected">거절</SelectItem>
              </SelectContent>
            </Select>
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="기간" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 기간</SelectItem>
                <SelectItem value="week">최근 1주일</SelectItem>
                <SelectItem value="month">최근 1개월</SelectItem>
                <SelectItem value="quarter">최근 3개월</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="text-xs py-2 w-20">상태</TableHead>
                <TableHead className="text-xs py-2 w-32">선박</TableHead>
                <TableHead className="text-xs py-2 w-20">직급</TableHead>
                <TableHead className="text-xs py-2 w-24">선원명</TableHead>
                <TableHead className="text-xs py-2 w-16">나이</TableHead>
                <TableHead className="text-xs py-2 w-32">매닝사</TableHead>
                <TableHead className="text-xs py-2">희망조건</TableHead>
                <TableHead className="text-xs py-2 w-24">출국가능일</TableHead>
                <TableHead className="text-xs py-2 w-24">추천일</TableHead>
                <TableHead className="text-right text-xs py-2 w-48">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentRecommendations.map((rec) => {
                const canApprove = canApproveRecommendation(rec);
                return (
                  <TableRow key={rec.id} className="hover:bg-muted/50">
                    <TableCell className="py-2">
                      {getStatusBadge(rec.status)}
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="text-sm font-medium truncate max-w-[120px]" title={rec.ship_name}>
                        {rec.ship_name}
                      </div>
                      {rec.fleet_name && (
                        <div className="text-xs text-muted-foreground truncate max-w-[120px]" title={rec.fleet_name}>
                          {rec.fleet_name}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="py-2">
                      {rec.rank_code ? (
                        <Badge
                          variant="outline"
                          className={`text-xs ${getDepartmentColor(rec.department)}`}
                        >
                          {rec.rank_code}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs bg-gray-100 text-gray-400">
                          -
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="text-sm font-medium">{rec.crew_name}</div>
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="text-xs text-muted-foreground">
                        {calculateAge(rec.crew_birth_date)}세
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="text-sm truncate max-w-[120px]" title={rec.manning_agency_name}>
                        {rec.manning_agency_name}
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="text-sm">
                        {rec.desired_currency} {rec.desired_salary.toLocaleString()}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {rec.desired_contract_months}개월
                      </div>
                    </TableCell>
                    <TableCell className="text-xs py-2">
                      {new Date(rec.available_date).toLocaleDateString('ko-KR', {
                        year: '2-digit',
                        month: '2-digit',
                        day: '2-digit',
                      })}
                    </TableCell>
                    <TableCell className="text-xs py-2">
                      {new Date(rec.created_at).toLocaleDateString('ko-KR', {
                        year: '2-digit',
                        month: '2-digit',
                        day: '2-digit',
                      })}
                    </TableCell>
                    <TableCell className="text-right py-2">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewDetail(rec)}
                          className="h-7 px-2 text-xs"
                        >
                          <Eye className="w-3.5 h-3.5 mr-1" />
                          상세
                        </Button>
                        {rec.status === 'pending' && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenApprovalDialog(rec, 'accept')}
                              disabled={!canApprove}
                              className="h-7 px-2 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
                              title={!canApprove ? '해당 선박의 감독이 아닙니다' : ''}
                            >
                              <Send className="w-3.5 h-3.5 mr-1" />
                              채용결재
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenApprovalDialog(rec, 'reject')}
                              disabled={!canApprove}
                              className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                              title={!canApprove ? '해당 선박의 감독이 아닙니다' : ''}
                            >
                              <XCircle className="w-3.5 h-3.5 mr-1" />
                              거절
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
              {searchTerm || statusFilter !== 'all' || dateFilter !== 'all' || ownerFilter !== 'all' || fleetFilter !== 'all' || shipFilter !== 'all' || rankFilter !== 'all' || agencyFilter !== 'all'
                ? '검색 결과가 없습니다.'
                : '받은 선원 추천이 없습니다.'}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-3 flex justify-center">
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => currentPage > 1 && handlePageChange(currentPage - 1)}
                    className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                  />
                </PaginationItem>
                
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                  if (
                    page === 1 ||
                    page === totalPages ||
                    (page >= currentPage - 1 && page <= currentPage + 1)
                  ) {
                    return (
                      <PaginationItem key={page}>
                        <PaginationLink
                          onClick={() => handlePageChange(page)}
                          isActive={currentPage === page}
                          className="cursor-pointer"
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  } else if (page === currentPage - 2 || page === currentPage + 2) {
                    return (
                      <PaginationItem key={page}>
                        <span className="px-4">...</span>
                      </PaginationItem>
                    );
                  }
                  return null;
                })}

                <PaginationItem>
                  <PaginationNext
                    onClick={() => currentPage < totalPages && handlePageChange(currentPage + 1)}
                    className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}

        {/* Detail Dialog */}
        <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>추천 선원 상세 정보</DialogTitle>
            </DialogHeader>
            
            {selectedRecommendation && (() => {
              const canApprove = canApproveRecommendation(selectedRecommendation);
              return (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                    <span className="text-sm font-medium">현재 상태</span>
                    {getStatusBadge(selectedRecommendation.status)}
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold mb-2">선원 정보</h3>
                    <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-md">
                      <div>
                        <span className="text-xs text-gray-600">직급</span>
                        <div className="mt-1">
                          {selectedRecommendation.rank_code ? (
                            <Badge className={getDepartmentColor(selectedRecommendation.department)}>
                              {selectedRecommendation.rank_code}
                            </Badge>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <span className="text-xs text-gray-600">성명</span>
                        <p className="text-sm font-medium">{selectedRecommendation.crew_name}</p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-600">생년월일</span>
                        <p className="text-sm font-medium">
                          {new Date(selectedRecommendation.crew_birth_date).toLocaleDateString('ko-KR')}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-600">나이</span>
                        <p className="text-sm font-medium">
                          {calculateAge(selectedRecommendation.crew_birth_date)}세
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-600">출국 가능일</span>
                        <p className="text-sm font-medium">
                          {new Date(selectedRecommendation.available_date).toLocaleDateString('ko-KR')}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold mb-2">선박 정보</h3>
                    <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-md">
                      <div>
                        <span className="text-xs text-gray-600">선주사</span>
                        <p className="text-sm font-medium">{selectedRecommendation.company_name}</p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-600">선박명</span>
                        <p className="text-sm font-medium">{selectedRecommendation.ship_name}</p>
                      </div>
                      {selectedRecommendation.fleet_name && (
                        <div>
                          <span className="text-xs text-gray-600">선대</span>
                          <p className="text-sm font-medium">{selectedRecommendation.fleet_name}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold mb-2">추천 매닝사</h3>
                    <div className="p-3 bg-gray-50 rounded-md">
                      <p className="text-sm font-medium">{selectedRecommendation.manning_agency_name}</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold mb-2">희망 계약 조건</h3>
                    <div className="grid grid-cols-3 gap-3 p-3 bg-gray-50 rounded-md">
                      <div>
                        <span className="text-xs text-gray-600">희망 급여</span>
                        <p className="text-sm font-medium">
                          {selectedRecommendation.desired_currency} {selectedRecommendation.desired_salary.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-600">희망 계약기간</span>
                        <p className="text-sm font-medium">{selectedRecommendation.desired_contract_months}개월</p>
                      </div>
                    </div>
                  </div>

                  {selectedRecommendation.remarks && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2">비고</h3>
                      <div className="p-3 bg-gray-50 rounded-md">
                        <p className="text-sm whitespace-pre-wrap">{selectedRecommendation.remarks}</p>
                      </div>
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
                              <span className="text-xs text-gray-500">
                                ({(file.size / 1024).toFixed(1)} KB)
                              </span>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenResume(selectedRecommendation)}
                              className="h-7"
                            >
                              <ExternalLink className="w-3.5 h-3.5 mr-1" />
                              열기
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedRecommendation.status === 'pending' && (
                    <div className="flex justify-end gap-2 pt-4 border-t">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setDetailDialogOpen(false);
                          handleOpenApprovalDialog(selectedRecommendation, 'reject');
                        }}
                        disabled={!canApprove}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={!canApprove ? '해당 선박의 감독이 아닙니다' : ''}
                      >
                        <XCircle className="w-4 h-4 mr-2" />
                        거절
                      </Button>
                      <Button
                        onClick={() => {
                          setDetailDialogOpen(false);
                          handleOpenApprovalDialog(selectedRecommendation, 'accept');
                        }}
                        disabled={!canApprove}
                        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={!canApprove ? '해당 선박의 감독이 아닙니다' : ''}
                      >
                        <Send className="w-4 h-4 mr-2" />
                        채용 결재 요청
                      </Button>
                    </div>
                  )}

                  <div className="flex justify-end pt-4">
                    <Button onClick={() => setDetailDialogOpen(false)}>
                      닫기
                    </Button>
                  </div>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Approval Dialog */}
        <Dialog open={approvalDialogOpen} onOpenChange={setApprovalDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {approvalAction === 'accept' ? '채용 결재 요청' : '선원 추천 거절'}
              </DialogTitle>
            </DialogHeader>
            
            {selectedRecommendation && (
              <div className="space-y-4">
                <div className="p-3 bg-gray-50 rounded-md">
                  <div className="text-sm">
                    <span className="font-medium">선원:</span> {selectedRecommendation.crew_name}
                  </div>
                  <div className="text-sm">
                    <span className="font-medium">직급:</span> {selectedRecommendation.rank_code}
                  </div>
                  <div className="text-sm">
                    <span className="font-medium">선박:</span> {selectedRecommendation.ship_name}
                  </div>
                </div>

                {approvalAction === 'accept' && (
                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      결재 라인 선택 *
                    </label>
                    <Select value={selectedApprovalLine} onValueChange={handleApprovalLineChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="결재 라인을 선택하세요" />
                      </SelectTrigger>
                      <SelectContent>
                        {approvalLines.length === 0 ? (
                          <SelectItem value="none" disabled>
                            등록된 결재 라인이 없습니다
                          </SelectItem>
                        ) : (
                          approvalLines.map(line => (
                            <SelectItem key={line.id} value={String(line.id)}>
                              {line.name} ({line.steps.length}단계)
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    
                    {selectedApprovalLine && getSelectedApprovalLineSteps().length > 0 && (
                      <>
                        <div className="mt-2 p-2 bg-blue-50 rounded-md">
                          <p className="text-xs font-medium text-blue-900 mb-1">결재 순서:</p>
                          {getSelectedApprovalLineSteps().map((step, idx) => (
                            <div key={step.id} className="text-xs text-blue-700">
                              {idx + 1}. {step.approver_name} ({step.approver_role || '담당자'})
                            </div>
                          ))}
                        </div>
                        
                        <div className="flex items-center space-x-2 mt-3">
                          <Checkbox
                            id="use-for-future"
                            checked={useApprovalLineForFuture}
                            onCheckedChange={(checked) => setUseApprovalLineForFuture(checked as boolean)}
                          />
                          <label
                            htmlFor="use-for-future"
                            className="text-sm text-gray-700 cursor-pointer"
                          >
                            앞으로도 해당 결재 라인 이용
                          </label>
                        </div>
                      </>
                    )}
                    
                    {selectedApprovalLine && getSelectedApprovalLineSteps().length === 0 && (
                      <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-md">
                        <p className="text-xs text-yellow-800">
                          ⚠️ 선택한 결재 라인에 결재자가 없습니다. 결재 라인 관리에서 결재자를 추가해주세요.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium mb-2 block">
                    {approvalAction === 'accept' ? '요청 사유 (선택)' : '거절 사유 (필수)'}
                  </label>
                  <Textarea
                    value={approvalComment}
                    onChange={(e) => setApprovalComment(e.target.value)}
                    placeholder={approvalAction === 'accept' ? '요청 사유를 입력하세요...' : '거절 사유를 입력하세요...'}
                    className="min-h-[100px]"
                  />
                </div>

                <div className={`border rounded-md p-3 ${approvalAction === 'accept' ? 'bg-blue-50 border-blue-200' : 'bg-yellow-50 border-yellow-200'}`}>
                  <div className="flex items-start gap-2">
                    <Clock className={`w-4 h-4 mt-0.5 ${approvalAction === 'accept' ? 'text-blue-600' : 'text-yellow-600'}`} />
                    <div className={`text-xs ${approvalAction === 'accept' ? 'text-blue-800' : 'text-yellow-800'}`}>
                      <p className="font-medium mb-1">
                        {approvalAction === 'accept' ? '결재 프로세스 안내' : '거절 처리 안내'}
                      </p>
                      <p>
                        {approvalAction === 'accept' 
                          ? '채용 결재 요청 시 선택한 결재 라인을 따라 순차적으로 결재가 진행됩니다. 모든 결재자가 승인하면 최종 수락됩니다.'
                          : '거절 시 매닝사에 즉시 통보되며, 거절 사유가 전달됩니다.'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setApprovalDialogOpen(false)}
                disabled={submittingApproval}
              >
                취소
              </Button>
              <Button
                onClick={handleSubmitApproval}
                disabled={submittingApproval || isApprovalRequestDisabled()}
                className={approvalAction === 'accept' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'}
              >
                {submittingApproval ? '처리 중...' : approvalAction === 'accept' ? '결재 요청' : '거절 확정'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}