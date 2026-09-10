import { useRef } from 'react';
import { Bold, Italic, Underline, List, ListOrdered } from 'lucide-react';
import { sanitizeRichTextHtml, renderRichTextReadOnlyHtml } from '@/utils/rich-text-field';

interface Props {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  placeholder?: string;
  minRows?: number;
}

const TOOLBAR_BUTTONS: { command: string; icon: typeof Bold; label: string }[] = [
  { command: 'bold', icon: Bold, label: '굵게' },
  { command: 'italic', icon: Italic, label: '기울임' },
  { command: 'underline', icon: Underline, label: '밑줄' },
  { command: 'insertUnorderedList', icon: List, label: '글머리 목록' },
  { command: 'insertOrderedList', icon: ListOrdered, label: '번호 목록' },
];

// 기안서 본문 등 서식 있는 텍스트 입력 — 직접 타이핑하거나, 워드/한글 등에서 작성한 내용을
// 붙여넣어 서식을 유지한 채 이어서 편집할 수 있다. PasteableTableField.tsx와 같은 구조
// (contentEditable + 붙여넣기 시 text/html 캡처 + DOMPurify 정제)를 따르되, 표 필드와 달리
// "통째로 교체"가 아니라 커서 위치에 붙여넣기가 삽입되는 연속 편집 대상이다.
export default function RichTextField({ value, onChange, disabled, placeholder, minRows = 6 }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  const commit = () => {
    if (!ref.current) return;
    const next = sanitizeRichTextHtml(ref.current.innerHTML);
    if (next !== value) onChange(next);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    if (html) {
      document.execCommand('insertHTML', false, sanitizeRichTextHtml(html));
    } else {
      const text = e.clipboardData.getData('text/plain');
      if (text) document.execCommand('insertText', false, text);
    }
  };

  const applyFormat = (command: string) => {
    ref.current?.focus();
    document.execCommand(command, false);
  };

  if (disabled) {
    return value ? (
      <div className="rich-text-readonly text-sm" dangerouslySetInnerHTML={{ __html: renderRichTextReadOnlyHtml(value) }} />
    ) : (
      <p className="text-xs text-gray-400">-</p>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-0.5 border border-gray-200 rounded-md p-1 bg-gray-50 w-fit">
        {TOOLBAR_BUTTONS.map(({ command, icon: Icon, label }) => (
          <button
            key={command}
            type="button"
            title={label}
            onMouseDown={e => e.preventDefault()}
            onClick={() => applyFormat(command)}
            className="h-7 w-7 flex items-center justify-center rounded hover:bg-gray-200 text-gray-600"
          >
            <Icon className="w-3.5 h-3.5" />
          </button>
        ))}
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onPaste={handlePaste}
        onBlur={commit}
        data-placeholder={placeholder}
        className="rich-text-editable border border-gray-300 rounded-md p-3 text-sm focus:outline-none focus:border-blue-400"
        style={{ minHeight: `${minRows * 1.5}em` }}
        dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(value) }}
      />
      <style>{`
        .rich-text-editable:empty:before { content: attr(data-placeholder); color: #9ca3af; }
        .rich-text-readonly p, .rich-text-editable p { margin: 0 0 8px; }
        .rich-text-readonly ul, .rich-text-editable ul, .rich-text-readonly ol, .rich-text-editable ol { margin: 0 0 8px; padding-left: 1.5em; }
        .rich-text-readonly h1, .rich-text-editable h1 { font-size: 1.4em; font-weight: 700; margin: 0.4em 0; }
        .rich-text-readonly h2, .rich-text-editable h2 { font-size: 1.25em; font-weight: 700; margin: 0.4em 0; }
        .rich-text-readonly h3, .rich-text-editable h3 { font-size: 1.1em; font-weight: 700; margin: 0.4em 0; }
        .rich-text-readonly table, .rich-text-editable table { width: 100% !important; }
      `}</style>
    </div>
  );
}
