import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  getCurrentUser, 
  getCompanies, 
  getShips, 
  getFleets,
  getSalaryTables,
  getShipOwnerUsers,
  addCompany,
  updateCompany,
  deleteCompany,
  addSalaryTable,
  updateSalaryTable,
  checkFleetDependencies,
  checkCompanyDependencies
} from '@/lib/store';
import type { User, Company, Ship, Fleet, SalaryTable } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Layers, Ship as ShipIcon, User as UserIcon } from 'lucide-react';
import Layout from '@/components/Layout';
import CompanyTable from '@/components/company/CompanyTable';
import CompanyDialog from '@/components/company/CompanyDialog';
import SalaryTable from '@/components/salary/SalaryTable';
import SalaryDialog from '@/components/salary/SalaryDialog';
import ProtectedRoute from '@/components/ProtectedRoute';
import { usePermissions } from '@/hooks/usePermissions';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Pencil, Trash2, Container, Anchor, Waves, AlertTriangle } from 'lucide-react';

export default function CompanyManagementPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const companyType = searchParams.get('type'); // 'owner' or 'manning'
  
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [ships, setShips] = useState<Ship[]>([]);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [salaryTables, setSalaryTables] = useState<SalaryTable[]>([]);
  const [shipOwnerUsers, setShipOwnerUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCompanyForShips, setSelectedCompanyForShips] = useState<string | null>(null);

  const permissions = usePermissions('companies');

  const [isCompanyDialogOpen, setIsCompanyDialogOpen] = useState(false);
  const [isSalaryDialogOpen, setIsSalaryDialogOpen] = useState(false);
  const [isFleetDialogOpen, setIsFleetDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<string | null>(null);
  const [editingSalary, setEditingSalary] = useState<string | null>(null);
  const [editingFleet, setEditingFleet] = useState<string | null>(null);
  const [selectedCompanyForFleet, setSelectedCompanyForFleet] = useState<string | null>(null);

  // Fleet deletion confirmation dialog state
  const [fleetToDelete, setFleetToDelete] = useState<string | null>(null);
  const [fleetDependencies, setFleetDependencies] = useState<{
    crewCount: number;
    shipCount: number;
    salaryAssignmentCount: number;
  } | null>(null);

  // Company deletion confirmation dialog state
  const [companyToDelete, setCompanyToDelete] = useState<Company | null>(null);
  const [companyDependencies, setCompanyDependencies] = useState<{
    crewCount: number;
    shipCount: number;
    fleetCount: number;
  } | null>(null);

  const [companyFormData, setCompanyFormData] = useState({
    name: '',
    type: 'owner' as 'owner' | 'manning',
    country: '',
    contact_person: '',
    email: '',
    phone: '',
    default_officer_contract_months: undefined as number | undefined,
    default_rating_contract_months: undefined as number | undefined,
    manager_id: undefined as string | undefined,
  });

  const [salaryFormData, setSalaryFormData] = useState({
    ship_id: '',
    rank: '',
    onboard_salary: '',
    leave_salary: '',
    special_allowance: '',
    currency: 'USD',
  });

  const [fleetFormData, setFleetFormData] = useState({
    name: '',
    description: '',
    owner_id: '',
    manager_id: undefined as string | undefined,
  });

  useEffect(() => {
    const loadUser = async () => {
      const user = await getCurrentUser();
      if (!user || !['ship_manager', 'ship_owner'].includes(user.role)) {
      navigate('/dashboard');
      return;
    }
    setCurrentUser(user);
    loadData();
    };
    
    loadUser();
  }, [navigate]);

  const loadData = async () => {
    try {
      const [companiesData, shipsData, fleetsData, salariesData, ownersData] = await Promise.all([
        getCompanies(),
        getShips(),
        getFleets(),
        getSalaryTables(),
        getShipOwnerUsers(),
      ]);
      setCompanies(companiesData);
      setShips(shipsData);
      setFleets(fleetsData);
      setSalaryTables(salariesData);
      setShipOwnerUsers(ownersData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!currentUser || loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">데이터를 불러오는 중...</p>
          </div>
        </div>
      </Layout>
    );
  }

  const handleCompanySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const submitData: Partial<Company> = {
      name: companyFormData.name,
      type: companyFormData.type,
      phone: companyFormData.phone,
    };

    // Only include these fields for manning companies
    if (companyFormData.type === 'manning') {
      submitData.country = companyFormData.country;
      submitData.contact_person = companyFormData.contact_person;
      submitData.email = companyFormData.email;
    }

    // Only include contract periods and manager for owner companies
    if (companyFormData.type === 'owner') {
      if (companyFormData.default_officer_contract_months) {
        submitData.default_officer_contract_months = companyFormData.default_officer_contract_months;
      }
      if (companyFormData.default_rating_contract_months) {
        submitData.default_rating_contract_months = companyFormData.default_rating_contract_months;
      }
      if (companyFormData.manager_id) {
        submitData.manager_id = companyFormData.manager_id;
      }
    }
    
    if (editingCompany) {
      await updateCompany(editingCompany, submitData);
    } else {
      await addCompany(submitData);
    }

    await loadData();
    setIsCompanyDialogOpen(false);
    resetCompanyForm();
  };

  const handleDeleteCompanyClick = async (company: Company) => {
    try {
      // Check dependencies first
      const deps = await checkCompanyDependencies(company.id);
      setCompanyDependencies(deps);
      setCompanyToDelete(company);
    } catch (error) {
      console.error('Error checking company dependencies:', error);
      alert('회사 정보를 확인하는 중 오류가 발생했습니다.');
    }
  };

  const handleConfirmDeleteCompany = async () => {
    if (!companyToDelete) return;

    try {
      await deleteCompany(companyToDelete.id);
      await loadData();
      setCompanyToDelete(null);
      setCompanyDependencies(null);
    } catch (error) {
      console.error('Error deleting company:', error);
      alert('회사 삭제 중 오류가 발생했습니다.');
    }
  };

  const handleSalarySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const salaryData = {
      ship_id: salaryFormData.ship_id || undefined,
      rank: salaryFormData.rank,
      onboard_salary: Number(salaryFormData.onboard_salary),
      leave_salary: Number(salaryFormData.leave_salary),
      special_allowance: salaryFormData.special_allowance ? Number(salaryFormData.special_allowance) : undefined,
      currency: salaryFormData.currency,
    };

    if (editingSalary) {
      await updateSalaryTable(editingSalary, salaryData);
    } else {
      await addSalaryTable(salaryData);
    }

    await loadData();
    setIsSalaryDialogOpen(false);
    resetSalaryForm();
  };

  const handleFleetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const { addFleet, updateFleet } = await import('@/lib/store');
    
    if (editingFleet) {
      await updateFleet(editingFleet, {
        name: fleetFormData.name,
        description: fleetFormData.description || undefined,
        manager_id: fleetFormData.manager_id || undefined,
      });
    } else {
      await addFleet({
        name: fleetFormData.name,
        description: fleetFormData.description || undefined,
        owner_id: fleetFormData.owner_id,
        manager_id: fleetFormData.manager_id || undefined,
      });
    }

    await loadData();
    setIsFleetDialogOpen(false);
    resetFleetForm();
  };

  const handleDeleteFleetClick = async (fleetId: string) => {
    try {
      // Check dependencies first
      const deps = await checkFleetDependencies(fleetId);
      setFleetDependencies(deps);
      setFleetToDelete(fleetId);
    } catch (error) {
      console.error('Error checking fleet dependencies:', error);
      alert('플릿 정보를 확인하는 중 오류가 발생했습니다.');
    }
  };

  const handleConfirmDeleteFleet = async () => {
    if (!fleetToDelete) return;

    try {
      const { deleteFleet } = await import('@/lib/store');
      await deleteFleet(fleetToDelete);
      await loadData();
      setFleetToDelete(null);
      setFleetDependencies(null);
    } catch (error) {
      console.error('Error deleting fleet:', error);
      alert('플릿 삭제 중 오류가 발생했습니다.');
    }
  };

  const resetCompanyForm = () => {
    setCompanyFormData({
      name: '',
      type: companyType === 'manning' ? 'manning' : 'owner',
      country: '',
      contact_person: '',
      email: '',
      phone: '',
      default_officer_contract_months: undefined,
      default_rating_contract_months: undefined,
      manager_id: undefined,
    });
    setEditingCompany(null);
  };

  const resetSalaryForm = () => {
    setSalaryFormData({
      ship_id: '',
      rank: '',
      onboard_salary: '',
      leave_salary: '',
      special_allowance: '',
      currency: 'USD',
    });
    setEditingSalary(null);
  };

  const resetFleetForm = () => {
    setFleetFormData({
      name: '',
      description: '',
      owner_id: '',
      manager_id: undefined,
    });
    setEditingFleet(null);
    setSelectedCompanyForFleet(null);
  };

  const handleEditCompany = (company: Company) => {
    setCompanyFormData({
      name: company.name,
      type: company.type,
      country: company.country || '',
      contact_person: company.contact_person || '',
      email: company.email || '',
      phone: company.phone || '',
      default_officer_contract_months: company.default_officer_contract_months,
      default_rating_contract_months: company.default_rating_contract_months,
      manager_id: company.manager_id,
    });
    setEditingCompany(company.id);
    setIsCompanyDialogOpen(true);
  };

  const handleEditSalary = (salary: SalaryTable) => {
    setSalaryFormData({
      ship_id: salary.ship_id || '',
      rank: salary.rank,
      onboard_salary: salary.onboard_salary.toString(),
      leave_salary: salary.leave_salary.toString(),
      special_allowance: salary.special_allowance?.toString() || '',
      currency: salary.currency,
    });
    setEditingSalary(salary.id);
    setIsSalaryDialogOpen(true);
  };

  const handleEditFleet = (fleet: Fleet) => {
    setFleetFormData({
      name: fleet.name,
      description: fleet.description || '',
      owner_id: fleet.owner_id,
      manager_id: fleet.manager_id,
    });
    setEditingFleet(fleet.id);
    setSelectedCompanyForFleet(fleet.owner_id);
    setIsFleetDialogOpen(true);
  };

  const handleManageFleets = (companyId: string) => {
    setSelectedCompanyForFleet(companyId);
    setFleetFormData({
      ...fleetFormData,
      owner_id: companyId,
    });
  };

  const handleViewShips = (companyId: string) => {
    setSelectedCompanyForShips(selectedCompanyForShips === companyId ? null : companyId);
  };

  const ownerCompanies = companies.filter(c => c.type === 'owner');
  const manningCompanies = companies.filter(c => c.type === 'manning');

  const getCompanyFleets = (companyId: string) => {
    return fleets.filter(f => f.owner_id === companyId);
  };

  const getFleetShipCount = (fleetId: string) => {
    return ships.filter(s => s.fleet_id === fleetId).length;
  };

  const getCompanyShips = (companyId: string) => {
    return ships.filter(s => s.owner_id === companyId);
  };

  const getManagerName = (managerId?: string) => {
    if (!managerId) return null;
    const manager = shipOwnerUsers.find(u => u.id === managerId);
    return manager ? (manager.username || manager.name || manager.email) : null;
  };

  const getEffectiveManagerForShip = (ship: Ship): string | null => {
    // Priority 1: Ship manager
    if (ship.manager_id) {
      return getManagerName(ship.manager_id);
    }
    
    // Priority 2: Fleet manager
    if (ship.fleet_id) {
      const fleet = fleets.find(f => f.id === ship.fleet_id);
      if (fleet?.manager_id) {
        return getManagerName(fleet.manager_id);
      }
    }
    
    // Priority 3: Company manager
    const company = companies.find(c => c.id === ship.owner_id);
    if (company?.manager_id) {
      return getManagerName(company.manager_id);
    }
    
    return null;
  };

  const getShipIcon = (shipType: string, size: number) => {
    const iconSize = size > 50000 ? 24 : size > 20000 ? 20 : 18;
    const iconColor = size > 50000 ? 'text-blue-600' : size > 20000 ? 'text-blue-500' : 'text-blue-400';

    const type = shipType?.toLowerCase() || '';
    
    if (type.includes('container')) {
      return <Container size={iconSize} className={iconColor} />;
    } else if (type.includes('tanker') || type.includes('oil')) {
      return <Waves size={iconSize} className={iconColor} />;
    } else if (type.includes('bulk')) {
      return <Anchor size={iconSize} className={iconColor} />;
    } else {
      return <ShipIcon size={iconSize} className={iconColor} />;
    }
  };

  const getSizeCategory = (dwt?: number, gt?: number) => {
    const size = dwt || gt || 0;
    if (size > 50000) return { label: 'Large', color: 'bg-red-100 text-red-800' };
    if (size > 20000) return { label: 'Medium', color: 'bg-yellow-100 text-yellow-800' };
    return { label: 'Small', color: 'bg-green-100 text-green-800' };
  };

  // Render based on query parameter
  const renderOwnerCompanies = () => (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="text-base">선주사 관리</CardTitle>
            <CardDescription className="text-xs mt-1">선주사 정보 및 플릿을 관리하세요</CardDescription>
          </div>
          {permissions.canCreate && (
            <Button 
              size="sm"
              className="gap-1.5 h-8"
              onClick={() => {
                setCompanyFormData({...companyFormData, type: 'owner'});
                setIsCompanyDialogOpen(true);
              }}
            >
              <Plus className="w-3.5 h-3.5" />
              선주사 추가
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-4">
          {ownerCompanies.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-500">
              등록된 선주사가 없습니다
            </div>
          ) : (
            ownerCompanies.map(company => {
              const companyShips = getCompanyShips(company.id);
              const isShipsExpanded = selectedCompanyForShips === company.id;
              const managerName = getManagerName(company.manager_id);
              
              return (
                <Card key={company.id} className="border-l-4 border-l-blue-500">
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-sm">{company.name}</CardTitle>
                        <CardDescription className="text-xs mt-1 space-y-0.5">
                          <div>{company.phone}</div>
                          {managerName && (
                            <div className="flex items-center gap-1 text-blue-600">
                              <UserIcon className="w-3 h-3" />
                              <span>담당자: {managerName}</span>
                            </div>
                          )}
                        </CardDescription>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleViewShips(company.id)}
                          className="h-7 px-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          title="선박 보기"
                        >
                          <ShipIcon className="w-3.5 h-3.5" />
                        </Button>
                        {permissions.canEdit && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEditCompany(company)}
                            className="h-7 px-2"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {permissions.canDelete && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteCompanyClick(company)}
                            className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <h4 className="text-xs font-medium flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5" />
                          플릿 관리
                        </h4>
                        {permissions.canCreate && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              handleManageFleets(company.id);
                              setIsFleetDialogOpen(true);
                            }}
                            className="h-7 px-2 gap-1"
                          >
                            <Plus className="w-3 h-3" />
                            <span className="text-xs">플릿 추가</span>
                          </Button>
                        )}
                      </div>
                      
                      {getCompanyFleets(company.id).length === 0 ? (
                        <div className="text-center py-4 text-xs text-gray-500 bg-gray-50 rounded-md">
                          플릿이 없습니다
                        </div>
                      ) : (
                        <div className="rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">플릿명</TableHead>
                                <TableHead className="text-xs">담당자</TableHead>
                                <TableHead className="text-xs">설명</TableHead>
                                <TableHead className="text-xs text-center">선박 수</TableHead>
                                {permissions.canEdit && (
                                  <TableHead className="text-right text-xs w-24">작업</TableHead>
                                )}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {getCompanyFleets(company.id).map(fleet => {
                                const fleetManagerName = getManagerName(fleet.manager_id);
                                return (
                                  <TableRow key={fleet.id}>
                                    <TableCell className="font-medium text-sm">{fleet.name}</TableCell>
                                    <TableCell className="text-sm">
                                      {fleetManagerName ? (
                                        <span className="text-blue-600 flex items-center gap-1">
                                          <UserIcon className="w-3 h-3" />
                                          {fleetManagerName}
                                        </span>
                                      ) : (
                                        <span className="text-gray-400">-</span>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-sm text-gray-600">
                                      {fleet.description || '-'}
                                    </TableCell>
                                    <TableCell className="text-center">
                                      <Badge variant="secondary" className="text-xs">
                                        {getFleetShipCount(fleet.id)}척
                                      </Badge>
                                    </TableCell>
                                    {permissions.canEdit && (
                                      <TableCell className="text-right">
                                        <div className="flex justify-end gap-1">
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleEditFleet(fleet)}
                                            className="h-7 px-2"
                                          >
                                            <Pencil className="w-3 h-3" />
                                          </Button>
                                          {permissions.canDelete && (
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              onClick={() => handleDeleteFleetClick(fleet.id)}
                                              className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                                            >
                                              <Trash2 className="w-3 h-3" />
                                            </Button>
                                          )}
                                        </div>
                                      </TableCell>
                                    )}
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      )}

                      {/* Ship List Section */}
                      {isShipsExpanded && (
                        <div className="mt-4 p-4 bg-gray-50 rounded-md">
                          <h4 className="text-xs font-medium mb-3 flex items-center gap-1.5">
                            <ShipIcon className="w-3.5 h-3.5" />
                            소속 선박 ({companyShips.length}척)
                          </h4>
                          {companyShips.length === 0 ? (
                            <div className="text-center py-4 text-xs text-gray-500">
                              등록된 선박이 없습니다
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {companyShips.map((ship) => {
                                const size = ship.dwt || ship.gt || 0;
                                const sizeCategory = getSizeCategory(ship.dwt, ship.gt);
                                const fleet = fleets.find(f => f.id === ship.fleet_id);
                                const effectiveManager = getEffectiveManagerForShip(ship);
                                
                                return (
                                  <div
                                    key={ship.id}
                                    className="flex items-start gap-2 p-3 bg-white border rounded-lg hover:shadow-md transition-shadow"
                                  >
                                    <div className="flex-shrink-0 mt-1">
                                      {getShipIcon(ship.ship_type || '', size)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <h5 className="font-semibold text-sm text-gray-900 truncate">
                                        {ship.name}
                                      </h5>
                                      <p className="text-xs text-gray-600 mt-0.5">
                                        {ship.ship_type || '미분류'}
                                      </p>
                                      {fleet && (
                                        <p className="text-xs text-gray-500 mt-0.5">
                                          플릿: {fleet.name}
                                        </p>
                                      )}
                                      {effectiveManager && (
                                        <p className="text-xs text-blue-600 mt-0.5 flex items-center gap-1">
                                          <UserIcon className="w-3 h-3" />
                                          담당자: {effectiveManager}
                                        </p>
                                      )}
                                      <div className="flex items-center gap-2 mt-2">
                                        <Badge className={`${sizeCategory.color} text-xs`}>
                                          {sizeCategory.label}
                                        </Badge>
                                        {ship.dwt && (
                                          <span className="text-xs text-gray-500">
                                            {ship.dwt.toLocaleString()} DWT
                                          </span>
                                        )}
                                        {ship.gt && (
                                          <span className="text-xs text-gray-500">
                                            {ship.gt.toLocaleString()} GT
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );

  const renderManningCompanies = () => (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="text-base">선원 매닝사 관리</CardTitle>
            <CardDescription className="text-xs mt-1">매닝사 정보를 관리하세요</CardDescription>
          </div>
          {permissions.canCreate && (
            <Button 
              size="sm"
              className="gap-1.5 h-8"
              onClick={() => {
                setCompanyFormData({...companyFormData, type: 'manning'});
                setIsCompanyDialogOpen(true);
              }}
            >
              <Plus className="w-3.5 h-3.5" />
              매닝사 추가
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <CompanyTable 
          companies={manningCompanies} 
          currentUser={currentUser}
          onEdit={handleEditCompany}
          onDelete={handleDeleteCompanyClick}
          canEdit={permissions.canEdit}
          canDelete={permissions.canDelete}
        />
      </CardContent>
    </Card>
  );

  return (
    <ProtectedRoute resource="companies">
      <Layout>
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
          {companyType === 'owner' && renderOwnerCompanies()}
          {companyType === 'manning' && renderManningCompanies()}
          {!companyType && (
            <div className="space-y-4">
              {renderOwnerCompanies()}
              {renderManningCompanies()}
            </div>
          )}

          <CompanyDialog
            open={isCompanyDialogOpen}
            onOpenChange={(open) => {
              setIsCompanyDialogOpen(open);
              if (!open) resetCompanyForm();
            }}
            formData={companyFormData}
            onFormDataChange={setCompanyFormData}
            onSubmit={handleCompanySubmit}
            isEditing={!!editingCompany}
          />

          <SalaryDialog
            open={isSalaryDialogOpen}
            onOpenChange={(open) => {
              setIsSalaryDialogOpen(open);
              if (!open) resetSalaryForm();
            }}
            formData={salaryFormData}
            onFormDataChange={setSalaryFormData}
            onSubmit={handleSalarySubmit}
            isEditing={!!editingSalary}
            ships={ships}
          />

          <Dialog open={isFleetDialogOpen} onOpenChange={(open) => {
            setIsFleetDialogOpen(open);
            if (!open) resetFleetForm();
          }}>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle className="text-base">
                  {editingFleet ? '플릿 수정' : '플릿 추가'}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  플릿 정보를 입력하세요
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleFleetSubmit}>
                <div className="grid gap-3 py-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="fleet-name" className="text-xs">플릿명 *</Label>
                    <Input
                      id="fleet-name"
                      value={fleetFormData.name}
                      onChange={(e) => setFleetFormData({...fleetFormData, name: e.target.value})}
                      required
                      className="h-9 text-sm"
                    />
                  </div>
                  
                  <div className="space-y-1.5">
                    <Label htmlFor="fleet-manager" className="text-xs">담당자</Label>
                    <Select
                      value={fleetFormData.manager_id || '__none__'}
                      onValueChange={(value) => setFleetFormData({...fleetFormData, manager_id: value === '__none__' ? undefined : value})}
                    >
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="담당자를 선택하세요 (선택사항)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__" className="text-sm">
                          담당자 없음
                        </SelectItem>
                        {shipOwnerUsers.map((user) => (
                          <SelectItem 
                            key={user.id} 
                            value={user.id}
                            className="text-sm"
                          >
                            {user.username || user.name || user.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-1.5">
                    <Label htmlFor="fleet-description" className="text-xs">설명</Label>
                    <Textarea
                      id="fleet-description"
                      value={fleetFormData.description}
                      onChange={(e) => setFleetFormData({...fleetFormData, description: e.target.value})}
                      rows={3}
                      className="text-sm resize-none"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" size="sm" className="h-8">
                    {editingFleet ? '수정' : '추가'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* Fleet Deletion Confirmation Dialog */}
          <AlertDialog open={!!fleetToDelete} onOpenChange={(open) => {
            if (!open) {
              setFleetToDelete(null);
              setFleetDependencies(null);
            }
          }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  플릿 삭제 확인
                </AlertDialogTitle>
                <AlertDialogDescription className="space-y-3">
                  <p>이 플릿을 삭제하시겠습니까?</p>
                  
                  {fleetDependencies && (
                    <div className="bg-amber-50 border border-amber-200 rounded-md p-3 space-y-2">
                      <p className="font-medium text-amber-900 text-sm">다음 데이터가 영향을 받습니다:</p>
                      <ul className="text-sm text-amber-800 space-y-1">
                        {fleetDependencies.crewCount > 0 && (
                          <li>• {fleetDependencies.crewCount}명의 선원 (플릿 할당 해제됨)</li>
                        )}
                        {fleetDependencies.shipCount > 0 && (
                          <li>• {fleetDependencies.shipCount}척의 선박 (플릿 할당 해제됨)</li>
                        )}
                        {fleetDependencies.salaryAssignmentCount > 0 && (
                          <li>• {fleetDependencies.salaryAssignmentCount}개의 급여 할당 (삭제됨)</li>
                        )}
                      </ul>
                      <p className="text-xs text-amber-700 mt-2">
                        선원과 선박 데이터는 유지되지만 플릿 할당이 해제됩니다.
                      </p>
                    </div>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>취소</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleConfirmDeleteFleet}
                  className="bg-red-600 hover:bg-red-700"
                >
                  삭제
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Company Deletion Confirmation Dialog */}
          <AlertDialog open={!!companyToDelete} onOpenChange={(open) => {
            if (!open) {
              setCompanyToDelete(null);
              setCompanyDependencies(null);
            }
          }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  회사 삭제 확인
                </AlertDialogTitle>
                <AlertDialogDescription className="space-y-3">
                  <p>"{companyToDelete?.name}"을(를) 삭제하시겠습니까?</p>
                  
                  {companyDependencies && (companyDependencies.crewCount > 0 || companyDependencies.shipCount > 0 || companyDependencies.fleetCount > 0) && (
                    <div className="bg-amber-50 border border-amber-200 rounded-md p-3 space-y-2">
                      <p className="font-medium text-amber-900 text-sm">다음 데이터가 영향을 받습니다:</p>
                      <ul className="text-sm text-amber-800 space-y-1">
                        {companyDependencies.crewCount > 0 && (
                          <li>• {companyDependencies.crewCount}명의 선원 (회사 할당 해제됨)</li>
                        )}
                        {companyDependencies.shipCount > 0 && (
                          <li>• {companyDependencies.shipCount}척의 선박 (회사 할당 해제됨)</li>
                        )}
                        {companyDependencies.fleetCount > 0 && (
                          <li>• {companyDependencies.fleetCount}개의 플릿 (삭제됨)</li>
                        )}
                      </ul>
                      <p className="text-xs text-amber-700 mt-2">
                        선원과 선박 데이터는 유지되지만 회사 할당이 해제됩니다. 플릿은 완전히 삭제됩니다.
                      </p>
                    </div>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>취소</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleConfirmDeleteCompany}
                  className="bg-red-600 hover:bg-red-700"
                >
                  삭제
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </Layout>
    </ProtectedRoute>
  );
}