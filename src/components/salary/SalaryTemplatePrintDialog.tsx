import { useEffect } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X, Printer } from 'lucide-react';
import type { SalaryTemplateWithItems, SalaryComponent } from '@/lib/salary-store';
import type { Rank } from '@/types/models';
import SalaryTemplateWageSheet from './SalaryTemplateWageSheet';

const BODY_PRINT_CLASS = 'salary-print-dialog-open';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: SalaryTemplateWithItems;
  components: SalaryComponent[];
  ranks: Rank[];
}

// 인쇄 시 뒤에 있는 앱 화면(#root) 전체를 숨기고 이 모달 내용만 인쇄되도록 하는 전용 클래스.
// index.css의 `body.salary-print-dialog-open #root { display: none }` 규칙과 짝을 이룬다.
export default function SalaryTemplatePrintDialog({ open, onOpenChange, template, components, ranks }: Props) {
  useEffect(() => {
    if (open) document.body.classList.add(BODY_PRINT_CLASS);
    else document.body.classList.remove(BODY_PRINT_CLASS);
    return () => document.body.classList.remove(BODY_PRINT_CLASS);
  }, [open]);

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
            <DialogPrimitive.Title className="text-sm font-semibold">급여 템플릿 인쇄 — {template.name}</DialogPrimitive.Title>
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
          <div className="p-6 print:p-0">
            <SalaryTemplateWageSheet template={template} components={components} ranks={ranks} />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
