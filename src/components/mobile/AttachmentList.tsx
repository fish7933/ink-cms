import { Paperclip } from 'lucide-react';
import { getFileUrl } from '@/lib/upload';
import type { ApprovalDocumentAttachment } from '@/types/approval-document';

interface Props {
  attachments: ApprovalDocumentAttachment[];
}

// 결재문서 첨부파일 — 모바일 결재함/기안함 공용. 이미지/PDF 구분 없이 새 탭으로 열면
// 모바일 브라우저/OS가 알맞은 뷰어로 보여주므로 별도 분기가 필요 없다.
export default function AttachmentList({ attachments }: Props) {
  if (!attachments || attachments.length === 0) return null;
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold text-gray-500 mb-2">첨부파일 ({attachments.length})</div>
      <div className="space-y-1.5">
        {attachments.map((a, i) => (
          <a
            key={i}
            href={getFileUrl('documents', a.path)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-blue-600 underline truncate"
          >
            <Paperclip className="w-3.5 h-3.5 shrink-0" />{a.name}
          </a>
        ))}
      </div>
    </div>
  );
}
