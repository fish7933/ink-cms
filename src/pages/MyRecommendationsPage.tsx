import { useState, useEffect } from 'react';
import { Search, Filter, Eye, Download, Calendar, User, Ship as ShipIcon, Briefcase, ExternalLink, UserPlus, Award } from 'lucide-react';
import { CertificateUploadDialog } from '@/components/crew/CertificateUploadDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
} from '@/components/ui/dialog';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { crewRecommendationService } from '@/services/crew-recommendation.service';
import { supabase } from '@/lib/supabase';
import { getCurrentUser, getCompanies, getFleets, getShips, getRanks } from '@/lib/store';
import Layout from '@/components/Layout';
import type { CrewRecommendationWithDetails, User as UserType, Company, Fleet, Ship, Rank } from '@/types/models';
import { useNavigate } from 'react-router-dom';

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

export default function MyRecommendationsPage() {
  const navigate = useNavigate();
  const [recommendations, setRecommendations] = useState<CrewRecommendationWithDetails[]>([]);
  const [filteredRecommendations, setFilteredRecommendations] = useState<CrewRecommendationWithDetails[]>([]);
  const [currentUser, setCurrentUser] = useState<UserType | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRecommendation, setSelectedRecommendation] = useState<CrewRecommendationWithDetails | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  
  // Filter data
  const [companies, setCompanies] = useState<Company[]>([]);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [ships, setShips] = useState<Ship[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);
  
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

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [recommendations, searchTerm, statusFilter, dateFilter, ownerFilter, fleetFilter, shipFilter, rankFilter]);

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
      setCompanies(companiesData.filter(c => c.type === 'owner'));
      setFleets(fleetsData);
      setShips(shipsData);
      setRanks(ranksData);

      if (!user || !user.company_id) {
        console.error('User or company_id not found');
        return;
      }

      // Load all recommendations for this manning agency
      const allRecommendations = await crewRecommendationService.getByManningAgency(user.company_id);
      console.log('Loaded recommendations:', allRecommendations);
      console.log('Sample recommendation:', allRecommendations[0]);
      setRecommendations(allRecommendations);
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

    // Search filter (crew name, ship name, rank code)
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.crew_name.toLowerCase().includes(term) ||
          r.ship_name.toLowerCase().includes(term) ||
          (r.rank_code && r.rank_code.toLowerCase().includes(term))
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

  const handleOpenResume = async (recommendation: CrewRecommendationWithDetails) => {
    if (!recommendation.resume_files || recommendation.resume_files.length === 0) {
      alert('첨부된 이력서가 없습니다.');
      return;
    }

    try {
      for (const file of recommendation.resume_files) {
        // Get public URL for the file
        const { data } = supabase.storage
          .from('documents')
          .getPublicUrl(file.path);

        if (data?.publicUrl) {
          // Open in new tab
          window.open(data.publicUrl, '_blank');
        }
      }
    } catch (error) {
      console.error('Failed to open resume:', error);
      alert('이력서 열기에 실패했습니다.');
    }
  };

  const handleInputDetails = (recommendation: CrewRecommendationWithDetails) => {
    navigate('/crew/input', { state: { recommendation } });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary" className="text-xs">검토 대기</Badge>;
      case 'reviewed':
        return <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-300">검토 완료</Badge>;
      case 'accepted':
        return <Badge variant="default" className="text-xs bg-green-600">수락</Badge>;
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

  // Pagination calculations
  const totalPages = Math.ceil(filteredRecommendations.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentRecommendations = filteredRecommendations.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Statistics
  const stats = {
    total: recommendations.length,
    pending: recommendations.filter(r => r.status === 'pending').length,
    reviewed: recommendations.filter(r => r.status === 'reviewed').length,
    accepted: recommendations.filter(r => r.status === 'accepted').length,
    rejected: recommendations.filter(r => r.status === 'rejected').length,
  };

  if (loading) {
    return (
    <Layout>
      <div className="p-8">로딩 중...</div>
    </Layout>
  );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50">      <main className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
        <div className="mb-4">
          <h1 className="text-2xl font-bold">내 추천 선원 관리</h1>
          <p className="text-sm text-muted-foreground mt-1">
            우리 회사가 추천한 선원 목록을 관리합니다
          </p>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          <div className="bg-white rounded-lg shadow-sm p-3 border-l-4 border-blue-500">
            <div className="text-xs text-gray-600">전체 추천</div>
            <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-3 border-l-4 border-gray-400">
            <div className="text-xs text-gray-600">검토 대기</div>
            <div className="text-2xl font-bold text-gray-600">{stats.pending}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-3 border-l-4 border-blue-400">
            <div className="text-xs text-gray-600">검토 완료</div>
            <div className="text-2xl font-bold text-blue-500">{stats.reviewed}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-3 border-l-4 border-green-500">
            <div className="text-xs text-gray-600">수락</div>
            <div className="text-2xl font-bold text-green-600">{stats.accepted}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-3 border-l-4 border-red-500">
            <div className="text-xs text-gray-600">거절</div>
            <div className="text-2xl font-bold text-red-600">{stats.rejected}</div>
          </div>
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
                  placeholder="선원명, 선박명, 직급 검색..."
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
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="상태" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 상태</SelectItem>
                <SelectItem value="pending">검토 대기</SelectItem>
                <SelectItem value="reviewed">검토 완료</SelectItem>
                <SelectItem value="accepted">수락</SelectItem>
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
                <TableHead className="text-xs py-2 w-32">선박 정보</TableHead>
                <TableHead className="text-xs py-2 w-20">직급</TableHead>
                <TableHead className="text-xs py-2 min-w-[120px]">선원명</TableHead>
                <TableHead className="text-xs py-2 w-16">나이</TableHead>
                <TableHead className="text-xs py-2">희망 조건</TableHead>
                <TableHead className="text-xs py-2 w-24">출국가능일</TableHead>
                <TableHead className="text-xs py-2 w-24">추천일</TableHead>
                <TableHead className="text-right text-xs py-2 w-40">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentRecommendations.map((rec) => (
                <TableRow key={rec.id} className="hover:bg-muted/50">
                  <TableCell className="py-2">
                    {getStatusBadge(rec.status)}
                  </TableCell>
                  <TableCell className="py-2">
                    <div className="text-sm font-medium truncate max-w-[120px]" title={rec.ship_name}>
                      {rec.ship_name}
                    </div>
                    <div className="text-xs text-muted-foreground truncate max-w-[120px]" title={rec.company_name}>
                      {rec.company_name}
                    </div>
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
                    <div className="flex justify-end gap-1.5">
                      {rec.status === 'accepted' && (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => handleInputDetails(rec)}
                          className="h-8 px-3 text-xs bg-blue-600 hover:bg-blue-700"
                        >
                          <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                          상세입력
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewDetail(rec)}
                        className="h-8 px-3 text-xs"
                      >
                        <Eye className="w-3.5 h-3.5 mr-1.5" />
                        상세
                      </Button>
                      {rec.resume_files && rec.resume_files.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenResume(rec)}
                          className="h-8 px-3 text-xs"
                        >
                          <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                          이력서
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {currentRecommendations.length === 0 && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {searchTerm || statusFilter !== 'all' || dateFilter !== 'all' || ownerFilter !== 'all' || fleetFilter !== 'all' || shipFilter !== 'all' || rankFilter !== 'all'
                ? '검색 결과가 없습니다.'
                : '아직 추천한 선원이 없습니다.'}
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
            
            {selectedRecommendation && (
              <div className="space-y-4">
                {/* Status */}
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                  <span className="text-sm font-medium">현재 상태</span>
                  {getStatusBadge(selectedRecommendation.status)}
                </div>

                {/* Crew Information */}
                <div>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <User className="w-4 h-4" />
                    선원 정보
                  </h3>
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

                {/* Ship Information */}
                <div>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <ShipIcon className="w-4 h-4" />
                    선박 정보
                  </h3>
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

                {/* Contract Conditions */}
                <div>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Briefcase className="w-4 h-4" />
                    희망 계약 조건
                  </h3>
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

                {/* Dates */}
                <div>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    날짜 정보
                  </h3>
                  <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-md">
                    <div>
                      <span className="text-xs text-gray-600">추천 제출일</span>
                      <p className="text-sm font-medium">
                        {new Date(selectedRecommendation.created_at).toLocaleDateString('ko-KR', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </p>
                    </div>
                    {selectedRecommendation.updated_at && (
                      <div>
                        <span className="text-xs text-gray-600">최종 수정일</span>
                        <p className="text-sm font-medium">
                          {new Date(selectedRecommendation.updated_at).toLocaleDateString('ko-KR', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Remarks */}
                {selectedRecommendation.remarks && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2">비고</h3>
                    <div className="p-3 bg-gray-50 rounded-md">
                      <p className="text-sm whitespace-pre-wrap">{selectedRecommendation.remarks}</p>
                    </div>
                  </div>
                )}

                {/* Resume Files */}
                {selectedRecommendation.resume_files && selectedRecommendation.resume_files.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2">첨부 이력서</h3>
                    <div className="space-y-2">
                      {selectedRecommendation.resume_files.map((file, index) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
                          <div className="flex items-center gap-2">
                            <ExternalLink className="w-4 h-4 text-gray-500" />
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
                            열기
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Close Button */}
                <div className="flex justify-end pt-4">
                  <Button onClick={() => setDetailDialogOpen(false)}>
                    닫기
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}