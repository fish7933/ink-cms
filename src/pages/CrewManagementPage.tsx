import { useState, useEffect } from "react";
import { Plus, Search, Filter, X, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { CrewStatusTable } from "@/components/crew/CrewStatusTable";
import { CrewFormDialog } from "@/components/crew/CrewFormDialog";
import { CrewStatusDialog } from "@/components/crew/CrewStatusDialog";
import { crewService, type CrewWithDetails } from "@/services/crew.service";
import { supabase } from "@/lib/supabase";
import type { Rank, Company, Fleet, Ship } from "@/types/models";
import Layout from "@/components/Layout";
import { useToast } from "@/hooks/use-toast";

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
  const [selectedCrewIds, setSelectedCrewIds] = useState<string[]>([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOwner, setSelectedOwner] = useState("all");
  const [selectedFleet, setSelectedFleet] = useState("all");
  const [selectedShip, setSelectedShip] = useState("all");
  const [selectedRank, setSelectedRank] = useState("all");
  const [selectedRankCategory, setSelectedRankCategory] = useState("all");
  const [selectedManningAgency, setSelectedManningAgency] = useState("all");
  const [selectedShipType, setSelectedShipType] = useState("all");
  const [minAge, setMinAge] = useState("");
  const [maxAge, setMaxAge] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [crewDialogOpen, setCrewDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [selectedCrew, setSelectedCrew] = useState<CrewWithDetails | null>(null);

  useEffect(() => { loadData(); }, []);
  useEffect(() => { filterCrew(); }, [crewMembers, searchTerm, selectedOwner, selectedFleet, selectedShip, selectedRank, selectedRankCategory, selectedManningAgency, selectedShipType, minAge, maxAge, activeTab]);
  useEffect(() => { setCurrentPage(1); }, [filteredCrew.length]);
  useEffect(() => {
    if (selectedOwner !== "all") loadFleets(selectedOwner);
    else { setFleets([]); setSelectedFleet("all"); }
  }, [selectedOwner]);
  useEffect(() => {
    if (selectedFleet !== "all") loadShips(selectedFleet);
    else if (selectedOwner !== "all") loadShipsByOwner(selectedOwner);
    else { setShips([]); setSelectedShip("all"); }
  }, [selectedFleet, selectedOwner]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [crewData, ranksData, companiesData] = await Promise.all([
        crewService.getAllWithDetails(),
        supabase.from("ranks").select("*").order("display_order"),
        supabase.from("companies").select("*"),
      ]);
      setCrewMembers(crewData);
      if (ranksData.data) setRanks(ranksData.data);
      if (companiesData.data) {
        setOwners(companiesData.data.filter((c: Company) => c.type === "owner"));
        setManningAgencies(companiesData.data.filter((c: Company) => c.type === "manning"));
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const loadFleets = async (ownerId: string) => {
    const { data } = await supabase.from("fleets").select("*").eq("owner_id", ownerId);
    if (data) setFleets(data);
  };
  const loadShips = async (fleetId: string) => {
    const { data } = await supabase.from("ships").select("*").eq("fleet_id", fleetId);
    if (data) setShips(data);
  };
  const loadShipsByOwner = async (ownerId: string) => {
    const { data } = await supabase.from("ships").select("*").eq("owner_id", ownerId);
    if (data) setShips(data);
  };

  const filterCrew = () => {
    let filtered = [...crewMembers];
    if (activeTab !== "all") filtered = filtered.filter(c => c.current_status === activeTab);
    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      filtered = filtered.filter(c =>
        c.name.toLowerCase().includes(t) ||
        c.rank_name.toLowerCase().includes(t) ||
        c.rank_code.toLowerCase().includes(t) ||
        c.passport_number?.toLowerCase().includes(t) ||
        c.seaman_book_number?.toLowerCase().includes(t)
      );
    }
    if (selectedOwner !== "all") filtered = filtered.filter(c => c.owner_id === selectedOwner);
    if (selectedFleet !== "all") filtered = filtered.filter(c => c.fleet_id === selectedFleet);
    if (selectedShip !== "all") filtered = filtered.filter(c => c.current_ship_id === selectedShip);
    if (selectedRank !== "all") filtered = filtered.filter(c => c.rank_id === selectedRank);
    if (selectedRankCategory !== "all") filtered = filtered.filter(c => c.rank_category === selectedRankCategory);
    if (selectedManningAgency !== "all") filtered = filtered.filter(c => c.manning_agency_id === selectedManningAgency);
    if (minAge || maxAge) {
      filtered = filtered.filter(c => {
        if (!c.age) return false;
        if (minAge && c.age < parseInt(minAge)) return false;
        if (maxAge && c.age > parseInt(maxAge)) return false;
        return true;
      });
    }
    setFilteredCrew(filtered);
  };

  const handleView = (crew: CrewWithDetails) => {
    setSelectedCrew(crew);
    setCrewDialogOpen(true);
  };

  const handleAddCrew = () => { setSelectedCrew(null); setCrewDialogOpen(true); };
  const handleChangeStatus = (crew: CrewWithDetails) => { setSelectedCrew(crew); setStatusDialogOpen(true); };

  const handleCrewDialogClose = async (saved: boolean, crewId?: string) => {
    setCrewDialogOpen(false);
    setSelectedCrew(null);
    if (saved) await loadData();
  };

  const handleSelectionChange = (crewId: string, checked: boolean) => {
    if (checked) setSelectedCrewIds(prev => [...prev, crewId]);
    else setSelectedCrewIds(prev => prev.filter(id => id !== crewId));
  };
  const handleSelectAll = (checked: boolean) => {
    if (checked) setSelectedCrewIds(paginatedCrew.map(c => c.id));
    else setSelectedCrewIds([]);
  };

  const handleBulkDelete = () => {
    if (selectedCrewIds.length === 0) { toast({ title: "선원을 선택하세요", variant: "destructive" }); return; }
    setShowDeleteDialog(true);
  };

  const confirmDelete = async () => {
    try {
      const { error } = await supabase.from("crew_members").delete().in("id", selectedCrewIds);
      if (error) throw error;
      toast({ title: "삭제 완료", description: `${selectedCrewIds.length}명의 선원이 삭제되었습니다.` });
      setSelectedCrewIds([]);
      setShowDeleteDialog(false);
      await loadData();
    } catch (e) {
      console.error(e);
      toast({ title: "삭제 실패", variant: "destructive" });
    }
  };

  const clearFilters = () => {
    setSearchTerm(""); setSelectedOwner("all"); setSelectedFleet("all"); setSelectedShip("all");
    setSelectedRank("all"); setSelectedRankCategory("all"); setSelectedManningAgency("all");
    setSelectedShipType("all"); setMinAge(""); setMaxAge("");
  };

  const getStatusCount = (status: string) =>
    status === "all" ? crewMembers.length : crewMembers.filter(c => c.current_status === status).length;

  const totalPages = Math.ceil(filteredCrew.length / itemsPerPage);
  const paginatedCrew = filteredCrew.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const goToPage = (page: number) => setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  const shipTypes = ["Tanker", "Bulk Carrier", "Container", "General Cargo", "LNG/LPG"];

  const tableProps = {
    crew: paginatedCrew,
    selectedCrewIds,
    onSelectionChange: handleSelectionChange,
    onSelectAll: handleSelectAll,
    onView: handleView,
    onEdit: handleView,
    onChangeStatus: handleChangeStatus,
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3"></div>
            <p className="text-sm text-gray-600">로딩 중...</p>
          </div>
        </div>
      </Layout>
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
                  <Button onClick={handleBulkDelete} size="sm" variant="destructive" className="gap-1.5 h-8">
                    <Trash2 className="w-4 h-4" />선택 삭제 ({selectedCrewIds.length})
                  </Button>
                )}
                <Button onClick={handleAddCrew} size="sm" className="gap-1.5 h-8">
                  <Plus className="w-4 h-4" />선원 등록
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-3">
              <TabsList>
                <TabsTrigger value="all">전체 ({getStatusCount("all")})</TabsTrigger>
                <TabsTrigger value="registered">등록 ({getStatusCount("registered")})</TabsTrigger>
                <TabsTrigger value="available">대기 ({getStatusCount("available")})</TabsTrigger>
                <TabsTrigger value="on_board">승선 ({getStatusCount("on_board")})</TabsTrigger>
                <TabsTrigger value="on_leave">휴가 ({getStatusCount("on_leave")})</TabsTrigger>
                <TabsTrigger value="retired">퇴직 ({getStatusCount("retired")})</TabsTrigger>
              </TabsList>
              <div className="space-y-3">
                <div className="flex gap-2 items-center">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                    <Input placeholder="이름, 직급, 여권번호 검색..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 h-9 text-sm" />
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)} className="h-9 text-sm">
                    <Filter className="w-4 h-4 mr-2" />필터
                  </Button>
                  {(selectedOwner !== "all" || selectedRank !== "all" || minAge || maxAge) && (
                    <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 text-sm">
                      <X className="w-4 h-4 mr-2" />초기화
                    </Button>
                  )}
                </div>
                {showFilters && (
                  <div className="grid grid-cols-4 gap-3 p-3 border rounded-lg bg-muted/50">
                    <div><Label className="text-xs">선주사</Label><Select value={selectedOwner} onValueChange={setSelectedOwner}><SelectTrigger className="h-9 text-sm mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체</SelectItem>{owners.map(o => <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>)}</SelectContent></Select></div>
                    <div><Label className="text-xs">플릿</Label><Select value={selectedFleet} onValueChange={setSelectedFleet} disabled={selectedOwner === "all"}><SelectTrigger className="h-9 text-sm mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체</SelectItem>{fleets.map(f => <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>)}</SelectContent></Select></div>
                    <div><Label className="text-xs">선박</Label><Select value={selectedShip} onValueChange={setSelectedShip} disabled={selectedOwner === "all"}><SelectTrigger className="h-9 text-sm mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체</SelectItem>{ships.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent></Select></div>
                    <div><Label className="text-xs">직급</Label><Select value={selectedRank} onValueChange={setSelectedRank}><SelectTrigger className="h-9 text-sm mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체</SelectItem>{ranks.map(r => <SelectItem key={r.id} value={String(r.id)}>{r.name} ({r.rank_code})</SelectItem>)}</SelectContent></Select></div>
                    <div><Label className="text-xs">사관/부원</Label><Select value={selectedRankCategory} onValueChange={setSelectedRankCategory}><SelectTrigger className="h-9 text-sm mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체</SelectItem><SelectItem value="officer">사관</SelectItem><SelectItem value="rating">부원</SelectItem></SelectContent></Select></div>
                    <div><Label className="text-xs">매닝사</Label><Select value={selectedManningAgency} onValueChange={setSelectedManningAgency}><SelectTrigger className="h-9 text-sm mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체</SelectItem>{manningAgencies.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}</SelectContent></Select></div>
                    <div><Label className="text-xs">선종</Label><Select value={selectedShipType} onValueChange={setSelectedShipType}><SelectTrigger className="h-9 text-sm mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체</SelectItem>{shipTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
                    <div><Label className="text-xs">나이 범위</Label><div className="flex gap-2 mt-1"><Input type="number" placeholder="최소" value={minAge} onChange={e => setMinAge(e.target.value)} className="w-20 h-9 text-sm" /><span className="self-center">-</span><Input type="number" placeholder="최대" value={maxAge} onChange={e => setMaxAge(e.target.value)} className="w-20 h-9 text-sm" /></div></div>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <p className="text-xs text-gray-500">총 {filteredCrew.length}명{selectedCrewIds.length > 0 && ` · ${selectedCrewIds.length}명 선택됨`}</p>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">페이지당:</Label>
                    <Select value={itemsPerPage.toString()} onValueChange={v => { setItemsPerPage(parseInt(v)); setCurrentPage(1); }}>
                      <SelectTrigger className="h-8 w-20 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="10">10</SelectItem><SelectItem value="20">20</SelectItem><SelectItem value="50">50</SelectItem><SelectItem value="100">100</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              {["all","registered","available","on_board","on_leave","retired"].map(tab => (
                <TabsContent key={tab} value={tab}><CrewStatusTable {...tableProps} /></TabsContent>
              ))}
            </Tabs>
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-2 pt-3 border-t">
                <Button variant="outline" size="sm" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1} className="h-8"><ChevronLeft className="w-4 h-4" /></Button>
                <div className="flex gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let p: number;
                    if (totalPages <= 5) p = i + 1;
                    else if (currentPage <= 3) p = i + 1;
                    else if (currentPage >= totalPages - 2) p = totalPages - 4 + i;
                    else p = currentPage - 2 + i;
                    return <Button key={p} variant={currentPage === p ? "default" : "outline"} size="sm" onClick={() => goToPage(p)} className="h-8 w-8 p-0">{p}</Button>;
                  })}
                </div>
                <Button variant="outline" size="sm" onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages} className="h-8"><ChevronRight className="w-4 h-4" /></Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <CrewFormDialog open={crewDialogOpen} crew={selectedCrew} onClose={handleCrewDialogClose} />

      <CrewStatusDialog open={statusDialogOpen} crew={selectedCrew} onClose={async (saved) => { setStatusDialogOpen(false); setSelectedCrew(null); if (saved) await loadData(); }} />

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>선원 삭제 확인</AlertDialogTitle>
            <AlertDialogDescription>선택한 {selectedCrewIds.length}명의 선원을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}

export default CrewManagementPage;
