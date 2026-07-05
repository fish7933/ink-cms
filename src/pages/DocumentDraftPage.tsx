import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getCurrentUser } from '@/lib/store';
import { orgChartService } from '@/services/org-chart.service';
import { approvalDocumentService } from '@/services/approval-document.service';
import { useToast } from '@/hooks/use-toast';
import type { OrgUnit } from '@/types/org-chart';
import type { ApprovalDocumentType } from '@/types/approval-document';
import type { ApprovalChainStep } from '@/types/org-chart';
import type { User } from '@/types/models';

export default function DocumentDraftPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [types, setTypes] = useState<ApprovalDocumentType[]>([]);
  const [units, setUnits] = useState<OrgUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [documentTypeId, setDocumentTypeId] = useState('');
  const [orgUnitId, setOrgUnitId] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [requesterComment, setRequesterComment] = useState('');

  const [previewChain, setPreviewChain] = useState<ApprovalChainStep[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  useEffect(() => {
    const init = async () => {
      const user = await getCurrentUser();
      if (!user || !['ship_manager', 'admin', 'system_admin'].includes(user.role ?? '')) { navigate('/dashboard'); return; }
      setCurrentUser(user);
      try {
        const [t, u] = await Promise.all([approvalDocumentService.getDocumentTypes(), orgChartService.getOrgUnits()]);
        setTypes(t);
        setUnits(u);
      } catch (e) {
        console.error(e);
        toast({ title: '데이터를 불러오는 중 오류가 발생했습니다.', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!documentTypeId || !orgUnitId) { setPreviewChain([]); setPreviewError(''); return; }
    let cancelled = false;
    setPreviewLoading(true);
    approvalDocumentService.previewChain(orgUnitId, documentTypeId)
      .then(chain => { if (!cancelled) { setPreviewChain(chain); setPreviewError(chain.length === 0 ? '이 부서에서는 결재라인을 구성할 수 없습니다.' : ''); } })
      .catch(e => { if (!cancelled) setPreviewError(e instanceof Error ? e.message : '미리보기 계산 중 오류'); })
      .finally(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [documentTypeId, orgUnitId]);

  const selfStepIndexes = useMemo(
    () => previewChain.map((c, i) => (c.approver_id === currentUser?.id ? i : -1)).filter(i => i >= 0),
    [previewChain, currentUser],
  );

  const handleSubmit = async () => {
    if (!currentUser) return;
    if (!documentTypeId) { toast({ title: '문서유형을 선택해주세요.', variant: 'destructive' }); return; }
    if (!orgUnitId) { toast({ title: '기안 부서를 선택해주세요.', variant: 'destructive' }); return; }
    if (!title.trim()) { toast({ title: '제목을 입력해주세요.', variant: 'destructive' }); return; }
    if (previewChain.length === 0) { toast({ title: '결재라인을 구성할 수 없는 부서입니다.', variant: 'destructive' }); return; }

    try {
      setSubmitting(true);
      await approvalDocumentService.createDocument({
        document_type_id: documentTypeId,
        title: title.trim(),
        content: content.trim() || undefined,
        org_unit_id: orgUnitId,
        created_by: currentUser.id,
        requester_comment: requesterComment.trim() || undefined,
      });
      toast({ title: '기안서가 제출되었습니다.' });
      navigate('/documents');
    } catch (e) {
      toast({ title: '제출 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setSubmitting(false);
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
    <div className="max-w-3xl mx-auto px-3 sm:px-4 lg:px-6 py-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            <CardTitle className="text-base">기안서 작성</CardTitle>
          </div>
          <p className="text-xs text-muted-foreground mt-1">문서유형과 기안 부서를 고르면 결재라인이 자동으로 구성됩니다.</p>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">문서유형 *</Label>
              <Select value={documentTypeId} onValueChange={setDocumentTypeId} disabled={submitting}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="문서유형 선택" /></SelectTrigger>
                <SelectContent>
                  {types.length === 0
                    ? <div className="px-2 py-1.5 text-sm text-gray-500">등록된 문서유형이 없습니다</div>
                    : types.map(t => <SelectItem key={t.id} value={t.id} className="text-sm">{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">기안 부서 *</Label>
              <Select value={orgUnitId} onValueChange={setOrgUnitId} disabled={submitting}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="부서 선택" /></SelectTrigger>
                <SelectContent>
                  {units.length === 0
                    ? <div className="px-2 py-1.5 text-sm text-gray-500">등록된 부서가 없습니다</div>
                    : units.map(u => <SelectItem key={u.id} value={u.id} className="text-sm">{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">제목 *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="기안서 제목" className="h-9 text-sm" disabled={submitting} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">본문</Label>
            <Textarea value={content} onChange={e => setContent(e.target.value)} placeholder="기안 내용을 입력하세요" rows={8} disabled={submitting} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">요청 사유 <span className="text-gray-400 font-normal">(선택)</span></Label>
            <Textarea value={requesterComment} onChange={e => setRequesterComment(e.target.value)} placeholder="결재자에게 전달할 메모" rows={2} disabled={submitting} />
          </div>

          <div className="rounded-md border bg-gray-50 p-3">
            <p className="text-xs font-medium mb-2">결재라인 미리보기</p>
            {!documentTypeId || !orgUnitId ? (
              <p className="text-xs text-gray-400">문서유형과 기안 부서를 선택하면 결재라인이 표시됩니다.</p>
            ) : previewLoading ? (
              <p className="text-xs text-gray-400">계산 중...</p>
            ) : previewError ? (
              <p className="text-xs text-red-500">{previewError}</p>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                {previewChain.map((c, i) => {
                  const isSelf = selfStepIndexes.includes(i);
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <div className={`px-2.5 py-1.5 rounded border text-xs ${isSelf ? 'bg-blue-50 border-blue-400' : 'bg-white border-gray-300'}`}>
                        <div className="font-medium">{i + 1}. {c.approver_name}{isSelf && <span className="text-blue-600 ml-1">(본인 · 자동승인)</span>}</div>
                        <div className="text-gray-500">{c.approver_role}</div>
                      </div>
                      {i < previewChain.length - 1 && <span className="text-gray-400">→</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => navigate('/documents')} disabled={submitting}>취소</Button>
            <Button size="sm" onClick={handleSubmit} disabled={submitting || previewChain.length === 0}>
              {submitting ? '제출 중...' : '제출'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
