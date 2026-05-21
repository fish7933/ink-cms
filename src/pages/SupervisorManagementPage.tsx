import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supervisorService } from '@/services/supervisor.service';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/store';
import type { SupervisorAssignmentWithDetails } from '@/types/supervisor';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { UserCheck, Plus, Trash2, Building2, Layers, Ship, AlertCircle } from 'lucide-react';
import { format, isValid } from 'date-fns';
import { ko } from 'date-fns/locale';
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

export default function SupervisorManagementPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<SupervisorAssignmentWithDetails[]>([]);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<SupervisorAssignmentWithDetails | null>(null);
  const [processing, setProcessing] = useState(false);

  // Form state
  const [supervisors, setSupervisors] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [owners, setOwners] = useState<Array<{ id: string; name: string }>>([]);
  const [fleets, setFleets] = useState<Array<{ id: string; name: string; owner_id: string }>>([]);
  const [ships, setShips] = useState<Array<{ id: string; name: string; owner_id: string; fleet_id?: string }>>([]);
  
  const [selectedSupervisor, setSelectedSupervisor] = useState('');
  const [selectedEntityType, setSelectedEntityType] = useState<'owner' | 'fleet' | 'ship'>('owner');
  const [selectedOwner, setSelectedOwner] = useState('');
  const [selectedFleet, setSelectedFleet] = useState('');
  const [selectedShip, setSelectedShip] = useState('');
  const [notes, setNotes] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      // Get current user
      const authUser = await getCurrentUser();
      if (!authUser) {
        navigate('/login');
        return;
      }

      setCurrentUserId(authUser.id);

      // Check if user is ship_manager
      const { data: userData } = await supabase
        .from('users')
        .select('role')
        .eq('id', currentUser.user.id)
        .single();

      if (userData?.role !== 'ship_manager') {
        toast({
          title: '접근 권한 없음',
          description: '선박관리사만 접근할 수 있습니다.',
          variant: 'destructive',
        });
        navigate('/dashboard');
        return;
      }

      // Load all data
      const [assignmentsData, supervisorsData, ownersData, fleetsData, shipsData] = await Promise.all([
        supervisorService.getAllAssignments(),
        supervisorService.getShipManagers(),
        supabase.from('companies').select('id, name').eq('type', 'owner').order('name'),
        supabase.from('fleets').select('id, name, owner_id').order('name'),
        supabase.from('ships').select('id, name, owner_id, fleet_id').order('name'),
      ]);

      setAssignments(assignmentsData || []);
      setSupervisors(supervisorsData || []);
      setOwners(ownersData.data || []);
      setFleets(fleetsData.data || []);
      setShips(shipsData.data || []);
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: '오류',
        description: '데이터를 불러오는데 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddAssignment = async () => {
    if (!selectedSupervisor) {
      toast({
        title: '오류',
        description: '담당 감독을 선택해주세요.',
        variant: 'destructive',
      });
      return;
    }

    let entityId = '';
    if (selectedEntityType === 'owner') {
      if (!selectedOwner) {
        toast({
          title: '오류',
          description: '선주사를 선택해주세요.',
          variant: 'destructive',
        });
        return;
      }
      entityId = selectedOwner;
    } else if (selectedEntityType === 'fleet') {
      if (!selectedFleet) {
        toast({
          title: '오류',
          description: '플릿을 선택해주세요.',
          variant: 'destructive',
        });
        return;
      }
      entityId = selectedFleet;
    } else {
      if (!selectedShip) {
        toast({
          title: '오류',
          description: '선박을 선택해주세요.',
          variant: 'destructive',
        });
        return;
      }
      entityId = selectedShip;
    }

    try {
      setProcessing(true);
      await supervisorService.createAssignment(
        selectedSupervisor,
        selectedEntityType,
        entityId,
        currentUserId,
        notes
      );

      toast({
        title: '성공',
        description: '담당 감독이 지정되었습니다.',
      });

      setAddDialogOpen(false);
      resetForm();
      await loadData();
    } catch (error) {
      console.error('Error adding assignment:', error);
      
      // Check for duplicate assignment error
      const errorMessage = error instanceof Error ? error.message : '';
      if (errorMessage.includes('unique') || (error && typeof error === 'object' && 'code' in error && error.code === '23505')) {
        toast({
          title: '오류',
          description: '이미 동일한 담당 감독 지정이 존재합니다.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: '오류',
          description: '담당 감독 지정에 실패했습니다.',
          variant: 'destructive',
        });
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteAssignment = async () => {
    if (!selectedAssignment) return;

    try {
      setProcessing(true);
      await supervisorService.deleteAssignment(selectedAssignment.id);

      toast({
        title: '성공',
        description: '담당 감독 지정이 해제되었습니다.',
        variant: 'default',
      });

      setDeleteDialogOpen(false);
      setSelectedAssignment(null);
      await loadData();
    } catch (error) {
      console.error('Error deleting assignment:', error);
      toast({
        title: '오류',
        description: '담당 감독 해제에 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  const resetForm = () => {
    setSelectedSupervisor('');
    setSelectedEntityType('owner');
    setSelectedOwner('');
    setSelectedFleet('');
    setSelectedShip('');
    setNotes('');
  };

  const getEntityIcon = (type: 'owner' | 'fleet' | 'ship') => {
    switch (type) {
      case 'owner':
        return <Building2 className="w-4 h-4" />;
      case 'fleet':
        return <Layers className="w-4 h-4" />;
      case 'ship':
        return <Ship className="w-4 h-4" />;
    }
  };

  const getEntityTypeLabel = (type: 'owner' | 'fleet' | 'ship') => {
    switch (type) {
      case 'owner':
        return '선주사';
      case 'fleet':
        return '플릿';
      case 'ship':
        return '선박';
    }
  };

  const getFilteredFleets = () => {
    if (!selectedOwner) return [];
    return fleets.filter(f => f.owner_id === selectedOwner);
  };

  const getFilteredShips = () => {
    if (selectedEntityType === 'fleet' && selectedFleet) {
      return ships.filter(s => s.fleet_id === selectedFleet);
    } else if (selectedEntityType === 'ship' && selectedOwner) {
      return ships.filter(s => s.owner_id === selectedOwner);
    }
    return [];
  };

  const formatDate = (dateString: string | undefined | null) => {
    try {
      if (!dateString) return '-';
      const date = new Date(dateString);
      if (!isValid(date)) return '-';
      return format(date, 'yyyy-MM-dd', { locale: ko });
    } catch (error) {
      console.error('Date formatting error:', error);
      return '-';
    }
  };

  // Group assignments by supervisor
  const groupedAssignments = (assignments || []).reduce((acc, assignment) => {
    if (!acc[assignment.supervisor_id]) {
      acc[assignment.supervisor_id] = {
        supervisor_name: assignment.supervisor_name,
        supervisor_email: assignment.supervisor_email,
        assignments: [],
      };
    }
    acc[assignment.supervisor_id].assignments.push(assignment);
    return acc;
  }, {} as Record<string, { supervisor_name: string; supervisor_email: string; assignments: SupervisorAssignmentWithDetails[] }>);

  if (loading) {
    return (
    <Layout>
      <div className="container mx-auto p-6">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
              <p className="mt-4 text-gray-600">로딩중...</p>
            </div>
          </div>
        </div>
    </Layout>
  );
  }

  return (
    <Layout>
      <div className="container mx-auto p-6 max-w-7xl">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">담당 감독 관리</h1>
            <p className="text-gray-600 mt-2">선주사, 플릿, 선박별 담당 감독을 지정하고 관리합니다.</p>
          </div>
          <Button onClick={() => setAddDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            담당 지정
          </Button>
        </div>

        {Object.keys(groupedAssignments).length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <UserCheck className="w-12 h-12 text-gray-400 mb-4" />
              <p className="text-gray-600">현재 지정된 담당 감독이 없습니다.</p>
              <Button variant="outline" className="mt-4" onClick={() => setAddDialogOpen(true)}>
                첫 담당 지정하기
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6">
            {Object.entries(groupedAssignments).map(([supervisorId, group]) => (
              <Card key={supervisorId}>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-5 h-5 text-blue-600" />
                    <CardTitle>{group.supervisor_name}</CardTitle>
                    <Badge variant="outline" className="ml-2">{group.supervisor_email}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {group.assignments.map((assignment) => (
                      <div key={assignment.id} className="flex items-start justify-between p-3 bg-gray-50 rounded-lg border">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            {getEntityIcon(assignment.entity_type)}
                            <span className="font-medium">
                              {getEntityTypeLabel(assignment.entity_type)}: {assignment.entity_name}
                            </span>
                          </div>
                          {assignment.notes && (
                            <p className="text-sm text-gray-500">{assignment.notes}</p>
                          )}
                          <p className="text-xs text-gray-400">
                            지정일: {formatDate(assignment.assigned_at || (assignment as SupervisorAssignmentWithDetails & { created_at?: string }).created_at)}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => {
                            setSelectedAssignment(assignment);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Add Assignment Dialog */}
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>담당 감독 지정</DialogTitle>
              <DialogDescription>
                선주사, 플릿 또는 특정 선박에 대한 담당 감독을 지정합니다.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>담당 감독</Label>
                <Select value={selectedSupervisor} onValueChange={setSelectedSupervisor}>
                  <SelectTrigger>
                    <SelectValue placeholder="감독 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {supervisors.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name} ({s.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>대상 유형</Label>
                <Select 
                  value={selectedEntityType} 
                  onValueChange={(value: 'owner' | 'fleet' | 'ship') => {
                    setSelectedEntityType(value);
                    setSelectedOwner('');
                    setSelectedFleet('');
                    setSelectedShip('');
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">선주사 (전체 선박)</SelectItem>
                    <SelectItem value="fleet">플릿 (소속 선박)</SelectItem>
                    <SelectItem value="ship">개별 선박</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {selectedEntityType === 'owner' && (
                <div className="space-y-2">
                  <Label>선주사</Label>
                  <Select value={selectedOwner} onValueChange={setSelectedOwner}>
                    <SelectTrigger>
                      <SelectValue placeholder="선주사 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {owners.map((o) => (
                        <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {selectedEntityType === 'fleet' && (
                <>
                  <div className="space-y-2">
                    <Label>선주사 (필터)</Label>
                    <Select value={selectedOwner} onValueChange={setSelectedOwner}>
                      <SelectTrigger>
                        <SelectValue placeholder="선주사 선택 (선택사항)" />
                      </SelectTrigger>
                      <SelectContent>
                        {owners.map((o) => (
                          <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>플릿</Label>
                    <Select value={selectedFleet} onValueChange={setSelectedFleet}>
                      <SelectTrigger>
                        <SelectValue placeholder="플릿 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {getFilteredFleets().map((f) => (
                          <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {selectedEntityType === 'ship' && (
                <>
                  <div className="space-y-2">
                    <Label>선주사 (필터)</Label>
                    <Select value={selectedOwner} onValueChange={setSelectedOwner}>
                      <SelectTrigger>
                        <SelectValue placeholder="선주사 선택 (선택사항)" />
                      </SelectTrigger>
                      <SelectContent>
                        {owners.map((o) => (
                          <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>선박</Label>
                    <Select value={selectedShip} onValueChange={setSelectedShip}>
                      <SelectTrigger>
                        <SelectValue placeholder="선박 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {getFilteredShips().map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label>비고 (선택사항)</Label>
                <Textarea 
                  value={notes} 
                  onChange={(e) => setNotes(e.target.value)} 
                  placeholder="메모를 입력하세요"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddDialogOpen(false)}>취소</Button>
              <Button onClick={handleAddAssignment} disabled={processing}>
                {processing ? '처리중...' : '지정하기'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>담당 감독 해제</AlertDialogTitle>
              <AlertDialogDescription>
                정말로 <strong>{selectedAssignment?.supervisor_name}</strong> 감독의 
                <strong> {selectedAssignment?.entity_name}</strong> 담당 지정을 해제하시겠습니까?
                <br />
                <span className="text-red-500 text-sm mt-2 block">
                  <AlertCircle className="w-3 h-3 inline mr-1" />
                  이 작업은 되돌릴 수 없습니다.
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>취소</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleDeleteAssignment}
                className="bg-red-600 hover:bg-red-700"
                disabled={processing}
              >
                {processing ? '처리중...' : '해제하기'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}