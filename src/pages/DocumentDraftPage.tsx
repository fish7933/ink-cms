import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { FileText, Upload, X, Archive, Clock, CheckCircle2, XCircle, Ban, PencilLine, Trash2, Sparkles, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getCurrentUser } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { orgChartService } from '@/services/org-chart.service';
import { approvalDocumentService } from '@/services/approval-document.service';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { useTabContext } from '@/contexts/TabContext';
import DynamicDocumentForm from '@/components/document/DynamicDocumentForm';
import { msg } from '@/lib/messages';
import type { OrgUnit, OrgMember } from '@/types/org-chart';
import type { ApprovalDocumentType, ApprovalDocumentAttachment, ApprovalDocumentWithDetails } from '@/types/approval-document';
import type { ApprovalChainStep } from '@/types/org-chart';
import type { User } from '@/types/models';

type StatusFilter = 'all' | 'draft' | 'pending' | 'approved' | 'rejected' | 'cancelled';

const STATUS_BADGE: Record<string, { label: string; className: string; icon: typeof Clock }> = {
  draft: { label: '임시저장', className: 'bg-slate-50 text-slate-600 border-slate-200', icon: PencilLine },
  pending: { label: '결재중', className: 'bg-yellow-50 text-yellow-700 border-yellow-200', icon: Clock },
  approved: { label: '승인', className: 'bg-green-50 text-green-700 border-green-200', icon: CheckCircle2 },
  rejected: { label: '반려', className: 'bg-red-50 text-red-700 border-red-200', icon: XCircle },
  cancelled: { label: '취소', className: 'bg-gray-50 text-gray-700 border-gray-200', icon: Ban },
};

const FILTER_LABELS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'draft', label: '임시저장' },
  { value: 'pending', label: '결재중' },
  { value: 'approved', label: '승인' },
  { value: 'rejected', label: '반려' },
  { value: 'cancelled', label: '취소' },
];

