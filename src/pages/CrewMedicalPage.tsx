import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Trash2, Stethoscope, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  const [filterOwner, setFilterOwner] = useState('all');
  const [filterFleet, setFilterFleet] = useState('all');
  const [filterShip, setFilterShip] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

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

  const searched = useMemo(() => {
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

  // 선주/플릿/선박 필터 옵션 — 실제 데이터에 존재하는 값만, 선주를 고르면 플릿/선박이, 플릿을 고르면 선박이 좁혀진다.
  const ownerOptions = useMemo(() => [...new Set(records.map(r => r.owner_name).filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, 'ko')), [records]);
  const fleetOptions = useMemo(() => [...new Set(records.filter(r => filterOwner === 'all' || r.owner_name === filterOwner).map(r => r.fleet_name).filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, 'ko')), [records, filterOwner]);
  const shipOptions2 = useMemo(() => [...new Set(records.filter(r => (filterOwner === 'all' || r.owner_name === filterOwner) && (filterFleet === 'all' || r.fleet_name === filterFleet)).map(r => r.resolved_ship_name).filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, 'ko')), [records, filterOwner, filterFleet]);

  useEffect(() => { if (filterFleet !== 'all' && !fleetOptions.includes(filterFleet)) setFilterFleet('all'); }, [fleetOptions, filterFleet]);
  useEffect(() => { if (filterShip !== 'all' && !shipOptions2.includes(filterShip)) setFilterShip('all'); }, [shipOptions2, filterShip]);

  const filtered = useMemo(() => searched.filter(r =>
    (filterOwner === 'all' || r.owner_name === filterOwner) &&
    (filterFleet === 'all' || r.fleet_name === filterFleet) &&
    (filterShip === 'all' || r.resolved_ship_name === filterShip)
  ), [searched, filterOwner, filterFleet, filterShip]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, filterOwner, filterFleet, filterShip]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const goToPage = (p: number) => setCurrentPage(Math.max(1, Math.min(p, totalPages)));

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>;

  return (
    <div className="max-w-[1600px] mx-auto px-3 sm:px-4 lg:px-6 py-4">
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
          <div className="flex flex-wrap gap-2">
            <Select value={filterOwner} onValueChange={setFilterOwner}>
              <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="선주사" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-sm">전체 선주사</SelectItem>
                {ownerOptions.map(o => <SelectItem key={o} value={o} className="text-sm">{o}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterFleet} onValueChange={setFilterFleet}>
              <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="플릿" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-sm">전체 플릿</SelectItem>
                {fleetOptions.map(f => <SelectItem key={f} value={f} className="text-sm">{f}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterShip} onValueChange={setFilterShip}>
              <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="선박" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-sm">전체 선박</SelectItem>
                {shipOptions2.map(s => <SelectItem key={s} value={s} className="text-sm">{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-between items-center">
            <p className="text-xs text-gray-500">총 {filtered.length}건</p>
            <div className="flex items-center gap-2">
              <Label className="text-xs">페이지당:</Label>
              <Select value={itemsPerPage.toString()} onValueChange={v => { setItemsPerPage(+v); setCurrentPage(1); }}>
                <SelectTrigger className="h-7 w-16 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{[10, 20, 50, 100].map(n => <SelectItem key={n} value={String(n)} className="text-sm">{n}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <table className="w-full text-xs">
            <thead><tr className="border-b bg-gray-50">
              <th className="w-8 p-2"><Checkbox checked={filtered.length > 0 && filtered.every(r => selectedIds.includes(r.id))} onCheckedChange={checked => toggleSelectAll(!!checked)} /></th>
              <th className="text-left p-2">선주사</th><th className="text-left p-2">플릿</th><th className="text-left p-2">선박</th><th className="text-left p-2">직급</th><th className="text-left p-2">선원명</th>
              <th className="text-left p-2">발생일</th><th className="text-left p-2">유형</th><th className="text-left p-2">진단</th><th className="text-center p-2">적합성</th><th className="text-center p-2">휴무일수</th><th className="text-center p-2">작업</th>
            </tr></thead>
            <tbody>
              {paginated.length === 0 ? <tr><td colSpan={12} className="text-center py-8 text-gray-400">데이터가 없습니다.</td></tr> : paginated.map(r => (
                <tr key={r.id} className={`border-b hover:bg-gray-50 ${permissions.canEdit ? 'cursor-pointer' : ''}`} onClick={() => permissions.canEdit && openDialog(r)}>
                  <td className="p-2" onClick={ev => ev.stopPropagation()}><Checkbox checked={selectedIds.includes(r.id)} onCheckedChange={() => toggleSelect(r.id)} /></td>
                  <td className="p-2 text-gray-600">{r.owner_name || '-'}</td>
                  <td className="p-2 text-gray-500">{r.fleet_name || '-'}</td>
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
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 pt-3">
              <Button variant="outline" size="sm" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1} className="h-8">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = totalPages <= 5 ? i + 1
                  : currentPage <= 3 ? i + 1
                  : currentPage >= totalPages - 2 ? totalPages - 4 + i
                  : currentPage - 2 + i;
                return (
                  <Button key={p} variant={currentPage === p ? 'default' : 'outline'} size="sm"
                    onClick={() => goToPage(p)} className="h-8 w-8 p-0">{p}</Button>
                );
              })}
              <Button variant="outline" size="sm" onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages} className="h-8">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
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
