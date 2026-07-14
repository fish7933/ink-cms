import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Eye, EyeOff, Users } from 'lucide-react';
import { approvalDocumentService } from '@/services/approval-document.service';

interface Props {
  documentId: string;
}

// 결재함 상세/승인화면에서 "참조자가 실제로 열람했는지"를 사람 단위로 펼쳐서 보여준다.
// 문서에 참조가 없으면 아무것도 렌더링하지 않는다.
export default function ReferenceReadStatus({ documentId }: Props) {
  const [status, setStatus] = useState<{ userId: string; userName: string; via: string; readAt: string | null }[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    approvalDocumentService.getReferenceReadStatus(documentId)
      .then(r => { if (!cancelled) setStatus(r); })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [documentId]);

  if (!status || status.length === 0) return null;

  const readCount = status.filter(s => s.readAt).length;

  return (
    <div className="bg-gray-50 p-3 rounded">
      <p className="text-sm font-semibold mb-1.5 flex items-center gap-1">
        <Users className="w-3.5 h-3.5" />참조자 열람 현황 <span className="text-gray-400 font-normal">({readCount}/{status.length}명 열람)</span>
      </p>
      <div className="space-y-1">
        {status.map(s => (
          <div key={s.userId} className="flex items-center gap-2 text-sm">
            {s.readAt ? <Eye className="w-3.5 h-3.5 text-green-600 shrink-0" /> : <EyeOff className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
            <span className="font-medium">{s.userName}</span>
            <span className="text-xs text-gray-400">{s.via}</span>
            <span className="text-xs ml-auto shrink-0">
              {s.readAt ? <span className="text-green-600">{format(new Date(s.readAt), 'MM-dd HH:mm', { locale: ko })} 열람</span> : <span className="text-gray-400">미열람</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
