import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/store';
import type { User } from '@/lib/store';
import type { Rank } from '@/types/models';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useTabContext } from '@/contexts/TabContext';
import { SortableTableRow } from '@/components/ui/sortable-table-row';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';

const EMPTY_FORM = { name: '', rank_code: '', department: 'deck' as 'deck'|'engine'|'catering', rank_category: 'officer' as 'officer'|'rating', stcw_requirement: '', display_order: 0 };
const DEPT_LABELS = { deck: '갑판부', engine: '기관부', catering: '사주부' };
const DEPT_COLORS = { deck: 'bg-blue-50 border-blue-200', engine: 'bg-gray-50 border-gray-200', catering: 'bg-green-50 border-green-200' };

export default function RanksPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { openNewTab, closeTab, activeTabId } = useTabContext();

  const editId = searchParams.get('id');
  const isNew = searchParams.get('mode') === 'new';
  const isFormMode = isNew || !!editId;

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    const init = async () => {
      const user = await getCurrentUser();
      if (!user) { navigate('/login'); return; }
      if (!['ship_manager', 'ship_owner', 'admin', 'system_admin'].includes(user.role)) { navigate('/dashboard'); return; }
      setCurrentUser(user);
      await loadData();
    };
    init();
  }, [navigate]);

  useEffect(() => {
    if (isFormMode) return;
    const handler = () => loadData();
    window.addEventListener('ranks-data-changed', handler);
    return () => window.removeEventListener('ranks-data-changed', handler);
  }, [isFormMode]);

  useEffect(() => {
    if (editId && ranks.length > 0) {
      const r = ranks.find(r => r.id === editId);
      if (r) setFormData({ name: r.name, rank_code: r.rank_code, department: r.department, rank_category: r.rank_category, stcw_requirement: (r as Record<string, string>).stcw_requirement || '', display_order: r.display_order });
    }
    if (isNew) {
      const max = ranks.length > 0 ? Math.max(...ranks.map(r => r.display_order)) : 0;
      setFormData({ ...EMPTY_FORM, display_order: max + 1 });
    }
  }, [editId, isNew, ranks]);

  const loadData = async () => {
    try {
      const { data, error } = await supabase.from('ranks').select('*').order('display_order');
      if (error) throw error;
      setRanks(data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const payload = { name: formData.name, rank_code: formData.rank_code, department: formData.department, rank_category: formData.rank_category, stcw_requirement: formData.stcw_requirement, display_order: formData.display_order };
      if (editId) {
        const { error } = await supabase.from('ranks').update(payload).eq('id', editId);
        if (error) throw error;
      } else {
        const max = ranks.length > 0 ? Math.max(...ranks.map(r => r.display_order)) : 0;
        const { error } = await supabase.from('ranks').insert({ ...payload, display_order: max + 1 });
        if (error) throw error;
      }
      window.dispatchEvent(new CustomEvent('ranks-data-changed'));
      closeTab(activeTabId!);
    } catch { alert('저장 중 오류가 발생했습니다.'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return;
    try {
      const { error } = await supabase.from('ranks').delete().eq('id', id);
      if (error) throw error;
      await loadData();
    } catch { alert('삭제 중 오류가 발생했습니다.'); }
  };

  const handleDeptDragEnd = async (dept: keyof typeof DEPT_LABELS, event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const deptRanks = ranks.filter(r => r.department === dept);
    const oldIndex = deptRanks.findIndex(r => r.id === active.id);
    const newIndex = deptRanks.findIndex(r => r.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    // 부서 내 실제 순서를 새 표시 순서(1..n)로 재정렬해서 저장한다. 기존 display_order 값을
    // 그대로 재사용하면(예: 부서 내 중복값이 있는 경우) 드래그해도 값이 안 바뀌는 것처럼 보일 수 있다.
    const reordered = arrayMove(deptRanks, oldIndex, newIndex).map((r, i) => ({ ...r, display_order: i + 1 }));
    const updates = reordered.map(r => ({ id: r.id, display_order: r.display_order }));

    // prev.map()은 배열 내 원래 위치를 그대로 유지하므로, filter()로 부서별 화면을 그리는 이 페이지에서는
    // display_order 값만 바꿔봤자 화면상 행 순서가 안 바뀌어 드래그가 "제자리로 돌아오는" 것처럼 보인다.
    // 이 부서에 속한 항목들을 실제로 새 순서(reordered)로 재배치해서 배열 자체를 갱신해야 한다.
    setRanks(prev => {
      const others = prev.filter(r => r.department !== dept);
      return [...others, ...reordered].sort((a, b) => a.display_order - b.display_order);
    });

    try {
      await Promise.all(updates.map(u => supabase.from('ranks').update({ display_order: u.display_order }).eq('id', u.id)));
    } catch {
      alert('순서 저장 중 오류가 발생했습니다.');
      await loadData();
    }
  };

  if (!currentUser || (loading && !isFormMode)) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>;
  }

  const grouped = { deck: ranks.filter(r => r.department === 'deck'), engine: ranks.filter(r => r.department === 'engine'), catering: ranks.filter(r => r.department === 'catering') };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex justify-between items-center">
            <CardTitle className="text-base">{isFormMode ? (editId ? '직급 수정' : '직급 추가') : '직급 관리'}</CardTitle>
            {isFormMode ? (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-8" onClick={() => closeTab(activeTabId!)}>취소</Button>
                <Button size="sm" className="gap-1.5 h-8" onClick={handleSave} disabled={saving}>
                  <Save className="w-4 h-4" />{saving ? '저장 중...' : '저장'}
                </Button>
              </div>
            ) : (
              <Button size="sm" className="gap-1.5 h-8" onClick={() => openNewTab('/ranks?mode=new', '직급 추가', true)}>
                <Plus className="w-4 h-4" />직급 추가
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          {isFormMode ? (
            <div className="space-y-3 pt-2 max-w-lg">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm">직급 코드 *</Label>
                  <Input value={formData.rank_code} onChange={e => setFormData({ ...formData, rank_code: e.target.value })} placeholder="예: MSTR, C/O" className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">직급명 *</Label>
                  <Input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="예: Master, Chief Officer" className="h-9 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm">부서 *</Label>
                  <select value={formData.department} onChange={e => setFormData({ ...formData, department: e.target.value as 'deck'|'engine'|'catering' })} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm">
                    <option value="deck">갑판부</option><option value="engine">기관부</option><option value="catering">사주부</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">직급 구분 *</Label>
                  <select value={formData.rank_category} onChange={e => setFormData({ ...formData, rank_category: e.target.value as 'officer'|'rating' })} className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm">
                    <option value="officer">Officer (사관)</option><option value="rating">Rating (부원)</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">STCW 요구사항</Label>
                <Input value={formData.stcw_requirement} onChange={e => setFormData({ ...formData, stcw_requirement: e.target.value })} placeholder="예: STCW II/2" className="h-9 text-sm" />
              </div>
            </div>
          ) : ranks.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-500">등록된 직급이 없습니다</div>
          ) : (
            <div className="space-y-3">
              {(Object.entries(grouped) as [keyof typeof grouped, Rank[]][]).map(([dept, deptRanks]) => {
                if (!deptRanks.length) return null;
                return (
                  <div key={dept} className={`rounded-lg border p-3 ${DEPT_COLORS[dept]}`}>
                    <h3 className="text-sm font-semibold mb-2 text-gray-700">{DEPT_LABELS[dept]} ({deptRanks.length})</h3>
                    <div className="rounded-md border bg-white overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-gray-50/50">
                            <TableHead className="w-12 text-xs"></TableHead>
                            <TableHead className="text-xs">직급 코드</TableHead>
                            <TableHead className="text-xs">직급명</TableHead>
                            <TableHead className="text-xs">구분</TableHead>
                            <TableHead className="text-xs">STCW</TableHead>
                            <TableHead className="text-right text-xs w-20">작업</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDeptDragEnd(dept, e)}>
                            <SortableContext items={deptRanks.map(r => r.id)} strategy={verticalListSortingStrategy}>
                              {deptRanks.map((rank) => (
                                <SortableTableRow key={rank.id} id={rank.id} className="hover:bg-gray-50/50" onClick={() => openNewTab(`/ranks?id=${rank.id}`, `${rank.name} 수정`)}>
                                  <TableCell className="font-bold text-sm py-2">{rank.rank_code}</TableCell>
                                  <TableCell className="font-medium text-sm py-2">{rank.name}</TableCell>
                                  <TableCell className="text-sm py-2">
                                    <Badge variant={rank.rank_category === 'officer' ? 'default' : 'secondary'} className="text-xs">{rank.rank_category === 'officer' ? '사관' : '부원'}</Badge>
                                  </TableCell>
                                  <TableCell className="text-sm py-2">{(rank as Record<string, string>).stcw_requirement}</TableCell>
                                  <TableCell className="text-right py-2" onClick={e => e.stopPropagation()}>
                                    <Button size="sm" variant="ghost" onClick={() => handleDelete(rank.id)} className="h-6 px-2 text-red-600 hover:text-red-700 hover:bg-red-50">
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  </TableCell>
                                </SortableTableRow>
                              ))}
                            </SortableContext>
                          </DndContext>
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
