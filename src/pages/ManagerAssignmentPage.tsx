import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser } from '@/services/auth.service';
import { getUsers } from '@/services/user.service';
import { getCompanies } from '@/services/company.service';
import { getFleets } from '@/services/fleet.service';
import { getShips } from '@/services/ship.service';
import { getAssignments, getAssignmentsByEntity, addAssignment, deleteAssignment } from '@/services/assignment.service';
import type { User, Company, Fleet, Ship } from '@/types/models';
import type { Assignment } from '@/types/assignment-approval';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, Users, Building2, Ship as ShipIcon, Layers } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Layout from '@/components/Layout';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function ManagerAssignmentPage() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [ships, setShips] = useState<Ship[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    assignment_type: 'owner' as 'owner' | 'fleet' | 'ship',
    entity_id: '',
    user_id: '',
    role: 'owner_manager' as 'owner_manager' | 'fleet_manager' | 'ship_manager' | 'manning_manager',
  });

  useEffect(() => {
    const loadUser = async () => {
      const user = await getCurrentUser();
      if (!user || user.role !== 'ship_manager') {
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
      const [usersData, companiesData, fleetsData, shipsData, assignmentsData] = await Promise.all([
        getUsers(),
        getCompanies(),
        getFleets(),
        getShips(),
        getAssignments(),
      ]);
      setUsers(usersData);
      setCompanies(companiesData.filter(c => c.type === 'owner'));
      setFleets(fleetsData);
      setShips(shipsData);
      setAssignments(assignmentsData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getAssignmentsByType = (type: 'owner' | 'fleet' | 'ship') => {
    return assignments.filter(a => a.assignment_type === type);
  };

  const getRoleName = (role: string) => {
    const roleMap: Record<string, string> = {
      owner_manager: '선주 담당자',
      fleet_manager: '플릿 담당자',
      ship_manager: '선박 담당자',
      manning_manager: '매닝 담당자',
    };
    return roleMap[role] || role;
  };

  const getRoleBadgeColor = (role: string) => {
    const colorMap: Record<string, string> = {
      owner_manager: 'bg-purple-500',
      fleet_manager: 'bg-blue-500',
      ship_manager: 'bg-green-500',
      manning_manager: 'bg-orange-500',
    };
    return colorMap[role] || 'bg-gray-500';
  };

  const getEntityName = (assignment: Assignment) => {
    if (assignment.assignment_type === 'owner') {
      const company = companies.find(c => c.id === assignment.entity_id);
      return company?.name || '알 수 없음';
    } else if (assignment.assignment_type === 'fleet') {
      const fleet = fleets.find(f => f.id === assignment.entity_id);
      return fleet?.name || '알 수 없음';
    } else if (assignment.assignment_type === 'ship') {
      const ship = ships.find(s => s.id === assignment.entity_id);
      return ship?.name || '알 수 없음';
    }
    return '알 수 없음';
  };

  const getUserName = (userId: string) => {
    const user = users.find(u => u.id === userId);
    return user ? `${user.name} (${user.email})` : '알 수 없음';
  };

  const openAddDialog = (type: 'owner' | 'fleet' | 'ship') => {
    const roleMap = {
      owner: 'owner_manager',
      fleet: 'fleet_manager',
      ship: 'ship_manager',
    };
    
    setFormData({
      assignment_type: type,
      entity_id: '',
      user_id: '',
      role: roleMap[type] as 'owner_manager' | 'fleet_manager' | 'ship_manager' | 'manning_manager',
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      await addAssignment({
        assignment_type: formData.assignment_type,
        entity_id: formData.entity_id,
        user_id: formData.user_id,
        role: formData.role,
        assigned_by: currentUser?.id || null,
      });
      
      setIsDialogOpen(false);
      await loadData();
    } catch (error) {
      console.error('Error adding assignment:', error);
      alert('담당자 배정 중 오류가 발생했습니다.');
    }
  };

  const handleDelete = async (assignmentId: string) => {
    if (!confirm('이 담당자 배정을 삭제하시겠습니까?')) return;
    
    try {
      await deleteAssignment(assignmentId);
      await loadData();
    } catch (error) {
      console.error('Error deleting assignment:', error);
      alert('담당자 배정 삭제 중 오류가 발생했습니다.');
    }
  };

  const getEntityOptions = () => {
    if (formData.assignment_type === 'owner') {
      return companies.map(c => ({ id: c.id, name: c.name }));
    } else if (formData.assignment_type === 'fleet') {
      return fleets.map(f => ({ id: f.id, name: f.name }));
    } else if (formData.assignment_type === 'ship') {
      return ships.map(s => ({ id: s.id, name: s.name }));
    }
    return [];
  };

  const getAvailableUsers = () => {
    // Filter users based on role - only ship_owner users can be assigned
    return users.filter(u => u.role === 'ship_owner');
  };

  if (!currentUser || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">데이터를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  const renderAssignmentTable = (type: 'owner' | 'fleet' | 'ship') => {
    const typeAssignments = getAssignmentsByType(type);
    const typeName = type === 'owner' ? '선주' : type === 'fleet' ? '플릿' : '선박';
    
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-base">{typeName} 담당자 관리</CardTitle>
              <CardDescription className="text-xs mt-1">
                총 {typeAssignments.length}건의 담당자 배정
              </CardDescription>
            </div>
            <Button
              size="sm"
              className="gap-1.5 h-8"
              onClick={() => openAddDialog(type)}
            >
              <Plus className="w-3.5 h-3.5" />
              담당자 배정
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {typeAssignments.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-500">
              배정된 {typeName} 담당자가 없습니다
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">{typeName}</TableHead>
                    <TableHead className="text-xs">담당자</TableHead>
                    <TableHead className="text-xs">역할</TableHead>
                    <TableHead className="text-xs">배정일</TableHead>
                    <TableHead className="text-right text-xs w-24">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {typeAssignments.map(assignment => (
                    <TableRow key={assignment.id}>
                      <TableCell className="font-medium text-sm">
                        {getEntityName(assignment)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {getUserName(assignment.user_id)}
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${getRoleBadgeColor(assignment.role)}`}>
                          {getRoleName(assignment.role)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {new Date(assignment.created_at).toLocaleDateString('ko-KR')}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(assignment.id)}
                          className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <Layout>
      <main className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
        <div className="mb-4">
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-6 h-6" />
            담당자 배정 관리
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            선주, 플릿, 선박별로 담당자를 배정하고 관리합니다
          </p>
        </div>

        <Tabs defaultValue="owner" className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-9">
            <TabsTrigger value="owner" className="text-sm flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" />
              선주 담당자 ({getAssignmentsByType('owner').length})
            </TabsTrigger>
            <TabsTrigger value="fleet" className="text-sm flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              플릿 담당자 ({getAssignmentsByType('fleet').length})
            </TabsTrigger>
            <TabsTrigger value="ship" className="text-sm flex items-center gap-1.5">
              <ShipIcon className="w-3.5 h-3.5" />
              선박 담당자 ({getAssignmentsByType('ship').length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="owner" className="mt-3">
            {renderAssignmentTable('owner')}
          </TabsContent>

          <TabsContent value="fleet" className="mt-3">
            {renderAssignmentTable('fleet')}
          </TabsContent>

          <TabsContent value="ship" className="mt-3">
            {renderAssignmentTable('ship')}
          </TabsContent>
        </Tabs>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="text-base">
                {formData.assignment_type === 'owner' ? '선주' : 
                 formData.assignment_type === 'fleet' ? '플릿' : '선박'} 담당자 배정
              </DialogTitle>
              <DialogDescription className="text-xs">
                담당자를 배정하여 선원 추천 승인 권한을 부여합니다
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-3 py-3">
                <div className="space-y-1.5">
                  <Label htmlFor="entity" className="text-xs">
                    {formData.assignment_type === 'owner' ? '선주사' : 
                     formData.assignment_type === 'fleet' ? '플릿' : '선박'} *
                  </Label>
                  <Select
                    value={formData.entity_id}
                    onValueChange={(value) => setFormData({ ...formData, entity_id: value })}
                    required
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="선택하세요" />
                    </SelectTrigger>
                    <SelectContent>
                      {getEntityOptions().map(entity => (
                        <SelectItem key={entity.id} value={String(entity.id)} className="text-sm">
                          {entity.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="user" className="text-xs">담당자 *</Label>
                  <Select
                    value={formData.user_id}
                    onValueChange={(value) => setFormData({ ...formData, user_id: value })}
                    required
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="담당자를 선택하세요" />
                    </SelectTrigger>
                    <SelectContent>
                      {getAvailableUsers().map(user => (
                        <SelectItem key={user.id} value={String(user.id)} className="text-sm">
                          {user.name} ({user.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">역할</Label>
                  <div className="flex items-center gap-2">
                    <Badge className={`text-xs ${getRoleBadgeColor(formData.role)}`}>
                      {getRoleName(formData.role)}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-500">
                    이 담당자는 선원 추천을 승인하거나 거절할 수 있습니다
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                  className="h-8"
                >
                  취소
                </Button>
                <Button type="submit" size="sm" className="h-8">
                  배정
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </main>
    </Layout>
  );
}