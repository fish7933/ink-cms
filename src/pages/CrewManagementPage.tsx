import { useState, useEffect } from 'react';
import { Plus, Search, Filter, X, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CrewStatusTable } from '@/components/crew/CrewStatusTable';
import { CrewFormDialog } from '@/components/crew/CrewFormDialog';
import { CrewStatusDialog } from '@/components/crew/CrewStatusDialog';
import { crewService, type CrewWithDetails } from '@/services/crew.service';
import { supabase } from '@/lib/supabase';
import type { Rank, Company, Fleet, Ship } from '@/types/models';
import Layout from '@/components/Layout';
import { useToast } from '@/hooks/use-toast';
import { CrewDetailDialog } from '@/components/crew/CrewDetailDialog';

export function CrewManagementPage() {
  const { toast } = useToast();
  const [crewMembers, setCrewMembers] = useState<CrewWithDetails[]>([]);
  const [filteredCrew, setFilteredCrew] = useState<CrewWithDetails[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [owners, setOwners] = useState<Company[]>([]);
  const [manningAgencies, setManningAgencies] = useState<Company[]>([]);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [ships, setShips] = useState<Ship[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Selection states
  const [selectedCrewIds, setSelectedCrewIds] = useState<string[]>([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  
  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOwner, setSelectedOwner] = useState<string>('all');
  const [selectedFleet, setSelectedFleet] = useState<string>('all');
  const [selectedShip, setSelectedShip] = useState<string>('all');
  const [selectedRank, setSelectedRank] = useState<string>('all');
  const [selectedRankCategory, setSelectedRankCategory] = useState<string>('all');
  const [selectedManningAgency, setSelectedManningAgency] = useState<string>('all');
  const [selectedShipType, setSelectedShipType] = useState<string>('all');
  const [minAge, setMinAge] = useState<string>('');
  const [maxAge, setMaxAge] = useState<string>('');
  const [activeTab, setActiveTab] = useState('all');
  
  const [crewDialogOpen, setCrewDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [selectedCrew, setSelectedCrew] = useState<CrewWithDetails | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [viewingCrew, setViewingCrew] = useState<CrewWithDetails | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    filterCrew();
  }, [
    crewMembers,
    searchTerm,
    selectedOwner,
    selectedFleet,
    selectedShip,
    selectedRank,
    selectedRankCategory,
    selectedManningAgency,
    selectedShipType,
    minAge,
    maxAge,
    activeTab,
  ]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filteredCrew.length]);

  // Load fleets when owner changes
  useEffect(() => {
    if (selectedOwner && selectedOwner !== 'all') {
      loadFleets(selectedOwner);
    } else {
      setFleets([]);
      setSelectedFleet('all');
    }
  }, [selectedOwner]);

  // Load ships when fleet changes
  useEffect(() => {
    if (selectedFleet && selectedFleet !== 'all') {
      loadShips(selectedFleet);
    } else if (selectedOwner && selectedOwner !== 'all') {
      loadShipsByOwner(selectedOwner);
    } else {
      setShips([]);
      setSelectedShip('all');
    }
  }, [selectedFleet, selectedOwner]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [crewData, ranksData, companiesData] = await Promise.all([
        crewService.getAllWithDetails(),
        supabase.from('ranks').select('*').order('display_order'),
        supabase.from('companies').select('*'),
      ]);
      
      setCrewMembers(crewData);
      if (ranksData.data) setRanks(ranksData.data);
      if (companiesData.data) {
        setOwners(companiesData.data.filter(c => c.type === 'owner'));
        setManningAgencies(companiesData.data.filter(c => c.type === 'manning'));
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFleets = async (ownerId: string) => {
    const { data } = await supabase
      .from('fleets')
      .select('*')
      .eq('company_id', ownerId);
    
    if (data) setFleets(data);
  };

  const loadShips = async (fleetId: string) => {
    const { data } = await supabase
      .from('ships')
      .select('*')
      .eq('fleet_id', fleetId);
    
    if (data) setShips(data);
  };

  const loadShipsByOwner = async (ownerId: string) => {
    const { data } = await supabase
      .from('ships')
      .select('*')
      .eq('owner_id', ownerId);
    
    if (data) setShips(data);
  };

  const filterCrew = () => {
    let filtered = [...crewMembers];

    // Filter by tab (status)
    if (activeTab !== 'all') {
      filtered = filtered.filter(crew => crew.current_status === activeTab);
    }

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(crew =>
        crew.name.toLowerCase().includes(term) ||
        crew.rank_name.toLowerCase().includes(term) ||
        crew.rank_code.toLowerCase().includes(term) ||
        crew.passport_number?.toLowerCase().includes(term) ||
        crew.seaman_book_number?.toLowerCase().includes(term)
      );
    }

    // Filter by owner
    if (selectedOwner !== 'all') {
      filtered = filtered.filter(crew => crew.owner_id === selectedOwner);
    }

    // Filter by fleet
    if (selectedFleet !== 'all') {
      filtered = filtered.filter(crew => crew.fleet_id === selectedFleet);
    }

    // Filter by ship
    if (selectedShip !== 'all') {
      filtered = filtered.filter(crew => crew.current_ship_id === selectedShip);
    }

    // Filter by rank
    if (selectedRank !== 'all') {
      filtered = filtered.filter(crew => crew.rank_id === selectedRank);
    }

    // Filter by rank category (officer/rating)
    if (selectedRankCategory !== 'all') {
      filtered = filtered.filter(crew => crew.rank_category === selectedRankCategory);
    }

    // Filter by manning agency
    if (selectedManningAgency !== 'all') {
      filtered = filtered.filter(crew => crew.manning_agency_id === selectedManningAgency);
    }

    // Filter by ship type (from experience)
    if (selectedShipType !== 'all') {
      filtered = filtered.filter(crew => {
        if (!crew.experience || crew.experience.length === 0) return false;
        return crew.experience.some(exp => 
          exp.ship_type.toLowerCase().includes(selectedShipType.toLowerCase())
        );
      });
    }

    // Filter by age range
    if (minAge || maxAge) {
      filtered = filtered.filter(crew => {
        if (!crew.age) return false;
        if (minAge && crew.age < parseInt(minAge)) return false;
        if (maxAge && crew.age > parseInt(maxAge)) return false;
        return true;
      });
    }

    setFilteredCrew(filtered);
  };
  const handleView = (crew: CrewWithDetails) => {
  setViewingCrew(crew);
  setDetailDialogOpen(true);
  };

  const handleAddCrew = () => {
    setSelectedCrew(null);
    setCrewDialogOpen(true);
  };

  const handleEditCrew = (crew: CrewWithDetails) => {
    setSelectedCrew(crew);
    setCrewDialogOpen(true);
  };

  const handleChangeStatus = (crew: CrewWithDetails) => {
    setSelectedCrew(crew);
    setStatusDialogOpen(true);
  };

  const handleDialogClose = async (saved: boolean) => {
    setCrewDialogOpen(false);
    setStatusDialogOpen(false);
    setSelectedCrew(null);
    if (saved) {
      await loadData();
    }
  };

  const handleSelectionChange = (crewId: string, checked: boolean) => {
    if (checked) {
      setSelectedCrewIds(prev => [...prev, crewId]);
    } else {
      setSelectedCrewIds(prev => prev.filter(id => id !== crewId));
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedCrewIds(paginatedCrew.map(crew => crew.id));
    } else {
      setSelectedCrewIds([]);
    }
  };

  const handleBulkDelete = () => {
    if (selectedCrewIds.length === 0) {
      toast({
        title: '선원을 선택하세요',
        description: '삭제할 선원을 먼저 선택해주세요.',
        variant: 'destructive',
      });
      return;
    }
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    try {
      // Delete selected crew members
      const { error } = await supabase
        .from('crew_members')
        .delete()
        .in('id', selectedCrewIds);

      if (error) throw error;

      toast({
        title: '삭제 완료',
        description: `${selectedCrewIds.length}명의 선원이 삭제되었습니다.`,
      });

      setSelectedCrewIds([]);
      setShowDeleteDialog(false);
      await loadData();
    } catch (error) {
      console.error('Failed to delete crew members:', error);
      toast({
        title: '삭제 실패',
        description: '선원 삭제 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedOwner('all');
    setSelectedFleet('all');
    setSelectedShip('all');
    setSelectedRank('all');
    setSelectedRankCategory('all');
    setSelectedManningAgency('all');
    setSelectedShipType('all');
    setMinAge('');
    setMaxAge('');
  };

  const getStatusCount = (status: string) => {
    if (status === 'all') return crewMembers.length;
    return crewMembers.filter(crew => crew.current_status === status).length;
  };

  // Pagination calculations
  const totalPages = Math.ceil(filteredCrew.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedCrew = filteredCrew.slice(startIndex, endIndex);

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const shipTypes = ['Tanker', 'Bulk Carrier', 'Container', 'General Cargo', 'LNG/LPG'];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3"></div>
          <p className="text-sm text-gray-600">로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-base">선원 관리</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">선원 정보와 승하선 이력을 관리합니다</p>
              </div>
              <div className="flex gap-2">
                {selectedCrewIds.length > 0 && (
                  <Button 
                    onClick={handleBulkDelete} 
                    size="sm" 
                    variant="destructive"
                    className="gap-1.5 h-8"
                  >
                    <Trash2 className="w-4 h-4" />
                    선택 삭제 ({selectedCrewIds.length})
                  </Button>
                )}
                <Button onClick={handleAddCrew} size="sm" className="gap-1.5 h-8">
                  <Plus className="w-4 h-4" />
                  선원 등록
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-0 space-y-3">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-3">
              <TabsList>
                <TabsTrigger value="all">
                  전체 선원 ({getStatusCount('all')})
                </TabsTrigger>
                <TabsTrigger value="registered">
                  등록 ({getStatusCount('registered')})
                </TabsTrigger>
                <TabsTrigger value="available">
                  대기 ({getStatusCount('available')})
                </TabsTrigger>
                <TabsTrigger value="on_board">
                  승선 ({getStatusCount('on_board')})
                </TabsTrigger>
                <TabsTrigger value="on_leave">
                  휴가 ({getStatusCount('on_leave')})
                </TabsTrigger>
                <TabsTrigger value="retired">
                  퇴직 ({getStatusCount('retired')})
                </TabsTrigger>
              </TabsList>

              <div className="space-y-3">
                <div className="flex gap-2 items-center">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                    <Input
                      placeholder="이름, 직급, 여권번호, 선원수첩번호로 검색..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 h-9 text-sm"
                    />
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowFilters(!showFilters)}
                    className="h-9 text-sm"
                  >
                    <Filter className="w-4 h-4 mr-2" />
                    필터 {showFilters ? '숨기기' : '표시'}
                  </Button>

                  {(selectedOwner !== 'all' || selectedFleet !== 'all' || selectedShip !== 'all' || 
                    selectedRank !== 'all' || selectedRankCategory !== 'all' || selectedManningAgency !== 'all' ||
                    selectedShipType !== 'all' || minAge || maxAge) && (
                    <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 text-sm">
                      <X className="w-4 h-4 mr-2" />
                      필터 초기화
                    </Button>
                  )}
                </div>

                {showFilters && (
                  <div className="grid grid-cols-4 gap-3 p-3 border rounded-lg bg-muted/50">
                    <div>
                      <Label className="text-xs">선주사</Label>
                      <Select value={selectedOwner} onValueChange={setSelectedOwner}>
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="선주사 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all" className="text-sm">전체</SelectItem>
                          {owners.map(owner => (
                            <SelectItem key={owner.id} value={String(owner.id)} className="text-sm">
                              {owner.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-xs">플릿</Label>
                      <Select value={selectedFleet} onValueChange={setSelectedFleet} disabled={selectedOwner === 'all'}>
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="플릿 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all" className="text-sm">전체</SelectItem>
                          {fleets.map(fleet => (
                            <SelectItem key={fleet.id} value={String(fleet.id)} className="text-sm">
                              {fleet.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-xs">선박</Label>
                      <Select value={selectedShip} onValueChange={setSelectedShip} disabled={selectedOwner === 'all'}>
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="선박 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all" className="text-sm">전체</SelectItem>
                          {ships.map(ship => (
                            <SelectItem key={ship.id} value={String(ship.id)} className="text-sm">
                              {ship.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-xs">직급</Label>
                      <Select value={selectedRank} onValueChange={setSelectedRank}>
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="직급 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all" className="text-sm">전체</SelectItem>
                          {ranks.map(rank => (
                            <SelectItem key={rank.id} value={String(rank.id)} className="text-sm">
                              {rank.name} ({rank.rank_code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-xs">사관/부원 구분</Label>
                      <Select value={selectedRankCategory} onValueChange={setSelectedRankCategory}>
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="구분 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all" className="text-sm">전체</SelectItem>
                          <SelectItem value="officer" className="text-sm">사관</SelectItem>
                          <SelectItem value="rating" className="text-sm">부원</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-xs">매닝사</Label>
                      <Select value={selectedManningAgency} onValueChange={setSelectedManningAgency}>
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="매닝사 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all" className="text-sm">전체</SelectItem>
                          {manningAgencies.map(agency => (
                            <SelectItem key={agency.id} value={String(agency.id)} className="text-sm">
                              {agency.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-xs">선종 (경력기준)</Label>
                      <Select value={selectedShipType} onValueChange={setSelectedShipType}>
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="선종 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all" className="text-sm">전체</SelectItem>
                          {shipTypes.map(type => (
                            <SelectItem key={type} value={type} className="text-sm">
                              {type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-xs">나이 범위</Label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          placeholder="최소"
                          value={minAge}
                          onChange={(e) => setMinAge(e.target.value)}
                          className="w-20 h-9 text-sm"
                        />
                        <span className="self-center text-sm">-</span>
                        <Input
                          type="number"
                          placeholder="최대"
                          value={maxAge}
                          onChange={(e) => setMaxAge(e.target.value)}
                          className="w-20 h-9 text-sm"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-between items-center">
                  <p className="text-xs text-gray-500">
                    총 {filteredCrew.length}명의 선원 (페이지 {currentPage}/{totalPages})
                    {selectedCrewIds.length > 0 && ` · ${selectedCrewIds.length}명 선택됨`}
                  </p>
                  
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">페이지당 항목:</Label>
                    <Select 
                      value={itemsPerPage.toString()} 
                      onValueChange={(value) => {
                        setItemsPerPage(parseInt(value));
                        setCurrentPage(1);
                      }}
                    >
                      <SelectTrigger className="h-8 w-20 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10" className="text-sm">10</SelectItem>
                        <SelectItem value="20" className="text-sm">20</SelectItem>
                        <SelectItem value="50" className="text-sm">50</SelectItem>
                        <SelectItem value="100" className="text-sm">100</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <TabsContent value="all">
                <CrewStatusTable
                  crew={paginatedCrew}
                  selectedCrewIds={selectedCrewIds}
                  onSelectionChange={handleSelectionChange}
                  onSelectAll={handleSelectAll}
                  onView={handleView}
                  onEdit={handleEditCrew}
                  onChangeStatus={handleChangeStatus}
                />
              </TabsContent>

              <TabsContent value="registered">
                <CrewStatusTable
                  crew={paginatedCrew}
                  selectedCrewIds={selectedCrewIds}
                  onSelectionChange={handleSelectionChange}
                  onSelectAll={handleSelectAll}
                  onView={handleView}
                  onEdit={handleEditCrew}
                  onChangeStatus={handleChangeStatus}
                />
              </TabsContent>

              <TabsContent value="available">
                <CrewStatusTable
                  crew={paginatedCrew}
                  selectedCrewIds={selectedCrewIds}
                  onSelectionChange={handleSelectionChange}
                  onSelectAll={handleSelectAll}
                  onView={handleView}
                  onEdit={handleEditCrew}
                  onChangeStatus={handleChangeStatus}
                />
              </TabsContent>

              <TabsContent value="on_board">
                <CrewStatusTable
                  crew={paginatedCrew}
                  selectedCrewIds={selectedCrewIds}
                  onSelectionChange={handleSelectionChange}
                  onSelectAll={handleSelectAll}
                  onView={handleView}
                  onEdit={handleEditCrew}
                  onChangeStatus={handleChangeStatus}
                />
              </TabsContent>

              <TabsContent value="on_leave">
                <CrewStatusTable
                  crew={paginatedCrew}
                  selectedCrewIds={selectedCrewIds}
                  onSelectionChange={handleSelectionChange}
                  onSelectAll={handleSelectAll}
                  onView={handleView}
                  onEdit={handleEditCrew}
                  onChangeStatus={handleChangeStatus}
                />
              </TabsContent>

              <TabsContent value="retired">
                <CrewStatusTable
                  crew={paginatedCrew}
                  selectedCrewIds={selectedCrewIds}
                  onSelectionChange={handleSelectionChange}
                  onSelectAll={handleSelectAll}
                  onView={handleView}
                  onEdit={handleEditCrew}
                  onChangeStatus={handleChangeStatus}
                />
              </TabsContent>
            </Tabs>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-2 pt-3 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="h-8"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                
                <div className="flex gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    
                    return (
                      <Button
                        key={pageNum}
                        variant={currentPage === pageNum ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => goToPage(pageNum)}
                        className="h-8 w-8 p-0"
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="h-8"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <CrewFormDialog
        open={crewDialogOpen}
        crew={selectedCrew}
        onClose={(saved, crewId) => {
  setCrewDialogOpen(false);
  if (saved) {
    loadData().then(() => {
      if (crewId) {
        setTimeout(() => {
          setCrewMembers(prev => {
            const updated = prev.find(c => c.id === crewId);
            if (updated) { setViewingCrew(updated); setDetailDialogOpen(true); }
            return prev;
          });
        }, 300);
      }
    });
  }
  setSelectedCrew(null);
}}
      />

      <CrewStatusDialog
        open={statusDialogOpen}
        crew={selectedCrew}
        onClose={handleDialogClose}
      />

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>선원 삭제 확인</AlertDialogTitle>
            <AlertDialogDescription>
              선택한 {selectedCrewIds.length}명의 선원을 삭제하시겠습니까?
              이 작업은 되돌릴 수 없으며, 선원의 모든 정보와 이력이 영구적으로 삭제됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <CrewDetailDialog
        open={detailDialogOpen}
        crew={viewingCrew}
        onClose={() => { setDetailDialogOpen(false); setViewingCrew(null); }}
        onEdit={(crew) => { setSelectedCrew(crew); setCrewDialogOpen(true); }}
        onDelete={(crew) => { setSelectedCrew(crew); setShowDeleteDialog(true); }}
      />
    </Layout>
  );
}

export default CrewManagementPage;