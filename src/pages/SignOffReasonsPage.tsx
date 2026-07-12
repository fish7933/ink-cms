import { useState, useEffect } from 'react';
import { Plus, Trash2, Save, Edit2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getSignOffReasons, addSignOffReason, updateSignOffReason, deleteSignOffReason } from '@/services/sign-off-reason.service';
import type { SignOffReason } from '@/types/sign-off-reason';
import { useToast } from '@/hooks/use-toast';

export default function SignOffReasonsPage() {
  const { toast } = useToast();
  const [reasons, setReasons] = useState<SignOffReason[]>([]);
  const [loading, setLoading] = useState(true);
  const [formView, setFormView] = useState<{ id?: string } | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    setReasons(await getSignOffReasons());
    setLoading(false);
  };

  const openForm = (reason?: SignOffReason) => {
    setName(reason?.name || '');
    setError('');
    setFormView({ id: reason?.id });
  };
  const closeForm = () => { setFormView(null); setError(''); };

  const handleSave = async () => {
    if (!name.trim()) { setError('사유명을 입력해주세요.'); return; }
    try {
      setSaving(true);
      if (formView?.id) await updateSignOffReason(formView.id, name.trim());
      else await addSignOffReason(name.trim());
      await loadData();
      closeForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 중 오류가 발생했습니다.');
    } finally { setSaving(false); }
  };

  const handleDelete = async (reason: SignOffReason) => {
    if (reason.is_system) { toast({ title: '삭제할 수 없습니다', description: '시스템 기본 사유는 삭제할 수 없습니다.', variant: 'destructive' }); return; }
    if (!confirm('이 하선 사유를 삭제하시겠습니까?')) return;
    try { await deleteSignOffReason(reason); await loadData(); }
    catch (e) { toast({ title: '삭제 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }); }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
      {formView !== null && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">{formView.id ? '하선 사유 수정' : '하선 사유 추가'}</CardTitle>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={closeForm} disabled={saving}>취소</Button>
                <Button size="sm" onClick={handleSave} disabled={saving}><Save className="w-3.5 h-3.5 mr-1" />{saving ? '저장 중...' : '저장'}</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">사유명 *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="예: 휴가 하선" className="h-9 text-sm" />
            </div>
            {error && <Alert variant="destructive"><AlertDescription className="text-xs">{error}</AlertDescription></Alert>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">하선 사유 관리</CardTitle>
              <CardDescription className="text-xs mt-1">승선 경력의 하선 사유 목록을 관리합니다. 계약만료/자의하선/강제하선/상병하선/진급/강등은 시스템 기본 사유로 삭제할 수 없습니다.</CardDescription>
            </div>
            {formView === null && (
              <Button size="sm" className="gap-1.5 h-8" onClick={() => openForm()}><Plus className="w-4 h-4" />사유 추가</Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {reasons.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-400">등록된 하선 사유가 없습니다.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">사유명</TableHead>
                  <TableHead className="text-xs w-24">구분</TableHead>
                  <TableHead className="text-right text-xs w-20">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reasons.map(r => (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-gray-50" onClick={() => openForm(r)}>
                    <TableCell className="font-medium text-sm">{r.name}</TableCell>
                    <TableCell>
                      {r.is_system
                        ? <Badge variant="secondary" className="text-xs gap-1"><Lock className="w-3 h-3" />시스템</Badge>
                        : <Badge variant="outline" className="text-xs">사용자 정의</Badge>}
                    </TableCell>
                    <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openForm(r)}><Edit2 className="h-3.5 w-3.5" /></Button>
                        {!r.is_system && (
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-600" onClick={() => handleDelete(r)}><Trash2 className="h-3.5 w-3.5" /></Button>
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
