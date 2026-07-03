import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Anchor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { getCurrentUser } from '@/lib/store';
import { getPorts, addPort, updatePort, deletePort } from '@/services/port.service';
import type { Port } from '@/types/port';
import PortDialog from '@/components/ports/PortDialog';
import { SortableTableRow } from '@/components/ui/sortable-table-row';
import { useDragReorder } from '@/hooks/useDragReorder';
import { DndContext } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

export default function PortManagementPage() {
  const navigate = useNavigate();

  const [ports, setPorts] = useState<Port[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPort, setEditingPort] = useState<Port | null>(null);

  useEffect(() => {
    const init = async () => {
      const user = await getCurrentUser();
      if (!user) { navigate('/login'); return; }
      if (!['ship_manager', 'admin', 'system_admin'].includes(user.role ?? '')) { navigate('/dashboard'); return; }
      await loadData();
    };
    init();
  }, [navigate]);

  const loadData = async () => {
    setLoading(true);
    try { setPorts(await getPorts(false)); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const { sensors, collisionDetection, handleDragEnd } = useDragReorder(
    ports,
    setPorts,
    (id, display_order) => updatePort(id, { display_order }),
    loadData
  );

  const handleAdd = () => {
    setEditingPort(null);
    setDialogOpen(true);
  };

  const handleEdit = (port: Port) => {
    setEditingPort(port);
    setDialogOpen(true);
  };

  const handleSave = async (data: { country_code: string | null; country_name: string; city_name: string; is_active: boolean }) => {
    try {
      if (editingPort) {
        await updatePort(editingPort.id, data);
      } else {
        const nextOrder = ports.length > 0 ? Math.max(...ports.map(p => p.display_order)) + 1 : 1;
        await addPort({ ...data, display_order: nextOrder });
      }
      await loadData();
      setDialogOpen(false);
    } catch { alert('저장 중 오류가 발생했습니다.'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return;
    try { await deletePort(id); await loadData(); }
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
              <Anchor className="w-5 h-5 text-blue-600" />
              <CardTitle className="text-base">교대지 관리</CardTitle>
            </div>
            <Button size="sm" className="gap-1.5 h-8" onClick={handleAdd}>
              <Plus className="h-4 w-4" />교대지 추가
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {ports.length === 0 ? (
            <div className="text-center py-6 text-sm text-gray-500">등록된 교대지가 없습니다.</div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs w-12"></TableHead>
                    <TableHead className="text-xs">국가</TableHead>
                    <TableHead className="text-xs">도시</TableHead>
                    <TableHead className="text-xs w-20">상태</TableHead>
                    <TableHead className="text-right text-xs w-24">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragEnd={handleDragEnd}>
                    <SortableContext items={ports.map(p => p.id)} strategy={verticalListSortingStrategy}>
                      {ports.map(port => (
                        <SortableTableRow key={port.id} id={port.id} onClick={() => handleEdit(port)}>
                          <TableCell className="text-sm">{port.country_name}</TableCell>
                          <TableCell className="font-medium text-sm">{port.city_name}</TableCell>
                          <TableCell>
                            {port.is_active ? <Badge variant="secondary" className="text-xs">활성</Badge> : <Badge variant="outline" className="text-xs">비활성</Badge>}
                          </TableCell>
                          <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(port.id)} className="gap-1 h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50">
                              <Trash2 className="h-3.5 w-3.5" /><span className="text-xs">삭제</span>
                            </Button>
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

      <PortDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        port={editingPort}
        onSave={handleSave}
      />
    </div>
  );
}
