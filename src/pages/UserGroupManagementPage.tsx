import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser } from '@/services/auth.service';
import { getUsers, addUser, updateUser, deleteUser } from '@/services/user.service';
import { getCompanies } from '@/services/company.service';
import { getShorePositions } from '@/services/shore-position.service';
import type { User, Company, ShorePosition } from '@/types/models';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Edit, Trash2, UserCircle } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function UserGroupManagementPage() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [positions, setPositions] = useState<ShorePosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formError, setFormError] = useState('');
  
  // Form state
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    name: '',
    email: '',
    role: 'crew' as 'ship_owner' | 'ship_manager' | 'manning_agency' | 'crew',
    company_id: '',
    position_id: '',
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
      const [usersData, companiesData, positionsData] = await Promise.all([
        getUsers(),
        getCompanies(),
        getShorePositions(),
      ]);
      setUsers(usersData);
      setCompanies(companiesData);
      setPositions(positionsData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getUsersByRole = (role: string) => {
    return users.filter(u => u.role === role);
  };

  const getRoleName = (role: string) => {
    const roleMap: Record<string, string> = {
      ship_owner: '선주',
      ship_manager: '선박관리사',
      manning_agency: '선원매닝사',
      crew: '선원',
    };
    return roleMap[role] || role;
  };

  const getRoleBadgeColor = (role: string) => {
    const colorMap: Record<string, string> = {
      ship_owner: 'bg-purple-500',
      ship_manager: 'bg-blue-500',
      manning_agency: 'bg-green-500',
      crew: 'bg-gray-500',
    };
    return colorMap[role] || 'bg-gray-500';
  };

  const openAddDialog = (role: 'ship_owner' | 'ship_manager' | 'manning_agency' | 'crew') => {
    setEditingUser(null);
    setFormError('');
    setFormData({
      username: '',
      password: '',
      name: '',
      email: '',
      role,
      company_id: '',
      position_id: '',
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (user: User) => {
    setEditingUser(user);
    setFormError('');
    setFormData({
      username: user.username,
      password: '',
      name: user.name,
      email: user.email,
      role: user.role as 'ship_owner' | 'ship_manager' | 'manning_agency' | 'crew',
      company_id: user.company_id || '',
      position_id: user.position_id || '',
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    
    // Validation for company_id
    if ((formData.role === 'ship_owner' || formData.role === 'manning_agency') && !formData.company_id) {
      setFormError('소속 회사를 선택해주세요.');
      return;
    }
    
    try {
      if (editingUser) {
        // Update user
        const updateData: Partial<User> = {
          name: formData.name,
          email: formData.email,
          role: formData.role,
          company_id: formData.company_id || null,
          position_id: formData.position_id || null,
        };
        
        if (formData.password) {
          updateData.password = formData.password;
        }
        
        await updateUser(editingUser.id, updateData);
      } else {
        // Add new user
        await addUser({
          username: formData.username,
          password: formData.password,
          name: formData.name,
          email: formData.email,
          role: formData.role,
          company_id: formData.company_id || null,
          position_id: formData.position_id || null,
        });
      }
      
      setIsDialogOpen(false);
      await loadData();
    } catch (error) {
      console.error('Error saving user:', error);
      setFormError('사용자 저장 중 오류가 발생했습니다.');
    }
  };

  const handleDelete = async (userId: string) => {
    if (!confirm('이 사용자를 삭제하시겠습니까?')) return;
    
    try {
      await deleteUser(userId);
      await loadData();
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('사용자 삭제 중 오류가 발생했습니다.');
    }
  };

  const getCompanyOptions = () => {
    if (formData.role === 'ship_owner') {
      return companies.filter(c => c.type === 'owner');
    } else if (formData.role === 'manning_agency') {
      return companies.filter(c => c.type === 'manning');
    } else if (formData.role === 'ship_manager') {
      return companies.filter(c => c.type === 'owner');
    }
    return [];
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

  const renderUserTable = (role: string) => {
    const roleUsers = getUsersByRole(role);
    
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-base">{getRoleName(role)} 관리</CardTitle>
              <CardDescription className="text-xs mt-1">
                총 {roleUsers.length}명의 {getRoleName(role)}
              </CardDescription>
            </div>
            <Button
              size="sm"
              className="gap-1.5 h-8"
              onClick={() => openAddDialog(role as 'ship_owner' | 'ship_manager' | 'manning_agency' | 'crew')}
            >
              <Plus className="w-3.5 h-3.5" />
              {getRoleName(role)} 추가
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {roleUsers.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-500">
              등록된 {getRoleName(role)}이 없습니다
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">사용자명</TableHead>
                    <TableHead className="text-xs">이름</TableHead>
                    <TableHead className="text-xs">이메일</TableHead>
                    <TableHead className="text-xs">소속</TableHead>
                    <TableHead className="text-xs">직급</TableHead>
                    <TableHead className="text-xs">역할</TableHead>
                    <TableHead className="text-right text-xs w-32">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roleUsers.map(user => {
                    const company = companies.find(c => c.id === user.company_id);
                    const position = positions.find(p => p.id === user.position_id);
                    return (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium text-sm">{user.username}</TableCell>
                        <TableCell className="text-sm">{user.name}</TableCell>
                        <TableCell className="text-sm">{user.email}</TableCell>
                        <TableCell className="text-sm">
                          {user.role === 'ship_manager' ? 'INK' : (company ? company.name : '-')}
                        </TableCell>
                        <TableCell className="text-sm">
                          {position ? position.name : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-xs ${getRoleBadgeColor(user.role)}`}>
                            {getRoleName(user.role)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openEditDialog(user)}
                              className="h-7 px-2"
                            >
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDelete(user.id)}
                              className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
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
            <UserCircle className="w-6 h-6" />
            사용자 그룹 관리
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            선주, 선박관리사, 선원매닝사, 선원을 그룹별로 관리합니다
          </p>
        </div>

        <Tabs defaultValue="ship_manager" className="w-full">
          <TabsList className="grid w-full grid-cols-4 h-9">
            <TabsTrigger value="ship_manager" className="text-sm">
              선박관리사 ({getUsersByRole('ship_manager').length})
            </TabsTrigger>
            <TabsTrigger value="ship_owner" className="text-sm">
              선주 ({getUsersByRole('ship_owner').length})
            </TabsTrigger>
            <TabsTrigger value="manning_agency" className="text-sm">
              선원매닝사 ({getUsersByRole('manning_agency').length})
            </TabsTrigger>
            <TabsTrigger value="crew" className="text-sm">
              선원 ({getUsersByRole('crew').length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ship_manager" className="mt-3">
            {renderUserTable('ship_manager')}
          </TabsContent>

          <TabsContent value="ship_owner" className="mt-3">
            {renderUserTable('ship_owner')}
          </TabsContent>

          <TabsContent value="manning_agency" className="mt-3">
            {renderUserTable('manning_agency')}
          </TabsContent>

          <TabsContent value="crew" className="mt-3">
            {renderUserTable('crew')}
          </TabsContent>
        </Tabs>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="text-base">
                {editingUser ? '사용자 수정' : `${getRoleName(formData.role)} 추가`}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {editingUser ? '사용자 정보를 수정합니다' : '새로운 사용자를 등록합니다'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-3 py-3">
                {formError && (
                  <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded text-sm">
                    {formError}
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="username" className="text-xs">
                    사용자명 * {editingUser && <span className="text-gray-500">(수정 불가)</span>}
                  </Label>
                  <Input
                    id="username"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="로그인 ID"
                    required
                    disabled={!!editingUser}
                    className="h-9 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-xs">
                    비밀번호 {editingUser ? '(변경시에만 입력)' : '*'}
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="비밀번호"
                    required={!editingUser}
                    className="h-9 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-xs">이름 *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="실명"
                    required
                    className="h-9 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs">이메일 *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="email@example.com"
                    required
                    className="h-9 text-sm"
                  />
                </div>

                {formData.role === 'ship_manager' && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">소속 회사</Label>
                    <Input
                      value="INK"
                      disabled
                      className="h-9 text-sm bg-gray-50"
                    />
                    <p className="text-xs text-gray-500">선박관리사는 INK 소속입니다</p>
                  </div>
                )}

                {(formData.role === 'ship_owner' || formData.role === 'manning_agency') && (
                  <div className="space-y-1.5">
                    <Label htmlFor="company" className="text-xs">
                      소속 회사 *
                    </Label>
                    <Select
                      value={formData.company_id}
                      onValueChange={(value) => setFormData({ ...formData, company_id: value })}
                    >
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="회사를 선택하세요" />
                      </SelectTrigger>
                      <SelectContent>
                        {getCompanyOptions().length === 0 ? (
                          <div className="px-2 py-1.5 text-sm text-gray-500">
                            등록된 회사가 없습니다
                          </div>
                        ) : (
                          getCompanyOptions().map(company => (
                            <SelectItem key={company.id} value={String(company.id)} className="text-sm">
                              {company.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    {getCompanyOptions().length === 0 && (
                      <p className="text-xs text-red-500">
                        먼저 회사 관리에서 {formData.role === 'manning_agency' ? '선원매닝사' : '선주'} 회사를 등록해주세요
                      </p>
                    )}
                  </div>
                )}

                {formData.role === 'ship_manager' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="position" className="text-xs">직급</Label>
                    <Select
                      value={formData.position_id}
                      onValueChange={(value) => setFormData({ ...formData, position_id: value })}
                    >
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="직급을 선택하세요" />
                      </SelectTrigger>
                      <SelectContent>
                        {positions.map(position => (
                          <SelectItem key={position.id} value={String(position.id)} className="text-sm">
                            {position.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs">역할</Label>
                  <div className="flex items-center gap-2">
                    <Badge className={`text-xs ${getRoleBadgeColor(formData.role)}`}>
                      {getRoleName(formData.role)}
                    </Badge>
                  </div>
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
                  {editingUser ? '수정' : '추가'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </main>
    </Layout>
  );
}
