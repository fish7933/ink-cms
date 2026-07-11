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
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import type { ShorePosition } from '@/types/models';
import type { ApprovalDocumentType, ApprovalAuthorityLimit } from '@/types/approval-document';

export default function DocumentTypesManagementPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [types, setTypes] = useState<ApprovalDocumentType[]>([]);
  const [limits, setLimits] = useState<ApprovalAuthorityLimit[]>([]);
  const [positions, setPositions] = useState<ShorePosition[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<ApprovalDocumentType | null>(null);
  const [form, setForm] = useState({ code: '', name: '' });
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
      const [t, l, p] = await Promise.all([
        approvalDocumentService.getDocumentTypes(true),
        approvalDocumentService.getAuthorityLimits(),
        getShorePositions(),
      ]);
      setTypes(t);
      setLimits(l);
      setPositions(p);
    } catch (e) {
      console.error(e);
      toast({ title: '문서유형을 불러오는 중 오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => { setEditingType(null); setForm({ code: '', name: '' }); setDialogOpen(true); };
  const openEdit = (t: ApprovalDocumentType) => { setEditingType(t); setForm({ code: t.code, name: t.name }); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.code.trim() || !form.name.trim()) { toast({ title: '코드와 이름을 모두 입력해주세요.', variant: 'destructive' }); return; }
    try {
      setSaving(true);
      if (editingType) {
        await approvalDocumentService.updateDocumentType(editingType.id, { code: form.code.trim(), name: form.name.trim() });
      } else {
        await approvalDocumentService.createDocumentType({ code: form.code.trim(), name: form.name.trim() });
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
    try {
      await approvalDocumentService.updateDocumentType(t.id, { is_active: !t.is_active });
      await loadData();
    } catch (e) {
      toast({ title: '변경 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
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
    <div className="max-w-5xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-blue-600" />
              <div>
                <CardTitle className="text-base">문서유형 / 전결규정 관리</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  기안서 문서유형과, 유형별 결재 종결 직급(전결규정)을 관리합니다. 전결 직급을 지정하면 결재라인이 그 직급(또는 더 상위)에서 자동으로 종결됩니다.
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
                    <TableHead className="text-xs">전결 기준 직급</TableHead>
                    <TableHead className="text-xs">상태</TableHead>
                    <TableHead className="text-right text-xs w-40">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {types.map(t => {
                    const limit = limits.find(l => l.document_type_id === t.id);
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="font-mono text-xs">{t.code}</TableCell>
                        <TableCell className={`text-sm ${permissions.canEdit ? 'cursor-pointer' : ''}`} onClick={() => permissions.canEdit && openEdit(t)}>{t.name}</TableCell>
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
                        <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                          {permissions.canEdit && (
                            <>
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openEdit(t)}>수정</Button>
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => toggleActive(t)}>
                                {t.is_active ? '비활성화' : '활성화'}
                              </Button>
                            </>
                          )}
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
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-base">{editingType ? '문서유형 수정' : '문서유형 추가'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs">코드 *</Label>
              <Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="예: general_draft" className="h-8 text-sm" disabled={saving} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">이름 *</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="예: 일반 기안서" className="h-8 text-sm" disabled={saving} />
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
