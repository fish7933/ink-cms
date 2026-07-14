import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Trash2, Pencil, ChevronRight, ChevronDown, Building2, Users, UserMinus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { OrgUnitDialog } from '@/components/org-chart/OrgUnitDialog';
import { orgChartService } from '@/services/org-chart.service';
import { getCurrentUser } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import type { OrgUnit, OrgMember, OrgUnitNode } from '@/types/org-chart';

// 부서와 그 모든 하위 부서 id를 모아준다 — "상위 부서" 선택지에서 자기 자신/하위 부서를
// 제외하기 위함(자기 자신을 상위로 지정하면 트리가 순환하게 됨).
function collectDescendantIds(unitId: string, units: OrgUnit[]): Set<string> {
  const result = new Set<string>([unitId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const u of units) {
      if (u.parent_id && result.has(u.parent_id) && !result.has(u.id)) {
        result.add(u.id);
        changed = true;
      }
    }
  }
  return result;
}

export default function OrgChartManagementPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [units, setUnits] = useState<OrgUnit[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<OrgUnit | null>(null);
  const [dialogParentId, setDialogParentId] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<OrgUnitNode | null>(null);
  const [addMemberId, setAddMemberId] = useState('_none');

  const permissions = usePermissions('org_chart');

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
      const [u, m] = await Promise.all([orgChartService.getOrgUnits(), orgChartService.getOrgMembers()]);
      setUnits(u);
      setMembers(m);
    } catch (e) {
      console.error(e);
      toast({ title: '조직도를 불러오는 중 오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const tree = useMemo(() => orgChartService.buildTree(units, members), [units, members]);

  const flatNodes = useMemo(() => {
    const map = new Map<string, OrgUnitNode>();
    const walk = (nodes: OrgUnitNode[]) => { for (const n of nodes) { map.set(n.id, n); walk(n.children); } };
    walk(tree);
    return map;
  }, [tree]);

  const selectedNode = selectedUnitId ? flatNodes.get(selectedUnitId) || null : null;
  const unassignedMembers = useMemo(() => members.filter(m => m.org_unit_ids.length === 0), [members]);

  const toggleCollapse = (id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const openCreate = (parentId: string | null) => {
    setEditingUnit(null);
    setDialogParentId(parentId);
    setDialogOpen(true);
  };

  const openEdit = (unit: OrgUnit) => {
    setEditingUnit(unit);
    setDialogParentId(unit.parent_id);
    setDialogOpen(true);
  };

  const handleSaveUnit = async (data: { name: string; parent_id: string | null; head_user_id: string | null; display_order: number }) => {
    if (editingUnit) {
      await orgChartService.updateOrgUnit(editingUnit.id, data);
      toast({ title: '부서 정보를 수정했습니다.' });
    } else {
      const created = await orgChartService.createOrgUnit(data);
      setSelectedUnitId(created.id);
      toast({ title: '부서를 추가했습니다.' });
    }
    await loadData();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await orgChartService.deleteOrgUnit(deleteTarget.id);
      if (selectedUnitId === deleteTarget.id) setSelectedUnitId(null);
      toast({ title: '부서를 삭제했습니다.' });
      setDeleteTarget(null);
      await loadData();
    } catch (e) {
      toast({ title: '삭제 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  const requestDelete = (node: OrgUnitNode) => {
    if (node.children.length > 0) {
      toast({ title: '하위 부서가 있어 삭제할 수 없습니다.', description: '하위 부서를 먼저 이동하거나 삭제해주세요.', variant: 'destructive' });
      return;
    }
    if (node.members.length > 0) {
      toast({ title: '소속 인원이 있어 삭제할 수 없습니다.', description: '구성원을 먼저 다른 부서로 이동하거나 미지정으로 변경해주세요.', variant: 'destructive' });
      return;
    }
    setDeleteTarget(node);
  };

  const handleAddMember = async () => {
    if (!selectedUnitId || addMemberId === '_none') return;
    await orgChartService.addMembership(addMemberId, selectedUnitId);
    setAddMemberId('_none');
    await loadData();
  };

  const handleRemoveMember = async (userId: string) => {
    if (!selectedUnitId) return;
    await orgChartService.removeMembership(userId, selectedUnitId);
    await loadData();
  };

  const parentOptionsFor = (unit: OrgUnit | null): OrgUnit[] => {
    if (!unit) return units;
    const excluded = collectDescendantIds(unit.id, units);
    return units.filter(u => !excluded.has(u.id));
  };

  const renderNode = (node: OrgUnitNode, depth: number) => {
    const isCollapsed = collapsed.has(node.id);
    const isSelected = node.id === selectedUnitId;
    return (
      <div key={node.id}>
        <div
          className={`flex items-center gap-1.5 py-1.5 rounded-md cursor-pointer group ${isSelected ? 'bg-blue-50 text-blue-900' : 'hover:bg-gray-50'}`}
          style={{ paddingLeft: `${depth * 20 + 4}px` }}
          onClick={() => setSelectedUnitId(node.id)}
        >
          <button
            type="button"
            className="w-4 h-4 flex items-center justify-center text-gray-400 shrink-0"
            onClick={e => { e.stopPropagation(); toggleCollapse(node.id); }}
          >
            {node.children.length > 0 ? (isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />) : null}
          </button>
          <Building2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <span className="text-sm font-medium truncate">{node.name}</span>
          {node.head_name && (
            <span className="text-xs text-gray-500 shrink-0">
              · {node.head_name}{node.head_position_name ? `(${node.head_position_name})` : ''}
              {!node.head_is_explicit && <span className="text-gray-400"> 자동</span>}
            </span>
          )}
          <Badge variant="secondary" className="text-xs px-1.5 py-0 h-4 shrink-0">{node.members.length}명</Badge>
          <div className="flex-1" />
          <div className="hidden group-hover:flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
            {permissions.canCreate && (
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="하위 부서 추가" onClick={() => openCreate(node.id)}>
                <Plus className="w-3.5 h-3.5" />
              </Button>
            )}
            {permissions.canEdit && (
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="수정" onClick={() => openEdit(node)}>
                <Pencil className="w-3.5 h-3.5" />
              </Button>
            )}
            {permissions.canDelete && (
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-600 hover:text-red-700" title="삭제" onClick={() => requestDelete(node)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>
        {!isCollapsed && node.children.map(child => renderNode(child, depth + 1))}
      </div>
    );
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
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-3">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-base">조직도 관리</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                부서 구조와 부서장을 관리합니다. 결재선을 만들 때 부서를 선택하면 부서장 → 상위 부서장 순으로 결재라인이 자동 구성됩니다.
              </p>
            </div>
            {permissions.canCreate && (
              <Button size="sm" className="gap-1.5 h-8" onClick={() => openCreate(null)}>
                <Plus className="w-4 h-4" />최상위 부서 추가
              </Button>
            )}
          </div>
        </CardHeader>
      </Card>

      {unassignedMembers.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="py-2.5 flex items-center gap-2 flex-wrap text-xs">
            <span className="font-medium text-amber-800">미배정 직원 ({unassignedMembers.length}명):</span>
            {unassignedMembers.map(m => (
              <Badge key={m.id} variant="outline" className="text-xs bg-white">{m.name}{m.position_name ? ` (${m.position_name})` : ''}</Badge>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm">부서 트리</CardTitle></CardHeader>
          <CardContent className="pt-0">
            {tree.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-400">등록된 부서가 없습니다. "최상위 부서 추가"로 시작하세요.</div>
            ) : (
              <div className="space-y-0.5">{tree.map(node => renderNode(node, 0))}</div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader className="pb-2"><CardTitle className="text-sm">{selectedNode ? `${selectedNode.name} 상세` : '부서를 선택하세요'}</CardTitle></CardHeader>
          <CardContent className="pt-0 space-y-3">
            {!selectedNode ? (
              <div className="text-center py-8 text-sm text-gray-400">왼쪽 트리에서 부서를 클릭하면 구성원을 관리할 수 있습니다.</div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-xs text-gray-500">부서장</span>
                    <p className="font-medium">
                      {selectedNode.head_name ? `${selectedNode.head_name}${selectedNode.head_position_name ? ` (${selectedNode.head_position_name})` : ''}` : '—'}
                      {selectedNode.head_name && !selectedNode.head_is_explicit && (
                        <span className="text-xs text-gray-400 font-normal ml-1">(자동 추정 — 최상위 직급자)</span>
                      )}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500">상위 부서</span>
                    <p className="font-medium">{units.find(u => u.id === selectedNode.parent_id)?.name || '— 최상위 —'}</p>
                  </div>
                </div>

                <div className="border-t pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs flex items-center gap-1"><Users className="w-3.5 h-3.5" />구성원 ({selectedNode.members.length}명)</Label>
                  </div>
                  {selectedNode.members.length === 0 ? (
                    <p className="text-xs text-gray-400 mb-2">소속된 구성원이 없습니다.</p>
                  ) : (
                    <div className="space-y-1 mb-2">
                      {[...selectedNode.members].sort((a, b) => {
                        const posA = a.position_order ?? Infinity;
                        const posB = b.position_order ?? Infinity;
                        if (posA !== posB) return posA - posB;
                        const hireA = a.hire_date ?? '9999-99-99';
                        const hireB = b.hire_date ?? '9999-99-99';
                        return hireA.localeCompare(hireB);
                      }).map(m => (
                        <div key={m.id} className="flex items-center justify-between text-sm px-2 py-1.5 rounded bg-gray-50">
                          <span>
                            {m.name}{m.position_name ? <span className="text-gray-500"> · {m.position_name}</span> : ''}
                            {selectedNode.head_user_id === m.id && <Badge className="ml-1.5 text-xs px-1.5 py-0 h-4 bg-blue-600">부서장</Badge>}
                          </span>
                          {permissions.canEdit && (
                            <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs text-gray-500 hover:text-red-600" onClick={() => handleRemoveMember(m.id)}>
                              <UserMinus className="w-3 h-3 mr-1" />제외
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {permissions.canEdit && (
                    <div className="flex items-center gap-2">
                      <Select value={addMemberId} onValueChange={setAddMemberId}>
                        <SelectTrigger className="h-8 text-sm flex-1"><SelectValue placeholder="구성원 추가" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">— 직원 선택 —</SelectItem>
                          {members.filter(m => !m.org_unit_ids.includes(selectedNode.id)).map(m => (
                            <SelectItem key={m.id} value={m.id} className="text-sm">
                              {m.name}{m.position_name ? ` (${m.position_name})` : ''}{m.org_unit_ids.length > 0 ? ' · 겸직 추가' : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="sm" className="h-8 gap-1" disabled={addMemberId === '_none'} onClick={handleAddMember}>
                        <Plus className="w-3.5 h-3.5" />추가
                      </Button>
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <OrgUnitDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        unit={editingUnit}
        defaultParentId={dialogParentId}
        units={parentOptionsFor(editingUnit)}
        unitMembers={editingUnit ? (flatNodes.get(editingUnit.id)?.members || []) : []}
        onSave={handleSaveUnit}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>부서 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.name}" 부서를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
