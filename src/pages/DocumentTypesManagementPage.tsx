import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { getCurrentUser } from '@/lib/store';
import { getShorePositions } from '@/services/shore-position.service';
import { approvalDocumentService } from '@/services/approval-document.service';
import { orgChartService } from '@/services/org-chart.service';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import DocumentFormFieldsEditor from '@/components/document/DocumentFormFieldsEditor';
import type { ShorePosition } from '@/types/models';
import type { OrgUnit } from '@/types/org-chart';
import type { ApprovalDocumentType, ApprovalAuthorityLimit, DocumentFormField } from '@/types/approval-document';

export default function DocumentTypesManagementPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [types, setTypes] = useState<ApprovalDocumentType[]>([]);
  const [limits, setLimits] = useState<ApprovalAuthorityLimit[]>([]);
  const [positions, setPositions] = useState<ShorePosition[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<ApprovalDocumentType | null>(null);
  const [form, setForm] = useState({ code: '', name: '' });
  const [fieldSchema, setFieldSchema] = useState<DocumentFormField[]>([]);
  const [defaultCcOrgUnitIds, setDefaultCcOrgUnitIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const permissions = usePermissions('document_types');

  useEffect(() => {
    const init = async () => {
      const user = await getCurrentUser();
      if (!user || !['ship_manager', 'admin', 'system_admin'].includes(user.role ?? '')) { navigate('/dashboard'); return; }
      await loadData();
    };
    init();
  }, [navigate]);

  useEffect(() => {
    if (!permissions.loading && !permissions.canView) navigate('/dashboard');
  }, [permissions.loading, permissions.canView, navigate]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [t, l, p, u] = await Promise.all([
        approvalDocumentService.getDocumentTypes(true),
        approvalDocumentService.getAuthorityLimits(),
        getShorePositions(),
        orgChartService.getOrgUnits(),
      ]);
      setTypes(t);
      setLimits(l);
      setPositions(p);
      setOrgUnits(u);
    } catch (e) {
      console.error(e);
      toast({ title: '문서유형을 불러오는 중 오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => { setEditingType(null); setForm({ code: '', name: '' }); setFieldSchema([]); setDefaultCcOrgUnitIds([]); setDialogOpen(true); };
  const openEdit = (t: ApprovalDocumentType) => { setEditingType(t); setForm({ code: t.code, name: t.name }); setFieldSchema(t.field_schema || []); setDefaultCcOrgUnitIds(t.default_cc_org_unit_ids || []); setDialogOpen(true); };
  const isSystemManaged = (t: ApprovalDocumentType) => t.is_free_form === false;
  const toggleDefaultCcUnit = (unitId: string) =>
    setDefaultCcOrgUnitIds(prev => prev.includes(unitId) ? prev.filter(id => id !== unitId) : [...prev, unitId]);

  const handleSave = async () => {
    if (!form.code.trim() || !form.name.trim()) { toast({ title: '코드와 이름을 모두 입력해주세요.', variant: 'destructive' }); return; }
    if (fieldSchema.some(f => !f.label.trim())) { toast({ title: '필드명이 비어있는 항목이 있습니다.', variant: 'destructive' }); return; }
    try {
      setSaving(true);
      const schema = fieldSchema.length > 0 ? fieldSchema : null;
      const defaultCc = defaultCcOrgUnitIds.length > 0 ? defaultCcOrgUnitIds : null;
      if (editingType) {
        await approvalDocumentService.updateDocumentType(editingType.id, { code: form.code.trim(), name: form.name.trim(), field_schema: schema, default_cc_org_unit_ids: defaultCc });
      } else {
        await approvalDocumentService.createDocumentType({ code: form.code.trim(), name: form.name.trim(), field_schema: schema, default_cc_org_unit_ids: defaultCc });
      }
      setDialogOpen(false);
      await loadData();
      toast({ title: '저장되었습니다.' });
    } catch (e) {
      toast({ title: '저장 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (t: ApprovalDocumentType) => {
    if (t.is_active && isSystemManaged(t) && !confirm(`'${t.name}'은(는) 시스템에서 자동으로 생성하는 결재문서 유형입니다. 비활성화하면 관련 기능(연차/질병휴가 신청, 교대계획, 승진·강등 발령 등)에서 결재 상신이 실패할 수 있습니다. 계속하시겠습니까?`)) return;
    try {
      await approvalDocumentService.updateDocumentType(t.id, { is_active: !t.is_active });
      await loadData();
    } catch (e) {
      toast({ title: '변경 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  const handleDelete = async (t: ApprovalDocumentType) => {
    const warning = isSystemManaged(t)
      ? `'${t.name}'은(는) 시스템에서 자동으로 생성하는 결재문서 유형입니다. 삭제하면 관련 기능(연차/질병휴가 신청, 교대계획, 승진·강등 발령 등)에서 결재 상신이 실패합니다. 정말 삭제하시겠습니까?`
      : `'${t.name}' 문서유형을 삭제하시겠습니까? 되돌릴 수 없습니다.`;
    if (!confirm(warning)) return;
    try {
      await approvalDocumentService.deleteDocumentType(t.id);
      await loadData();
      toast({ title: '삭제되었습니다.' });
    } catch (e) {
      const isFkViolation = typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code === '23503';
      toast({
        title: '삭제 실패',
        description: isFkViolation ? '이미 이 유형으로 생성된 문서가 있어 삭제할 수 없습니다. 대신 비활성화를 사용하세요.' : (e instanceof Error ? e.message : undefined),
        variant: 'destructive',
      });
    }
  };

  const handleAuthorityChange = async (typeId: string, positionId: string) => {
    try {
      await approvalDocumentService.setAuthorityLimit(typeId, positionId === '_none' ? null : positionId);
      await loadData();
    } catch (e) {
      toast({ title: '전결규정 저장 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3" />
        <p className="text-sm text-gray-600">로딩 중...</p>
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-blue-600" />
              <div>
                <CardTitle className="text-base">문서유형 / 전결규정 관리 (문서 양식함)</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  기안서 문서유형과, 유형별 결재 종결 직급(전결규정)을 관리합니다. 전결 직급을 지정하면 결재라인이 그 직급(또는 더 상위)에서 자동으로 종결됩니다.
                  문서유형에 입력 필드를 구성하면(문서 양식함) 기안서 작성 화면이 그 양식대로의 입력폼으로 바뀝니다.
                </p>
              </div>
            </div>
            {permissions.canCreate && (
              <Button size="sm" className="gap-1.5 h-8" onClick={openCreate}>
                <Plus className="w-4 h-4" />문서유형 추가
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {types.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-500">등록된 문서유형이 없습니다.</div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">코드</TableHead>
                    <TableHead className="text-xs">이름</TableHead>
                    <TableHead className="text-xs">구분</TableHead>
                    <TableHead className="text-xs">양식</TableHead>
                    <TableHead className="text-xs">전결 기준 직급</TableHead>
                    <TableHead className="text-xs">상태</TableHead>
                    <TableHead className="text-right text-xs w-48">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {types.map(t => {
                    const limit = limits.find(l => l.document_type_id === t.id);
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="font-mono text-xs">{t.code}</TableCell>
                        <TableCell className={`text-sm ${permissions.canEdit ? 'cursor-pointer' : ''}`} onClick={() => permissions.canEdit && openEdit(t)}>{t.name}</TableCell>
                        <TableCell>
                          {isSystemManaged(t)
                            ? <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">시스템 관리</Badge>
                            : <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">기안 가능</Badge>}
                        </TableCell>
                        <TableCell>
                          {isSystemManaged(t)
                            ? <span className="text-xs text-gray-400">-</span>
                            : t.field_schema && t.field_schema.length > 0
                              ? <Badge variant="outline" className="text-xs">필드 {t.field_schema.length}개</Badge>
                              : <span className="text-xs text-gray-400">자유 서식</span>}
                        </TableCell>
                        <TableCell onClick={e => e.stopPropagation()}>
                          <Select value={limit?.position_id || '_none'} onValueChange={v => handleAuthorityChange(t.id, v)} disabled={!permissions.canEdit}>
                            <SelectTrigger className="h-8 text-xs w-44"><SelectValue placeholder="전결 없음(대표까지)" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_none">전결 없음(대표까지)</SelectItem>
                              {positions.map(p => <SelectItem key={p.id} value={p.id} className="text-sm">{p.name} 전결</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Badge variant={t.is_active ? 'default' : 'secondary'} className="text-xs">{t.is_active ? '사용중' : '비활성'}</Badge>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-0.5">
                            {permissions.canEdit && (
                              <>
                                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openEdit(t)}>수정</Button>
                                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => toggleActive(t)}>
                                  {t.is_active ? '비활성화' : '활성화'}
                                </Button>
                              </>
                            )}
                            {permissions.canDelete && (
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-500 hover:text-red-600" onClick={() => handleDelete(t)}>삭제</Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={o => !saving && setDialogOpen(o)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-base">{editingType ? '문서유형 수정' : '문서유형 추가'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">코드 *</Label>
                <Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="예: general_draft" className="h-8 text-sm" disabled={saving} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">이름 *</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="예: 일반 기안서" className="h-8 text-sm" disabled={saving} />
              </div>
            </div>
            {editingType && isSystemManaged(editingType) ? (
              <div className="text-xs text-purple-700 bg-purple-50 border border-purple-200 rounded-md p-2.5 space-y-1">
                <p className="font-medium">시스템 관리 문서유형입니다.</p>
                <p className="text-purple-600">연차/질병휴가 신청, 교대계획, 승진·강등 발령 등 해당 기능에서 자동으로 결재문서를 생성할 때 사용되며, 기안함의 "기안서 작성" 화면에서는 직접 선택할 수 없습니다. 입력 양식은 사용되지 않으므로 이름과 전결규정만 관리하세요.</p>
              </div>
            ) : (
              <div className="space-y-1.5 border-t pt-3">
                <Label className="text-xs">입력 양식 (문서 양식함)</Label>
                <DocumentFormFieldsEditor fields={fieldSchema} onChange={setFieldSchema} disabled={saving} />
              </div>
            )}
            <div className="space-y-1.5 border-t pt-3">
              <Label className="text-xs">기본 참조부서 <span className="text-gray-400 font-normal">(이 유형으로 기안하면 자동으로 참조 지정, 예: 지출결의서 → 총무팀)</span></Label>
              <div className="flex flex-wrap gap-1.5">
                {orgUnits.length === 0 ? (
                  <p className="text-xs text-gray-400">등록된 부서가 없습니다</p>
                ) : orgUnits.map(u => (
                  <button
                    key={u.id} type="button" onClick={() => toggleDefaultCcUnit(u.id)} disabled={saving}
                    className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${defaultCcOrgUnitIds.includes(u.id) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                  >
                    {u.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)} disabled={saving}>취소</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? '저장 중...' : '저장'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
