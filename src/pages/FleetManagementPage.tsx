import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser, getFleets, addFleet, updateFleet, deleteFleet, getFleetShips } from '@/lib/store';
import type { User, Fleet } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Pencil, Trash2, Ship } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import Layout from '@/components/Layout';
import ProtectedRoute from '@/components/ProtectedRoute';
import { usePermissions } from '@/hooks/usePermissions';

export default function FleetManagementPage() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [loading, setLoading] = useState(true);
  const [fleetShipCounts, setFleetShipCounts] = useState<Record<string, number>>({});

  const permissions = usePermissions('fleets');

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingFleet, setEditingFleet] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
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
      const user = await getCurrentUser();
      const fleetsData = await getFleets(user?.role === 'ship_owner' ? user.id : undefined);
      setFleets(fleetsData);

      // Load ship counts for each fleet
      const counts: Record<string, number> = {};
      for (const fleet of fleetsData) {
        const ships = await getFleetShips(fleet.id);
        counts[fleet.id] = ships.length;
      }
      setFleetShipCounts(counts);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!currentUser || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3"></div>
          <p className="text-sm text-gray-600">로딩 중...</p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const fleetData = {
      name: formData.name,
      description: formData.description,
      owner_id: currentUser.id,
      is_active: true,
    };

    if (editingFleet) {
      await updateFleet(editingFleet, fleetData);
    } else {
      await addFleet(fleetData);
    }

    await loadData();
    setIsDialogOpen(false);
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
    });
    setEditingFleet(null);
  };

  const handleEdit = (fleet: Fleet) => {
    setFormData({
      name: fleet.name,
      description: fleet.description || '',
    });
    setEditingFleet(fleet.id);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('이 플릿을 삭제하시겠습니까?')) {
      await deleteFleet(id);
      await loadData();
    }
  };

  return (
    <ProtectedRoute resource="fleets">
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50">
        <main className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-center">
                <CardTitle className="text-base">플릿 관리</CardTitle>
                {permissions.canCreate && (
                  <Dialog open={isDialogOpen} onOpenChange={(open) => {
                    setIsDialogOpen(open);
                    if (!open) resetForm();
                  }}>
                    <DialogTrigger asChild>
                      <Button size="sm" className="gap-1.5 h-8">
                        <Plus className="w-4 h-4" />
                        플릿 추가
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle className="text-base">{editingFleet ? '플릿 수정' : '플릿 추가'}</DialogTitle>
                        <DialogDescription className="text-sm">플릿 정보를 입력하세요</DialogDescription>
                      </DialogHeader>
                      <form onSubmit={handleSubmit} className="space-y-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="name" className="text-sm">플릿명 *</Label>
                          <Input
                            id="name"
                            value={formData.name}
                            onChange={(e) => setFormData({...formData, name: e.target.value})}
                            placeholder="예: Pacific Fleet"
                            className="h-9 text-sm"
                            required
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="description" className="text-sm">설명</Label>
                          <Textarea
                            id="description"
                            value={formData.description}
                            onChange={(e) => setFormData({...formData, description: e.target.value})}
                            placeholder="플릿에 대한 설명을 입력하세요"
                            className="text-sm min-h-[80px]"
                          />
                        </div>
                        <div className="flex gap-2 pt-2">
                          <Button type="submit" size="sm" className="flex-1 h-8">
                            {editingFleet ? '수정' : '추가'}
                          </Button>
                          <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setIsDialogOpen(false)}>
                            취소
                          </Button>
                        </div>
                      </form>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">플릿명</TableHead>
                      <TableHead className="text-xs">설명</TableHead>
                      <TableHead className="text-xs">선박 수</TableHead>
                      <TableHead className="text-xs">상태</TableHead>
                      {(permissions.canEdit || permissions.canDelete) && (
                        <TableHead className="text-right text-xs w-32">작업</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fleets.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-6 text-sm text-gray-500">
                          등록된 플릿이 없습니다
                        </TableCell>
                      </TableRow>
                    ) : (
                      fleets.map((fleet) => (
                        <TableRow key={fleet.id}>
                          <TableCell className="font-medium text-sm">{fleet.name}</TableCell>
                          <TableCell className="text-sm text-gray-600">{fleet.description || '-'}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <Ship className="w-3.5 h-3.5 text-gray-500" />
                              <span className="text-sm">{fleetShipCounts[fleet.id] || 0}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {fleet.is_active ? (
                              <Badge variant="default" className="text-xs">활성</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">비활성</Badge>
                            )}
                          </TableCell>
                          {(permissions.canEdit || permissions.canDelete) && (
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                {permissions.canEdit && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleEdit(fleet)}
                                    className="gap-1 h-7 px-2"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                    <span className="text-xs">수정</span>
                                  </Button>
                                )}
                                {permissions.canDelete && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleDelete(fleet.id)}
                                    className="gap-1 h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span className="text-xs">삭제</span>
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    </ProtectedRoute>
  );
}