import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  getCurrentUser, 
  getCrewAssignments, 
  getShips, 
  getCrewMembers, 
  addCrewAssignment, 
  updateCrewAssignment, 
  deleteCrewAssignment 
} from '@/lib/store';
import type { User, CrewAssignment, Ship, CrewMember } from '@/types/models';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit, Trash2, X, Ship as ShipIcon, User as UserIcon } from 'lucide-react';
import Layout from '@/components/Layout';
import ProtectedRoute from '@/components/ProtectedRoute';

const RANKS = [
  'Master', 'Chief Officer', '2nd Officer', '3rd Officer', 'Deck Cadet',
  'Chief Engineer', '2nd Engineer', '3rd Engineer', '4th Engineer', 'Engine Cadet',
  'Bosun', 'AB', 'OS', 'Fitter', 'Oiler', 'Wiper',
  'Chief Cook', 'Messman'
];

const STATUS_OPTIONS = [
  { value: 'active', label: '승선중', color: 'bg-green-100 text-green-700' },
  { value: 'completed', label: '하선완료', color: 'bg-gray-100 text-gray-700' },
  { value: 'terminated', label: '계약종료', color: 'bg-red-100 text-red-700' }
];

export default function CrewAssignmentPage() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [assignments, setAssignments] = useState<CrewAssignment[]>([]);
  const [ships, setShips] = useState<Ship[]>([]);
  const [crewMembers, setCrewMembers] = useState<CrewMember[]>([]);
  const [loading, setLoading] = useState(true);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Filter states
  const [selectedShip, setSelectedShip] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedRank, setSelectedRank] = useState<string>('all');

  const [formData, setFormData] = useState({
    ship_id: '',
    crew_member_id: '',
    rank: '',
    sign_on_date: '',
    sign_off_date: '',
    contract_duration_months: '',
    status: 'active' as 'active' | 'completed' | 'terminated',
    salary: '',
    currency: 'USD',
    notes: '',
  });

  useEffect(() => {
    const loadUser = async () => {
      const user = await getCurrentUser();
      if (!user || !['ship_owner', 'ship_manager', 'manning_agency'].includes(user.role)) {
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
      const [assignmentsData, shipsData, crewData] = await Promise.all([
        getCrewAssignments(),
        getShips(),
        getCrewMembers(),
      ]);
      setAssignments(assignmentsData);
      setShips(shipsData);
      setCrewMembers(crewData);
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
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3"></div>
            <p className="text-sm text-gray-600">로딩 중...</p>
          </div>
        </div>
      </Layout>
    );
  }

  const filteredAssignments = assignments.filter(assignment => {
    const ship = ships.find(s => s.id === assignment.ship_id);
    const crew = crewMembers.find(c => c.id === assignment.crew_member_id);
    
    const matchesSearch = 
      ship?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      crew?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      assignment.rank.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (!matchesSearch) return false;
    
    if (selectedShip !== 'all' && assignment.ship_id !== selectedShip) return false;
    if (selectedStatus !== 'all' && assignment.status !== selectedStatus) return false;
    if (selectedRank !== 'all' && assignment.rank !== selectedRank) return false;
    
    return true;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentUser) return;
    
    const assignmentData: Omit<CrewAssignment, 'id' | 'created_at' | 'updated_at'> = {
      ship_id: formData.ship_id,
      crew_member_id: formData.crew_member_id,
      rank: formData.rank,
      sign_on_date: formData.sign_on_date,
      sign_off_date: formData.sign_off_date || undefined,
      contract_duration_months: Number(formData.contract_duration_months),
      status: formData.status,
      salary: formData.salary ? Number(formData.salary) : undefined,
      currency: formData.currency,
      notes: formData.notes || undefined,
      created_by: currentUser.id,
    };

    try {
      if (editingAssignment) {
        await updateCrewAssignment(editingAssignment, assignmentData);
      } else {
        await addCrewAssignment(assignmentData);
      }

      await loadData();
      setIsDialogOpen(false);
      resetForm();
    } catch (error) {
      console.error('Error saving assignment:', error);
      alert('발령 저장 중 오류가 발생했습니다.');
    }
  };

  const resetForm = () => {
    setFormData({
      ship_id: '',
      crew_member_id: '',
      rank: '',
      sign_on_date: '',
      sign_off_date: '',
      contract_duration_months: '',
      status: 'active',
      salary: '',
      currency: 'USD',
      notes: '',
    });
    setEditingAssignment(null);
  };

  const handleEdit = (assignment: CrewAssignment) => {
    setFormData({
      ship_id: assignment.ship_id,
      crew_member_id: assignment.crew_member_id,
      rank: assignment.rank,
      sign_on_date: assignment.sign_on_date,
      sign_off_date: assignment.sign_off_date || '',
      contract_duration_months: assignment.contract_duration_months.toString(),
      status: assignment.status,
      salary: assignment.salary?.toString() || '',
      currency: assignment.currency || 'USD',
      notes: assignment.notes || '',
    });
    setEditingAssignment(assignment.id);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('이 발령을 삭제하시겠습니까?')) {
      await deleteCrewAssignment(id);
      await loadData();
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedShip('all');
    setSelectedStatus('all');
    setSelectedRank('all');
  };

  const hasActiveFilters = searchTerm || selectedShip !== 'all' || selectedStatus !== 'all' || selectedRank !== 'all';

  const getShipName = (shipId: string) => ships.find(s => s.id === shipId)?.name || '-';
  const getCrewName = (crewId: string) => crewMembers.find(c => c.id === crewId)?.name || '-';
  const getStatusBadge = (status: string) => {
    const statusOption = STATUS_OPTIONS.find(s => s.value === status);
    return statusOption ? (
      <Badge className={`${statusOption.color} text-xs`}>
        {statusOption.label}
      </Badge>
    ) : null;
  };

  return (
    <ProtectedRoute resource="crew">
      <Layout>
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-center">
                <CardTitle className="text-base">선원 발령 관리</CardTitle>
                <Button 
                  size="sm"
                  className="gap-1.5 h-8"
                  onClick={() => setIsDialogOpen(true)}
                >
                  <Plus className="w-4 h-4" />
                  발령 등록
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              {/* Search and Filters */}
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Input
                    placeholder="선박명, 선원명, 직급으로 검색..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="max-w-xs h-9 text-sm"
                  />
                  
                  <Select value={selectedShip} onValueChange={setSelectedShip}>
                    <SelectTrigger className="w-48 h-9 text-sm">
                      <SelectValue placeholder="선박 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-sm">전체 선박</SelectItem>
                      {ships.map(ship => (
                        <SelectItem key={ship.id} value={String(ship.id)} className="text-sm">
                          {ship.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                    <SelectTrigger className="w-40 h-9 text-sm">
                      <SelectValue placeholder="상태 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-sm">전체 상태</SelectItem>
                      {STATUS_OPTIONS.map(status => (
                        <SelectItem key={status.value} value={status.value} className="text-sm">
                          {status.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={selectedRank} onValueChange={setSelectedRank}>
                    <SelectTrigger className="w-40 h-9 text-sm">
                      <SelectValue placeholder="직급 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-sm">전체 직급</SelectItem>
                      {RANKS.map(rank => (
                        <SelectItem key={rank} value={rank} className="text-sm">
                          {rank}
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
                    {selectedShip !== 'all' && (
                      <Badge variant="secondary" className="text-xs">
                        선박: {getShipName(selectedShip)}
                      </Badge>
                    )}
                    {selectedStatus !== 'all' && (
                      <Badge variant="secondary" className="text-xs">
                        상태: {STATUS_OPTIONS.find(s => s.value === selectedStatus)?.label}
                      </Badge>
                    )}
                    {selectedRank !== 'all' && (
                      <Badge variant="secondary" className="text-xs">
                        직급: {selectedRank}
                      </Badge>
                    )}
                  </div>
                )}

                {/* Results Count */}
                <p className="text-xs text-gray-500">
                  총 {filteredAssignments.length}건의 발령
                </p>
              </div>

              {/* Assignments Table */}
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">선박명</TableHead>
                      <TableHead className="text-xs">선원명</TableHead>
                      <TableHead className="text-xs">직급</TableHead>
                      <TableHead className="text-xs">승선일</TableHead>
                      <TableHead className="text-xs">하선일</TableHead>
                      <TableHead className="text-xs">계약기간</TableHead>
                      <TableHead className="text-xs">상태</TableHead>
                      <TableHead className="text-right text-xs w-32">작업</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAssignments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-sm text-gray-500">
                          등록된 발령이 없습니다
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredAssignments.map((assignment) => (
                        <TableRow key={assignment.id}>
                          <TableCell className="text-sm">
                            <div className="flex items-center gap-1.5">
                              <ShipIcon className="w-3.5 h-3.5 text-gray-400" />
                              {getShipName(assignment.ship_id)}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            <div className="flex items-center gap-1.5">
                              <UserIcon className="w-3.5 h-3.5 text-gray-400" />
                              {getCrewName(assignment.crew_member_id)}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm font-medium">{assignment.rank}</TableCell>
                          <TableCell className="text-sm">{assignment.sign_on_date}</TableCell>
                          <TableCell className="text-sm">{assignment.sign_off_date || '-'}</TableCell>
                          <TableCell className="text-sm">{assignment.contract_duration_months}개월</TableCell>
                          <TableCell className="text-sm">{getStatusBadge(assignment.status)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleEdit(assignment)}
                                className="h-7 px-2 gap-1"
                              >
                                <Edit className="w-3.5 h-3.5" />
                                <span className="text-xs">수정</span>
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDelete(assignment.id)}
                                className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Assignment Dialog */}
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingAssignment ? '발령 수정' : '발령 등록'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="ship_id">선박 *</Label>
                    <Select
                      value={formData.ship_id}
                      onValueChange={(value) => setFormData({ ...formData, ship_id: value })}
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="선박 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {ships.map(ship => (
                          <SelectItem key={ship.id} value={String(ship.id)}>
                            {ship.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="crew_member_id">선원 *</Label>
                    <Select
                      value={formData.crew_member_id}
                      onValueChange={(value) => setFormData({ ...formData, crew_member_id: value })}
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="선원 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {crewMembers.map(crew => (
                          <SelectItem key={crew.id} value={String(crew.id)}>
                            {crew.name} - {crew.rank}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="rank">직급 *</Label>
                    <Select
                      value={formData.rank}
                      onValueChange={(value) => setFormData({ ...formData, rank: value })}
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="직급 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {RANKS.map(rank => (
                          <SelectItem key={rank} value={rank}>
                            {rank}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="status">상태 *</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(value) => setFormData({ ...formData, status: value as 'active' | 'completed' | 'terminated' })}
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="상태 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map(status => (
                          <SelectItem key={status.value} value={status.value}>
                            {status.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="sign_on_date">승선일 *</Label>
                    <Input
                      id="sign_on_date"
                      type="date"
                      value={formData.sign_on_date}
                      onChange={(e) => setFormData({ ...formData, sign_on_date: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="sign_off_date">하선일</Label>
                    <Input
                      id="sign_off_date"
                      type="date"
                      value={formData.sign_off_date}
                      onChange={(e) => setFormData({ ...formData, sign_off_date: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="contract_duration_months">계약기간 (개월) *</Label>
                    <Input
                      id="contract_duration_months"
                      type="number"
                      min="1"
                      value={formData.contract_duration_months}
                      onChange={(e) => setFormData({ ...formData, contract_duration_months: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="salary">급여</Label>
                    <div className="flex gap-2">
                      <Input
                        id="salary"
                        type="number"
                        min="0"
                        value={formData.salary}
                        onChange={(e) => setFormData({ ...formData, salary: e.target.value })}
                        placeholder="금액"
                        className="flex-1"
                      />
                      <Select
                        value={formData.currency}
                        onValueChange={(value) => setFormData({ ...formData, currency: value })}
                      >
                        <SelectTrigger className="w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USD">USD</SelectItem>
                          <SelectItem value="EUR">EUR</SelectItem>
                          <SelectItem value="KRW">KRW</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">비고</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="추가 정보나 특이사항을 입력하세요"
                    rows={3}
                  />
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    취소
                  </Button>
                  <Button type="submit">
                    {editingAssignment ? '수정' : '등록'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </Layout>
    </ProtectedRoute>
  );
}