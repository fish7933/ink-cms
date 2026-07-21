import { useRef } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { extractSanitizedTable, plainTextToTableHtml, sanitizeTableHtml, injectContentEditable, stripContentEditable } from '@/utils/table-field';

interface Props {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
}

// 엑셀에서 셀 범위를 복사해 서식(글꼴/테두리/배경/정렬)을 그대로 유지한 채 붙여넣을 수 있는
// 표 입력 컨트롤 (기안서 동적 양식 field.type === 'table'). 값은 정제된 <table> HTML 문자열.
export default function PasteableTableField({ value, onChange, disabled }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  const commit = () => {
    if (!containerRef.current) return;
    const next = stripContentEditable(containerRef.current.innerHTML);
    if (next !== value) onChange(next);
  };

  // 표 전체를 새로 붙여넣는 경우(엑셀 range 복사)는 기존 내용을 통째로 교체하고,
  // 표가 없는 순수 텍스트를 이미 편집 중인 셀 안에 붙여넣는 경우는 그 자리에 텍스트만 삽입한다
  // (셀 안에 임의 HTML이 그대로 삽입되지 않도록 위험을 차단).
  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const html = e.clipboardData.getData('text/html');
    if (html && /<table/i.test(html)) {
      e.preventDefault();
      if (value && !window.confirm('기존 표 내용을 붙여넣은 내용으로 교체할까요?')) return;
      const extracted = extractSanitizedTable(html);
      if (extracted) onChange(extracted);
      return;
    }
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    e.preventDefault();
    if (!value) {
      onChange(plainTextToTableHtml(text));
      return;
    }
    document.execCommand('insertText', false, text);
  };

  const clear = () => onChange('');

  if (disabled) {
    return value ? (
      <div className="border border-gray-300 rounded-md overflow-x-auto p-1" dangerouslySetInnerHTML={{ __html: sanitizeTableHtml(value) }} />
    ) : (
      <p className="text-xs text-gray-400">-</p>
    );
  }

  return (
    <div className="space-y-1.5">
      {value && (
        <div className="flex items-center gap-1">
          <Button type="button" size="sm" variant="ghost" className="h-6 px-1.5 text-[11px] gap-0.5 text-red-500" onClick={clear}>
            <Trash2 className="w-3 h-3" />지우고 다시 붙여넣기
          </Button>
          <span className="text-[10px] text-gray-400 ml-auto">셀을 클릭해 내용을 직접 수정할 수 있습니다</span>
        </div>
      )}
      {value ? (
        <div
          ref={containerRef}
          className="border border-gray-300 rounded-md overflow-x-auto p-1"
          onPaste={handlePaste}
          onBlur={commit}
          dangerouslySetInnerHTML={{ __html: injectContentEditable(value) }}
        />
      ) : (
        <div
          tabIndex={0}
          onPaste={handlePaste}
          className="border-2 border-dashed border-gray-300 rounded-md p-6 text-center text-xs text-gray-400 cursor-text focus:outline-none focus:border-blue-400"
        >
          엑셀에서 범위를 복사(Ctrl+C)한 뒤 여기를 클릭하고 붙여넣기(Ctrl+V)하세요
        </div>
      )}
    </div>
  );
}
