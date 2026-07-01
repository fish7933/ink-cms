import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getCurrentUser } from '@/services/auth.service';
import { getCertificateTypes, addCertificateType, updateCertificateType, deleteCertificateType } from '@/services/certificate-type.service';
import type { CertificateType } from '@/types/certificate-type';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, FileText, Save } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useTabContext } from '@/contexts/TabContext';

type Category = 'stcw'|'national'|'medical'|'safety'|'technical'|'other';

const EMPTY_FORM = { category: 'stcw' as Category, type_code: '', type_name_en: '', type_name_ko: '', description: '', validity_period_months: undefined as number|undefined, is_mandatory: false, is_active: true, display_order: 999 };
const CAT_LABELS: Record<string, string> = { stcw: 'STCW 증서', national: '자국/기국 증서', medical: '건강/의료 증서', safety: '안전 교육', technical: '기술 교육', other: '기타' };
const CATEGORIES: Category[] = ['stcw', 'national', 'medical', 'safety', 'technical', 'other'];

export default function CertificateTypeManagementPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { openNewTab, closeTab, activeTabId } = useTabContext();

  const editId = searchParams.get('id');
  const isNew = searchParams.get('mode') === 'new';
  const isFormMode = isNew || !!editId;

  const [types, setTypes] = useState<CertificateType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);

  useEffect(() => {
    const init = async () => {
      const user = await getCurrentUser();
      if (!user || user.role !== 'ship_manager') { navigate('/dashboard'); return; }
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
    if (isNew) setFormData(EMPTY_FORM);
  }, [editId, isNew, types]);

  const loadData = async () => {
    try { setTypes(await getCertificateTypes(false)); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const payload = { ...formData, validity_period_months: formData.validity_period_months || null };
      if (editId) await updateCertificateType(editId, payload);
      else await addCertificateType(payload);
      window.dispatchEvent(new CustomEvent('certtype-data-changed'));
      closeTab(activeTabId!);
    } catch { alert('저장 중 오류가 발생했습니다.'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return;
    try { await deleteCertificateType(id); await loadData(); }
    catch { alert('삭제 중 오류가 발생했습니다.'); }
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
                <CardTitle className="text-base">{isFormMode ? (editId ? '증서 유형 수정' : '증서 유형 추가') : '증서 유형 관리'}</CardTitle>
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
              <Button size="sm" className="gap-1.5 h-8" onClick={() => openNewTab('/certificate-types?mode=new', '증서 유형 추가', true)}>
                <Plus className="w-3.5 h-3.5" />증서 유형 추가
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {isFormMode ? (
            <div className="space-y-3 pt-2 max-w-lg">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">카테고리 *</Label>
                  <Select value={formData.category} onValueChange={(v: Category) => setFormData({ ...formData, category: v })}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c} className="text-sm">{CAT_LABELS[c]}</SelectItem>)}</SelectContent>
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
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">유효기간 (개월, 비워두면 무기한)</Label>
                  <Input type="number" value={formData.validity_period_months || ''} onChange={e => setFormData({ ...formData, validity_period_months: e.target.value ? parseInt(e.target.value) : undefined })} placeholder="예: 60" min={1} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">표시 순서</Label>
                  <Input type="number" value={formData.display_order} onChange={e => setFormData({ ...formData, display_order: parseInt(e.target.value) || 999 })} min={1} className="h-9 text-sm" />
                </div>
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer"><Checkbox checked={formData.is_mandatory} onCheckedChange={c => setFormData({ ...formData, is_mandatory: c === true })} /><span className="text-xs">필수 증서</span></label>
                <label className="flex items-center gap-2 cursor-pointer"><Checkbox checked={formData.is_active} onCheckedChange={c => setFormData({ ...formData, is_active: c === true })} /><span className="text-xs">활성 상태</span></label>
              </div>
            </div>
          ) : (
            <Tabs defaultValue="stcw" className="w-full">
              <TabsList className="grid w-full grid-cols-6 h-9">
                {CATEGORIES.map(cat => <TabsTrigger key={cat} value={cat} className="text-xs">{CAT_LABELS[cat]} ({types.filter(t => t.category === cat).length})</TabsTrigger>)}
              </TabsList>
              {CATEGORIES.map(cat => {
                const items = types.filter(t => t.category === cat);
                return (
                  <TabsContent key={cat} value={cat} className="mt-3">
                    {items.length === 0 ? <div className="text-center py-8 text-sm text-gray-500">등록된 증서 유형이 없습니다</div> : (
                      <div className="rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs w-16">순서</TableHead>
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
                            {items.map(t => (
                              <TableRow key={t.id} className="cursor-pointer hover:bg-gray-50" onClick={() => openNewTab(`/certificate-types?id=${t.id}`, `${t.type_name_ko} 수정`)}>
                                <TableCell className="text-sm">{t.display_order}</TableCell>
                                <TableCell className="text-sm font-mono">{t.type_code}</TableCell>
                                <TableCell className="text-sm">{t.type_name_en}</TableCell>
                                <TableCell className="text-sm font-medium">{t.type_name_ko}</TableCell>
                                <TableCell className="text-sm">{t.validity_period_months ? `${t.validity_period_months}개월` : '무기한'}</TableCell>
                                <TableCell>{t.is_mandatory ? <Badge variant="destructive" className="text-xs">필수</Badge> : <Badge variant="outline" className="text-xs">선택</Badge>}</TableCell>
                                <TableCell>{t.is_active ? <Badge variant="secondary" className="text-xs">활성</Badge> : <Badge variant="outline" className="text-xs">비활성</Badge>}</TableCell>
                                <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                                  <Button size="sm" variant="ghost" onClick={() => handleDelete(t.id)} className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"><Trash2 className="w-3 h-3" /></Button>
                                </TableCell>
                              </TableRow>
                            ))}
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
    </main>
  );
}
