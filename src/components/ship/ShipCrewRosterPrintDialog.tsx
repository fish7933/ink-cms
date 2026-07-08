import { useEffect } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X, Printer } from 'lucide-react';
import type { ShipCrewRosterEntry } from '@/services/ship-crew-roster.service';
import ShipCrewListTable from './ShipCrewListTable';

const BODY_PRINT_CLASS = 'ship-roster-print-open';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shipName: string;
  imoNumber?: string;
  callSign?: string;
  flag?: string;
  date: string;
  roster: ShipCrewRosterEntry[];
  nationalityLabel?: (code: string) => string;
}

// 인쇄 시 뒤에 있는 앱 화면(#root) 전체를 숨기고 이 모달 내용만 인쇄되도록 하는 전용 클래스.
// index.css의 `body.ship-roster-print-open #root { display: none }` 규칙과 짝을 이룬다.
export default function ShipCrewRosterPrintDialog({ open, onOpenChange, shipName, imoNumber, callSign, flag, date, roster, nationalityLabel }: Props) {
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
          className="fixed left-1/2 top-1/2 z-50 w-[95vw] max-w-5xl max-h-[92vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border bg-white shadow-lg
            print:static print:inset-auto print:z-auto print:w-auto print:max-w-none print:max-h-none print:translate-x-0 print:translate-y-0
            print:overflow-visible print:rounded-none print:border-none print:shadow-none"
        >
          <div className="print:hidden sticky top-0 z-10 flex items-center justify-between border-b bg-white px-4 py-3">
            <DialogPrimitive.Title className="text-sm font-semibold">CREW LIST 인쇄 — {shipName}</DialogPrimitive.Title>
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
          <div className="p-6 print:p-4 space-y-3">
            <div className="text-center">
              <h2 className="text-lg font-bold tracking-wide">CREW LIST</h2>
              <p className="text-xs text-gray-500">(IMO FAL Form 5)</p>
            </div>
            <div className="grid grid-cols-4 gap-x-4 gap-y-1 text-xs border rounded-md p-3">
              <div><span className="text-gray-400">1.1 Name of ship</span><div className="font-medium">{shipName}</div></div>
              <div><span className="text-gray-400">1.2 IMO number</span><div className="font-medium">{imoNumber || '-'}</div></div>
              <div><span className="text-gray-400">1.3 Call sign</span><div className="font-medium">{callSign || '-'}</div></div>
              <div><span className="text-gray-400">4. Flag State of ship</span><div className="font-medium">{flag || '-'}</div></div>
              <div className="col-span-4"><span className="text-gray-400">3. Date (기준일)</span><div className="font-medium">{date}</div></div>
            </div>
            <ShipCrewListTable roster={roster} nationalityLabel={nationalityLabel} />
            <div className="pt-6 text-xs text-gray-500">18. Date and signature by master, authorized agent or officer</div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
