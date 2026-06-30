import { useState, useEffect } from 'react';
import { msg } from '@/lib/messages';
import { Plus, Search, Filter, AlertTriangle, Eye, UserPlus, Users, ArrowLeft } from 'lucide-react';
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
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { JobPostingDialog } from '@/components/job-postings/JobPostingDialog';
import { jobPostingGroupService } from '@/services/job-posting-group.service';
import { crewRecommendationService } from '@/services/crew-recommendation.service';
import { getCompanies, getFleets, getShips, getCurrentUser } from '@/lib/store';
import type { JobPostingGroupWithDetails, Company, Fleet, Ship, User, CrewRecommendationWithDetails } from '@/types/models';

const ITEMS_PER_PAGE = 20;

export default function JobPostingsPage() {
  const [postings, setPostings] = useState<JobPostingGroupWithDetails[]>([]);
  const [filteredPostings, setFilteredPostings] = useState<JobPostingGroupWithDetails[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [ships, setShips] = useState<Ship[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPosting, setSelectedPosting] = useState<JobPostingGroupWithDetails | null>(null);
  const [duplicateWarnings, setDuplicateWarnings] = useState<string[]>([]);

  // View mode: 'list' shows the table, 'recommendations' shows inline recommendations panel
  const [viewMode, setViewMode] = useState<'list' | 'recommendations'>('list');

  // Crew recommendations (inline panel)
  const [selectedPostingRecommendations, setSelectedPostingRecommendations] = useState<CrewRecommendationWithDetails[]>([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [urgencyFilter, setUrgencyFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [fleetFilter, setFleetFilter] = useState<string>('all');
  const [shipFilter, setShipFilter] = useState<string>('all');

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [postings, searchTerm, statusFilter, urgencyFilter, categoryFilter, ownerFilter, fleetFilter, shipFilter]);

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
      const [postingsData, companiesData, fleetsData, shipsData, user] = await Promise.all([
        jobPostingGroupService.getAll(),
        getCompanies(),
        getFleets(),
        getShips(),
        getCurrentUser(),
      ]);

      // Load recommendation counts for each posting based on user role
      const postingsWithCounts = await Promise.all(
        postingsData.map(async (posting) => {
          let count = 0;
          if (user?.role === 'manning_agency' && user.company_id) {
            // For manning agencies, show only their own recommendations
            count = await crewRecommendationService.getRecommendationCountByJobPostingGroupAndAgency(
              posting.id,
              user.company_id
            );
          } else if (user?.role === 'ship_manager' || user?.role === 'ship_owner') {
            // For ship managers/owners, show all recommendations
            count = await crewRecommendationService.getRecommendationCountByJobPostingGroup(posting.id);
          }
          return { ...posting, recommendation_count: count };
        })
      );

      setPostings(postingsWithCounts);
      setCompanies(companiesData);
      setFleets(fleetsData);
      setShips(shipsData);
      setCurrentUser(user);

      // Only check for duplicates if user is ship_manager
      if (user?.role === 'ship_manager') {
        checkForDuplicates(postingsWithCounts);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
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

  const checkForDuplicates = (postingsList: JobPostingGroupWithDetails[]) => {
    const warnings: string[] = [];
    const activePostings = postingsList.filter(p => p.status === 'active');

    // Group by ship_id
    const postingsByShip = activePostings.reduce((acc, posting) => {
      if (!acc[posting.ship_id]) {
        acc[posting.ship_id] = [];
      }
      acc[posting.ship_id].push(posting);
      return acc;
    }, {} as Record<string, JobPostingGroupWithDetails[]>);

    // Check for duplicates within each ship
    Object.entries(postingsByShip).forEach(([shipId, shipPostings]) => {
      if (shipPostings.length > 1) {
        // Sort by embarkation date
        shipPostings.sort((a, b) =>
          new Date(a.embarkation_date).getTime() - new Date(b.embarkation_date).getTime()
        );

        // Check for overlapping dates (within 30 days) AND overlapping ranks
        for (let i = 0; i < shipPostings.length - 1; i++) {
          const current = shipPostings[i];
          const next = shipPostings[i + 1];

          const currentDate = new Date(current.embarkation_date);
          const nextDate = new Date(next.embarkation_date);
          const daysDiff = Math.abs((nextDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));

          if (daysDiff <= 30) {
            // Check if there are overlapping ranks
            const currentRankCodes = current.ranks.map(r => r.rank_code);
            const nextRankCodes = next.ranks.map(r => r.rank_code);
            const overlappingRanks = currentRankCodes.filter(code => nextRankCodes.includes(code));

            // Only warn if there are overlapping ranks
            if (overlappingRanks.length > 0) {
              const currentRanks = current.ranks.map(r => r.rank_code).join(', ');
              const nextRanks = next.ranks.map(r => r.rank_code).join(', ');
              warnings.push(
                msg.jobPosting.overlapDetail(current.ship_name, currentRanks, currentDate.toLocaleDateString('ko-KR'), nextRanks, nextDate.toLocaleDateString('ko-KR'), overlappingRanks.join(', '), Math.floor(daysDiff))
              );
            }
          }
        }
      }
    });

    setDuplicateWarnings(warnings);
  };

  const applyFilters = () => {
    let filtered = [...postings];

    // Search filter (ship name, company name, rank codes)
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.ship_name.toLowerCase().includes(term) ||
          p.company_name.toLowerCase().includes(term) ||
          p.ranks.some(r => r.rank_code.toLowerCase().includes(term))
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((p) => p.status === statusFilter);
    }

    // Urgency filter
    if (urgencyFilter !== 'all') {
      filtered = filtered.filter((p) => p.urgency === urgencyFilter);
    }

    // Category filter
    if (categoryFilter !== 'all') {
      filtered = filtered.filter((p) =>
        p.ranks.some(r => r.rank_category === categoryFilter)
      );
    }

    // Owner filter
    if (ownerFilter !== 'all') {
      filtered = filtered.filter((p) => p.company_id === ownerFilter);
    }

    // Fleet filter
    if (fleetFilter !== 'all') {
      filtered = filtered.filter((p) => p.fleet_id === fleetFilter);
    }

    // Ship filter
    if (shipFilter !== 'all') {
      filtered = filtered.filter((p) => p.ship_id === shipFilter);
    }

    setFilteredPostings(filtered);
    setCurrentPage(1); // Reset to first page when filters change
  };

  const handleAdd = () => {
    setSelectedPosting(null);
    setDialogOpen(true);
  };

  const handleView = (posting: JobPostingGroupWithDetails) => {
    setSelectedPosting(posting);
    setDialogOpen(true);
  };

  const handleViewRecommendations = async (posting: JobPostingGroupWithDetails) => {
    try {
      setSelectedPosting(posting);
      setLoadingRecommendations(true);
      setViewMode('recommendations');

      let recommendations: CrewRecommendationWithDetails[];
      if (currentUser?.role === 'manning_agency' && currentUser.company_id) {
        // For manning agencies, show only their own recommendations
        recommendations = await crewRecommendationService.getByJobPostingGroupAndAgency(
          posting.id,
          currentUser.company_id
        );
      } else {
        // For ship managers/owners, show all recommendations
        recommendations = await crewRecommendationService.getByJobPostingGroup(posting.id);
      }

      setSelectedPostingRecommendations(recommendations);
    } catch (error) {
      console.error('Failed to load recommendations:', error);
      alert('선원 추천 목록을 불러오는데 실패했습니다.');
    } finally {
      setLoadingRecommendations(false);
    }
  };

  const handleBackToList = () => {
    setViewMode('list');
    setSelectedPosting(null);
    setSelectedPostingRecommendations([]);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 구인 공고를 삭제하시겠습니까?')) return;

    try {
      await jobPostingGroupService.delete(id);
      await loadData();
    } catch (error) {
      console.error('Failed to delete job posting:', error);
      alert('구인 공고 삭제에 실패했습니다.');
    }
  };

  const handleDialogClose = async (saved: boolean) => {
    setDialogOpen(false);
    setSelectedPosting(null);
    if (saved) {
      await loadData();
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="default" className="bg-green-600 text-xs">모집중</Badge>;
      case 'filled':
        return <Badge variant="secondary" className="text-xs">채용완료</Badge>;
      case 'cancelled':
        return <Badge variant="outline" className="text-xs">취소</Badge>;
      default:
        return null;
    }
  };

  const getUrgencyBadge = (urgency: string) => {
    if (urgency === 'urgent') {
      return <Badge variant="destructive" className="text-xs">긴급</Badge>;
    }
    return null;
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

  const getAgencyNames = (agencyIds: string[]) => {
    if (!agencyIds || agencyIds.length === 0) return '-';

    const manningCompanies = companies.filter(c => c.type === 'manning' && agencyIds.includes(c.id));

    if (manningCompanies.length === 0) return '-';
    if (manningCompanies.length === 1) return manningCompanies[0].name;
    if (manningCompanies.length === 2) return `${manningCompanies[0].name}, ${manningCompanies[1].name}`;
    return msg.jobPosting.multipleAgencies(manningCompanies[0].name, manningCompanies.length - 1);
  };

  const getRecommendationStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary" className="text-xs">검토대기</Badge>;
      case 'reviewed':
        return <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-300">검토완료</Badge>;
      case 'accepted':
        return <Badge variant="default" className="text-xs bg-green-600">수락</Badge>;
      case 'rejected':
        return <Badge variant="destructive" className="text-xs">거절</Badge>;
      default:
        return null;
    }
  };

  const departmentColors = {
    deck: 'bg-blue-100 text-blue-700 border-blue-300',
    engine: 'bg-green-100 text-green-700 border-green-300',
    catering: 'bg-orange-100 text-orange-700 border-orange-300',
  };

  // Pagination calculations
  const totalPages = Math.ceil(filteredPostings.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentPostings = filteredPostings.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Get owner companies
  const ownerCompanies = companies.filter(c => c.type === 'owner');

  // Check if user can edit postings (only ship_manager and ship_owner)
  const canEditPostings = currentUser?.role === 'ship_manager' || currentUser?.role === 'ship_owner';

  // Check if user is manning agency or crew (can only recommend)
  const isManningOrCrew = currentUser?.role === 'manning_agency' || currentUser?.role === 'crew';

  if (loading) {
    return (
      <>
        <div className="p-8">로딩 중...</div>
      </>
    );
  }

  return (
    <>
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
        {viewMode === 'list' && (
          <>
            <div className="flex justify-between items-center mb-4">
              <div>
                <h1 className="text-2xl font-bold">
                  {isManningOrCrew ? '선원 추천 가능 공고' : '구인 공고 관리'}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {isManningOrCrew
                    ? msg.jobPosting.totalRecommendable(filteredPostings.length)
                    : msg.jobPosting.total(filteredPostings.length)
                  }
                </p>
              </div>
              {canEditPostings && (
                <Button onClick={handleAdd} size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  다직급 공고 등록
                </Button>
              )}
            </div>

            {/* Duplicate Warnings - only for ship managers */}
            {canEditPostings && duplicateWarnings.length > 0 && (
              <Alert variant="destructive" className="mb-3">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle className="text-sm">중복 공고 경고 (동일 선박, 동일 직급)</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc list-inside space-y-1 mt-2">
                    {duplicateWarnings.map((warning, index) => (
                      <li key={index} className="text-xs">{warning}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Info for manning agencies and crew */}
            {isManningOrCrew && (
              <Alert className="mb-3 bg-blue-50 border-blue-200">
                <AlertTitle className="text-sm text-blue-900">선원 추천 안내</AlertTitle>
                <AlertDescription className="text-xs text-blue-800">
                  아래 공고는 선박관리사가 등록한 채용 공고입니다. 각 공고에 적합한 선원을 추천할 수 있습니다.
                  공고 내용을 수정할 수는 없으며, 선원 추천만 가능합니다.
                </AlertDescription>
              </Alert>
            )}

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
                      placeholder="선박명, 선주사, 직급 코드 검색..."
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
                    {ownerCompanies.map(owner => (
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
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="상태" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체 상태</SelectItem>
                    <SelectItem value="active">모집중</SelectItem>
                    <SelectItem value="filled">채용완료</SelectItem>
                    <SelectItem value="cancelled">취소</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={urgencyFilter} onValueChange={setUrgencyFilter}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="긴급 여부" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    <SelectItem value="urgent">긴급</SelectItem>
                    <SelectItem value="normal">일반</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="직급 구분" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    <SelectItem value="officer">사관</SelectItem>
                    <SelectItem value="rating">부원</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="text-xs py-2">상태</TableHead>
                    <TableHead className="text-xs py-2">선주사</TableHead>
                    <TableHead className="text-xs py-2">선박</TableHead>
                    <TableHead className="text-xs py-2">직급 (인원)</TableHead>
                    <TableHead className="text-xs py-2">승선예정일</TableHead>
                    <TableHead className="text-xs py-2">공고마감일</TableHead>
                    {!isManningOrCrew && (
                      <TableHead className="text-xs py-2">노출 매닝사</TableHead>
                    )}
                    <TableHead className="text-xs py-2">추천현황</TableHead>
                    <TableHead className="text-right text-xs py-2 w-24">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentPostings.map((posting) => {
                    return (
                      <TableRow
                        key={posting.id}
                        className="hover:bg-muted/50 cursor-pointer"
                        onClick={() => handleView(posting)}
                      >
                        <TableCell className="py-2">
                          <div className="flex gap-1">
                            {getStatusBadge(posting.status)}
                            {getUrgencyBadge(posting.urgency)}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm py-2">{posting.company_name}</TableCell>
                        <TableCell className="py-2">
                          <div className="text-sm font-medium">{posting.ship_name}</div>
                          {posting.fleet_name && (
                            <div className="text-xs text-muted-foreground">{posting.fleet_name}</div>
                          )}
                        </TableCell>
                        <TableCell className="py-2">
                          <div className="flex flex-wrap gap-1">
                            {posting.ranks.map((rank) => (
                              <Badge
                                key={rank.id}
                                variant="outline"
                                className={`text-xs ${getDepartmentColor(rank.department)}`}
                              >
                                {rank.rank_code} ({rank.positions_available}명)
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm py-2">
                          {new Date(posting.embarkation_date).toLocaleDateString('ko-KR', {
                            year: '2-digit',
                            month: '2-digit',
                            day: '2-digit',
                          })}
                        </TableCell>
                        <TableCell className="text-sm py-2">
                          {posting.application_deadline ? (
                            new Date(posting.application_deadline).toLocaleDateString('ko-KR', {
                              year: '2-digit',
                              month: '2-digit',
                              day: '2-digit',
                            })
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        {!isManningOrCrew && (
                          <TableCell className="text-sm py-2">
                            <div className="max-w-[150px] truncate" title={getAgencyNames(posting.visible_to_agencies)}>
                              {getAgencyNames(posting.visible_to_agencies)}
                            </div>
                          </TableCell>
                        )}
                        <TableCell className="py-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewRecommendations(posting);
                            }}
                            className="h-7 px-2"
                          >
                            <Users className="w-3.5 h-3.5 mr-1" />
                            {posting.recommendation_count || 0}명
                          </Button>
                        </TableCell>
                        <TableCell className="text-right py-2">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleView(posting);
                              }}
                              className="h-7 px-2"
                            >
                              <Eye className="w-3.5 h-3.5 mr-1" />
                              보기
                            </Button>
                            {!isManningOrCrew && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(posting.id);
                                }}
                                className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                삭제
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {currentPostings.length === 0 && (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  {searchTerm || statusFilter !== 'all' || urgencyFilter !== 'all' || categoryFilter !== 'all' || ownerFilter !== 'all' || fleetFilter !== 'all' || shipFilter !== 'all'
                    ? '검색 결과가 없습니다.'
                    : isManningOrCrew
                      ? '현재 추천 가능한 채용 공고가 없습니다.'
                      : '등록된 구인 공고가 없습니다.'}
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
                      // Show first page, last page, current page, and pages around current
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
          </>
        )}

        {viewMode === 'recommendations' && (
          <>
            {/* Recommendations inline header */}
            <div className="flex items-center gap-3 mb-4">
              <Button variant="ghost" size="sm" onClick={handleBackToList} className="h-8 px-2">
                <ArrowLeft className="w-4 h-4 mr-1" />
                목록
              </Button>
              <h1 className="text-2xl font-bold">
                {isManningOrCrew ? '내 회사 선원 추천 현황' : '선원 추천 현황'} - {selectedPosting?.ship_name}
              </h1>
            </div>

            {/* Recommendations inline panel */}
            <div className="bg-white rounded-lg shadow-sm p-4">
              {loadingRecommendations ? (
                <div className="py-12 text-center text-muted-foreground">
                  로딩 중...
                </div>
              ) : selectedPostingRecommendations.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  {isManningOrCrew ? '아직 추천한 선원이 없습니다.' : '아직 받은 선원 추천이 없습니다.'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="text-xs py-1 px-2 whitespace-nowrap">직급</TableHead>
                        <TableHead className="text-xs py-1 px-2 whitespace-nowrap">이름</TableHead>
                        <TableHead className="text-xs py-1 px-2 whitespace-nowrap">생년월일</TableHead>
                        <TableHead className="text-xs py-1 px-2 whitespace-nowrap">출국가능일</TableHead>
                        <TableHead className="text-xs py-1 px-2 whitespace-nowrap">희망급여</TableHead>
                        <TableHead className="text-xs py-1 px-2 whitespace-nowrap">계약기간</TableHead>
                        {!isManningOrCrew && (
                          <TableHead className="text-xs py-1 px-2 whitespace-nowrap">매닝사</TableHead>
                        )}
                        <TableHead className="text-xs py-1 px-2 whitespace-nowrap">추천일</TableHead>
                        <TableHead className="text-xs py-1 px-2 whitespace-nowrap">상태</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedPostingRecommendations.map((rec) => (
                        <TableRow key={rec.id} className="hover:bg-muted/50">
                          <TableCell className="py-1 px-2">
                            <Badge
                              variant="outline"
                              className={`text-xs ${getDepartmentColor(rec.department)}`}
                            >
                              {rec.rank_code}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs py-1 px-2 whitespace-nowrap font-medium">
                            {rec.crew_name}
                          </TableCell>
                          <TableCell className="text-xs py-1 px-2 whitespace-nowrap">
                            {new Date(rec.crew_birth_date).toLocaleDateString('ko-KR', {
                              year: '2-digit',
                              month: '2-digit',
                              day: '2-digit',
                            })}
                          </TableCell>
                          <TableCell className="text-xs py-1 px-2 whitespace-nowrap">
                            {new Date(rec.available_date).toLocaleDateString('ko-KR', {
                              year: '2-digit',
                              month: '2-digit',
                              day: '2-digit',
                            })}
                          </TableCell>
                          <TableCell className="text-xs py-1 px-2 whitespace-nowrap">
                            {rec.desired_currency} {rec.desired_salary.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-xs py-1 px-2 whitespace-nowrap">
                            {rec.desired_contract_months}개월
                          </TableCell>
                          {!isManningOrCrew && (
                            <TableCell className="text-xs py-1 px-2 whitespace-nowrap">
                              {rec.manning_agency_name}
                            </TableCell>
                          )}
                          <TableCell className="text-xs py-1 px-2 whitespace-nowrap">
                            {new Date(rec.created_at).toLocaleDateString('ko-KR', {
                              year: '2-digit',
                              month: '2-digit',
                              day: '2-digit',
                            })}
                          </TableCell>
                          <TableCell className="py-1 px-2">
                            {getRecommendationStatusBadge(rec.status)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </>
        )}

        <JobPostingDialog
          open={dialogOpen}
          posting={selectedPosting}
          onClose={handleDialogClose}
        />
      </div>
    </>
  );
}
