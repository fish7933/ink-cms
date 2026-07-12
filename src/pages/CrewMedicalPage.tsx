import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Trash2, Stethoscope } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { getAllMedicalRecordsWithDetails } from '@/services/medical-record.service';
import { deleteMedicalRecord } from '@/services/crew-extended.service';
import type { MedicalRecordWithDetails, MedicalRecord } from '@/types/crew-extended';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import MedicalRecordDialog from '@/components/crew/MedicalRecordDialog';

const RECORD_TYPE_LABELS: Record<string, string> = { injury: '부상', illness: '질병' };
const FITNESS_LABELS: Record<string, { label: string; color: string }> = {
  fit: { label: '적합', color: 'bg-green-100 text-green-700' },
  fit_with_restrictions: { label: '조건부 적합', color: 'bg-yellow-100 text-yellow-700' },
  unfit: { label: '부적합', color: 'bg-red-100 text-red-700' },
  pending: { label: '대기 중', color: 'bg-gray-100 text-gray-700' },
};

// 전체 선원의 상병(부상/질병) 기록을 모아 보여주는 화면. 개별 기록의 추가/수정/삭제는
// 선원 상세의 상병 탭과 동일하게 MedicalRecordDialog를 그대로 재사용한다.
export default function CrewMedicalPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const permissions = usePermissions('crew_medical');
  const [records, setRecords] = useState<MedicalRecordWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<MedicalRecord | undefined>();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (!permissions.loading && !permissions.canView) navigate('/dashboard');
  }, [permissions.loading, permissions.canView, navigate]);

  const loadData = async () => {
    try { setLoading(true); setRecords(await getAllMedicalRecordsWithDetails()); }
    catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const openDialog = (record?: MedicalRecord) => { setEditingRecord(record); setDialogOpen(true); };

  const handleDelete = async (id: string) => {
    if (!confirm('이 상병 기록을 삭제하시겠습니까?')) return;
    try { await deleteMedicalRecord(id); toast({ title: '삭제 완료' }); loadData(); } catch { toast({ title: '실패', variant: 'destructive' }); }
  };

  const confirmBulkDelete = async () => {
    try {
      await Promise.all(selectedIds.map(id => deleteMedicalRecord(id)));
      toast({ title: `${selectedIds.length}건 삭제 완료` });
      setSelectedIds([]);
      setShowDeleteDialog(false);
      loadData();
    } catch { toast({ title: '삭제 실패', variant: 'destructive' }); }
  };

  const toggleSelect = (id: string) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleSelectAll = (checked: boolean) => setSelectedIds(checked ? filtered.map(r => r.id) : []);

  const filtered = useMemo(() => {
    if (!searchTerm) return records;
    const t = searchTerm.toLowerCase();
    return records.filter(r =>
      r.crew_name.toLowerCase().includes(t) ||
      r.rank_name.toLowerCase().includes(t) ||
      (r.rank_code || '').toLowerCase().includes(t) ||
      (r.owner_name || '').toLowerCase().includes(t) ||
      (r.resolved_ship_name || '').toLowerCase().includes(t) ||
      r.diagnosis.toLowerCase().includes(t)
    );
  }, [records, searchTerm]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>;

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Stethoscope className="w-5 h-5 text-orange-600" />
              <div>
                <CardTitle className="text-base">상병 관리</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">선원의 부상/질병 기록을 모아서 관리합니다. 승선 기록과 연결하면 어느 배에서 발생했는지 함께 확인할 수 있습니다.</p>
              </div>
            </div>
            <div className="flex gap-2">
              {selectedIds.length > 0 && permissions.canDelete && (
                <Button size="sm" variant="destructive" className="gap-1.5 h-8" onClick={() => setShowDeleteDialog(true)}><Trash2 className="w-4 h-4" />선택 삭제 ({selectedIds.length})</Button>
              )}
              {permissions.canCreate && (
                <Button size="sm" className="gap-1.5 h-8" onClick={() => openDialog()}><Plus className="w-4 h-4" />상병 기록 추가</Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" /><Input placeholder="선원명, 직급, 선주사, 선박, 진단명으로 검색..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 h-9 text-sm" /></div>
          <table className="w-full text-xs">
            <thead><tr className="border-b bg-gray-50">
              <th className="w-8 p-2"><Checkbox checked={filtered.length > 0 && filtered.every(r => selectedIds.includes(r.id))} onCheckedChange={checked => toggleSelectAll(!!checked)} /></th>
              <th className="text-left p-2">선주사</th><th className="text-left p-2">선박</th><th className="text-left p-2">직급</th><th className="text-left p-2">선원명</th>
              <th className="text-left p-2">발생일</th><th className="text-left p-2">유형</th><th className="text-left p-2">진단</th><th className="text-center p-2">적합성</th><th className="text-center p-2">휴무일수</th><th className="text-center p-2">작업</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 ? <tr><td colSpan={11} className="text-center py-8 text-gray-400">데이터가 없습니다.</td></tr> : filtered.map(r => (
                <tr key={r.id} className={`border-b hover:bg-gray-50 ${permissions.canEdit ? 'cursor-pointer' : ''}`} onClick={() => permissions.canEdit && openDialog(r)}>
                  <td className="p-2" onClick={ev => ev.stopPropagation()}><Checkbox checked={selectedIds.includes(r.id)} onCheckedChange={() => toggleSelect(r.id)} /></td>
                  <td className="p-2 text-gray-600">{r.owner_name || '-'}</td>
                  <td className="p-2">{r.resolved_ship_name || '-'}</td>
                  <td className="p-2">{(r.rank_code || r.rank_name)}{r.rank_grade ? `(${r.rank_grade})` : ''}</td>
                  <td className="p-2 font-medium">{r.crew_name}</td>
                  <td className="p-2">{r.record_date}</td>
                  <td className="p-2"><Badge variant="outline" className="text-xs">{RECORD_TYPE_LABELS[r.record_type]}</Badge></td>
                  <td className="p-2 max-w-[200px] truncate">{r.diagnosis}</td>
                  <td className="p-2 text-center">{r.fitness_status ? <Badge className={`text-xs ${FITNESS_LABELS[r.fitness_status]?.color}`}>{FITNESS_LABELS[r.fitness_status]?.label}</Badge> : '-'}</td>
                  <td className="p-2 text-center">{r.days_off_duty ?? '-'}</td>
                  <td className="p-2 text-center" onClick={ev => ev.stopPropagation()}>
                    {permissions.canDelete && (
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={() => handleDelete(r.id)}><Trash2 className="h-3 w-3" /></Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-gray-400 text-right">총 {filtered.length}건</p>
        </CardContent>
      </Card>

      <MedicalRecordDialog open={dialogOpen} onOpenChange={setDialogOpen} record={editingRecord} onSuccess={loadData} />

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>상병 기록 삭제 확인</AlertDialogTitle>
            <AlertDialogDescription>선택한 {selectedIds.length}건의 상병 기록을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBulkDelete} className="bg-red-600 hover:bg-red-700">삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