// 기안함: "기안서 작성"과 "내 문서함"을 탭으로 묶은 페이지.
// 내 문서함에서 임시저장 문서를 클릭하면 작성 탭으로 이어서 편집할 수 있고,
// 제출된 문서를 클릭하면 결재 진행상황이 아니라 기안 당시의 입력 형태 그대로 열람한다.
export default function DocumentDraftPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { openNewTab } = useTabContext();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [types, setTypes] = useState<ApprovalDocumentType[]>([]);
  const [units, setUnits] = useState<OrgUnit[]>([]);
  const [myOrgUnitIds, setMyOrgUnitIds] = useState<string[]>([]);
  const [myPositionName, setMyPositionName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  const [innerTab, setInnerTab] = useState<'write' | 'box'>('write');

  // 작성 탭 상태
  const [draftId, setDraftId] = useState<string | null>(null);
  const [documentTypeId, setDocumentTypeId] = useState('');
  const [orgUnitId, setOrgUnitId] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [formValues, setFormValues] = useState<Record<string, string | number | null>>({});
  const [ccOrgUnitIds, setCcOrgUnitIds] = useState<string[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [ccUserIds, setCcUserIds] = useState<string[]>([]);
  const [ccUserSearch, setCcUserSearch] = useState('');
  const [requesterComment, setRequesterComment] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<ApprovalDocumentAttachment[]>([]);
  const skipFormResetRef = useRef(false);

  const [previewChain, setPreviewChain] = useState<ApprovalChainStep[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  // 문서함 탭 상태
  const [documents, setDocuments] = useState<ApprovalDocumentWithDetails[]>([]);
  const [boxLoading, setBoxLoading] = useState(true);
  const [boxFilter, setBoxFilter] = useState<StatusFilter>('all');
  const [viewDoc, setViewDoc] = useState<ApprovalDocumentWithDetails | null>(null);

  const permissions = usePermissions('document_draft');

  // 메뉴 접속(canView) 권한이 명시적으로 꺼진 경우 접근을 차단한다. loading 중에는 판단하지 않는다.
  useEffect(() => {
    if (!permissions.loading && !permissions.canView) navigate('/dashboard');
  }, [permissions.loading, permissions.canView, navigate]);

  useEffect(() => {
    const init = async () => {
      const user = await getCurrentUser();
      if (!user || !['ship_manager', 'admin', 'system_admin'].includes(user.role ?? '')) { navigate('/dashboard'); return; }
      setCurrentUser(user);
      try {
        const [t, u, members] = await Promise.all([
          approvalDocumentService.getDocumentTypes(),
          orgChartService.getOrgUnits(),
          orgChartService.getOrgMembers(),
        ]);
        setTypes(t);
        setUnits(u);
        setMembers(members);
        // 기안 부서는 본인이 소속된 부서만 고를 수 있어야 한다 (다른 부서 명의로 기안하면 안 됨).
        // 단, 관리자는 조직도 담당자 지정 없이 시스템 전체를 관리하므로 예외적으로 전체 부서를 허용한다.
        const me = members.find(m => m.id === user.id);
        const myUnitIds = me?.org_unit_ids || [];
        const isAdminRole = user.role === 'admin' || user.role === 'system_admin';
        setMyOrgUnitIds(isAdminRole ? u.map(x => x.id) : myUnitIds);
        setMyPositionName(me?.position_name || null);
        // 대부분 본인 소속 부서로 기안하므로 기본값으로 미리 채워둔다 (필요하면 직접 바꿀 수 있음)
        if (myUnitIds[0]) setOrgUnitId(myUnitIds[0]);
        await loadDocuments(user.id);
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
    const handler = () => { if (currentUser) loadDocuments(currentUser.id); };
    window.addEventListener('approval-inbox-data-changed', handler);
    return () => window.removeEventListener('approval-inbox-data-changed', handler);
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadDocuments = async (userId: string) => {
    setBoxLoading(true);
    try {
      setDocuments(await approvalDocumentService.getMyDraftedDocuments(userId));
    } catch (e) {
      console.error(e);
      toast({ title: '오류', description: '문서함을 불러오는 중 오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setBoxLoading(false);
    }
  };

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

  const myUnits = units.filter(u => myOrgUnitIds.includes(u.id));
  // 연차/질병휴가 신청, 교대계획, 승진·강등 발령 등은 각 기능이 시스템에서 자동으로 결재문서를
  // 생성하는 유형(is_free_form === false)이라, 기안서 작성 화면에서 직접 골라 만들 수 없다.
  const draftableTypes = types.filter(t => t.is_free_form !== false);
  const selectedType = types.find(t => t.id === documentTypeId) || null;
  const formFields = selectedType?.field_schema || [];

  useEffect(() => {
    if (skipFormResetRef.current) { skipFormResetRef.current = false; return; }
    setFormValues({});
    // 문서유형에 기본 참조부서가 설정되어 있으면 자동으로 반영 (기안 화면에서 개별 조정 가능)
    setCcOrgUnitIds(selectedType?.default_cc_org_unit_ids || []);
  }, [documentTypeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const selfStepIndexes = useMemo(
    () => previewChain.map((c, i) => (c.approver_id === currentUser?.id ? i : -1)).filter(i => i >= 0),
    [previewChain, currentUser],
  );

  // 자주 쓰는 문서 목록에서 사용자가 지운 제목들 (브라우저에 사용자별로 저장)
  const [dismissedFrequentTitles, setDismissedFrequentTitles] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!currentUser) return;
    try {
      const raw = localStorage.getItem(`frequent-docs-dismissed:${currentUser.id}`);
      setDismissedFrequentTitles(new Set(raw ? JSON.parse(raw) : []));
    } catch {
      setDismissedFrequentTitles(new Set());
    }
  }, [currentUser]);

  const dismissFrequentDoc = (title: string) => {
    if (!currentUser) return;
    setDismissedFrequentTitles(prev => {
      const next = new Set(prev);
      next.add(title);
      localStorage.setItem(`frequent-docs-dismissed:${currentUser.id}`, JSON.stringify([...next]));
      return next;
    });
  };

  // 자주 쓰는 문서: 최근에 제출한(임시저장 제외) 문서 중 제목이 겹치지 않고, 사용자가 지우지 않은 것들을 최신순으로 보여준다.
  // 연차/질병휴가 신청 등 시스템이 자동 생성한 문서는 기안서 작성으로 이어서 만들 수 있는 대상이 아니므로 제외한다.
  const frequentDocs = useMemo(() => {
    const draftableTypeIds = new Set(draftableTypes.map(t => t.id));
    const seen = new Set<string>();
    const result: ApprovalDocumentWithDetails[] = [];
    for (const d of documents) {
      if (d.status === 'draft') continue;
      if (!draftableTypeIds.has(d.document_type_id)) continue;
      if (dismissedFrequentTitles.has(d.title)) continue;
      if (seen.has(d.title)) continue;
      seen.add(d.title);
      result.push(d);
      if (result.length >= 6) break;
    }
    return result;
  }, [documents, dismissedFrequentTitles, draftableTypes]);

  const resetForm = () => {
    setDraftId(null);
    if (documentTypeId !== '') skipFormResetRef.current = true;
    setDocumentTypeId('');
    setTitle('');
    setContent('');
    setFormValues({});
    setCcOrgUnitIds([]);
    setCcUserIds([]);
    setCcUserSearch('');
    setRequesterComment('');
    setUploadedFiles([]);
    setExistingAttachments([]);
    setOrgUnitId(myOrgUnitIds[0] || '');
  };

  const applyTemplate = (doc: ApprovalDocumentWithDetails) => {
    if (doc.document_type_id !== documentTypeId) skipFormResetRef.current = true;
    setDocumentTypeId(doc.document_type_id);
    setTitle(doc.title);
    setContent(doc.content || '');
    setFormValues(doc.form_data || {});
    toast({ title: `'${doc.title}' 내용을 불러왔습니다.` });
  };

  const loadDraftIntoForm = (doc: ApprovalDocumentWithDetails) => {
    if (doc.document_type_id !== documentTypeId) skipFormResetRef.current = true;
    setDraftId(doc.id);
    setDocumentTypeId(doc.document_type_id);
    setOrgUnitId(doc.org_unit_id || myOrgUnitIds[0] || '');
    setTitle(doc.title);
    setContent(doc.content || '');
    setFormValues(doc.form_data || {});
    setRequesterComment(doc.requester_comment || '');
    setUploadedFiles([]);
    setExistingAttachments(doc.attachments || []);
    setInnerTab('write');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files).filter(f => {
      if (f.size > 10 * 1024 * 1024) { toast({ title: `${f.name}은 10MB를 초과합니다.`, variant: 'destructive' }); return false; }
      return true;
    });
    setUploadedFiles(prev => [...prev, ...files]);
  };

  const removeFile = (idx: number) => setUploadedFiles(prev => prev.filter((_, i) => i !== idx));
  const removeExistingAttachment = (idx: number) => setExistingAttachments(prev => prev.filter((_, i) => i !== idx));

  const toggleCcUnit = (unitId: string) =>
    setCcOrgUnitIds(prev => prev.includes(unitId) ? prev.filter(id => id !== unitId) : [...prev, unitId]);

  const toggleCcUser = (userId: string) =>
    setCcUserIds(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]);

  const uploadAttachments = async (files: File[]): Promise<ApprovalDocumentAttachment[]> => {
    const attachments: ApprovalDocumentAttachment[] = [];
    for (const file of files) {
      const ext = file.name.split('.').pop();
      const path = `approval-documents/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
      const { error } = await supabase.storage.from('documents').upload(path, file);
      if (error) throw new Error(msg.file.uploadFailed(file.name));
      attachments.push({ name: file.name, path, size: file.size, type: file.type });
    }
    return attachments;
  };

  const handleSaveDraft = async () => {
    if (!currentUser) return;
    if (!documentTypeId) { toast({ title: '문서유형을 선택해주세요.', variant: 'destructive' }); return; }
    if (!title.trim()) { toast({ title: '제목을 입력해주세요.', variant: 'destructive' }); return; }
    try {
      setSavingDraft(true);
      const newAttachments = await uploadAttachments(uploadedFiles);
      const attachments = [...existingAttachments, ...newAttachments];
      const saved = await approvalDocumentService.saveDraft({
        draftId: draftId || undefined,
        document_type_id: documentTypeId,
        title: title.trim(),
        content: formFields.length > 0 ? undefined : (content.trim() || undefined),
        form_data: formFields.length > 0 ? formValues : undefined,
        attachments,
        org_unit_id: orgUnitId || undefined,
        created_by: currentUser.id,
        requester_comment: requesterComment.trim() || undefined,
      });
      setDraftId(saved.id);
      setExistingAttachments(attachments);
      setUploadedFiles([]);
      toast({ title: '임시저장되었습니다.', description: '내 문서함에서 이어서 작성할 수 있습니다.' });
      loadDocuments(currentUser.id);
    } catch (e) {
      toast({ title: '임시저장 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setSavingDraft(false);
    }
  };

  const handleDeleteDraft = async (id: string) => {
    if (!currentUser) return;
    if (!confirm('이 임시저장 문서를 삭제하시겠습니까?')) return;
    try {
      await approvalDocumentService.deleteDraft(id);
      if (draftId === id) resetForm();
      toast({ title: '삭제되었습니다.' });
      loadDocuments(currentUser.id);
    } catch (e) {
      toast({ title: '삭제 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  const handleSubmit = async () => {
    if (!currentUser) return;
    if (!documentTypeId) { toast({ title: '문서유형을 선택해주세요.', variant: 'destructive' }); return; }
    if (!orgUnitId) { toast({ title: '기안 부서를 선택해주세요.', variant: 'destructive' }); return; }
    if (!title.trim()) { toast({ title: '제목을 입력해주세요.', variant: 'destructive' }); return; }
    if (previewChain.length === 0) { toast({ title: '결재라인을 구성할 수 없는 부서입니다.', variant: 'destructive' }); return; }
    const missingField = formFields.find(f => f.required && (formValues[f.key] === undefined || formValues[f.key] === '' || formValues[f.key] === null));
    if (missingField) { toast({ title: `${missingField.label}을(를) 입력해주세요.`, variant: 'destructive' }); return; }

    try {
      setSubmitting(true);
      const newAttachments = await uploadAttachments(uploadedFiles);
      const attachments = [...existingAttachments, ...newAttachments];
      await approvalDocumentService.createDocument({
        document_type_id: documentTypeId,
        title: title.trim(),
        content: formFields.length > 0 ? undefined : (content.trim() || undefined),
        form_data: formFields.length > 0 ? formValues : undefined,
        attachments,
        org_unit_id: orgUnitId,
        created_by: currentUser.id,
        requester_comment: requesterComment.trim() || undefined,
        ccOrgUnitIds: ccOrgUnitIds.length > 0 ? ccOrgUnitIds : undefined,
        ccUserIds: ccUserIds.length > 0 ? ccUserIds : undefined,
        draftId: draftId || undefined,
      });
      toast({ title: '기안서가 제출되었습니다.' });
      resetForm();
      window.dispatchEvent(new CustomEvent('approval-inbox-data-changed'));
      openNewTab('/approval-inbox', '결재함');
    } catch (e) {
      toast({ title: '제출 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const filteredDocs = boxFilter === 'all' ? documents : documents.filter(d => d.status === boxFilter);

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
      <Tabs value={innerTab} onValueChange={v => setInnerTab(v as 'write' | 'box')}>
        <TabsList>
          <TabsTrigger value="write" className="gap-1.5"><FileText className="w-3.5 h-3.5" />기안서 작성</TabsTrigger>
          <TabsTrigger value="box" className="gap-1.5"><Archive className="w-3.5 h-3.5" />내 문서함{documents.length > 0 && <span className="text-gray-400">({documents.length})</span>}</TabsTrigger>
        </TabsList>

        <TabsContent value="write" className="mt-3">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  <CardTitle className="text-base">{draftId ? '기안서 작성 (임시저장 이어쓰기)' : '기안서 작성'}</CardTitle>
                </div>
                {(draftId || title || documentTypeId) && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={resetForm} disabled={submitting || savingDraft}>새로 작성</Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">문서유형과 기안 부서를 고르면 결재라인이 자동으로 구성됩니다.</p>
            </CardHeader>
            <CardContent className="pt-0 space-y-4">
              {frequentDocs.length > 0 && (
                <div className="rounded-md border bg-amber-50/50 border-amber-200 p-3 space-y-2">
                  <p className="text-xs font-medium flex items-center gap-1 text-amber-800"><Sparkles className="w-3.5 h-3.5" />자주 쓰는 문서 <span className="text-amber-600 font-normal">(클릭하면 제목/내용을 그대로 불러옵니다)</span></p>
                  <div className="flex flex-wrap gap-1.5">
                    {frequentDocs.map(d => (
                      <span
                        key={d.id}
                        className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-md text-xs border bg-white text-gray-700 border-amber-200 hover:bg-amber-100 transition-colors"
                      >
                        <button type="button" onClick={() => applyTemplate(d)} disabled={submitting || savingDraft}>
                          {d.title}
                        </button>
                        <button
                          type="button"
                          onClick={() => dismissFrequentDoc(d.title)}
                          disabled={submitting || savingDraft}
                          title="자주 쓰는 목록에서 지우기"
                          className="text-gray-400 hover:text-red-600 rounded-full p-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">문서유형 *</Label>
                  <Select value={documentTypeId} onValueChange={setDocumentTypeId} disabled={submitting}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="문서유형 선택" /></SelectTrigger>
                    <SelectContent>
                      {draftableTypes.length === 0
                        ? <div className="px-2 py-1.5 text-sm text-gray-500">등록된 문서유형이 없습니다</div>
                        : draftableTypes.map(t => <SelectItem key={t.id} value={t.id} className="text-sm">{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">기안 부서 *</Label>
                  <Select value={orgUnitId} onValueChange={setOrgUnitId} disabled={submitting}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="부서 선택" /></SelectTrigger>
                    <SelectContent>
                      {myUnits.length === 0
                        ? <div className="px-2 py-1.5 text-sm text-gray-500">소속된 부서가 없습니다. 관리자에게 문의하세요.</div>
                        : myUnits.map(u => <SelectItem key={u.id} value={u.id} className="text-sm">{u.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">제목 *</Label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="기안서 제목" className="h-9 text-sm" disabled={submitting} />
              </div>

              {formFields.length > 0 ? (
                <div className="space-y-1.5">
                  <Label className="text-xs">{selectedType?.name} 양식</Label>
                  <DynamicDocumentForm
                    fields={formFields}
                    values={formValues}
                    onChange={(key, value) => setFormValues(prev => ({ ...prev, [key]: value }))}
                    disabled={submitting}
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label className="text-xs">본문</Label>
                  <Textarea value={content} onChange={e => setContent(e.target.value)} placeholder="기안 내용을 입력하세요" rows={8} disabled={submitting} />
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs">요청 사유 <span className="text-gray-400 font-normal">(선택)</span></Label>
                <Textarea value={requesterComment} onChange={e => setRequesterComment(e.target.value)} placeholder="결재자에게 전달할 메모" rows={2} disabled={submitting} />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">결재할 문서(양식) 첨부 <span className="text-gray-400 font-normal">(선택)</span></Label>
                <div className="border-2 border-dashed rounded-md p-4 text-center">
                  <input type="file" id="doc-upload" multiple onChange={handleFileChange} className="hidden" disabled={submitting} />
                  <label htmlFor="doc-upload" className={`cursor-pointer flex flex-col items-center gap-2 ${submitting ? 'opacity-50 pointer-events-none' : ''}`}>
                    <Upload className="w-8 h-8 text-gray-400" />
                    <div className="text-sm text-gray-600"><span className="text-blue-600 font-medium">파일 선택</span> 또는 드래그 앤 드롭</div>
                    <div className="text-xs text-gray-500">문서 양식, 참고자료 등 (최대 10MB)</div>
                  </label>
                </div>
                {existingAttachments.length > 0 && (
                  <div className="space-y-2">
                    {existingAttachments.map((file, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 bg-blue-50 rounded-md">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-sm truncate">{file.name}</span>
                          <span className="text-xs text-gray-500 shrink-0">(임시저장됨)</span>
                        </div>
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeExistingAttachment(idx)} className="h-7 w-7 p-0 shrink-0" disabled={submitting}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                {uploadedFiles.length > 0 && (
                  <div className="space-y-2">
                    {uploadedFiles.map((file, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-sm truncate">{file.name}</span>
                          <span className="text-xs text-gray-500 shrink-0">({(file.size / 1024).toFixed(1)} KB)</span>
                        </div>
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeFile(idx)} className="h-7 w-7 p-0 shrink-0" disabled={submitting}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">참조 부서 <span className="text-gray-400 font-normal">(결재선과 별개로 통보)</span></Label>
                <div className="flex flex-wrap gap-1.5">
                  {units.map(u => (
                    <button
                      key={u.id} type="button" onClick={() => toggleCcUnit(u.id)} disabled={submitting}
                      className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${ccOrgUnitIds.includes(u.id) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                    >
                      {u.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">참조인 <span className="text-gray-400 font-normal">(부서와 별개로 특정 인원에게 개별 통보)</span></Label>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <Input
                    value={ccUserSearch} onChange={e => setCcUserSearch(e.target.value)} disabled={submitting}
                    placeholder="이름으로 검색" className="h-8 text-sm pl-7"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto border rounded-md p-2">
                  {members.filter(m => !ccUserSearch.trim() || m.name.includes(ccUserSearch.trim())).length === 0 ? (
                    <p className="text-xs text-gray-400 px-1 py-0.5">검색 결과가 없습니다</p>
                  ) : members
                    .filter(m => !ccUserSearch.trim() || m.name.includes(ccUserSearch.trim()))
                    .map(m => (
                      <button
                        key={m.id} type="button" onClick={() => toggleCcUser(m.id)} disabled={submitting}
                        className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${ccUserIds.includes(m.id) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                      >
                        {m.name}{m.position_name ? ` · ${m.position_name}` : ''}
                      </button>
                    ))}
                </div>
                {ccUserIds.length > 0 && (
                  <p className="text-xs text-gray-500">
                    선택됨: {ccUserIds.map(id => members.find(m => m.id === id)?.name).filter(Boolean).join(', ')}
                  </p>
                )}
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
                    <div className="px-2.5 py-1.5 rounded border bg-purple-50 border-purple-300 text-xs">
                      <div className="font-medium">기안자 · {currentUser?.name}</div>
                      <div className="text-gray-500">
                        {[units.find(u => u.id === orgUnitId)?.name, myPositionName].filter(Boolean).join(' · ') || '-'}
                      </div>
                    </div>
                    {previewChain.length > 0 && <span className="text-gray-400">→</span>}
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
                {permissions.canCreate && (
                  <Button variant="outline" size="sm" onClick={handleSaveDraft} disabled={submitting || savingDraft}>
                    {savingDraft ? '저장 중...' : '임시저장'}
                  </Button>
                )}
                {permissions.canCreate && (
                  <Button size="sm" onClick={handleSubmit} disabled={submitting || savingDraft || previewChain.length === 0}>
                    {submitting ? '제출 중...' : '제출'}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="box" className="mt-3 space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {FILTER_LABELS.map(f => (
              <button
                key={f.value} type="button" onClick={() => setBoxFilter(f.value)}
                className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${boxFilter === f.value ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">문서 목록 ({filteredDocs.length})</CardTitle></CardHeader>
            <CardContent className="pt-0">
              {boxLoading ? (
                <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
              ) : filteredDocs.length === 0 ? (
                <div className="text-center py-12 text-sm text-gray-400">해당하는 문서가 없습니다.</div>
              ) : (
                <div className="rounded-md border overflow-hidden overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left p-2 text-xs font-medium text-gray-600">상태</th>
                        <th className="text-left p-2 text-xs font-medium text-gray-600">제목</th>
                        <th className="text-left p-2 text-xs font-medium text-gray-600">유형/부서</th>
                        <th className="text-left p-2 text-xs font-medium text-gray-600">기안일</th>
                        <th className="text-right p-2 text-xs font-medium text-gray-600"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDocs.map(doc => {
                        const status = STATUS_BADGE[doc.status] || STATUS_BADGE.pending;
                        const StatusIcon = status.icon;
                        return (
                          <tr
                            key={doc.id}
                            className="border-b cursor-pointer hover:bg-gray-50"
                            onClick={() => doc.status === 'draft' ? loadDraftIntoForm(doc) : setViewDoc(doc)}
                          >
                            <td className="p-2"><Badge variant="outline" className={status.className}><StatusIcon className="w-3 h-3 mr-1" />{status.label}</Badge></td>
                            <td className="p-2 font-medium">{doc.title}</td>
                            <td className="p-2 text-gray-500">{doc.document_type_name}{doc.org_unit_name ? ` · ${doc.org_unit_name}` : ''}</td>
                            <td className="p-2 text-gray-500">{format(new Date(doc.created_at), 'yyyy-MM-dd', { locale: ko })}</td>
                            <td className="p-2 text-right">
                              {doc.status === 'draft' && (
                                <Button
                                  variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-red-600"
                                  onClick={e => { e.stopPropagation(); handleDeleteDraft(doc.id); }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 제출된 문서 열람: 결재 진행상황이 아니라 기안 당시 작성한 형태 그대로 보여준다. */}
      <Dialog open={!!viewDoc} onOpenChange={open => !open && setViewDoc(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {viewDoc?.title}
              {viewDoc && (
                <Badge variant="outline" className={(STATUS_BADGE[viewDoc.status] || STATUS_BADGE.pending).className}>
                  {(STATUS_BADGE[viewDoc.status] || STATUS_BADGE.pending).label}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {viewDoc && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="p-2.5 bg-gray-50 rounded-md">
                  <p className="text-gray-500">문서유형</p>
                  <p className="font-medium">{viewDoc.document_type_name}</p>
                </div>
                <div className="p-2.5 bg-gray-50 rounded-md">
                  <p className="text-gray-500">기안 부서</p>
                  <p className="font-medium">{viewDoc.org_unit_name || '-'}</p>
                </div>
                <div className="p-2.5 bg-gray-50 rounded-md">
                  <p className="text-gray-500">기안일</p>
                  <p className="font-medium">{format(new Date(viewDoc.created_at), 'yyyy-MM-dd', { locale: ko })}</p>
                </div>
              </div>

              {(viewDoc.form_data && Object.keys(viewDoc.form_data).length > 0) ? (
                <DynamicDocumentForm
                  fields={types.find(t => t.id === viewDoc.document_type_id)?.field_schema || []}
                  values={viewDoc.form_data}
                  onChange={() => {}}
                  disabled
                />
              ) : (
                viewDoc.content && <div className="text-sm leading-7 whitespace-pre-wrap p-2.5 bg-gray-50 rounded-md">{viewDoc.content}</div>
              )}

              {viewDoc.attachments.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-gray-500">첨부파일</p>
                  <div className="flex flex-wrap gap-1.5">
                    {viewDoc.attachments.map((a, i) => <span key={i} className="px-2 py-1 bg-gray-50 border rounded text-xs">{a.name}</span>)}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => { applyTemplate(viewDoc); setInnerTab('write'); setViewDoc(null); }}>이 내용으로 새로 작성</Button>
                <Button variant="outline" size="sm" onClick={() => { openNewTab(`/documents/${viewDoc.id}`, viewDoc.title); setViewDoc(null); }}>결재 현황 상세보기</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
