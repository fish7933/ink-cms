import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Undo2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { crewService, type DeletedCrewMember } from '@/services/crew.service';
import { getCurrentUser } from '@/lib/store';

export default function DeletedCrewListPage() {
  const { toast } = useToast();
  const [crew, setCrew] = useState<DeletedCrewMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => { init(); }, []);

  const init = async () => {
    try {
      setLoading(true);
      const currentUser = await getCurrentUser();
      setIsAdmin(currentUser?.role === 'admin' || currentUser?.role === 'system_admin');
      await loadData();
    } finally {
      setLoading(false);
    }
  };

  const loadData = async () => {
    try {
      setCrew(await crewService.getDeleted());
      setSelectedIds(new Set());
    } catch (e) {
      console.error(e);
      toast({ title: '오류', description: '삭제 선원 리스트를 불러오는 중 오류가 발생했습니다.', variant: 'destructive' });
    }
  };

  const toggleOne = (id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(crew.map(c => c.id)) : new Set());
  };

  const allSelected = crew.length > 0 && selectedIds.size === crew.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const handleRestore = async (ids: string[]) => {
    if (ids.length === 0) return;
    if (!confirm(`선택한 ${ids.length}명을 등록 선원으로 복귀시키겠습니까?`)) return;
    try {
      const { error } = await crewService.restore(ids);
      if (error) { toast({ title: '복구 실패', description: error, variant: 'destructive' }); return; }
      toast({ title: '복구되었습니다.', description: `${ids.length}명이 등록 선원 목록으로 복귀했습니다.` });
      await loadData();
    } catch (e) {
      toast({ title: '복구 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  const handlePermanentDelete = async (ids: string[]) => {
    if (ids.length === 0) return;
    if (!confirm(`선택한 ${ids.length}명을 완전히 삭제하시겠습니까? 계약/급여/승선 이력 등 관련 데이터가 모두 함께 삭제되며 되돌릴 수 없습니다.`)) return;
    try {
      const { error } = await crewService.permanentlyDelete(ids);
      if (error) { toast({ title: '삭제 실패', description: error, variant: 'destructive' }); return; }
      toast({ title: '영구 삭제되었습니다.' });
      await loadData();
    } catch (e) {
      toast({ title: '삭제 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>;
  }

  return (
    <div className="px-1 py-1 space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">삭제 선원 리스트</CardTitle>
              <CardDescription className="text-xs mt-1">
                선원 관리에서 삭제된 선원이 보관됩니다. 언제든 등록 선원으로 복귀시킬 수 있으며,
                {isAdmin ? ' 시스템관리자 이상은 영구 삭제도 가능합니다.' : ' 영구 삭제는 시스템관리자 이상만 가능합니다.'}
              </CardDescription>
            </div>
            {selectedIds.size > 0 && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="gap-1.5 h-8 text-emerald-600 border-emerald-300 hover:bg-emerald-50" onClick={() => handleRestore([...selectedIds])}>
                  <Undo2 className="w-4 h-4" />선택 복구 ({selectedIds.size})
                </Button>
                {isAdmin && (
                  <Button size="sm" variant="destructive" className="gap-1.5 h-8" onClick={() => handlePermanentDelete([...selectedIds])}>
                    <Trash2 className="w-4 h-4" />선택 영구삭제 ({selectedIds.size})
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {crew.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-400">삭제된 선원이 없습니다.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                      onCheckedChange={c => toggleAll(c === true)}
                    />
                  </TableHead>
                  <TableHead className="text-xs">선원명</TableHead>
                  <TableHead className="text-xs">직급</TableHead>
                  <TableHead className="text-xs">국적</TableHead>
                  <TableHead className="text-xs">생년월일</TableHead>
                  <TableHead className="text-xs">삭제한 사람</TableHead>
                  <TableHead className="text-xs">삭제일</TableHead>
                  <TableHead className="text-right text-xs">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {crew.map(c => (
                  <TableRow key={c.id} className={selectedIds.has(c.id) ? 'bg-blue-50/50' : ''}>
                    <TableCell>
                      <Checkbox checked={selectedIds.has(c.id)} onCheckedChange={checked => toggleOne(c.id, checked === true)} />
                    </TableCell>
                    <TableCell className="font-medium text-sm">{c.name}</TableCell>
                    <TableCell className="text-sm">{c.rank_code ? `${c.rank_name} (${c.rank_code})` : c.rank_name}</TableCell>
                    <TableCell className="text-sm">{c.nationality || '-'}</TableCell>
                    <TableCell className="text-sm">{c.date_of_birth ? format(new Date(c.date_of_birth), 'yyyy-MM-dd') : '-'}</TableCell>
                    <TableCell className="text-sm">{c.deleted_by_name}</TableCell>
                    <TableCell className="text-sm">{format(new Date(c.deleted_at), 'yyyy-MM-dd HH:mm', { locale: ko })}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={() => handleRestore([c.id])}>
                          <Undo2 className="h-3.5 w-3.5" />복구
                        </Button>
                        {isAdmin && (
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-600" onClick={() => handlePermanentDelete([c.id])}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
