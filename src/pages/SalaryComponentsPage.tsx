import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit2, Trash2, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { getCurrentUser } from '@/lib/store';
import ProtectedRoute from '@/components/ProtectedRoute';
import { usePermissions } from '@/hooks/usePermissions';
import {
  getSalaryComponents,
  addSalaryComponent,
  updateSalaryComponent,
  deleteSalaryComponent,
  type SalaryComponent,
} from '@/lib/salary-store';

export default function SalaryComponentsPage() {
  const navigate = useNavigate();
  const [components, setComponents] = useState<SalaryComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingComponent, setEditingComponent] = useState<SalaryComponent | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    display_order: 0,
  });
  const [error, setError] = useState('');

  const permissions = usePermissions('salary_components');

  useEffect(() => {
    const loadUser = async () => {
      const user = await getCurrentUser();
      if (!user) {
        navigate('/login');
        return;
      }
      if (user.role !== 'ship_manager' && user.role !== 'ship_owner') {
        navigate('/dashboard');
        return;
      }
      loadComponents();
    };
    
    loadUser();
  }, [navigate]);

  const loadComponents = async () => {
    setLoading(true);
    const data = await getSalaryComponents();
    setComponents(data);
    setLoading(false);
  };

  const handleOpenDialog = (component?: SalaryComponent) => {
    if (component) {
      setEditingComponent(component);
      setFormData({
        name: component.name,
        description: component.description || '',
        display_order: component.display_order,
      });
    } else {
      setEditingComponent(null);
      setFormData({
        name: '',
        description: '',
        display_order: components.length + 1,
      });
    }
    setError('');
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingComponent(null);
    setFormData({ name: '', description: '', display_order: 0 });
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.name.trim()) {
      setError('급여 항목명을 입력해주세요.');
      return;
    }

    try {
      if (editingComponent) {
        const updated = await updateSalaryComponent(editingComponent.id, formData);
        if (updated) {
          await loadComponents();
          handleCloseDialog();
        } else {
          setError('급여 항목 수정에 실패했습니다.');
        }
      } else {
        const added = await addSalaryComponent({
          ...formData,
          is_active: true,
        });
        if (added) {
          await loadComponents();
          handleCloseDialog();
        } else {
          setError('급여 항목 추가에 실패했습니다.');
        }
      }
    } catch (err) {
      setError('오류가 발생했습니다. 다시 시도해주세요.');
      console.error('Error saving component:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 급여 항목을 삭제하시겠습니까?')) return;

    const success = await deleteSalaryComponent(id);
    if (success) {
      await loadComponents();
    } else {
      alert('급여 항목 삭제에 실패했습니다.');
    }
  };

  if (loading) {
    return (
      <ProtectedRoute resource="salary_components">
        <>
          <div className="flex items-center justify-center h-64">
            <p className="text-sm text-gray-500">로딩 중...</p>
          </div>
        </>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute resource="salary_components">
      <>
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">급여 구성 항목 관리</CardTitle>
                {permissions.canCreate && (
                  <Button size="sm" className="gap-1.5 h-8" onClick={() => handleOpenDialog()}>
                    <Plus className="h-4 w-4" />
                    항목 추가
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {components.length === 0 ? (
                <div className="text-center py-6 text-sm text-gray-500">
                  등록된 급여 항목이 없습니다. 새로운 항목을 추가해주세요.
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16 text-xs">순서</TableHead>
                        <TableHead className="text-xs">항목명</TableHead>
                        <TableHead className="text-xs">설명</TableHead>
                        {(permissions.canEdit || permissions.canDelete) && (
                          <TableHead className="text-right text-xs w-32">작업</TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {components.map((component) => (
                        <TableRow key={component.id}>
                          <TableCell className="text-sm">{component.display_order}</TableCell>
                          <TableCell className="font-medium text-sm">{component.name}</TableCell>
                          <TableCell className="text-gray-600 text-sm">
                            {component.description || '-'}
                          </TableCell>
                          {(permissions.canEdit || permissions.canDelete) && (
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                {permissions.canEdit && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleOpenDialog(component)}
                                    className="gap-1 h-7 px-2"
                                  >
                                    <Edit2 className="h-3.5 w-3.5" />
                                    <span className="text-xs">수정</span>
                                  </Button>
                                )}
                                {permissions.canDelete && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDelete(component.id)}
                                    className="gap-1 h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    <span className="text-xs">삭제</span>
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="text-base">
                  {editingComponent ? '급여 항목 수정' : '급여 항목 추가'}
                </DialogTitle>
                <DialogDescription className="text-sm">
                  급여 템플릿에서 사용할 항목을 {editingComponent ? '수정' : '추가'}합니다
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit}>
                <div className="space-y-3 py-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="name" className="text-sm">항목명 *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="예: 기본급, 시간외 수당"
                      className="h-9 text-sm"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="description" className="text-sm">설명</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="항목에 대한 설명을 입력하세요"
                      rows={2}
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="display_order" className="text-sm">표시 순서</Label>
                    <Input
                      id="display_order"
                      type="number"
                      value={formData.display_order}
                      onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })}
                      min="1"
                      className="h-9 text-sm"
                      required
                    />
                  </div>
                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription className="text-sm">{error}</AlertDescription>
                    </Alert>
                  )}
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" size="sm" onClick={handleCloseDialog} className="h-8">
                    <X className="h-3.5 w-3.5 mr-1.5" />
                    취소
                  </Button>
                  <Button type="submit" size="sm" className="h-8">
                    <Save className="h-3.5 w-3.5 mr-1.5" />
                    저장
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </>
    </ProtectedRoute>
  );
}