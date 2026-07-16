import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { FileText, Upload, X, Archive, Clock, CheckCircle2, XCircle, Ban, PencilLine, Trash2, Sparkles, Search, ChevronLeft, ChevronRight } from 'lucide-react';
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
import { approvalDocumentService, approvalLineToChainSteps } from '@/services/approval-document.service';
import { approvalService } from '@/services/approval.service';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { useTabContext } from '@/contexts/TabContext';
import DynamicDocumentForm from '@/components/document/DynamicDocumentForm';
import { msg } from '@/lib/messages';
import { Checkbox } from '@/components/ui/checkbox';
import type { OrgUnit, OrgMember } from '@/types/org-chart';
import type { ApprovalDocumentType, ApprovalDocumentAttachment, ApprovalDocumentWithDetails } from '@/types/approval-document';
import type { ApprovalChainStep } from '@/types/org-chart';
import type { ApprovalLineWithSteps } from '@/types/approval';
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
  const [searchParams] = useSearchParams();
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
  // 반려된 문서를 내용을 고쳐 재상신하는 중이면 그 문서 id — draftId(임시저장 이어쓰기)와
  // 달리 "임시저장"이 불가능하고, 제출 시 새 문서가 아니라 이 문서를 그대로 갱신한다.
  const [resubmitId, setResubmitId] = useState<string | null>(null);
  const [documentTypeId, setDocumentTypeId] = useState('');
  const [orgUnitId, setOrgUnitId] = useState('');
  const [recipientOrgUnitId, setRecipientOrgUnitId] = useState('');
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

  // 문서유형의 전결규정으로 자동 계산된 결재라인 대신, 결재선 관리에서 고른 라인을 쓰고 싶을 때
  const [approvalLines, setApprovalLines] = useState<ApprovalLineWithSteps[]>([]);
  const [useManualLine, setUseManualLine] = useState(false);
  const [manualLineId, setManualLineId] = useState('');

  // 문서함 탭 상태
  const [documents, setDocuments] = useState<ApprovalDocumentWithDetails[]>([]);
  const [boxLoading, setBoxLoading] = useState(true);
  const [boxFilter, setBoxFilter] = useState<StatusFilter>('all');
  const [boxSearch, setBoxSearch] = useState('');
  const [boxPage, setBoxPage] = useState(1);
  const [boxItemsPerPage, setBoxItemsPerPage] = useState(20);
  const [boxSelectedIds, setBoxSelectedIds] = useState<string[]>([]);
  const [boxBulkDeleteProcessing, setBoxBulkDeleteProcessing] = useState(false);
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
        // 참조인 선택 목록은 직급(선임순) 우선, 같은 직급 내에서는 입사일이 빠른 순으로 정렬
        setMembers([...members].sort((a, b) => {
          const posA = a.position_order ?? Infinity;
          const posB = b.position_order ?? Infinity;
          if (posA !== posB) return posA - posB;
          const hireA = a.hire_date ?? '9999-99-99';
          const hireB = b.hire_date ?? '9999-99-99';
          return hireA.localeCompare(hireB);
        }));
        approvalService.getApprovalLines(user.company_id ?? null).then(setApprovalLines).catch(console.error);
        // 기안 부서는 본인이 소속된 부서만 고를 수 있어야 한다 (다른 부서 명의로 기안하면 안 됨).
        // 단, 관리자는 조직도 담당자 지정 없이 시스템 전체를 관리하므로 예외적으로 전체 부서를 허용한다.
        const me = members.find(m => m.id === user.id);
        const myUnitIds = me?.org_unit_ids || [];
        const isAdminRole = user.role === 'admin' || user.role === 'system_admin';
        setMyOrgUnitIds(isAdminRole ? u.map(x => x.id) : myUnitIds);
        setMyPositionName(me?.position_name || null);
        // 대부분 본인 소속 부서로 기안하므로 기본값으로 미리 채워둔다 (필요하면 직접 바꿀 수 있음)
        if (myUnitIds[0]) setOrgUnitId(myUnitIds[0]);

        // 결재함/문서상세에서 "다시 상신" 버튼으로 넘어온 경우 — 반려된 문서를 불러와 편집 상태로 채운다.
        const resubmitParam = searchParams.get('resubmit');
        if (resubmitParam) {
          const [target] = await approvalDocumentService.getDocumentDetails([resubmitParam]);
          if (!target || target.status !== 'rejected') {
            toast({ title: '다시 상신할 수 없습니다.', description: '반려된 문서가 아니거나 이미 처리되었습니다.', variant: 'destructive' });
          } else if (target.created_by !== user.id && !isAdminRole) {
            toast({ title: '본인이 기안한 문서만 다시 상신할 수 있습니다.', variant: 'destructive' });
          } else {
            loadRejectedIntoForm(target);
          }
        }

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

  useEffect(() => { setBoxPage(1); setBoxSelectedIds([]); }, [boxFilter, boxSearch]);

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
    // 문서유형에 기본 참조부서/수신부서가 설정되어 있으면 자동으로 반영 (기안 화면에서 개별 조정 가능)
    setCcOrgUnitIds(selectedType?.default_cc_org_unit_ids || []);
    setRecipientOrgUnitId(selectedType?.default_recipient_org_unit_id || '');
  }, [documentTypeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedManualLine = approvalLines.find(l => l.id === manualLineId) || null;
  const myPositionOrder = members.find(m => m.id === currentUser?.id)?.position_order ?? null;
  const [manualChain, setManualChain] = useState<ApprovalChainStep[]>([]);
  // 결재선 관리의 라인은 여러 사람이 같이 쓰는 고정 라인이라, 그 라인에 우연히 "기안자 본인"이나
  // "기안자보다 하위 직급"인 사람이 들어있을 수 있다 — 그런 단계는 결재 의미가 없으므로(자기
  // 결재 또는 아랫사람이 윗사람 결재) 중간 결재라인에서 통째로 제외한다.
  const [manualChainExcluded, setManualChainExcluded] = useState<{ name: string; role: string; reason: 'self' | 'junior' }[]>([]);
  useEffect(() => {
    if (!selectedManualLine) { setManualChain([]); setManualChainExcluded([]); return; }
    let cancelled = false;
    approvalLineToChainSteps(selectedManualLine).then(chain => {
      if (cancelled) return;
      const excluded: { name: string; role: string; reason: 'self' | 'junior' }[] = [];
      const filtered = chain.filter(step => {
        if (step.approver_id === currentUser?.id) {
          excluded.push({ name: step.approver_name, role: step.approver_role, reason: 'self' });
          return false;
        }
        const approverOrder = members.find(m => m.id === step.approver_id)?.position_order ?? null;
        if (myPositionOrder != null && approverOrder != null && approverOrder > myPositionOrder) {
          excluded.push({ name: step.approver_name, role: step.approver_role, reason: 'junior' });
          return false;
        }
        return true;
      });
      setManualChain(filtered);
      setManualChainExcluded(excluded);
    });
    return () => { cancelled = true; };
  }, [selectedManualLine, members, currentUser, myPositionOrder]);

  // 재상신 시 직전 상신의 결재라인을 디폴트로 그대로 가져온다 — 기안 부서/문서유형을 그대로
  // 두는 한(서버의 resubmitDocument와 동일한 기준) 자동 재계산 대신 이 값을 그대로 보여준다.
  const [resubmitOriginalChain, setResubmitOriginalChain] = useState<ApprovalChainStep[]>([]);
  const [resubmitOriginalOrgUnitId, setResubmitOriginalOrgUnitId] = useState('');
  const [resubmitOriginalDocTypeId, setResubmitOriginalDocTypeId] = useState('');
  const resubmitChainUnchanged = !!resubmitId && orgUnitId === resubmitOriginalOrgUnitId && documentTypeId === resubmitOriginalDocTypeId;
  const effectiveChain = useManualLine ? manualChain : (resubmitChainUnchanged ? resubmitOriginalChain : previewChain);

  const selfStepIndexes = useMemo(
    () => effectiveChain.map((c, i) => (c.approver_id === currentUser?.id ? i : -1)).filter(i => i >= 0),
    [effectiveChain, currentUser],
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
    setResubmitId(null);
    setResubmitOriginalChain([]);
    setResubmitOriginalOrgUnitId('');
    setResubmitOriginalDocTypeId('');
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
    setRecipientOrgUnitId('');
    setUseManualLine(false);
    setManualLineId('');
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
    setResubmitId(null);
    setDocumentTypeId(doc.document_type_id);
    setOrgUnitId(doc.org_unit_id || myOrgUnitIds[0] || '');
    setRecipientOrgUnitId(doc.recipient_org_unit_id || '');
    setTitle(doc.title);
    setContent(doc.content || '');
    setFormValues(doc.form_data || {});
    setRequesterComment(doc.requester_comment || '');
    setUploadedFiles([]);
    setExistingAttachments(doc.attachments || []);
    setInnerTab('write');
  };

  // 반려된 문서를 고쳐서 다시 상신 — draftId가 아니라 resubmitId로 표시해, 제출 시
  // resubmitDocument(같은 문서 id 갱신)를 타도록 한다. 임시저장 개념은 적용되지 않는다.
  // 결재라인은 디폴트로 직전 상신 때 그대로(resubmitOriginalChain)를 보여주고, 부서/문서유형을
  // 실제로 바꿀 때만 자동 재계산으로 전환된다.
  const loadRejectedIntoForm = (doc: ApprovalDocumentWithDetails) => {
    if (doc.document_type_id !== documentTypeId) skipFormResetRef.current = true;
    setDraftId(null);
    setResubmitId(doc.id);
    setDocumentTypeId(doc.document_type_id);
    setOrgUnitId(doc.org_unit_id || myOrgUnitIds[0] || '');
    setRecipientOrgUnitId(doc.recipient_org_unit_id || '');
    setTitle(doc.title);
    setContent(doc.content || '');
    setFormValues(doc.form_data || {});
    setRequesterComment(doc.requester_comment || '');
    setUploadedFiles([]);
    setExistingAttachments(doc.attachments || []);
    if (doc.manual_line_id) {
      // 직전 상신이 결재선 관리의 특정 라인을 골라 쓴 경우 — 체크박스를 기본으로 체크해두고
      // 그 라인을 그대로 선택해준다. 체크를 해제하면 조직도 기준 자동계산으로 전환된다.
      setUseManualLine(true);
      setManualLineId(doc.manual_line_id);
      setResubmitOriginalChain([]);
      setResubmitOriginalOrgUnitId('');
      setResubmitOriginalDocTypeId('');
    } else {
      setUseManualLine(false);
      setManualLineId('');
      setResubmitOriginalChain(
        [...doc.steps].sort((a, b) => a.step_order - b.step_order).map(s => ({
          approver_id: s.approver_id,
          approver_name: s.approver_name,
          approver_role: s.approver_label || '',
          org_unit_id: '',
          org_unit_name: '',
        }))
      );
      setResubmitOriginalOrgUnitId(doc.org_unit_id || myOrgUnitIds[0] || '');
      setResubmitOriginalDocTypeId(doc.document_type_id);
    }
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
        recipientOrgUnitId: recipientOrgUnitId || undefined,
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

  const handleCancelDocument = async (id: string) => {
    if (!currentUser) return;
    if (!confirm('이 기안서를 취소하시겠습니까?')) return;
    try {
      await approvalDocumentService.cancelDocument(id);
      toast({ title: '취소되었습니다.' });
      window.dispatchEvent(new CustomEvent('approval-inbox-data-changed'));
      loadDocuments(currentUser.id);
    } catch (e) {
      toast({ title: '취소 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  const handleDeleteDocument = async (id: string) => {
    if (!currentUser) return;
    if (!confirm('이 기안서를 완전히 삭제하시겠습니까? 되돌릴 수 없습니다.')) return;
    try {
      await approvalDocumentService.deleteDocument(id);
      toast({ title: '삭제되었습니다.' });
      window.dispatchEvent(new CustomEvent('approval-inbox-data-changed'));
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
    if (useManualLine && !manualLineId) { toast({ title: '사용할 결재선을 선택해주세요.', variant: 'destructive' }); return; }
    // 결재선의 결재자가 전부 본인/하위직급이라 제외되어 실제 남은 단계가 0인 경우는 정상
    // 상황(상신 즉시 승인)이므로 막지 않는다 — 라인 자체에 애초에 단계가 없는 경우만 막는다.
    const manualLineFullyExcluded = useManualLine && manualLineId && manualChainExcluded.length > 0;
    if (effectiveChain.length === 0 && !manualLineFullyExcluded) {
      toast({ title: useManualLine ? '선택한 결재선에 단계가 없습니다.' : '결재라인을 구성할 수 없는 부서입니다.', variant: 'destructive' });
      return;
    }
    const missingField = formFields.find(f => f.required && (formValues[f.key] === undefined || formValues[f.key] === '' || formValues[f.key] === null));
    if (missingField) { toast({ title: `${missingField.label}을(를) 입력해주세요.`, variant: 'destructive' }); return; }

    try {
      setSubmitting(true);
      const newAttachments = await uploadAttachments(uploadedFiles);
      const attachments = [...existingAttachments, ...newAttachments];
      if (resubmitId) {
        await approvalDocumentService.resubmitDocument(resubmitId, {
          document_type_id: documentTypeId,
          title: title.trim(),
          content: formFields.length > 0 ? undefined : (content.trim() || undefined),
          form_data: formFields.length > 0 ? formValues : undefined,
          attachments,
          org_unit_id: orgUnitId,
          requester_comment: requesterComment.trim() || undefined,
          recipientOrgUnitId: recipientOrgUnitId || undefined,
          ccOrgUnitIds: ccOrgUnitIds.length > 0 ? ccOrgUnitIds : undefined,
          ccUserIds: ccUserIds.length > 0 ? ccUserIds : undefined,
          manualChain: useManualLine ? manualChain : undefined,
          manualLineId: useManualLine ? manualLineId : undefined,
        });
        toast({ title: '다시 상신되었습니다.' });
      } else {
        await approvalDocumentService.createDocument({
          document_type_id: documentTypeId,
          title: title.trim(),
          content: formFields.length > 0 ? undefined : (content.trim() || undefined),
          form_data: formFields.length > 0 ? formValues : undefined,
          attachments,
          org_unit_id: orgUnitId,
          created_by: currentUser.id,
          requester_comment: requesterComment.trim() || undefined,
          recipientOrgUnitId: recipientOrgUnitId || undefined,
          ccOrgUnitIds: ccOrgUnitIds.length > 0 ? ccOrgUnitIds : undefined,
          ccUserIds: ccUserIds.length > 0 ? ccUserIds : undefined,
          draftId: draftId || undefined,
          manualChain: useManualLine ? manualChain : undefined,
          manualLineId: useManualLine ? manualLineId : undefined,
        });
        toast({ title: '기안서가 제출되었습니다.' });
      }
      resetForm();
      window.dispatchEvent(new CustomEvent('approval-inbox-data-changed'));
      openNewTab('/approval-inbox', '결재함');
    } catch (e) {
      toast({ title: '제출 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const boxSearchQuery = boxSearch.trim().toLowerCase();
  const filteredDocs = (boxFilter === 'all' ? documents : documents.filter(d => d.status === boxFilter))
    .filter(d =>
      !boxSearchQuery ||
      d.title.toLowerCase().includes(boxSearchQuery) ||
      d.document_type_name.toLowerCase().includes(boxSearchQuery) ||
      (d.org_unit_name || '').toLowerCase().includes(boxSearchQuery)
    );
  const boxTotalPages = Math.max(1, Math.ceil(filteredDocs.length / boxItemsPerPage));
  const boxPaginated = filteredDocs.slice((boxPage - 1) * boxItemsPerPage, boxPage * boxItemsPerPage);

  // 임시저장은 소프트 삭제(deleteDraft), 완료된(승인/반려/취소) 문서는 완전 삭제(deleteDocument) —
  // 결재 진행중(pending)인 문서는 취소만 가능하고 일괄삭제 대상이 아니다.
  const canBulkDeleteDoc = (doc: ApprovalDocumentWithDetails) =>
    doc.status === 'draft' || ((doc.status === 'approved' || doc.status === 'rejected' || doc.status === 'cancelled') && permissions.canDelete);
  const toggleBoxSelect = (id: string) => setBoxSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleBoxSelectAll = (checked: boolean, ids: string[]) => setBoxSelectedIds(checked ? ids : []);

  const handleBulkDeleteDocs = async () => {
    if (!currentUser) return;
    const targets = documents.filter(d => boxSelectedIds.includes(d.id) && canBulkDeleteDoc(d));
    if (targets.length === 0) return;
    if (!confirm(`선택한 ${targets.length}건을 삭제하시겠습니까? 되돌릴 수 없습니다.`)) return;
    try {
      setBoxBulkDeleteProcessing(true);
      await Promise.all(targets.map(d => d.status === 'draft' ? approvalDocumentService.deleteDraft(d.id) : approvalDocumentService.deleteDocument(d.id)));
      toast({ title: `${targets.length}건 삭제되었습니다.` });
      setBoxSelectedIds([]);
      window.dispatchEvent(new CustomEvent('approval-inbox-data-changed'));
      loadDocuments(currentUser.id);
    } catch (e) {
      toast({ title: '삭제 실패', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setBoxBulkDeleteProcessing(false);
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
                  <CardTitle className="text-base">{resubmitId ? '기안서 작성 (반려 문서 다시 상신)' : draftId ? '기안서 작성 (임시저장 이어쓰기)' : '기안서 작성'}</CardTitle>
                </div>
                {(draftId || resubmitId || title || documentTypeId) && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={resetForm} disabled={submitting || savingDraft}>새로 작성</Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">문서유형과 기안 부서를 고르면 결재라인이 자동으로 구성됩니다.</p>
            </CardHeader>
            <CardContent className="pt-0 space-y-4">
              {resubmitId && (
                <div className="rounded-md border border-blue-200 bg-blue-50 text-blue-800 text-xs p-2.5">
                  반려된 문서를 다시 상신하는 중입니다. 내용을 수정한 뒤 제출하면 새 문서가 아니라 이 문서가 그대로 갱신되며, 결재는 1단계부터 다시 진행됩니다. 이전 반려 기록은 문서 상세에 계속 남습니다.
                </div>
              )}
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

              <div className="grid grid-cols-3 gap-3">
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
                <div className="space-y-1.5">
                  <Label className="text-xs">수신 부서 <span className="text-gray-400 font-normal">(결재선/참조와 별개)</span></Label>
                  <Select value={recipientOrgUnitId || '_none'} onValueChange={v => setRecipientOrgUnitId(v === '_none' ? '' : v)} disabled={submitting}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="수신부서 선택" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">지정 안 함 (총무팀(보존) 기본 표기)</SelectItem>
                      {units.map(u => <SelectItem key={u.id} value={u.id} className="text-sm">{u.name}</SelectItem>)}
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

              <div className="rounded-md border bg-gray-50 p-3 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-xs font-medium">결재라인 미리보기</p>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <Checkbox checked={useManualLine} onCheckedChange={c => setUseManualLine(c === true)} disabled={submitting} />
                    <span className="text-xs text-gray-600">전결규정 자동계산 대신 결재선 관리의 라인 사용</span>
                  </label>
                </div>

                {useManualLine && (
                  <Select value={manualLineId} onValueChange={setManualLineId} disabled={submitting}>
                    <SelectTrigger className="h-8 text-sm bg-white"><SelectValue placeholder="결재선 선택" /></SelectTrigger>
                    <SelectContent>
                      {approvalLines.length === 0
                        ? <div className="px-2 py-1.5 text-sm text-gray-500">등록된 결재선이 없습니다</div>
                        : approvalLines.map(l => <SelectItem key={l.id} value={l.id} className="text-sm">{l.name} ({l.steps.length}단계)</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}

                {useManualLine ? (
                  manualLineId && manualChain.length === 0 && manualChainExcluded.length === 0 ? (
                    <p className="text-xs text-red-500">선택한 결재선에 단계가 없습니다.</p>
                  ) : !manualLineId ? (
                    <p className="text-xs text-gray-400">사용할 결재선을 선택하세요.</p>
                  ) : null
                ) : resubmitChainUnchanged ? (
                  <p className="text-xs text-blue-600">직전 상신과 동일한 결재라인입니다. (기안 부서나 문서유형을 바꾸면 자동으로 다시 계산됩니다)</p>
                ) : !documentTypeId || !orgUnitId ? (
                  <p className="text-xs text-gray-400">문서유형과 기안 부서를 선택하면 결재라인이 표시됩니다.</p>
                ) : previewLoading ? (
                  <p className="text-xs text-gray-400">계산 중...</p>
                ) : previewError ? (
                  <p className="text-xs text-red-500">{previewError}</p>
                ) : null}

                {useManualLine && manualLineId && manualChainExcluded.length > 0 && (
                  <p className="text-xs text-purple-700 bg-purple-50 border border-purple-200 rounded px-2 py-1.5">
                    다음 결재자는 이 결재라인에서 제외되었습니다(본인 기안이거나 기안자보다 하위 직급): {manualChainExcluded.map(e => `${e.name}(${e.reason === 'self' ? '본인' : '하위직급'})`).join(', ')}
                    {manualChain.length === 0 && ' — 남은 결재자가 없어 상신 즉시 승인 처리됩니다.'}
                  </p>
                )}

                {effectiveChain.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="px-2.5 py-1.5 rounded border bg-purple-50 border-purple-300 text-xs">
                      <div className="text-[10px] text-purple-500 font-medium">신청자</div>
                      <div className="font-medium">기안자 · {currentUser?.name}</div>
                      <div className="text-gray-500">
                        {[units.find(u => u.id === orgUnitId)?.name, myPositionName].filter(Boolean).join(' · ') || '-'}
                      </div>
                    </div>
                    <span className="text-gray-400">→</span>
                    {effectiveChain.map((c, i) => {
                      const isSelf = selfStepIndexes.includes(i);
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <div className={`px-2.5 py-1.5 rounded border text-xs ${isSelf ? 'bg-blue-50 border-blue-400' : 'bg-white border-gray-300'}`}>
                            <div className="text-[10px] text-gray-500 font-medium">{i === effectiveChain.length - 1 ? '최종결재자' : '중간결재자'}</div>
                            <div className="font-medium">{i + 1}. {c.approver_name}{isSelf && <span className="text-blue-600 ml-1">(본인 · 자동승인)</span>}</div>
                            <div className="text-gray-500">{c.approver_role}</div>
                          </div>
                          {i < effectiveChain.length - 1 && <span className="text-gray-400">→</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-1">
                {permissions.canCreate && !resubmitId && (
                  <Button variant="outline" size="sm" onClick={handleSaveDraft} disabled={submitting || savingDraft}>
                    {savingDraft ? '저장 중...' : '임시저장'}
                  </Button>
                )}
                {permissions.canCreate && (
                  <Button size="sm" onClick={handleSubmit} disabled={submitting || savingDraft || effectiveChain.length === 0}>
                    {submitting ? '제출 중...' : resubmitId ? '다시 상신' : '제출'}
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

          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <Input
              value={boxSearch} onChange={e => setBoxSearch(e.target.value)}
              placeholder="제목, 문서유형, 부서로 검색"
              className="h-8 text-sm pl-8"
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <div>
              {boxSelectedIds.length > 0 && (
                <Button size="sm" variant="outline" className="h-8 text-xs text-red-600 border-red-300" onClick={handleBulkDeleteDocs} disabled={boxBulkDeleteProcessing}>
                  {boxBulkDeleteProcessing ? '삭제 중...' : `선택 삭제 (${boxSelectedIds.length})`}
                </Button>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400">페이지당</span>
              <Select value={boxItemsPerPage.toString()} onValueChange={v => { setBoxItemsPerPage(+v); setBoxPage(1); }}>
                <SelectTrigger className="h-7 w-16 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{[10, 20, 50, 100].map(n => <SelectItem key={n} value={String(n)} className="text-sm">{n}</SelectItem>)}</SelectContent>
              </Select>
            </div>
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
                  <table className="w-full text-sm whitespace-nowrap">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="w-8 p-2">
                          <Checkbox
                            checked={(() => { const ids = boxPaginated.filter(canBulkDeleteDoc).map(d => d.id); return ids.length > 0 && ids.every(id => boxSelectedIds.includes(id)); })()}
                            onCheckedChange={checked => toggleBoxSelectAll(!!checked, boxPaginated.filter(canBulkDeleteDoc).map(d => d.id))}
                            disabled={boxPaginated.filter(canBulkDeleteDoc).length === 0}
                          />
                        </th>
                        <th className="text-left p-2 text-xs font-medium text-gray-600">상태</th>
                        <th className="text-left p-2 text-xs font-medium text-gray-600">제목</th>
                        <th className="text-left p-2 text-xs font-medium text-gray-600">유형/부서</th>
                        <th className="text-left p-2 text-xs font-medium text-gray-600">기안일</th>
                        <th className="text-right p-2 text-xs font-medium text-gray-600"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {boxPaginated.map(doc => {
                        const status = STATUS_BADGE[doc.status] || STATUS_BADGE.pending;
                        const StatusIcon = status.icon;
                        return (
                          <tr
                            key={doc.id}
                            className="border-b cursor-pointer hover:bg-gray-50"
                            onClick={() => doc.status === 'draft' ? loadDraftIntoForm(doc) : setViewDoc(doc)}
                          >
                            <td className="p-2" onClick={e => e.stopPropagation()}>
                              {canBulkDeleteDoc(doc) && <Checkbox checked={boxSelectedIds.includes(doc.id)} onCheckedChange={() => toggleBoxSelect(doc.id)} />}
                            </td>
                            <td className="p-2"><Badge variant="outline" className={status.className}><StatusIcon className="w-3 h-3 mr-1" />{status.label}</Badge></td>
                            <td className="p-2 font-medium">{doc.title}</td>
                            <td className="p-2 text-gray-500">{doc.document_type_name}{doc.org_unit_name ? ` · ${doc.org_unit_name}` : ''}</td>
                            <td className="p-2 text-gray-500">{format(new Date(doc.created_at), 'yyyy-MM-dd', { locale: ko })}</td>
                            <td className="p-2 text-right" onClick={e => e.stopPropagation()}>
                              {doc.status === 'draft' && (
                                <Button
                                  variant="ghost" size="sm" className="h-7 px-2 text-xs text-gray-400 hover:text-red-600"
                                  onClick={() => handleDeleteDraft(doc.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5 mr-1" />삭제
                                </Button>
                              )}
                              {doc.status === 'pending' && doc.steps.every(s => s.status === 'pending') && (
                                <Button
                                  variant="ghost" size="sm" className="h-7 px-2 text-xs text-red-500 hover:text-red-600"
                                  onClick={() => handleCancelDocument(doc.id)}
                                >
                                  기안 취소
                                </Button>
                              )}
                              {doc.status === 'rejected' && !doc.reference_type && permissions.canCreate && (
                                <Button
                                  variant="ghost" size="sm" className="h-7 px-2 text-xs text-blue-600 hover:text-blue-700"
                                  onClick={() => loadRejectedIntoForm(doc)}
                                >
                                  다시 상신
                                </Button>
                              )}
                              {(doc.status === 'approved' || doc.status === 'rejected' || doc.status === 'cancelled') && permissions.canDelete && (
                                <Button
                                  variant="ghost" size="sm" className="h-7 px-2 text-xs text-gray-400 hover:text-red-600"
                                  onClick={() => handleDeleteDocument(doc.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5 mr-1" />삭제
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

          {boxTotalPages > 1 && (
            <div className="flex justify-center items-center gap-2 py-2">
              <Button variant="outline" size="sm" onClick={() => setBoxPage(p => Math.max(1, p - 1))} disabled={boxPage === 1} className="h-8">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              {Array.from({ length: Math.min(5, boxTotalPages) }, (_, i) => {
                const p = boxTotalPages <= 5 ? i + 1
                  : boxPage <= 3 ? i + 1
                  : boxPage >= boxTotalPages - 2 ? boxTotalPages - 4 + i
                  : boxPage - 2 + i;
                return (
                  <Button key={p} variant={boxPage === p ? 'default' : 'outline'} size="sm"
                    onClick={() => setBoxPage(p)} className="h-8 w-8 p-0">
                    {p}
                  </Button>
                );
              })}
              <Button variant="outline" size="sm" onClick={() => setBoxPage(p => Math.min(boxTotalPages, p + 1))} disabled={boxPage === boxTotalPages} className="h-8">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
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
