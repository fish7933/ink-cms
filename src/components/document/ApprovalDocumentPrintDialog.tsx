import { useEffect } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X, Printer } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import ApprovalDocumentIssuedSheet from './ApprovalDocumentIssuedSheet';
import type { CompanyInfo } from '@/services/company-info.service';
import type { LeaveDetail } from '@/services/approval-document.service';
import type { ApprovalDocumentWithDetails, ApprovalDocumentType } from '@/types/approval-document';
import type { ShorePosition } from '@/types/models';

const BODY_PRINT_CLASS = 'approval-doc-print-dialog-open';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doc: ApprovalDocumentWithDetails;
  documentType: ApprovalDocumentType | null;
  company: CompanyInfo | null;
  positions: ShorePosition[];
  creatorPositionName: string | null;
  leaveDetail: LeaveDetail | null;
  referenceLabels: string[];
}

// 인쇄 시 뒤에 있는 앱 화면(#root) 전체를 숨기고 이 모달 내용만 인쇄되도록 하는 전용 클래스.
// index.css의 `body.approval-doc-print-dialog-open #root { display: none }` 규칙과 짝을 이룬다
// (급여 템플릿 인쇄 모달과 동일한 패턴).
export default function ApprovalDocumentPrintDialog({ open, onOpenChange, doc, documentType, company, positions, creatorPositionName, leaveDetail, referenceLabels }: Props) {
  useEffect(() => {
    if (open) document.body.classList.add(BODY_PRINT_CLASS);
    else document.body.classList.remove(BODY_PRINT_CLASS);
    return () => document.body.classList.remove(BODY_PRINT_CLASS);
  }, [open]);

  // 첨부파일 포함 여부를 먼저 물어보는 중간 화면 없이, 모달이 열리면 바로 인쇄 대화상자를 띄운다.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => window.print(), 150);
    return () => clearTimeout(t);
  }, [open]);

  // PDF 등 이미지가 아닌 첨부파일은 시행문 인쇄물에 함께 합쳐 넣지 않는다(iframe 인쇄가 첫
  // 페이지만 찍히는 등 브라우저 인쇄와 맞지 않음) — 대신 새 탭으로 열어 원본 뷰어로 따로 인쇄한다.
  const nonImageAttachments = doc.attachments.filter(a => !a.type?.startsWith('image/'));
  const openAttachment = (path: string) => {
    const { data } = supabase.storage.from('documents').getPublicUrl(path);
    if (data?.publicUrl) window.open(data.publicUrl, '_blank');
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 print:hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-50 w-[95vw] max-w-4xl max-h-[92vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border bg-white shadow-lg
            print:static print:inset-auto print:z-auto print:w-auto print:max-w-none print:max-h-none print:translate-x-0 print:translate-y-0
            print:overflow-visible print:rounded-none print:border-none print:shadow-none"
        >
          <div className="print:hidden sticky top-0 z-10 flex items-center justify-between border-b bg-white px-4 py-3">
            <DialogPrimitive.Title className="text-sm font-semibold">
              {doc.status === 'approved' ? '시행문' : '기안문'} 출력 — {doc.title}
            </DialogPrimitive.Title>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
              >
                <Printer className="h-4 w-4" />인쇄 / PDF 저장
              </button>
              <DialogPrimitive.Close className="rounded-sm p-1 opacity-70 hover:opacity-100 focus:outline-none">
                <X className="h-4 w-4" />
                <span className="sr-only">닫기</span>
              </DialogPrimitive.Close>
            </div>
          </div>
          {nonImageAttachments.length > 0 && (
            <div className="print:hidden px-4 py-2 text-xs text-gray-500 border-b bg-gray-50">
              PDF 등은 함께 인쇄되지 않습니다. 새 탭에서 열어 따로 인쇄해주세요:{' '}
              {nonImageAttachments.map((a, i) => (
                <span key={i}>
                  <button type="button" onClick={() => openAttachment(a.path)} className="text-blue-600 underline">{a.name}</button>
                  {i < nonImageAttachments.length - 1 && ', '}
                </span>
              ))}
            </div>
          )}
          <div className="p-6 print:p-0">
            <ApprovalDocumentIssuedSheet
              doc={doc}
              documentType={documentType}
              company={company}
              positions={positions}
              creatorPositionName={creatorPositionName}
              includeAttachments={false}
              leaveDetail={leaveDetail}
              referenceLabels={referenceLabels}
            />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
