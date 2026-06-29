import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Briefcase, GripVertical, ArrowLeft, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getCurrentUser } from '@/lib/store';
import { getShorePositions, addShorePosition, updateShorePosition, deleteShorePosition } from '@/services/shore-position.service';
import type { ShorePosition } from '@/types/models';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

export default function ShorePositionsPage() {
  const navigate = useNavigate();
  const [positions, setPositions] = useState<ShorePosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [formView, setFormView] = useState<{ id?: string } | null>(null);
  const [saving, setSaving] = useState(false);
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

  const openForm = (position?: ShorePosition) => {
    if (position) {
      setFormData({
        name: position.name,
        display_order: position.display_order,
      });
      setFormView({ id: position.id });
    } else {
      const maxOrder = positions.length > 0 ? Math.max(...positions.map(p => p.display_order)) : 0;
      setFormData({
        name: '',
        display_order: maxOrder + 1,
      });
      setFormView({});
    }
  };

  const closeForm = () => {
    setFormView(null);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      if (formView?.id) {
        await updateShorePosition(formView.id, formData);
      } else {
        await addShorePosition(formData);
      }

      closeForm();
      await loadData();
    } catch (error) {
      console.error('Error saving position:', error);
      alert('직급 저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
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
        <>
          <div className="flex items-center justify-center h-64">
            <p className="text-sm text-gray-500">로딩 중...</p>
          </div>
        </>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute resource="settings">
      <>
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {formView !== null && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={closeForm}>
                      <ArrowLeft className="w-4 h-4" />
                    </Button>
                  )}
                  <Briefcase className="w-5 h-5 text-blue-600" />
                  <CardTitle className="text-base">
                    {formView !== null ? (formView.id ? '직급 수정' : '직급 추가') : '육상 직원 직급 관리'}
                  </CardTitle>
                </div>
                {formView !== null ? (
                  <Button size="sm" className="gap-1.5 h-8" onClick={handleSave} disabled={saving}>
                    <Save className="w-4 h-4" />
                    {saving ? '저장 중...' : '저장'}
                  </Button>
                ) : (
                  <Button size="sm" className="gap-1.5 h-8" onClick={() => openForm()}>
                    <Plus className="h-4 w-4" />
                    직급 추가
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {formView !== null ? (
                <div className="space-y-3 pt-2">
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
                      className="h-9 text-sm w-32"
                    />
                    <p className="text-xs text-gray-500">숫자가 작을수록 상위에 표시됩니다</p>
                  </div>
                </div>
              ) : (
                <>
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
                            <TableHead className="text-right text-xs w-24">작업</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {positions.map((position) => (
                            <TableRow key={position.id} className="cursor-pointer hover:bg-gray-50" onClick={() => openForm(position)}>
                              <TableCell>
                                <GripVertical className="w-4 h-4 text-gray-400" />
                              </TableCell>
                              <TableCell className="font-medium text-sm">{position.name}</TableCell>
                              <TableCell className="text-sm">{position.display_order}</TableCell>
                              <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDelete(position.id)}
                                  className="gap-1 h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  <span className="text-xs">삭제</span>
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </>
    </ProtectedRoute>
  );
}
