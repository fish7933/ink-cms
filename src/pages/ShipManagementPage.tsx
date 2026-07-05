import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { msg } from '@/lib/messages';
import { getCurrentUser, getShips, getCompanies, getFleets, addShip, updateShip, deleteShip } from '@/lib/store';
import type { User, Ship, Company, Fleet } from '@/types/models';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, X, Trash2, ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import ShipTree from '@/components/ship/ShipTree';
import ShipDialog from '@/components/ship/ShipDialog';
import ProtectedRoute from '@/components/ProtectedRoute';
import { usePermissions } from '@/hooks/usePermissions';
import { getEffectiveTemplateMapForShips, type SalaryTemplate } from '@/lib/salary-store';

export default function ShipManagementPage() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [ships, setShips] = useState<Ship[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [shipTemplateMap, setShipTemplateMap] = useState<Record<string, SalaryTemplate | null>>({});
  const [loading, setLoading] = useState(true);

  const permissions = usePermissions('ships');

  const [formView, setFormView] = useState<{ ship?: Ship } | null>(null);
  const [editingShip, setEditingShip] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Filter states
  const [selectedOwner, setSelectedOwner] = useState<string>('all');
  const [selectedFleet, setSelectedFleet] = useState<string>('all');
  const [selectedShipType, setSelectedShipType] = useState<string>('all');

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
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Get owner companies that actually have ships, plus "no owner" option if applicable
  const availableOwnerCompanies = useMemo(() => {
    const ownerIds = new Set(ships.map(ship => ship.owner_id).filter(Boolean));
    const hasShipsWithoutOwner = ships.some(ship => !ship.owner_id);
    
    const ownersWithShips = companies.filter(c => c.type === 'owner' && ownerIds.has(c.id));
    
    return {
      companies: ownersWithShips,
      hasNoOwner: hasShipsWithoutOwner
    };
  }, [companies, ships]);
  
  // Get fleets for selected owner - only show when specific owner is selected
  const availableFleets = useMemo(() => {
    if (selectedOwner === 'all' || selectedOwner === 'none') {
      return [];
    }
    return fleets.filter(f => f.owner_id === selectedOwner);
  }, [fleets, selectedOwner]);

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

  // Use useMemo to prevent infinite loop
  const filteredShips = useMemo(() => {
    return ships.filter(ship => {
      // Role-based filtering
      if (currentUser && currentUser.role === 'ship_owner' && ship.owner_id !== currentUser.company_id) {
        return false;
      }
      
      // Search term filtering
      const matchesSearch = ship.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
             (ship.imo_number && ship.imo_number.toLowerCase().includes(searchTerm.toLowerCase())) ||
             (ship.imo && ship.imo.toLowerCase().includes(searchTerm.toLowerCase()));
      
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
      
      return true;
    });
  }, [ships, currentUser, searchTerm, selectedOwner, selectedFleet, selectedShipType]);

  // Clear selection when filters change
  useEffect(() => {
    setSelectedShipIds([]);
  }, [searchTerm, selectedOwner, selectedFleet, selectedShipType]);

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
      if (editingShip) {
        await updateShip(editingShip, shipData);
      } else {
        await addShip(shipData as Omit<Ship, 'id'>);
      }

      await loadData();
      setFormView(null);
      resetForm();
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
    setEditingShip(null);
  };

  const handleEdit = (ship: Ship) => {
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
    setEditingShip(ship.id);
    setFormView({ ship });
  };

  const handleDelete = async (id: string) => {
    if (confirm('이 선박을 삭제하시겠습니까?')) {
      await deleteShip(id);
      await loadData();
      setSelectedShipIds(prev => prev.filter(shipId => shipId !== id));
    }
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
  };

  const hasActiveFilters = searchTerm || 
    (selectedOwner !== 'all' && !(currentUser && currentUser.role === 'ship_owner' && selectedOwner === currentUser.company_id)) || 
    selectedFleet !== 'all' || 
    selectedShipType !== 'all';

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
                {formView !== null ? (
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setFormView(null); resetForm(); }}>
                      <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <div>
                      <CardTitle className="text-base">{editingShip ? '선박 정보 수정' : '선박 등록'}</CardTitle>
                      <p className="text-xs text-gray-500 mt-0.5">선박의 상세 정보를 입력하세요</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <CardTitle className="text-base">선박 목록</CardTitle>
                    <div className="flex gap-2">
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
                          onClick={() => { resetForm(); setFormView({}); }}
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
              {formView !== null ? (
                <ShipDialog
                  formData={formData}
                  onFormDataChange={setFormData}
                  onSubmit={handleSubmit}
                  isEditing={!!editingShip}
                  companies={companies}
                  shipId={editingShip || undefined}
                  salaryTemplate={editingShip ? shipTemplateMap[editingShip] ?? null : null}
                  onClose={() => { setFormView(null); resetForm(); }}
                />
              ) : (
              <>{/* Search and Filters */}
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Input
                    placeholder="선명 또는 IMO로 검색..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="max-w-xs h-9 text-sm"
                  />
                  
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

              <ShipTree
                ships={filteredShips}
                companies={companies}
                fleets={fleets}
                shipTemplateMap={shipTemplateMap}
                onEdit={handleEdit}
                onDelete={handleDelete}
                canEdit={permissions.canEdit}
                canDelete={permissions.canDelete}
                selectedShips={selectedShipIds}
                onSelectionChange={setSelectedShipIds}
              />
              </>
              )}
            </CardContent>
          </Card>
        </div>
      </>
    </ProtectedRoute>
  );
}