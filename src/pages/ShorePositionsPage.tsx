import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit2, Trash2, Briefcase, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getCurrentUser } from '@/lib/store';
import { getShorePositions, addShorePosition, updateShorePosition, deleteShorePosition } from '@/services/shore-position.service';
import type { ShorePosition } from '@/types/models';
import Layout from '@/components/Layout';
import ProtectedRoute from '@/components/ProtectedRoute';
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

export default function ShorePositionsPage() {
  const navigate = useNavigate();
  const [positions, setPositions] = useState<ShorePosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState<ShorePosition | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    display_order: 0,
  });

  useEffect(() => {
    const loadUser = async () => {
      const user = await getCurrentUser();
      if (!user) {
        navigate('/login');
        return;
      }
      if (user.role !== 'ship_manager') {
        navigate('/dashboard');
        return;
      }
      loadData();
    };
    
    loadUser();
  }, [navigate]);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getShorePositions();
      setPositions(data);
    } catch (error) {
      console.error('Error loading positions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (position?: ShorePosition) => {
    if (position) {
      setEditingPosition(position);
      setFormData({
        name: position.name,
        display_order: position.display_order,
      });
    } else {
      setEditingPosition(null);
      const maxOrder = positions.length > 0 ? Math.max(...positions.map(p => p.display_order)) : 0;
      setFormData({
        name: '',
        display_order: maxOrder + 1,
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingPosition(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (editingPosition) {
        await updateShorePosition(editingPosition.id, formData);
      } else {
        await addShorePosition(formData);
      }
      
      setDialogOpen(false);
      await loadData();
    } catch (error) {
      console.error('Error saving position:', error);
      alert('직급 저장 중 오류가 발생했습니다.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 직급을 삭제하시겠습니까?')) return;
    
    try {
      await deleteShorePosition(id);
      await loadData();
    } catch (error) {
      console.error('Error deleting position:', error);
      alert('직급 삭제 중 오류가 발생했습니다.');
    }
  };

  if (loading) {
    return (
      <ProtectedRoute resource="settings">
        <Layout>
          <div className="flex items-center justify-center h-64">
            <p className="text-sm text-gray-500">로딩 중...</p>
          </div>
        </Layout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute resource="settings">
      <Layout>
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Briefcase className="w-5 h-5 text-blue-600" />
                  <CardTitle className="text-base">육상 직원 직급 관리</CardTitle>
                </div>
                <Button size="sm" className="gap-1.5 h-8" onClick={() => handleOpenDialog()}>
                  <Plus className="h-4 w-4" />
                  직급 추가
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {positions.length === 0 ? (
                <div className="text-center py-6 text-sm text-gray-500">
                  등록된 직급이 없습니다. 새로운 직급을 추가해주세요.
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs w-12"></TableHead>
                        <TableHead className="text-xs">직급명</TableHead>
                        <TableHead className="text-xs w-24">표시 순서</TableHead>
                        <TableHead className="text-right text-xs w-32">작업</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {positions.map((position) => (
                        <TableRow key={position.id}>
                          <TableCell>
                            <GripVertical className="w-4 h-4 text-gray-400" />
                          </TableCell>
                          <TableCell className="font-medium text-sm">{position.name}</TableCell>
                          <TableCell className="text-sm">{position.display_order}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenDialog(position)}
                                className="gap-1 h-7 px-2"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                                <span className="text-xs">수정</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(position.id)}
                                className="gap-1 h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span className="text-xs">삭제</span>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle className="text-base">
                  {editingPosition ? '직급 수정' : '직급 추가'}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {editingPosition ? '직급 정보를 수정합니다' : '새로운 직급을 등록합니다'}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit}>
                <div className="grid gap-3 py-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="name" className="text-xs">직급명 *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="예: 부장"
                      required
                      className="h-9 text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="display_order" className="text-xs">표시 순서 *</Label>
                    <Input
                      id="display_order"
                      type="number"
                      value={formData.display_order}
                      onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })}
                      placeholder="1"
                      required
                      className="h-9 text-sm"
                    />
                    <p className="text-xs text-gray-500">숫자가 작을수록 상위에 표시됩니다</p>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleCloseDialog}
                    className="h-8"
                  >
                    취소
                  </Button>
                  <Button type="submit" size="sm" className="h-8">
                    {editingPosition ? '수정' : '추가'}
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