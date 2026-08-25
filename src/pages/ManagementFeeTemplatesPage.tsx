import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit2, Trash2, Eye, RefreshCw, ClipboardList, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { getCurrentUser } from '@/lib/store';
import {
  getManagementFeeTemplates,
  deleteManagementFeeTemplate,
  renewManagementFeeTemplate,
  copyManagementFeeTemplate,
  getTemplateAssignmentSummary,
  type ManagementFeeTemplate,
} from '@/lib/management-fee-store';
import { useTabContext } from '@/contexts/TabContext';
import ManagementFeeTemplateAssignmentsSection from '@/components/management-fee/ManagementFeeTemplateAssignmentsSection';
import { usePermissions } from '@/hooks/usePermissions';

export default function ManagementFeeTemplatesPage() {
  const navigate = useNavigate();
  const { openNewTab } = useTabContext();
  const { toast } = useToast();
  const permissions = usePermissions('management_fee_templates');
  const [templates, setTemplates] = useState<ManagementFeeTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const [renewTarget, setRenewTarget] = useState<ManagementFeeTemplate | null>(null);
  const [renewDate, setRenewDate] = useState('');
  const [renewing, setRenewing] = useState(false);

  const [copyTarget, setCopyTarget] = useState<ManagementFeeTemplate | null>(null);
  const [copyName, setCopyName] = useState('');
  const [copying, setCopying] = useState(false);

  const [activeTab, setActiveTab] = useState('templates');
  const [prefillAssignId, setPrefillAssignId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [deleteChecking, setDeleteChecking] = useState(false);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[] | null>(null);
  const [deleteWarning, setDeleteWarning] = useState<{ shipCount: number; fleetCount: number; ownerCount: number } | null>(null);

  useEffect(() => {
    const init = async () => {
      const user = await getCurrentUser();
      if (!user) { navigate('/login'); return; }
      if (!['ship_manager', 'ship_owner', 'admin', 'system_admin'].includes(user.role || '')) { navigate('/dashboard'); return; }
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
      setTemplates(await getManagementFeeTemplates());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const openView = (t: ManagementFeeTemplate) => openNewTab(`/management-fee/templates/${t.id}`, `관리비 템플릿 상세: ${t.name}`);

  const openAssign = (t: ManagementFeeTemplate) => {
    setPrefillAssignId(t.id);
    setActiveTab('assignments');
  };

  useEffect(() => {
    window.addEventListener('management-fee-template-data-changed', loadData);
    return () => window.removeEventListener('management-fee-template-data-changed', loadData);
  }, []);

  const performDelete = async (ids: string[]) => {
    await Promise.all(ids.map(id => deleteManagementFeeTemplate(id)));
    toast({ title: '삭제 완료', description: ids.length > 1 ? `${ids.length}개 템플릿이 삭제되었습니다.` : '삭제되었습니다.' });
    setSelectedIds(prev => prev.filter(id => !ids.includes(id)));
    setPendingDeleteIds(null);
    setDeleteWarning(null);
    await loadData();
  };

  const requestDelete = async (ids: string[]) => {
    if (ids.length === 0) return;
    setDeleteChecking(true);
    try {
      const summary = await getTemplateAssignmentSummary(ids);
      if (summary.total === 0) {
        if (!confirm(ids.length > 1 ? `선택한 ${ids.length}개 템플릿을 삭제하시겠습니까?` : '삭제하시겠습니까?')) return;
        await performDelete(ids);
        return;
      }
      setPendingDeleteIds(ids);
      setDeleteWarning(summary);
    } finally {
      setDeleteChecking(false);
    }
  };

  const handleDelete = (id: string) => requestDelete([id]);

  useEffect(() => { setSelectedIds([]); }, [page]);

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      await requestDelete(selectedIds);
    } finally {
      setBulkDeleting(false);
    }
  };

  const confirmDeleteAnyway = async () => {
    if (!pendingDeleteIds) return;
    await performDelete(pendingDeleteIds);
  };

  const openRenew = (t: ManagementFeeTemplate) => {
    setRenewTarget(t);
    setRenewDate(new Date().toISOString().slice(0, 10));
  };

  const openCopy = (t: ManagementFeeTemplate) => {
    setCopyTarget(t);
    setCopyName(`${t.name} 복사본`);
  };

  const handleCopy = async () => {
    if (!copyTarget || !copyName.trim()) return;
    setCopying(true);
    try {
      const newTemplate = await copyManagementFeeTemplate(copyTarget.id, copyName.trim());
      if (!newTemplate) {
        toast({ title: '복사 실패', description: '템플릿을 복사하는 중 오류가 발생했습니다.', variant: 'destructive' });
        return;
      }
      toast({ title: '복사 완료', description: '청구 항목 구성이 그대로 복사되었습니다. 필요한 금액을 수정해주세요.' });
      window.dispatchEvent(new CustomEvent('management-fee-template-data-changed'));
      setCopyTarget(null);
      openNewTab(`/management-fee/templates/${newTemplate.id}/edit`, `템플릿 수정: ${newTemplate.name}`);
    } finally {
      setCopying(false);
    }
  };

  const handleRenew = async () => {
    if (!renewTarget || !renewDate) return;
    setRenewing(true);
    try {
      const newTemplate = await renewManagementFeeTemplate(renewTarget.id, renewDate);
      if (!newTemplate) {
        toast({ title: '갱신 실패', description: '적용 시작일은 기존 유효기간 이후여야 합니다.', variant: 'destructive' });
        return;
      }
      toast({ title: '갱신 완료', description: '새 버전이 생성되었습니다. 인상분 금액을 수정해주세요.' });
      window.dispatchEvent(new CustomEvent('management-fee-template-data-changed'));
      setRenewTarget(null);
      openNewTab(`/management-fee/templates/${newTemplate.id}/edit`, `템플릿 수정: ${newTemplate.name}`);
    } finally {
      setRenewing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-gray-500">로딩 중...</p>
      </div>
    );
  }

  const pageTemplates = templates.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className={`grid w-full ${permissions.canEdit ? 'grid-cols-2' : 'grid-cols-1'} h-9 mb-3 max-w-md`}>
          <TabsTrigger value="templates" className="text-xs">템플릿 목록</TabsTrigger>
          {permissions.canEdit && <TabsTrigger value="assignments" className="text-xs">템플릿 할당</TabsTrigger>}
        </TabsList>

        <TabsContent value="templates">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">관리비 템플릿 관리</CardTitle>
                {permissions.canCreate && (
                  <Button size="sm" className="gap-1.5 h-8" onClick={() => openNewTab('/management-fee/templates/new', '관리비 템플릿 추가')}>
                    <Plus className="h-4 w-4" />템플릿 추가
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {templates.length === 0 ? (
                <div className="text-center py-6 text-sm text-gray-500">등록된 관리비 템플릿이 없습니다.</div>
              ) : (
                <div className="space-y-2">
                  {permissions.canDelete && selectedIds.length > 0 && (
                    <div className="flex items-center justify-between gap-2 rounded-md border bg-blue-50 border-blue-200 px-3 py-2">
                      <span className="text-xs text-blue-800">{selectedIds.length}개 선택됨</span>
                      <Button
                        size="sm" variant="outline"
                        className="h-7 px-2 text-xs text-red-600 border-red-300 hover:bg-red-50"
                        onClick={handleBulkDelete} disabled={bulkDeleting || deleteChecking}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />{bulkDeleting || deleteChecking ? '확인 중...' : '선택 삭제'}
                      </Button>
                    </div>
                  )}
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {permissions.canDelete && (
                          <TableHead className="w-8">
                            <Checkbox
                              checked={pageTemplates.length > 0 && pageTemplates.every(t => selectedIds.includes(t.id))}
                              onCheckedChange={checked => setSelectedIds(checked ? pageTemplates.map(t => t.id) : [])}
                              disabled={pageTemplates.length === 0}
                            />
                          </TableHead>
                        )}
                        <TableHead className="text-xs">템플릿명</TableHead>
                        <TableHead className="text-xs">통화</TableHead>
                        <TableHead className="text-xs">설명</TableHead>
                        <TableHead className="text-xs">유효기간</TableHead>
                        <TableHead className="text-xs">상태</TableHead>
                        <TableHead className="text-right text-xs">작업</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageTemplates.map(t => (
                        <TableRow key={t.id} className="hover:bg-muted/50 cursor-pointer" onClick={() => openView(t)}>
                          {permissions.canDelete && (
                            <TableCell onClick={e => e.stopPropagation()}>
                              <Checkbox
                                checked={selectedIds.includes(t.id)}
                                onCheckedChange={() => setSelectedIds(prev => prev.includes(t.id) ? prev.filter(id => id !== t.id) : [...prev, t.id])}
                              />
                            </TableCell>
                          )}
                          <TableCell className="font-medium text-sm">{t.name}</TableCell>
                          <TableCell className="text-sm">{t.currency}</TableCell>
                          <TableCell className="text-gray-600 text-sm">{t.description || '-'}</TableCell>
                          <TableCell className="text-xs">{t.effective_from} ~ 현재</TableCell>
                          <TableCell>
                            <Badge variant={t.is_active ? 'default' : 'secondary'} className="text-xs">
                              {t.is_active ? '활성' : '비활성'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost" size="sm"
                                className="gap-1 h-7 px-2"
                                onClick={() => openView(t)}
                              >
                                <Eye className="h-3.5 w-3.5" /><span className="text-xs">보기</span>
                              </Button>
                              {permissions.canEdit && (
                                <Button
                                  variant="ghost" size="sm"
                                  className="gap-1 h-7 px-2"
                                  onClick={() => openNewTab(`/management-fee/templates/${t.id}/edit`, `템플릿 수정: ${t.name}`)}
                                >
                                  <Edit2 className="h-3.5 w-3.5" /><span className="text-xs">수정</span>
                                </Button>
                              )}
                              {permissions.canEdit && (
                                <Button
                                  variant="ghost" size="sm"
                                  className="gap-1 h-7 px-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                  onClick={() => openRenew(t)}
                                >
                                  <RefreshCw className="h-3.5 w-3.5" /><span className="text-xs">갱신</span>
                                </Button>
                              )}
                              {permissions.canCreate && (
                                <Button
                                  variant="ghost" size="sm"
                                  className="gap-1 h-7 px-2 text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                                  onClick={() => openCopy(t)}
                                >
                                  <Copy className="h-3.5 w-3.5" /><span className="text-xs">복사</span>
                                </Button>
                              )}
                              {permissions.canEdit && (
                                <Button
                                  variant="ghost" size="sm"
                                  className="gap-1 h-7 px-2 text-green-600 hover:text-green-700 hover:bg-green-50"
                                  onClick={() => openAssign(t)}
                                >
                                  <ClipboardList className="h-3.5 w-3.5" /><span className="text-xs">할당</span>
                                </Button>
                              )}
                              {permissions.canDelete && (
                                <Button
                                  variant="ghost" size="sm"
                                  className="gap-1 h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                                  onClick={() => handleDelete(t.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" /><span className="text-xs">삭제</span>
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {templates.length > PAGE_SIZE && (
                    <div className="flex justify-center py-3">
                      <Pagination>
                        <PaginationContent>
                          <PaginationItem><PaginationPrevious onClick={() => page > 1 && setPage(page - 1)} className={page === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'} /></PaginationItem>
                          {Array.from({ length: Math.ceil(templates.length / PAGE_SIZE) }, (_, i) => i + 1).map(p => {
                            const totalPages = Math.ceil(templates.length / PAGE_SIZE);
                            if (p === 1 || p === totalPages || (p >= page - 1 && p <= page + 1)) {
                              return <PaginationItem key={p}><PaginationLink onClick={() => setPage(p)} isActive={page === p} className="cursor-pointer">{p}</PaginationLink></PaginationItem>;
                            } else if (p === page - 2 || p === page + 2) {
                              return <PaginationItem key={p}><span className="px-4">...</span></PaginationItem>;
                            }
                            return null;
                          })}
                          <PaginationItem><PaginationNext onClick={() => { const totalPages = Math.ceil(templates.length / PAGE_SIZE); page < totalPages && setPage(page + 1); }} className={page === Math.ceil(templates.length / PAGE_SIZE) ? 'pointer-events-none opacity-50' : 'cursor-pointer'} /></PaginationItem>
                        </PaginationContent>
                      </Pagination>
                    </div>
                  )}
                </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assignments">
          <ManagementFeeTemplateAssignmentsSection
            prefillTemplateId={prefillAssignId}
            onPrefillConsumed={() => setPrefillAssignId(null)}
          />
        </TabsContent>
      </Tabs>

      {/* 갱신 다이얼로그 */}
      <Dialog open={renewTarget !== null} onOpenChange={open => { if (!open) setRenewTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">템플릿 갱신 — {renewTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-gray-500">
              새 유효기간 버전을 생성합니다. 기존 금액이 그대로 복사되며, 이 템플릿을 사용 중인 선박/플릿/선주 배정은 자동으로 새 버전으로 이전됩니다.
            </p>
            <div className="space-y-1.5">
              <Label className="text-sm">적용 시작일</Label>
              <Input type="date" value={renewDate} onChange={e => setRenewDate(e.target.value)} className="h-9 text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRenewTarget(null)}>취소</Button>
            <Button size="sm" onClick={handleRenew} disabled={renewing || !renewDate}>
              {renewing ? '갱신 중...' : '갱신'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 복사 다이얼로그 */}
      <Dialog open={copyTarget !== null} onOpenChange={open => { if (!open) setCopyTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">템플릿 복사 — {copyTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-gray-500">
              청구 항목 구성과 금액을 그대로 복사한 새 템플릿을 만듭니다. 원본과는 완전히 독립된 별개 템플릿이며, 복사 후 필요한 부분만 수정하면 됩니다.
            </p>
            <div className="space-y-1.5">
              <Label className="text-sm">새 템플릿명</Label>
              <Input value={copyName} onChange={e => setCopyName(e.target.value)} className="h-9 text-sm" placeholder="예: A 템플릿 복사본" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCopyTarget(null)}>취소</Button>
            <Button size="sm" onClick={handleCopy} disabled={copying || !copyName.trim()}>
              {copying ? '복사 중...' : '복사'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 삭제 전 할당 현황 경고 다이얼로그 */}
      <Dialog open={pendingDeleteIds !== null} onOpenChange={open => { if (!open) { setPendingDeleteIds(null); setDeleteWarning(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base text-red-600">할당된 선박/플릿/선주가 있습니다</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-gray-700">
              {pendingDeleteIds && pendingDeleteIds.length > 1 ? `선택한 ${pendingDeleteIds.length}개 템플릿 중` : '삭제하려는 템플릿이'} 아래 대상에 할당되어 있습니다. 삭제해도 배정 자체는 그대로 남아 계속 이 템플릿을 참조하게 되므로, 미리 배정을 해제하는 것을 권장합니다.
            </p>
            <ul className="text-sm bg-red-50 border border-red-200 rounded-md p-3 space-y-1">
              {deleteWarning && deleteWarning.shipCount > 0 && <li>선박 <span className="font-medium">{deleteWarning.shipCount}건</span></li>}
              {deleteWarning && deleteWarning.fleetCount > 0 && <li>플릿 <span className="font-medium">{deleteWarning.fleetCount}건</span></li>}
              {deleteWarning && deleteWarning.ownerCount > 0 && <li>선주 <span className="font-medium">{deleteWarning.ownerCount}건</span></li>}
            </ul>
            <p className="text-xs text-gray-500">그래도 삭제하시겠습니까?</p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setPendingDeleteIds(null); setDeleteWarning(null); }}>취소</Button>
            <Button size="sm" variant="destructive" onClick={confirmDeleteAnyway}>그래도 삭제</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
