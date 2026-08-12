import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderOpen, Trash2, ChevronLeft, ChevronRight, RefreshCw, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { listAllStoredFiles, deleteStoredFiles, type StoredFileEntry } from '@/services/file-management.service';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';

const PAGE_SIZE = 50;

const BUCKET_LABELS: Record<string, string> = {
  documents: '문서(그룹웨어/경리/선원)',
  'crew-documents': '선원 사진',
  'company-assets': '회사 자산',
};

const PURPOSE_LABELS: Record<string, string> = {
  'approval-documents': '결재문서 첨부',
  'accounting-receipts': '금전출납 영수증',
  'accounting-daily-report-attachments': '자금일보 첨부',
  'homepage-posts': '게시판 첨부',
  'sick-leave-evidence': '질병휴가 증빙서류',
  'crew-photos': '선원 사진',
  'crew-certificates': '선원 증서',
  'medical-records': '선원 상병 첨부',
  evaluations: '승선평가/고과평가 첨부',
  'crew-recommendations': '선원 추천서류',
  logo: '회사 로고',
};

function purposeLabel(path: string): string {
  const first = path.split('/')[0];
  return PURPOSE_LABELS[first] || first;
}

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

function fileKey(f: StoredFileEntry): string {
  return `${f.bucket}:${f.path}`;
}

export default function FileManagementPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const permissions = usePermissions('file_management');
  const [files, setFiles] = useState<StoredFileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [oldBeforeDate, setOldBeforeDate] = useState('');

  useEffect(() => {
    if (!permissions.loading && !permissions.canView) navigate('/dashboard');
  }, [permissions.loading, permissions.canView, navigate]);

  const loadData = async () => {
    setLoading(true);
    try {
      setFiles(await listAllStoredFiles());
      setSelected(new Set());
    } catch (e) {
      toast({ title: '파일 목록을 불러오지 못했습니다.', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { loadData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    if (!search.trim()) return files;
    const q = search.trim().toLowerCase();
    return files.filter(f => f.path.toLowerCase().includes(q) || f.name.toLowerCase().includes(q));
  }, [files, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const totalSize = filtered.reduce((s, f) => s + f.size, 0);

  const toggleOne = (f: StoredFileEntry) => {
    setSelected(prev => {
      const next = new Set(prev);
      const k = fileKey(f);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };
  const toggleAllOnPage = () => {
    setSelected(prev => {
      const next = new Set(prev);
      const allSelected = paged.every(f => next.has(fileKey(f)));
      for (const f of paged) {
        if (allSelected) next.delete(fileKey(f)); else next.add(fileKey(f));
      }
      return next;
    });
  };

  const doDelete = async (targets: StoredFileEntry[]) => {
    if (targets.length === 0) return;
    if (!confirm(`파일 ${targets.length}개를 삭제하시겠습니까? 결재문서 등에서 이 파일을 참조하고 있다면 해당 문서에서 다운로드가 안 될 수 있습니다.`)) return;
    setDeleting(true);
    try {
      await deleteStoredFiles(targets.map(f => ({ bucket: f.bucket, path: f.path })));
      toast({ title: `${targets.length}개 파일이 삭제되었습니다.` });
      await loadData();
    } catch (e) {
      toast({ title: '삭제 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteSelected = () => {
    const targets = files.filter(f => selected.has(fileKey(f)));
    doDelete(targets);
  };

  const handleDeleteOld = () => {
    if (!oldBeforeDate) return;
    const targets = files.filter(f => f.updatedAt && f.updatedAt.slice(0, 10) < oldBeforeDate);
    if (targets.length === 0) { toast({ title: '해당 기준일 이전 파일이 없습니다.' }); return; }
    doDelete(targets);
  };

  const getUrl = (f: StoredFileEntry) => supabase.storage.from(f.bucket).getPublicUrl(f.path).data.publicUrl;

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-6 h-6" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">파일 관리</h1>
            <p className="text-sm text-gray-500">시스템에 저장된 모든 첨부파일을 조회하고 삭제할 수 있습니다.</p>
          </div>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={loadData}>
          <RefreshCw className="w-3.5 h-3.5" />새로고침
        </Button>
      </div>

      <Alert variant="destructive">
        <AlertDescription className="text-xs">
          삭제는 스토리지에서 파일만 지웁니다. 결재문서·금전출납 등에서 이미 참조 중인 파일을
          지우면 해당 화면에서 다운로드 링크가 깨질 수 있으니 신중하게 사용하세요.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base">파일 목록</CardTitle>
            <span className="text-xs text-gray-400">{filtered.length}개 · 총 {formatBytes(totalSize)}</span>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input placeholder="파일명/경로 검색" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="h-8 w-[220px] text-xs" />
            {selected.size > 0 && permissions.canDelete && (
              <Button size="sm" variant="destructive" className="h-8 gap-1.5" onClick={handleDeleteSelected} disabled={deleting}>
                <Trash2 className="w-3.5 h-3.5" />선택 {selected.size}개 삭제
              </Button>
            )}
            <div className="flex items-center gap-1.5 ml-auto">
              <Label className="text-xs text-gray-500 whitespace-nowrap">기준일 이전 일괄삭제</Label>
              <Input type="date" value={oldBeforeDate} onChange={e => setOldBeforeDate(e.target.value)} className="h-8 w-[150px] text-xs" />
              {permissions.canDelete && (
                <Button size="sm" variant="outline" className="h-8 text-red-600 border-red-200" onClick={handleDeleteOld} disabled={!oldBeforeDate || deleting}>
                  일괄 삭제
                </Button>
              )}
            </div>
          </div>

          <div className="border rounded-md overflow-hidden overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="p-2 w-8">
                    {permissions.canDelete && (
                      <Checkbox checked={paged.length > 0 && paged.every(f => selected.has(fileKey(f)))} onCheckedChange={toggleAllOnPage} />
                    )}
                  </th>
                  <th className="text-left p-2">버킷</th>
                  <th className="text-left p-2">용도</th>
                  <th className="text-left p-2">경로</th>
                  <th className="text-right p-2">크기</th>
                  <th className="text-left p-2">수정일</th>
                  <th className="p-2 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {paged.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-gray-400">파일이 없습니다.</td></tr>
                ) : paged.map(f => (
                  <tr key={fileKey(f)} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="p-2">
                      {permissions.canDelete && <Checkbox checked={selected.has(fileKey(f))} onCheckedChange={() => toggleOne(f)} />}
                    </td>
                    <td className="p-2 whitespace-nowrap">{BUCKET_LABELS[f.bucket] || f.bucket}</td>
                    <td className="p-2 whitespace-nowrap"><Badge variant="outline" className="text-[10px]">{purposeLabel(f.path)}</Badge></td>
                    <td className="p-2 text-gray-500 truncate max-w-[360px]" title={f.path}>{f.path}</td>
                    <td className="p-2 text-right font-mono whitespace-nowrap">{formatBytes(f.size)}</td>
                    <td className="p-2 whitespace-nowrap">{f.updatedAt ? new Date(f.updatedAt).toLocaleDateString('ko-KR') : '-'}</td>
                    <td className="p-2 text-center">
                      <a href={getUrl(f)} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-blue-600 inline-flex"><ExternalLink className="w-3.5 h-3.5" /></a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button type="button" size="sm" variant="outline" className="h-7 px-2" disabled={currentPage <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="w-3.5 h-3.5" /></Button>
              <span className="text-xs text-gray-500">{currentPage} / {totalPages}</span>
              <Button type="button" size="sm" variant="outline" className="h-7 px-2" disabled={currentPage >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="w-3.5 h-3.5" /></Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
