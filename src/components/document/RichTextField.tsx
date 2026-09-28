import { useEffect, useRef } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextAlign } from '@tiptap/extension-text-align';
import { TextStyleKit } from '@tiptap/extension-text-style';
import { Image as ImageExtension } from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { Placeholder } from '@tiptap/extension-placeholder';
import { TableCellWithStyle, TableHeaderWithStyle } from './rich-text-extensions';
import RichTextToolbar from './RichTextToolbar';
import { sanitizeRichTextHtml, renderRichTextReadOnlyHtml } from '@/utils/rich-text-field';

interface Props {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  placeholder?: string;
  minRows?: number;
}

// 기안서 본문 등 서식 있는 텍스트 입력 — 직접 타이핑하거나, 워드/한글/엑셀 등에서 작성한
// 내용을 붙여넣어 서식을 유지한 채 이어서 편집할 수 있다. TipTap(ProseMirror 기반) 에디터로
// 구현하되, 저장/전달되는 값은 예전과 동일하게 정제된 HTML 문자열 하나다 — 이 필드를 쓰는
// 쪽(DynamicDocumentForm, DocumentDraftPage, 시행문 인쇄 렌더링)은 손댈 필요가 없다.
export default function RichTextField({ value, onChange, disabled, placeholder, minRows = 6 }: Props) {
  if (disabled) {
    return value ? (
      <div className="rich-text-readonly text-sm" dangerouslySetInnerHTML={{ __html: renderRichTextReadOnlyHtml(value) }} />
    ) : (
      <p className="text-xs text-gray-400">-</p>
    );
  }
  return <RichTextEditor value={value} onChange={onChange} placeholder={placeholder} minRows={minRows} />;
}

function RichTextEditor({ value, onChange, placeholder, minRows }: Omit<Props, 'disabled'>) {
  // 외부에서 value가 바뀌었을 때(예: 다른 문서를 불러옴)만 에디터 내용을 다시 채워야 하고,
  // 이 컴포넌트 자신이 onChange로 내보낸 값이 그대로 돌아온 경우엔 다시 채우면 안 된다
  // (커서 위치가 튐) — 마지막으로 내보낸 값을 기억해 구분한다.
  const lastEmittedRef = useRef(value);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: { openOnClick: false, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } },
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyleKit,
      ImageExtension,
      Table.configure({ resizable: false }),
      TableRow,
      TableCellWithStyle,
      TableHeaderWithStyle,
      Placeholder.configure({ placeholder }),
    ],
    content: sanitizeRichTextHtml(value),
    editorProps: {
      attributes: { class: 'rich-text-editable-content' },
      // 클립보드 원본 HTML을 ProseMirror가 파싱하기 전에 기존 정제 파이프라인을 그대로
      // 거치게 한다 — 엑셀 클래스 테두리 보존, 워드 특수문자 제거, 표 전체폭 강제가 여기서 함께 적용된다.
      transformPastedHTML: html => sanitizeRichTextHtml(html),
    },
    onUpdate: ({ editor: e }) => {
      const html = sanitizeRichTextHtml(e.getHTML());
      lastEmittedRef.current = html;
      onChange(html);
    },
  });

  useEffect(() => {
    if (!editor || editor.isFocused || value === lastEmittedRef.current) return;
    const html = sanitizeRichTextHtml(value);
    lastEmittedRef.current = html;
    editor.commands.setContent(html, { emitUpdate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  return (
    <div className="space-y-1.5">
      <RichTextToolbar editor={editor as Editor | null} />
      <EditorContent
        editor={editor}
        className="rich-text-editable border border-gray-300 rounded-md p-3 text-sm focus-within:outline-none focus-within:border-blue-400"
        style={{ minHeight: `${minRows * 1.5}em` }}
      />
      <style>{`
        .rich-text-editable-content:focus { outline: none; }
        .rich-text-editable-content p.is-editor-empty:first-child::before {
          content: attr(data-placeholder); color: #9ca3af; float: left; height: 0; pointer-events: none;
        }
        .rich-text-readonly p, .rich-text-editable-content p { margin: 0 0 8px; }
        .rich-text-readonly ul, .rich-text-editable-content ul, .rich-text-readonly ol, .rich-text-editable-content ol { margin: 0 0 8px; padding-left: 1.5em; }
        .rich-text-readonly h1, .rich-text-editable-content h1 { font-size: 1.4em; font-weight: 700; margin: 0.4em 0; }
        .rich-text-readonly h2, .rich-text-editable-content h2 { font-size: 1.25em; font-weight: 700; margin: 0.4em 0; }
        .rich-text-readonly h3, .rich-text-editable-content h3 { font-size: 1.1em; font-weight: 700; margin: 0.4em 0; }
        .rich-text-readonly table, .rich-text-editable-content table { width: 100% !important; border-collapse: collapse; }
        .rich-text-readonly td, .rich-text-editable-content td, .rich-text-readonly th, .rich-text-editable-content th {
          border: 1px solid #999; padding: 4px 8px; vertical-align: top;
        }
        .rich-text-readonly th, .rich-text-editable-content th { background: #f5f5f5; font-weight: 600; }
        .rich-text-readonly blockquote, .rich-text-editable-content blockquote { border-left: 3px solid #d1d5db; padding-left: 0.8em; color: #4b5563; margin: 0 0 8px; }
        .rich-text-readonly img, .rich-text-editable-content img { max-width: 100%; }
        .rich-text-readonly hr, .rich-text-editable-content hr { border: none; border-top: 1px solid #d1d5db; margin: 0.8em 0; }
        .rich-text-editable-content .selectedCell { background-color: rgba(37, 99, 235, 0.08); }
      `}</style>
    </div>
  );
}
