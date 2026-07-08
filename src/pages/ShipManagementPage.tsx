import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { msg } from '@/lib/messages';
import { getCurrentUser, getShips, getCompanies, getFleets, addShip, updateShip, deleteShip } from '@/lib/store';
import { supervisorService } from '@/services/supervisor.service';
import { getOnboardCountsByShip, type OnboardCount } from '@/services/ship-onboard-count.service';
import { useTabContext } from '@/contexts/TabContext';
import type { User, Ship, Company, Fleet } from '@/types/models';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, X, Trash2, ArrowLeft, RefreshCw, LayoutGrid, ListTree } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import ShipListGridView from '@/components/ship/ShipListGridView';
import ShipListTreeView from '@/components/ship/ShipListTreeView';
import ShipDialog from '@/components/ship/ShipDialog';
import ProtectedRoute from '@/components/ProtectedRoute';
import { usePermissions } from '@/hooks/usePermissions';
import { getEffectiveTemplateMapForShips, type SalaryTemplate } from '@/lib/salary-store';

export default function ShipManagementPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { openNewTab, closeTab, activeTabId } = useTabContext();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [ships, setShips] = useState<Ship[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [shipTemplateMap, setShipTemplateMap] = useState<Record<string, SalaryTemplate | null>>({});
  const [loading, setLoading] = useState(true);
  const [supervisedShipIds, setSupervisedShipIds] = useState<Set<string> | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'tree'>('grid');
  const [onboardCounts, setOnboardCounts] = useState<Map<string, OnboardCount>>(new Map());

  const permissions = usePermissions('ships');

  // 선박 상세(수정/등록)는 목록과 별개의 탭으로 열린다 — /ships?id=... 또는 /ships?mode=new
  const editId = searchParams.get('id');
  const isNew = searchParams.get('mode') === 'new';
  const isFormMode = isNew || !!editId;
  const [searchTerm, setSearchTerm] = useState('');
  
  // Filter states
  const [selectedOwner, setSelectedOwner] = useState<string>('all');
  const [selectedFleet, setSelectedFleet] = useState<string>('all');
  const [selectedShipType, setSelectedShipType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('active');

  // Bulk selection state
  const [selectedShipIds, setSelectedShipIds] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    name: '',
    owner_id: '',
    fleet_id: '',
    imo_number: '',
    call_sign: '',
    mmsi: '',
    flag: '',
    ship_type: '',
    gross_tonnage: '',
    dwt: '',
    gt: '',
    built_year: '',
    builder: '',
    shipyard: '',
    classification_society: '',
    port_of_registry: '',
    engine_type: '',
    engine_power: '',
    speed_max: '',
    speed_service: '',
    fuel_consumption: '',
    crew_capacity: '',
    passenger_capacity: '',
    cargo_capacity: '',
    length_overall: '',
    breadth: '',
    depth: '',
    draft: '',
    is_bbchp: false,
  });

  useEffect(() => {
    const loadUser = async () => {
      try {
        const user = await getCurrentUser();
        
        if (!user || !['ship_owner', 'ship_manager', 'admin', 'system_admin'].includes(user.role)) {
          navigate('/dashboard');
          return;
        }
        setCurrentUser(user);
        setFormData(prev => ({ ...prev, owner_id: user.company_id || '' }));
        
        // Set default owner filter for ship_owner role
        if (user.role === 'ship_owner' && user.company_id) {
          setSelectedOwner(user.company_id);
        }

        // 선박관리사(ship_manager)는 본인이 담당하는 선박만 보이도록 제한 (관리자/시스템관리자는 전체 노출)
        if (user.role === 'ship_manager') {
          const shipIds = await supervisorService.getSupervisedShips(user.id);
          setSupervisedShipIds(new Set(shipIds));
        }

        await loadData();
      } catch (error) {
        console.error('Error loading user:', error);
        setLoading(false);
      }
    };
    
    loadUser();
  }, [navigate]);

  const loadData = async () => {
    try {
      const [shipsData, companiesData, fleetsData] = await Promise.all([
        getShips(),
        getCompanies(),
        getFleets(),
      ]);

      setShips(shipsData);
      setCompanies(companiesData);
      setFleets(fleetsData);
      getEffectiveTemplateMapForShips(shipsData).then(setShipTemplateMap);
      getOnboardCountsByShip().then(setOnboardCounts).catch(console.error);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  // 선박 상세 탭에서 등록/수정/삭제가 일어나면 목록 탭에도 반영되도록 이벤트로 동기화한다
  // (목록·상세가 서로 다른 탭 인스턴스라 상세 쪽 state 변경이 목록에 자동 반영되지 않음).
  useEffect(() => {
    if (isFormMode) return;
    const handler = () => loadData();
    window.addEventListener('ship-data-changed', handler);
    return () => window.removeEventListener('ship-data-changed', handler);
  }, [isFormMode]);

  // 상세 탭: URL의 id/mode에 맞춰 폼 데이터를 동기화한다
  useEffect(() => {
    if (editId && ships.length > 0) {
      const ship = ships.find(s => s.id === editId);
      if (ship) populateFormFromShip(ship);
    } else if (isNew) {
      resetForm();
    }
  }, [editId, isNew, ships]); // eslint-disable-line react-hooks/exhaustive-deps

  // 선박관리사(ship_manager)는 본인이 담당하는 선박으로만 범위를 제한 (관리자/시스템관리자는 제한 없음)
  const scopedShips = useMemo(() => {
    if (currentUser?.role === 'ship_manager' && supervisedShipIds) {
      return ships.filter(ship => supervisedShipIds.has(ship.id));
    }
    return ships;
  }, [ships, currentUser, supervisedShipIds]);

  // Get owner companies that actually have ships, plus "no owner" option if applicable
  const availableOwnerCompanies = useMemo(() => {
    const ownerIds = new Set(scopedShips.map(ship => ship.owner_id).filter(Boolean));
    const hasShipsWithoutOwner = scopedShips.some(ship => !ship.owner_id);

    const ownersWithShips = companies.filter(c => c.type === 'owner' && ownerIds.has(c.id));

    return {
      companies: ownersWithShips,
      hasNoOwner: hasShipsWithoutOwner
    };
  }, [companies, scopedShips]);

  // Get fleets for selected owner - only show when specific owner is selected
  const availableFleets = useMemo(() => {
    if (selectedOwner === 'all' || selectedOwner === 'none') {
      return [];
    }
    const fleetIdsInScope = new Set(scopedShips.map(s => s.fleet_id).filter(Boolean));
    return fleets.filter(f => f.owner_id === selectedOwner && (currentUser?.role !== 'ship_manager' || fleetIdsInScope.has(f.id)));
  }, [fleets, selectedOwner, scopedShips, currentUser]);

  // Get unique ship types from ALL ships (not filtered) - this keeps all types visible
  const availableShipTypes = useMemo(() => {
    const types = new Set<string>();
    ships.forEach(ship => {
      if (ship.ship_type) {
        types.add(ship.ship_type);
      }
    });
    return Array.from(types).sort();
  }, [ships]);

  // Reset fleet filter when owner changes
  useEffect(() => {
    if (selectedOwner === 'all' || selectedOwner === 'none') {
      setSelectedFleet('all');
    }
  }, [selectedOwner]);

  const ownerNameById = useMemo(() => new Map(companies.map(c => [c.id, c.name])), [companies]);
  const fleetNameById = useMemo(() => new Map(fleets.map(f => [f.id, f.name])), [fleets]);

  // Use useMemo to prevent infinite loop
  const filteredShips = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return scopedShips.filter(ship => {
      // Role-based filtering
      if (currentUser && currentUser.role === 'ship_owner' && ship.owner_id !== currentUser.company_id) {
        return false;
      }

      // Search term filtering — 선박명/IMO 외에 선주사·플릿 이름으로도 검색 가능
      const ownerName = ship.owner_id ? (ownerNameById.get(ship.owner_id) || '') : '';
      const fleetName = ship.fleet_id ? (fleetNameById.get(ship.fleet_id) || '') : '';
      const matchesSearch = ship.name.toLowerCase().includes(term) ||
             (ship.imo_number && ship.imo_number.toLowerCase().includes(term)) ||
             (ship.imo && ship.imo.toLowerCase().includes(term)) ||
             ownerName.toLowerCase().includes(term) ||
             fleetName.toLowerCase().includes(term);

      if (!matchesSearch) return false;
      
      // Owner filter
      if (selectedOwner !== 'all') {
        if (selectedOwner === 'none') {
          // Filter for ships without owner
          if (ship.owner_id) return false;
        } else {
          // Filter for specific owner
          if (ship.owner_id !== selectedOwner) return false;
        }
      }
      
      // Fleet filter
      if (selectedFleet !== 'all' && ship.fleet_id !== selectedFleet) {
        return false;
      }
      
      // Ship type filter - match against actual ship.ship_type values
      if (selectedShipType !== 'all' && ship.ship_type !== selectedShipType) {
        return false;
      }

      // Status filter (활성/비활성) - 컬럼이 없는 과거 데이터는 활성으로 취급
      if (selectedStatus === 'active' && ship.is_active === false) return false;
      if (selectedStatus === 'inactive' && ship.is_active !== false) return false;

      return true;
    });
  }, [scopedShips, currentUser, searchTerm, selectedOwner, selectedFleet, selectedShipType, selectedStatus, ownerNameById, fleetNameById]);

  // Clear selection when filters change
  useEffect(() => {
    setSelectedShipIds([]);
  }, [searchTerm, selectedOwner, selectedFleet, selectedShipType, selectedStatus]);

  const totalItems = filteredShips.length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Generate a unique IMO if not provided
    const imoValue = formData.imo_number || `TEMP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const dwtValue = formData.dwt ? Number(formData.dwt) : 0;
    const gtValue = formData.gt ? Number(formData.gt) : (formData.gross_tonnage ? Number(formData.gross_tonnage) : 0);
    
    const shipData: Partial<Ship> = {
      name: formData.name,
      imo: imoValue, // Required field with unique constraint
      dwt: dwtValue, // Required field
      gt: gtValue, // Required field
      owner_id: formData.owner_id || undefined,
      // Explicitly set fleet_id to null when empty to clear existing fleet assignments
      fleet_id: formData.fleet_id ? formData.fleet_id : null,
      imo_number: formData.imo_number || undefined,
      call_sign: formData.call_sign || undefined,
      mmsi: formData.mmsi || undefined,
      flag: formData.flag || undefined,
      ship_type: formData.ship_type || undefined,
      gross_tonnage: formData.gross_tonnage ? Number(formData.gross_tonnage) : undefined,
      built_year: formData.built_year ? Number(formData.built_year) : undefined,
      builder: formData.builder || undefined,
      shipyard: formData.shipyard || undefined,
      classification_society: formData.classification_society || undefined,
      port_of_registry: formData.port_of_registry || undefined,
      engine_type: formData.engine_type || undefined,
      engine_power: formData.engine_power ? Number(formData.engine_power) : undefined,
      speed_max: formData.speed_max ? Number(formData.speed_max) : undefined,
      speed_service: formData.speed_service ? Number(formData.speed_service) : undefined,
      fuel_consumption: formData.fuel_consumption ? Number(formData.fuel_consumption) : undefined,
      crew_capacity: formData.crew_capacity ? Number(formData.crew_capacity) : undefined,
      passenger_capacity: formData.passenger_capacity ? Number(formData.passenger_capacity) : undefined,
      cargo_capacity: formData.cargo_capacity ? Number(formData.cargo_capacity) : undefined,
      length_overall: formData.length_overall ? Number(formData.length_overall) : undefined,
      breadth: formData.breadth ? Number(formData.breadth) : undefined,
      depth: formData.depth ? Number(formData.depth) : undefined,
      draft: formData.draft ? Number(formData.draft) : undefined,
      is_bbchp: formData.is_bbchp,
    };

    try {
      if (editId) {
        await updateShip(editId, shipData);
      } else {
        await addShip(shipData as Omit<Ship, 'id'>);
      }

      window.dispatchEvent(new CustomEvent('ship-data-changed'));
      closeTab(activeTabId!);
    } catch (error) {
      console.error('Error saving ship:', error);
      alert('선박 저장 중 오류가 발생했습니다. IMO 번호가 중복되었는지 확인해주세요.');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      owner_id: currentUser?.company_id || '',
      fleet_id: '',
      imo_number: '',
      call_sign: '',
      mmsi: '',
      flag: '',
      ship_type: '',
      gross_tonnage: '',
      dwt: '',
      gt: '',
      built_year: '',
      builder: '',
      shipyard: '',
      classification_society: '',
      port_of_registry: '',
      engine_type: '',
      engine_power: '',
      speed_max: '',
      speed_service: '',
      fuel_consumption: '',
      crew_capacity: '',
      passenger_capacity: '',
      cargo_capacity: '',
      length_overall: '',
      breadth: '',
      depth: '',
      draft: '',
      is_bbchp: false,
    });
  };

  const populateFormFromShip = (ship: Ship) => {
    setFormData({
      name: ship.name,
      owner_id: ship.owner_id || '',
      fleet_id: ship.fleet_id || '',
      imo_number: ship.imo_number || ship.imo || '',
      call_sign: ship.call_sign || '',
      mmsi: ship.mmsi || '',
      flag: ship.flag || '',
      ship_type: ship.ship_type || '',
      gross_tonnage: ship.gross_tonnage?.toString() || ship.gt?.toString() || '',
      dwt: ship.dwt?.toString() || '',
      gt: ship.gt?.toString() || '',
      built_year: ship.built_year?.toString() || '',
      builder: ship.builder || '',
      shipyard: ship.shipyard || '',
      classification_society: ship.classification_society || '',
      port_of_registry: ship.port_of_registry || '',
      engine_type: ship.engine_type || '',
      engine_power: ship.engine_power?.toString() || '',
      speed_max: ship.speed_max?.toString() || '',
      speed_service: ship.speed_service?.toString() || '',
      fuel_consumption: ship.fuel_consumption?.toString() || '',
      crew_capacity: ship.crew_capacity?.toString() || '',
      passenger_capacity: ship.passenger_capacity?.toString() || '',
      cargo_capacity: ship.cargo_capacity?.toString() || '',
      length_overall: ship.length_overall?.toString() || '',
      breadth: ship.breadth?.toString() || '',
      depth: ship.depth?.toString() || '',
      draft: ship.draft?.toString() || '',
      is_bbchp: ship.is_bbchp || false,
    });
  };

  const handleEdit = (ship: Ship) => {
    openNewTab(`/ships?id=${ship.id}`, `${ship.name} 수정`);
  };

  const handleDelete = async (id: string) => {
    if (confirm('이 선박을 삭제하시겠습니까?')) {
      await deleteShip(id);
      await loadData();
      setSelectedShipIds(prev => prev.filter(shipId => shipId !== id));
      window.dispatchEvent(new CustomEvent('ship-data-changed'));
    }
  };

  const handleToggleActive = async (ship: Ship) => {
    await updateShip(ship.id, { is_active: !(ship.is_active !== false) });
    await loadData();
    window.dispatchEvent(new CustomEvent('ship-data-changed'));
  };

  const handleBulkDelete = async () => {
    if (selectedShipIds.length === 0) return;

    const shipNames = ships
      .filter(ship => selectedShipIds.includes(ship.id))
      .map(ship => ship.name)
      .join(', ');

    if (confirm(msg.ship.deleteConfirm(selectedShipIds.length, shipNames))) {
      try {
        await Promise.all(selectedShipIds.map(id => deleteShip(id)));
        await loadData();
        setSelectedShipIds([]);
        window.dispatchEvent(new CustomEvent('ship-data-changed'));
      } catch (error) {
        console.error('Error deleting ships:', error);
        alert('선박 삭제 중 오류가 발생했습니다.');
      }
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedOwner(currentUser && currentUser.role === 'ship_owner' && currentUser.company_id ? currentUser.company_id : 'all');
    setSelectedFleet('all');
    setSelectedShipType('all');
    setSelectedStatus('active');
  };

  const hasActiveFilters = searchTerm ||
    (selectedOwner !== 'all' && !(currentUser && currentUser.role === 'ship_owner' && selectedOwner === currentUser.company_id)) ||
    selectedFleet !== 'all' ||
    selectedShipType !== 'all' ||
    selectedStatus !== 'active';

  const getOwnerDisplayName = (ownerId: string) => {
    if (ownerId === 'none') return '선주 없음';
    return availableOwnerCompanies.companies.find(c => c.id === ownerId)?.name || '';
  };

  if (loading) {
    return (
      <>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3"></div>
            <p className="text-sm text-gray-600">로딩 중...</p>
          </div>
        </div>
      </>
    );
  }

  if (!currentUser) {
    return null;
  }

  return (
    <ProtectedRoute resource="ships">
      <>
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-center">
                {isFormMode ? (
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => closeTab(activeTabId!)}>
                      <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <div>
                      <CardTitle className="text-base">{editId ? '선박 정보 수정' : '선박 등록'}</CardTitle>
                      <p className="text-xs text-gray-500 mt-0.5">선박의 상세 정보를 입력하세요</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <CardTitle className="text-base">선박 목록</CardTitle>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={loadData} disabled={loading}>
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        새로고침
                      </Button>
                      {permissions.canDelete && selectedShipIds.length > 0 && (
                        <Button
                          size="sm"
                          variant="destructive"
                          className="gap-1.5 h-8"
                          onClick={handleBulkDelete}
                        >
                          <Trash2 className="w-4 h-4" />
                          선택 삭제 ({selectedShipIds.length})
                        </Button>
                      )}
                      {permissions.canCreate && (
                        <Button
                          size="sm"
                          className="gap-1.5 h-8"
                          onClick={() => openNewTab('/ships?mode=new', '선박 등록', true)}
                        >
                          <Plus className="w-4 h-4" />
                          선박 등록
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              {isFormMode ? (
                <ShipDialog
                  formData={formData}
                  onFormDataChange={setFormData}
                  onSubmit={handleSubmit}
                  isEditing={!!editId}
                  companies={companies}
                  shipId={editId || undefined}
                  salaryTemplate={editId ? shipTemplateMap[editId] ?? null : null}
                  onClose={() => closeTab(activeTabId!)}
                />
              ) : (
              <>{/* Search and Filters */}
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {currentUser.role === 'ship_manager' && (
                    <Select 
                      value={selectedOwner} 
                      onValueChange={setSelectedOwner}
                    >
                      <SelectTrigger className="w-48 h-9 text-sm">
                        <SelectValue placeholder="선주사 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all" className="text-sm">전체 선주사</SelectItem>
                        {availableOwnerCompanies.hasNoOwner && (
                          <SelectItem value="none" className="text-sm text-gray-500">선주 없음</SelectItem>
                        )}
                        {availableOwnerCompanies.companies.map(company => (
                          <SelectItem key={company.id} value={String(company.id)} className="text-sm">
                            {company.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  
                  <Select 
                    value={selectedFleet} 
                    onValueChange={setSelectedFleet}
                    disabled={selectedOwner === 'all' || selectedOwner === 'none' || availableFleets.length === 0}
                  >
                    <SelectTrigger className="w-40 h-9 text-sm">
                      <SelectValue placeholder="플릿 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-sm">전체 플릿</SelectItem>
                      {availableFleets.map(fleet => (
                        <SelectItem key={fleet.id} value={String(fleet.id)} className="text-sm">
                          {fleet.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  <Select
                    value={selectedShipType}
                    onValueChange={setSelectedShipType}
                    disabled={availableShipTypes.length === 0}
                  >
                    <SelectTrigger className="w-40 h-9 text-sm">
                      <SelectValue placeholder="선종 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-sm">전체 선종</SelectItem>
                      {availableShipTypes.map(type => (
                        <SelectItem key={type} value={type} className="text-sm">
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                    <SelectTrigger className="w-32 h-9 text-sm">
                      <SelectValue placeholder="상태" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-sm">전체 상태</SelectItem>
                      <SelectItem value="active" className="text-sm">활성</SelectItem>
                      <SelectItem value="inactive" className="text-sm">비활성</SelectItem>
                    </SelectContent>
                  </Select>

                  {hasActiveFilters && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearFilters}
                      className="h-9 gap-1.5 text-sm"
                    >
                      <X className="w-3.5 h-3.5" />
                      필터 초기화
                    </Button>
                  )}
                </div>

                {/* Active Filters Display */}
                {hasActiveFilters && (
                  <div className="flex flex-wrap gap-1.5">
                    {searchTerm && (
                      <Badge variant="secondary" className="text-xs">
                        검색: {searchTerm}
                      </Badge>
                    )}
                    {selectedOwner !== 'all' && !(currentUser.role === 'ship_owner' && selectedOwner === currentUser.company_id) && (
                      <Badge variant="secondary" className="text-xs">
                        선주사: {getOwnerDisplayName(selectedOwner)}
                      </Badge>
                    )}
                    {selectedFleet !== 'all' && (
                      <Badge variant="secondary" className="text-xs">
                        플릿: {fleets.find(f => f.id === selectedFleet)?.name}
                      </Badge>
                    )}
                    {selectedShipType !== 'all' && (
                      <Badge variant="secondary" className="text-xs">
                        선종: {selectedShipType}
                      </Badge>
                    )}
                  </div>
                )}

                {/* Results Count and Items Per Page */}
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">
                    총 {totalItems}척의 선박
                    {selectedShipIds.length > 0 && msg.ship.selectedCount(selectedShipIds.length)}
                  </p>
                </div>
              </div>

              <Tabs value={viewMode} onValueChange={v => setViewMode(v as 'grid' | 'tree')}>
                <TabsList className="h-9 gap-1">
                  <TabsTrigger value="grid" className="text-xs h-8 gap-1.5">
                    <LayoutGrid className="w-3.5 h-3.5" />그리드
                  </TabsTrigger>
                  <TabsTrigger value="tree" className="text-xs h-8 gap-1.5">
                    <ListTree className="w-3.5 h-3.5" />트리구조
                  </TabsTrigger>
                </TabsList>

                <Input
                  placeholder={viewMode === 'grid' ? '선명, IMO, 선주사, 플릿으로 검색...' : '선명, 선주사로 검색...'}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="max-w-xs h-9 text-sm mt-2"
                />

                <TabsContent value="grid" className="mt-3">
                  <ShipListGridView
                    ships={filteredShips}
                    companies={companies}
                    fleets={fleets}
                    shipTemplateMap={shipTemplateMap}
                    onboardCounts={onboardCounts}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onToggleActive={permissions.canEdit ? handleToggleActive : undefined}
                    canEdit={permissions.canEdit}
                    canDelete={permissions.canDelete}
                    selectedShips={selectedShipIds}
                    onSelectionChange={setSelectedShipIds}
                  />
                </TabsContent>
                <TabsContent value="tree" className="mt-3">
                  <ShipListTreeView
                    ships={filteredShips}
                    companies={companies}
                    fleets={fleets}
                    onboardCounts={onboardCounts}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onToggleActive={permissions.canEdit ? handleToggleActive : undefined}
                    canEdit={permissions.canEdit}
                    canDelete={permissions.canDelete}
                  />
                </TabsContent>
              </Tabs>
              </>
              )}
            </CardContent>
          </Card>
        </div>
      </>
    </ProtectedRoute>
  );
}