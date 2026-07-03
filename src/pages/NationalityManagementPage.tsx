import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getNationalities, addNationality, updateNationality, deleteNationality } from '@/services/nationality.service';
import type { Nationality } from '@/types/nationality';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, Globe, Save } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useTabContext } from '@/contexts/TabContext';
import { getCurrentUser } from '@/services/auth.service';
import { SortableTableRow } from '@/components/ui/sortable-table-row';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';

const EMPTY_FORM = {
  country_code: '', country_name_en: '', country_name_ko: '',
  region: 'asia' as 'asia' | 'europe' | 'americas' | 'africa' | 'oceania',
  is_major_supplier: false, is_active: true, display_order: 999,
};

const REGION_LABELS: Record<string, string> = { asia: '아시아', europe: '유럽', americas: '아메리카', africa: '아프리카', oceania: '오세아니아' };

export default function NationalityManagementPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { openNewTab, closeTab, activeTabId } = useTabContext();

  const editId = searchParams.get('id');
  const isNew = searchParams.get('mode') === 'new';
  const isFormMode = isNew || !!editId;

  const [nationalities, setNationalities] = useState<Nationality[]>([]);
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
      if (!user || !['ship_manager', 'admin', 'system_admin'].includes(user.role ?? '')) { navigate('/dashboard'); return; }
      await loadData();
    };
    init();
  }, [navigate]);

  useEffect(() => {
    if (isFormMode) return;
    const handler = () => loadData();
    window.addEventListener('nationality-data-changed', handler);
    return () => window.removeEventListener('nationality-data-changed', handler);
  }, [isFormMode]);

  useEffect(() => {
    if (editId && nationalities.length > 0) {
      const nat = nationalities.find(n => n.id === editId);
      if (nat) setFormData({
        country_code: nat.country_code, country_name_en: nat.country_name_en,
        country_name_ko: nat.country_name_ko, region: nat.region || 'asia',
        is_major_supplier: nat.is_major_supplier || false,
        is_active: nat.is_active !== false, display_order: nat.display_order || 999,
      });
    }
    if (isNew) setFormData(EMPTY_FORM);
  }, [editId, isNew, nationalities]);

  const loadData = async () => {
    try { setNationalities(await getNationalities(false)); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      if (editId) await updateNationality(editId, formData);
      else await addNationality(formData);
      window.dispatchEvent(new CustomEvent('nationality-data-changed'));
      closeTab(activeTabId!);
    } catch { alert('저장 중 오류가 발생했습니다.'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return;
    try { await deleteNationality(id); await loadData(); }
    catch { alert('삭제 중 오류가 발생했습니다.'); }
  };

  const handleGroupDragEnd = async (groupItems: Nationality[], event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = groupItems.findIndex(n => n.id === active.id);
    const newIndex = groupItems.findIndex(n => n.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const orderValues = groupItems.map(n => n.display_order);
    const reordered = arrayMove(groupItems, oldIndex, newIndex);
    const updates = reordered.map((n, i) => ({ id: n.id, display_order: orderValues[i] }));

    setNationalities(prev => prev.map(n => {
      const u = updates.find(u => u.id === n.id);
      return u ? { ...n, display_order: u.display_order } : n;
    }));

    try {
      await Promise.all(updates.map(u => updateNationality(u.id, { display_order: u.display_order })));
    } catch {
      alert('순서 저장 중 오류가 발생했습니다.');
      await loadData();
    }
  };

  const renderTable = (items: Nationality[], emptyMsg: string) => (
    items.length === 0 ? <div className="text-center py-6 text-sm text-gray-500">{emptyMsg}</div> : (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs w-12"></TableHead>
              <TableHead className="text-xs w-20">코드</TableHead>
              <TableHead className="text-xs">영문명</TableHead>
              <TableHead className="text-xs">한글명</TableHead>
              <TableHead className="text-xs">지역</TableHead>
              <TableHead className="text-xs">상태</TableHead>
              <TableHead className="text-right text-xs w-16">작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleGroupDragEnd(items, e)}>
              <SortableContext items={items.map(n => n.id)} strategy={verticalListSortingStrategy}>
                {items.map(n => (
                  <SortableTableRow key={n.id} id={n.id} onClick={() => openNewTab(`/nationalities?id=${n.id}`, `${n.country_name_ko} 수정`)}>
                    <TableCell className="text-sm font-mono font-semibold">{n.country_code}</TableCell>
                    <TableCell className="text-sm">{n.country_name_en}</TableCell>
                    <TableCell className="text-sm font-medium">{n.country_name_ko}</TableCell>
                    <TableCell className="text-sm">{REGION_LABELS[n.region || ''] || n.region}</TableCell>
                    <TableCell>
                      {n.is_active ? <Badge variant="secondary" className="text-xs">활성</Badge> : <Badge variant="outline" className="text-xs">비활성</Badge>}
                    </TableCell>
                    <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(n.id)} className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50">
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
    )
  );

  if (loading && !isFormMode) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;
  }

  const major = nationalities.filter(n => n.is_major_supplier);
  const others = nationalities.filter(n => !n.is_major_supplier);

  return (
    <main className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5" />
              <div>
                <CardTitle className="text-base">{isFormMode ? (editId ? '국적 수정' : '국적 추가') : '선원 국적 관리'}</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">{isFormMode ? '국적 정보를 입력하세요' : '주요 선원 송출국 및 국적 데이터 관리'}</p>
              </div>
            </div>
            {isFormMode ? (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-8" onClick={() => closeTab(activeTabId!)}>취소</Button>
                <Button size="sm" className="gap-1.5 h-8" onClick={handleSave} disabled={saving}>
                  <Save className="w-4 h-4" />{saving ? '저장 중...' : '저장'}
                </Button>
              </div>
            ) : (
              <Button size="sm" className="gap-1.5 h-8" onClick={() => openNewTab('/nationalities?mode=new', '국적 추가', true)}>
                <Plus className="w-3.5 h-3.5" />국적 추가
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {isFormMode ? (
            <div className="space-y-3 pt-2 max-w-lg">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">국가 코드 * (ISO 3166-1 alpha-2)</Label>
                  <Input value={formData.country_code} onChange={e => setFormData({ ...formData, country_code: e.target.value.toUpperCase() })} placeholder="예: KR, PH, US" maxLength={2} disabled={!!editId} className="h-9 text-sm font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">지역 *</Label>
                  <Select value={formData.region} onValueChange={(v: 'asia'|'europe'|'americas'|'africa'|'oceania') => setFormData({ ...formData, region: v })}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(REGION_LABELS).map(([v, l]) => <SelectItem key={v} value={v} className="text-sm">{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">영문명 *</Label>
                  <Input value={formData.country_name_en} onChange={e => setFormData({ ...formData, country_name_en: e.target.value })} placeholder="예: South Korea" className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">한글명 *</Label>
                  <Input value={formData.country_name_ko} onChange={e => setFormData({ ...formData, country_name_ko: e.target.value })} placeholder="예: 대한민국" className="h-9 text-sm" />
                </div>
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={formData.is_major_supplier} onCheckedChange={c => setFormData({ ...formData, is_major_supplier: c === true })} />
                  <span className="text-xs">주요 선원 송출국</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={formData.is_active} onCheckedChange={c => setFormData({ ...formData, is_active: c === true })} />
                  <span className="text-xs">활성 상태</span>
                </label>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold mb-2">주요 선원 송출국 ({major.length})</h3>
                {renderTable(major, '등록된 주요 송출국이 없습니다')}
              </div>
              <div>
                <h3 className="text-sm font-semibold mb-2">기타 국가 ({others.length})</h3>
                {renderTable(others, '등록된 기타 국가가 없습니다')}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
