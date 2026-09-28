import { useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import {
  Bold, Italic, Underline, Strikethrough, List, ListOrdered, Quote, Minus, X,
  AlignLeft, AlignCenter, AlignRight, AlignJustify, Link2, Unlink, Image as ImageIcon,
  Table as TableIcon, Rows3, Columns3, Trash2, Undo2, Redo2, RemoveFormatting, Palette, Highlighter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { uploadFile } from '@/lib/storage';

const FONT_SIZES = ['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px'];

interface ToolbarButtonProps {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}

function ToolbarButton({ onClick, active, disabled, title, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={e => e.preventDefault()}
      onClick={onClick}
      className={`h-7 w-7 flex items-center justify-center rounded text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed ${active ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'}`}
    >
      {children}
    </button>
  );
}

// 기안서 본문 서식 도구모음 — TipTap 에디터 인스턴스를 그대로 받아 명령을 실행한다.
// 표 편집(행/열 추가·삭제)은 별도 플로팅 메뉴 없이, 커서가 표 안에 있을 때만 활성화되는
// 버튼으로 제공한다(editor.can()으로 적용 가능 여부를 그대로 물어보면 되므로 가장 단순하다).
export default function RichTextToolbar({ editor }: { editor: Editor | null }) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);

  if (!editor) return null;

  const openLinkDialog = () => {
    setLinkUrl(editor.getAttributes('link').href || '');
    setLinkDialogOpen(true);
  };
  const applyLink = () => {
    const url = linkUrl.trim();
    if (url) editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    setLinkDialogOpen(false);
  };
  const removeLink = () => editor.chain().focus().unsetLink().run();

  const handleImagePick = () => imageInputRef.current?.click();
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingImage(true);
    try {
      const path = `${Date.now()}_${file.name.replace(/[^\w.\-]/g, '_')}`;
      const url = await uploadFile('document-body-images', path, file);
      if (url) editor.chain().focus().setImage({ src: url }).run();
    } finally {
      setUploadingImage(false);
    }
  };

  const currentFontSize = (editor.getAttributes('textStyle').fontSize as string | undefined) || '__default';

  return (
    <div className="flex flex-wrap items-center gap-0.5 border border-gray-200 rounded-md p-1 bg-gray-50">
      <Select
        value={editor.isActive('heading', { level: 1 }) ? '1' : editor.isActive('heading', { level: 2 }) ? '2' : editor.isActive('heading', { level: 3 }) ? '3' : 'p'}
        onValueChange={v => {
          const chain = editor.chain().focus();
          if (v === 'p') chain.setParagraph().run();
          else chain.toggleHeading({ level: Number(v) as 1 | 2 | 3 }).run();
        }}
      >
        <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="p">본문</SelectItem>
          <SelectItem value="1">제목 1</SelectItem>
          <SelectItem value="2">제목 2</SelectItem>
          <SelectItem value="3">제목 3</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={currentFontSize}
        onValueChange={v => {
          const chain = editor.chain().focus();
          if (v === '__default') chain.unsetFontSize().run();
          else chain.setFontSize(v).run();
        }}
      >
        <SelectTrigger className="h-7 w-20 text-xs"><SelectValue placeholder="크기" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__default">기본</SelectItem>
          {FONT_SIZES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
        </SelectContent>
      </Select>

      <Separator orientation="vertical" className="h-5 mx-0.5" />

      <ToolbarButton title="굵게" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton title="기울임" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton title="밑줄" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}><Underline className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton title="취소선" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className="w-3.5 h-3.5" /></ToolbarButton>

      <label className="h-7 w-7 flex items-center justify-center rounded hover:bg-gray-200 text-gray-600 cursor-pointer" title="글자색">
        <Palette className="w-3.5 h-3.5" />
        <input type="color" className="sr-only" onChange={e => editor.chain().focus().setColor(e.target.value).run()} />
      </label>
      <label className="h-7 w-7 flex items-center justify-center rounded hover:bg-gray-200 text-gray-600 cursor-pointer" title="형광펜">
        <Highlighter className="w-3.5 h-3.5" />
        <input type="color" className="sr-only" onChange={e => editor.chain().focus().setBackgroundColor(e.target.value).run()} />
      </label>

      <Separator orientation="vertical" className="h-5 mx-0.5" />

      <ToolbarButton title="왼쪽 정렬" active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()}><AlignLeft className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton title="가운데 정렬" active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}><AlignCenter className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton title="오른쪽 정렬" active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()}><AlignRight className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton title="양쪽 정렬" active={editor.isActive({ textAlign: 'justify' })} onClick={() => editor.chain().focus().setTextAlign('justify').run()}><AlignJustify className="w-3.5 h-3.5" /></ToolbarButton>

      <Separator orientation="vertical" className="h-5 mx-0.5" />

      <ToolbarButton title="글머리 목록" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton title="번호 목록" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton title="인용문" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton title="구분선" onClick={() => editor.chain().focus().setHorizontalRule().run()}><Minus className="w-3.5 h-3.5" /></ToolbarButton>

      <Separator orientation="vertical" className="h-5 mx-0.5" />

      <ToolbarButton title="링크" active={editor.isActive('link')} onClick={openLinkDialog}><Link2 className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton title="링크 해제" disabled={!editor.isActive('link')} onClick={removeLink}><Unlink className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton title="이미지 삽입" disabled={uploadingImage} onClick={handleImagePick}><ImageIcon className="w-3.5 h-3.5" /></ToolbarButton>
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />

      {editor.isActive('image') && (
        <>
          <Select
            value={(editor.getAttributes('image').width as string | undefined) || '__original'}
            onValueChange={v => editor.chain().focus().updateAttributes('image', { width: v === '__original' ? null : v }).run()}
          >
            <SelectTrigger className="h-7 w-20 text-xs"><SelectValue placeholder="크기" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__original">원본 크기</SelectItem>
              <SelectItem value="25%">25%</SelectItem>
              <SelectItem value="50%">50%</SelectItem>
              <SelectItem value="75%">75%</SelectItem>
              <SelectItem value="100%">100%</SelectItem>
            </SelectContent>
          </Select>
          <ToolbarButton title="이미지 왼쪽 배치(본문이 오른쪽으로 흐름)" active={editor.getAttributes('image').align === 'left'} onClick={() => editor.chain().focus().updateAttributes('image', { align: 'left' }).run()}><AlignLeft className="w-3.5 h-3.5" /></ToolbarButton>
          <ToolbarButton title="이미지 가운데 배치" active={editor.getAttributes('image').align === 'center'} onClick={() => editor.chain().focus().updateAttributes('image', { align: 'center' }).run()}><AlignCenter className="w-3.5 h-3.5" /></ToolbarButton>
          <ToolbarButton title="이미지 오른쪽 배치(본문이 왼쪽으로 흐름)" active={editor.getAttributes('image').align === 'right'} onClick={() => editor.chain().focus().updateAttributes('image', { align: 'right' }).run()}><AlignRight className="w-3.5 h-3.5" /></ToolbarButton>
          <ToolbarButton title="배치 해제" disabled={!editor.getAttributes('image').align} onClick={() => editor.chain().focus().updateAttributes('image', { align: null }).run()}><X className="w-3.5 h-3.5" /></ToolbarButton>
        </>
      )}

      <Separator orientation="vertical" className="h-5 mx-0.5" />

      <ToolbarButton title="표 삽입" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><TableIcon className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton title="행 추가" disabled={!editor.can().addRowAfter()} onClick={() => editor.chain().focus().addRowAfter().run()}><Rows3 className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton title="행 삭제" disabled={!editor.can().deleteRow()} onClick={() => editor.chain().focus().deleteRow().run()}><Rows3 className="w-3.5 h-3.5 opacity-60" /></ToolbarButton>
      <ToolbarButton title="열 추가" disabled={!editor.can().addColumnAfter()} onClick={() => editor.chain().focus().addColumnAfter().run()}><Columns3 className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton title="열 삭제" disabled={!editor.can().deleteColumn()} onClick={() => editor.chain().focus().deleteColumn().run()}><Columns3 className="w-3.5 h-3.5 opacity-60" /></ToolbarButton>
      <ToolbarButton title="표 삭제" disabled={!editor.can().deleteTable()} onClick={() => editor.chain().focus().deleteTable().run()}><Trash2 className="w-3.5 h-3.5" /></ToolbarButton>

      <Separator orientation="vertical" className="h-5 mx-0.5" />

      <ToolbarButton title="되돌리기" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}><Undo2 className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton title="다시하기" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}><Redo2 className="w-3.5 h-3.5" /></ToolbarButton>
      <ToolbarButton title="서식 지우기" onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}><RemoveFormatting className="w-3.5 h-3.5" /></ToolbarButton>

      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-base">링크 삽입</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">URL</Label>
            <Input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://" className="h-9 text-sm" onKeyDown={e => { if (e.key === 'Enter') applyLink(); }} />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setLinkDialogOpen(false)}>취소</Button>
            <Button size="sm" onClick={applyLink} disabled={!linkUrl.trim()}>삽입</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
