import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Trash2, Briefcase, GripVertical, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getCurrentUser } from '@/lib/store';
import { getShorePositions, addShorePosition, updateShorePosition, deleteShorePosition } from '@/services/shore-position.service';
import type { ShorePosition } from '@/types/models';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useTabContext } from '@/contexts/TabContext';

export default function ShorePositionsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { openNewTab, closeTab, activeTabId } = useTabContext();

  const editId = searchParams.get('id');
  const isNew = searchParams.get('mode') === 'new';
  const isFormMode = isNew || !!editId;

  const [positions, setPositions] = useState<ShorePosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({ name: '', display_order: 0 });

  useEffect(() => {
    const init = async () => {
      const user = await getCurrentUser();
      if (!user) { navigate('/login'); return; }
      if (!['ship_manager', 'admin'].includes(user.role ?? '')) { navigate('/dashboard'); return; }
      await loadData();
    };
    init();
  }, [navigate]);

  useEffect(() => {
    if (isFormMode) return;
    const handler = () => loadData();
    window.addEventListener('shorepos-data-changed', handler);
    return () => window.removeEventListener('shorepos-data-changed', handler);
  }, [isFormMode]);

  useEffect(() => {
    if (editId && positions.length > 0) {
      const pos = positions.find(p => p.id === editId);
      if (pos) setFormData({ name: pos.name, display_order: pos.display_order });
    }
    if (isNew) {
      const maxOrder = positions.length > 0 ? Math.max(...positions.map(p => p.display_order)) : 0;
      setFormData({ name: '', display_order: maxOrder + 1 });
    }
  }, [editId, isNew, positions]);

  const loadData = async () => {
    setLoading(true);
    try { setPositions(await getShorePositions()); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      if (editId) await updateShorePosition(editId, formData);
      else await addShorePosition(formData);
      window.dispatchEvent(new CustomEvent('shorepos-data-changed'));
      closeTab(activeTabId!);
    } catch { alert('저장 중 오류가 발생했습니다.'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return;
    try { await deleteShorePosition(id); await loadData(); }
    catch { alert('삭제 중 오류가 발생했습니다.'); }
  };

  if (loading && !isFormMode) {
    return <div className="flex items-center justify-center h-64"><p className="text-sm text-gray-500">로딩 중...</p></div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-blue-600" />
              <CardTitle className="text-base">
                {isFormMode ? (editId ? '직급 수정' : '직급 추가') : '육상 직원 직급 관리'}
              </CardTitle>
            </div>
            {isFormMode ? (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-8" onClick={() => closeTab(activeTabId!)}>취소</Button>
                <Button size="sm" className="gap-1.5 h-8" onClick={handleSave} disabled={saving}>
                  <Save className="w-4 h-4" />{saving ? '저장 중...' : '저장'}
                </Button>
              </div>
            ) : (
              <Button size="sm" className="gap-1.5 h-8" onClick={() => openNewTab('/shore-positions?mode=new', '직급 추가', true)}>
                <Plus className="h-4 w-4" />직급 추가
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {isFormMode ? (
            <div className="space-y-3 pt-2 max-w-sm">
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-xs">직급명 *</Label>
                <Input id="name" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="예: 부장" className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="display_order" className="text-xs">표시 순서</Label>
                <Input id="display_order" type="number" value={formData.display_order} onChange={e => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })} className="h-9 text-sm w-32" />
                <p className="text-xs text-gray-500">숫자가 작을수록 상위에 표시됩니다</p>
              </div>
            </div>
          ) : (
            positions.length === 0 ? (
              <div className="text-center py-6 text-sm text-gray-500">등록된 직급이 없습니다.</div>
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
                    {positions.map(pos => (
                      <TableRow key={pos.id} className="cursor-pointer hover:bg-gray-50" onClick={() => openNewTab(`/shore-positions?id=${pos.id}`, pos.name)}>
                        <TableCell><GripVertical className="w-4 h-4 text-gray-400" /></TableCell>
                        <TableCell className="font-medium text-sm">{pos.name}</TableCell>
                        <TableCell className="text-sm">{pos.display_order}</TableCell>
                        <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(pos.id)} className="gap-1 h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50">
                            <Trash2 className="h-3.5 w-3.5" /><span className="text-xs">삭제</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )
          )}
        </CardContent>
      </Card>
    </div>
  );
}
