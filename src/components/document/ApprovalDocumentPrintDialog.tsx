import { useEffect, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X, Printer } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import type { CompanyInfo } from '@/services/company-info.service';
import type { ApprovalDocumentWithDetails, ApprovalDocumentType } from '@/types/approval-document';
import type { ShorePosition } from '@/types/models';
import ApprovalDocumentIssuedSheet from './ApprovalDocumentIssuedSheet';

const BODY_PRINT_CLASS = 'document-print-dialog-open';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doc: ApprovalDocumentWithDetails;
  documentType: ApprovalDocumentType | null;
  company: CompanyInfo | null;
  positions: ShorePosition[];
}

// 승인 완료된 결재문서를 총무팀 보관용 "시행문" 형식으로 인쇄/PDF 저장하는 모달.
export default function ApprovalDocumentPrintDialog({ open, onOpenChange, doc, documentType, company, positions }: Props) {
  const [includeAttachments, setIncludeAttachments] = useState(false);

  useEffect(() => {
    if (open) document.body.classList.add(BODY_PRINT_CLASS);
    else document.body.classList.remove(BODY_PRINT_CLASS);
    return () => document.body.classList.remove(BODY_PRINT_CLASS);
  }, [open]);

  useEffect(() => { if (open) setIncludeAttachments(false); }, [open]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 print:hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-50 w-[95vw] max-w-3xl max-h-[92vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border bg-white shadow-lg
            print:static print:inset-auto print:z-auto print:w-auto print:max-w-none print:max-h-none print:translate-x-0 print:translate-y-0
            print:overflow-visible print:rounded-none print:border-none print:shadow-none"
        >
          <div className="print:hidden sticky top-0 z-10 flex items-center justify-between border-b bg-white px-4 py-3">
            <DialogPrimitive.Title className="text-sm font-semibold">시행문 인쇄 — {doc.title}</DialogPrimitive.Title>
            <div className="flex items-center gap-3">
              {doc.attachments.length > 0 && (
                <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                  <Checkbox checked={includeAttachments} onCheckedChange={c => setIncludeAttachments(c === true)} />
                  첨부파일({doc.attachments.length}개)도 함께 출력
                </label>
              )}
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
          <div className="p-6 print:p-0">
            <ApprovalDocumentIssuedSheet doc={doc} documentType={documentType} company={company} positions={positions} includeAttachments={includeAttachments} />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
