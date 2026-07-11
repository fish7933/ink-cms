import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Briefcase } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getCurrentUser } from '@/lib/store';
import { getShorePositions, addShorePosition, updateShorePosition, deleteShorePosition } from '@/services/shore-position.service';
import type { ShorePosition } from '@/types/models';
import ShorePositionDialog from '@/components/shore-positions/ShorePositionDialog';
import { usePermissions } from '@/hooks/usePermissions';
import { SortableTableRow } from '@/components/ui/sortable-table-row';
import { useDragReorder } from '@/hooks/useDragReorder';
import { DndContext } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

export default function ShorePositionsPage() {
  const navigate = useNavigate();

  const [positions, setPositions] = useState<ShorePosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState<ShorePosition | null>(null);

  const permissions = usePermissions('shore_positions');

  useEffect(() => {
    const init = async () => {
      const user = await getCurrentUser();
      if (!user) { navigate('/login'); return; }
      if (!['ship_manager', 'admin', 'system_admin'].includes(user.role ?? '')) { navigate('/dashboard'); return; }
      await loadData();
    };
    init();
  }, [navigate]);

  useEffect(() => {
    if (!permissions.loading && !permissions.canView) navigate('/dashboard');
  }, [permissions.loading, permissions.canView, navigate]);

  const loadData = async () => {
    setLoading(true);
    try { setPositions(await getShorePositions()); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const { sensors, collisionDetection, handleDragEnd } = useDragReorder(
    positions,
    setPositions,
    (id, display_order) => updateShorePosition(id, { display_order }),
    loadData
  );

  const handleAdd = () => {
    setEditingPosition(null);
    setDialogOpen(true);
  };

  const handleEdit = (pos: ShorePosition) => {
    setEditingPosition(pos);
    setDialogOpen(true);
  };

  const handleSave = async (data: { name: string }) => {
    try {
      if (editingPosition) {
        await updateShorePosition(editingPosition.id, data);
      } else {
        const nextOrder = positions.length > 0 ? Math.max(...positions.map(p => p.display_order)) + 1 : 1;
        await addShorePosition({ ...data, display_order: nextOrder });
      }
      await loadData();
      setDialogOpen(false);
    } catch { alert('저장 중 오류가 발생했습니다.'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return;
    try { await deleteShorePosition(id); await loadData(); }
    catch { alert('삭제 중 오류가 발생했습니다.'); }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><p className="text-sm text-gray-500">로딩 중...</p></div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-blue-600" />
              <CardTitle className="text-base">육상 직원 직급 관리</CardTitle>
            </div>
            {permissions.canCreate && (
              <Button size="sm" className="gap-1.5 h-8" onClick={handleAdd}>
                <Plus className="h-4 w-4" />직급 추가
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {positions.length === 0 ? (
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
                  <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragEnd={handleDragEnd}>
                    <SortableContext items={positions.map(p => p.id)} strategy={verticalListSortingStrategy}>
                      {positions.map(pos => (
                        <SortableTableRow key={pos.id} id={pos.id} onClick={() => permissions.canEdit && handleEdit(pos)}>
                          <TableCell className="font-medium text-sm">{pos.name}</TableCell>
                          <TableCell className="text-sm">{pos.display_order}</TableCell>
                          <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                            {permissions.canDelete && (
                              <Button variant="ghost" size="sm" onClick={() => handleDelete(pos.id)} className="gap-1 h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50">
                                <Trash2 className="h-3.5 w-3.5" /><span className="text-xs">삭제</span>
                              </Button>
                            )}
                          </TableCell>
                        </SortableTableRow>
                      ))}
                    </SortableContext>
                  </DndContext>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ShorePositionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        position={editingPosition}
        onSave={handleSave}
      />
    </div>
  );
}
