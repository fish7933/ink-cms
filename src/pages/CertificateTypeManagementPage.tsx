import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getCurrentUser } from '@/services/auth.service';
import { getCertificateTypes, addCertificateType, updateCertificateType, deleteCertificateType } from '@/services/certificate-type.service';
import {
  getCertificateCategories, addCertificateCategory, updateCertificateCategory, deleteCertificateCategory,
} from '@/services/certificate-category.service';
import type { CertificateType } from '@/types/certificate-type';
import type { CertificateCategory } from '@/types/certificate-category';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, FileText, Save, Settings, Edit2, X, Check } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTabContext } from '@/contexts/TabContext';
import { SortableTableRow } from '@/components/ui/sortable-table-row';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';

const EMPTY_FORM = { category: '', type_code: '', type_name_en: '', type_name_ko: '', description: '', validity_period_months: undefined as number|undefined, is_mandatory: false, is_active: true, display_order: 999 };

export default function CertificateTypeManagementPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { openNewTab, closeTab, activeTabId } = useTabContext();

  const editId = searchParams.get('id');
  const isNew = searchParams.get('mode') === 'new';
  const isFormMode = isNew || !!editId;

  const [types, setTypes] = useState<CertificateType[]>([]);
  const [categories, setCategories] = useState<CertificateCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [activeTab, setActiveTab] = useState('');

  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [newCatCode, setNewCatCode] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState('');
  const [catSaving, setCatSaving] = useState(false);

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
    window.addEventListener('certtype-data-changed', handler);
    return () => window.removeEventListener('certtype-data-changed', handler);
  }, [isFormMode]);

  useEffect(() => {
    if (editId && types.length > 0) {
      const t = types.find(t => t.id === editId);
      if (t) setFormData({ category: t.category, type_code: t.type_code, type_name_en: t.type_name_en, type_name_ko: t.type_name_ko, description: t.description || '', validity_period_months: t.validity_period_months || undefined, is_mandatory: t.is_mandatory || false, is_active: t.is_active !== false, display_order: t.display_order || 999 });
    }
    if (isNew) setFormData({ ...EMPTY_FORM, category: categories[0]?.code || '' });
  }, [editId, isNew, types, categories]);

  useEffect(() => {
    if (!activeTab && categories.length > 0) setActiveTab(categories[0].code);
  }, [categories, activeTab]);

  const loadData = async () => {
    try {
      const [t, c] = await Promise.all([getCertificateTypes(false), getCertificateCategories(false)]);
      setTypes(t);
      setCategories(c);
    }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const catLabel = (code: string) => categories.find(c => c.code === code)?.name || code;

  const handleAddCategory = async () => {
    const code = newCatCode.trim().toLowerCase().replace(/\s+/g, '_');
    if (!code || !newCatName.trim()) { alert('코드와 이름을 모두 입력하세요.'); return; }
    if (categories.some(c => c.code === code)) { alert('이미 존재하는 코드입니다.'); return; }
    try {
      setCatSaving(true);
      await addCertificateCategory({ code, name: newCatName.trim() });
      setNewCatCode(''); setNewCatName('');
      await loadData();
    } catch { alert('카테고리 추가 중 오류가 발생했습니다.'); }
    finally { setCatSaving(false); }
  };

  const startEditCategory = (c: CertificateCategory) => { setEditingCatId(c.id); setEditingCatName(c.name); };
  const saveEditCategory = async (id: string) => {
    if (!editingCatName.trim()) return;
    try {
      setCatSaving(true);
      await updateCertificateCategory(id, { name: editingCatName.trim() });
      setEditingCatId(null);
      await loadData();
    } catch { alert('카테고리 수정 중 오류가 발생했습니다.'); }
    finally { setCatSaving(false); }
  };

  const handleDeleteCategory = async (c: CertificateCategory) => {
    const inUse = types.filter(t => t.category === c.code).length;
    if (inUse > 0) { alert(`이 카테고리를 사용하는 증서 유형이 ${inUse}개 있어 삭제할 수 없습니다. 먼저 해당 증서 유형의 카테고리를 변경하거나 삭제하세요.`); return; }
    if (!confirm(`'${c.name}' 카테고리를 삭제하시겠습니까?`)) return;
    try { await deleteCertificateCategory(c.id); await loadData(); }
    catch { alert('카테고리 삭제 중 오류가 발생했습니다.'); }
  };

  const toggleCategoryActive = async (c: CertificateCategory) => {
    try { await updateCertificateCategory(c.id, { is_active: !c.is_active }); await loadData(); }
    catch { alert('변경 중 오류가 발생했습니다.'); }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const payload = { ...formData, validity_period_months: formData.validity_period_months || null };
      if (editId) await updateCertificateType(editId, payload);
      else await addCertificateType(payload);
      window.dispatchEvent(new CustomEvent('certtype-data-changed'));
      closeTab(activeTabId!);
    } catch (e) {
      console.error(e);
      alert(`저장 중 오류가 발생했습니다.${e instanceof Error ? `\n(${e.message})` : ''}`);
    }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return;
    try { await deleteCertificateType(id); await loadData(); }
    catch { alert('삭제 중 오류가 발생했습니다.'); }
  };

  const handleCategoryDragEnd = async (category: string, event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const items = types.filter(t => t.category === category);
    const oldIndex = items.findIndex(t => t.id === active.id);
    const newIndex = items.findIndex(t => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const orderValues = items.map(t => t.display_order);
    const reordered = arrayMove(items, oldIndex, newIndex);
    const updates = reordered.map((t, i) => ({ id: t.id, display_order: orderValues[i] }));

    setTypes(prev => prev.map(t => {
      const u = updates.find(u => u.id === t.id);
      return u ? { ...t, display_order: u.display_order } : t;
    }));

    try {
      await Promise.all(updates.map(u => updateCertificateType(u.id, { display_order: u.display_order })));
    } catch {
      alert('순서 저장 중 오류가 발생했습니다.');
      await loadData();
    }
  };

  if (loading && !isFormMode) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;
  }

  return (
    <main className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              <div>
                <CardTitle className="text-base">{isFormMode ? (editId ? '증서 유형 수정' : '증서 유형 추가') : '증서 관리'}</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">{isFormMode ? '증서 유형 정보를 입력하세요' : '선원 증서 카테고리 및 유형 관리'}</p>
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
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={() => setCatDialogOpen(true)}>
                  <Settings className="w-3.5 h-3.5" />카테고리 관리
                </Button>
                <Button size="sm" className="gap-1.5 h-8" onClick={() => openNewTab('/certificate-types?mode=new', '증서 유형 추가', true)}>
                  <Plus className="w-3.5 h-3.5" />증서 유형 추가
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {isFormMode ? (
            <div className="space-y-3 pt-2 max-w-lg">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">카테고리 *</Label>
                  <Select value={formData.category} onValueChange={(v: string) => setFormData({ ...formData, category: v })}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>{categories.map(c => <SelectItem key={c.code} value={c.code} className="text-sm">{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">증서 코드 *</Label>
                  <Input value={formData.type_code} onChange={e => setFormData({ ...formData, type_code: e.target.value.toUpperCase() })} placeholder="예: STCW_BST" disabled={!!editId} className="h-9 text-sm font-mono" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">영문명 *</Label>
                  <Input value={formData.type_name_en} onChange={e => setFormData({ ...formData, type_name_en: e.target.value })} placeholder="예: Basic Safety Training" className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">한글명 *</Label>
                  <Input value={formData.type_name_ko} onChange={e => setFormData({ ...formData, type_name_ko: e.target.value })} placeholder="예: 기본안전교육" className="h-9 text-sm" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">설명</Label>
                <Textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="text-sm min-h-[60px]" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">유효기간 (개월, 비워두면 무기한)</Label>
                <Input type="number" value={formData.validity_period_months || ''} onChange={e => setFormData({ ...formData, validity_period_months: e.target.value ? parseInt(e.target.value) : undefined })} placeholder="예: 60" min={1} className="h-9 text-sm max-w-[200px]" />
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer"><Checkbox checked={formData.is_mandatory} onCheckedChange={c => setFormData({ ...formData, is_mandatory: c === true })} /><span className="text-xs">필수 증서</span></label>
                <label className="flex items-center gap-2 cursor-pointer"><Checkbox checked={formData.is_active} onCheckedChange={c => setFormData({ ...formData, is_active: c === true })} /><span className="text-xs">활성 상태</span></label>
              </div>
            </div>
          ) : categories.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-500">등록된 카테고리가 없습니다. 카테고리 관리에서 먼저 추가하세요.</div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="w-full flex-wrap h-auto gap-1">
                {categories.map(cat => <TabsTrigger key={cat.code} value={cat.code} className="text-xs">{cat.name} ({types.filter(t => t.category === cat.code).length})</TabsTrigger>)}
              </TabsList>
              {categories.map(cat => {
                const items = types.filter(t => t.category === cat.code);
                return (
                  <TabsContent key={cat.code} value={cat.code} className="mt-3">
                    {items.length === 0 ? <div className="text-center py-8 text-sm text-gray-500">등록된 증서 유형이 없습니다</div> : (
                      <div className="rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs w-12"></TableHead>
                              <TableHead className="text-xs w-32">코드</TableHead>
                              <TableHead className="text-xs">영문명</TableHead>
                              <TableHead className="text-xs">한글명</TableHead>
                              <TableHead className="text-xs w-24">유효기간</TableHead>
                              <TableHead className="text-xs w-16">필수</TableHead>
                              <TableHead className="text-xs w-16">상태</TableHead>
                              <TableHead className="text-right text-xs w-16">작업</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleCategoryDragEnd(cat.code, e)}>
                              <SortableContext items={items.map(t => t.id)} strategy={verticalListSortingStrategy}>
                                {items.map(t => (
                                  <SortableTableRow key={t.id} id={t.id} onClick={() => openNewTab(`/certificate-types?id=${t.id}`, `${t.type_name_ko} 수정`)}>
                                    <TableCell className="text-sm font-mono">{t.type_code}</TableCell>
                                    <TableCell className="text-sm">{t.type_name_en}</TableCell>
                                    <TableCell className="text-sm font-medium">{t.type_name_ko}</TableCell>
                                    <TableCell className="text-sm">{t.validity_period_months ? `${t.validity_period_months}개월` : '무기한'}</TableCell>
                                    <TableCell>{t.is_mandatory ? <Badge variant="destructive" className="text-xs">필수</Badge> : <Badge variant="outline" className="text-xs">선택</Badge>}</TableCell>
                                    <TableCell>{t.is_active ? <Badge variant="secondary" className="text-xs">활성</Badge> : <Badge variant="outline" className="text-xs">비활성</Badge>}</TableCell>
                                    <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                                      <Button size="sm" variant="ghost" onClick={() => handleDelete(t.id)} className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"><Trash2 className="w-3 h-3" /></Button>
                                    </TableCell>
                                  </SortableTableRow>
                                ))}
                              </SortableContext>
                            </DndContext>
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </TabsContent>
                );
              })}
            </Tabs>
          )}
        </CardContent>
      </Card>

      <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="text-base">증서 카테고리 관리</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2 items-end p-2.5 bg-gray-50 rounded-md">
              <div className="space-y-1 flex-1">
                <Label className="text-xs">코드</Label>
                <Input value={newCatCode} onChange={e => setNewCatCode(e.target.value)} placeholder="예: license" className="h-8 text-sm font-mono" disabled={catSaving} />
              </div>
              <div className="space-y-1 flex-1">
                <Label className="text-xs">이름</Label>
                <Input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="예: 면허증" className="h-8 text-sm" disabled={catSaving} />
              </div>
              <Button size="sm" className="h-8 gap-1" onClick={handleAddCategory} disabled={catSaving}><Plus className="w-3.5 h-3.5" />추가</Button>
            </div>
            <div className="rounded-md border divide-y max-h-80 overflow-y-auto">
              {categories.length === 0 ? (
                <p className="text-center py-6 text-sm text-gray-400">등록된 카테고리가 없습니다</p>
              ) : categories.map(c => (
                <div key={c.id} className="flex items-center justify-between gap-2 p-2 text-sm">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="font-mono text-xs text-gray-400 shrink-0">{c.code}</span>
                    {editingCatId === c.id ? (
                      <Input value={editingCatName} onChange={e => setEditingCatName(e.target.value)} className="h-7 text-sm" autoFocus />
                    ) : (
                      <span className={`truncate ${!c.is_active ? 'text-gray-400' : ''}`}>{c.name}</span>
                    )}
                    {!c.is_active && <Badge variant="outline" className="text-xs shrink-0">비활성</Badge>}
                  </div>
                  <div className="flex gap-0.5 shrink-0">
                    {editingCatId === c.id ? (
                      <>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => saveEditCategory(c.id)} disabled={catSaving}><Check className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingCatId(null)}><X className="h-3.5 w-3.5" /></Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => toggleCategoryActive(c)}>{c.is_active ? '비활성화' : '활성화'}</Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEditCategory(c)}><Edit2 className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" onClick={() => handleDeleteCategory(c)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
