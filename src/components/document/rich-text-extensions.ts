import { Table } from '@tiptap/extension-table';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { Image } from '@tiptap/extension-image';

// 삽입한 이미지의 크기(width)와 배치(왼쪽/가운데/오른쪽)를 저장/복원한다. 두 속성이 각자
// style을 따로 렌더링하면 서로 덮어쓸 수 있어, align 쪽에서 width까지 함께 읽어 하나의
// style 문자열로 합쳐 렌더링한다(TipTap은 한 속성의 renderHTML에도 그 노드의 attributes
// 전체를 넘겨주므로 가능하다) — width 쪽은 style을 직접 내보내지 않는다.
export const ImageWithLayout = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: element => element.style.width || element.getAttribute('width'),
        renderHTML: () => ({}),
      },
      align: {
        default: null,
        // 별도 data-* 속성 없이(정제 파이프라인이 data-* 속성을 전부 막으므로) style 자체에서
        // 되읽어 판별한다 — 아래 renderHTML이 쓰는 표현과 항상 짝이 맞아야 한다.
        parseHTML: element => {
          if (element.style.float === 'left') return 'left';
          if (element.style.float === 'right') return 'right';
          if (element.style.display === 'block' && element.style.marginLeft === 'auto' && element.style.marginRight === 'auto') return 'center';
          return null;
        },
        renderHTML: attributes => {
          const decls: string[] = [];
          if (attributes.width) decls.push(`width:${attributes.width}`);
          if (attributes.align === 'left') decls.push('float:left', 'margin:0 12px 8px 0');
          else if (attributes.align === 'right') decls.push('float:right', 'margin:0 0 8px 12px');
          else if (attributes.align === 'center') decls.push('display:block', 'margin-left:auto', 'margin-right:auto');
          if (decls.length === 0) return {};
          return { style: `${decls.join(';')};` };
        },
      },
    };
  },
});

// 표 전체 크기(width)와 배치(왼쪽/가운데/오른쪽)를 저장/복원한다 — 이미지와 같은 구조.
// 기본 Table 노드의 renderHTML은 이 style을 읽으면(userStyles) 그대로 최종 표 style로
// 쓰고, 없으면 열 너비로부터 계산한 기본 폭으로 대체한다(@tiptap/extension-table 내부 구현) —
// 그래서 아직 크기를 바꾸지 않은 기존 표는 지금처럼 자동 계산된 폭을 그대로 쓴다.
export const TableWithLayout = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: element => element.style.width || null,
        renderHTML: () => ({}),
      },
      align: {
        default: null,
        parseHTML: element => {
          if (element.style.marginLeft === 'auto' && element.style.marginRight === 'auto') return 'center';
          if (element.style.marginLeft === 'auto') return 'right';
          if (element.style.marginRight === 'auto') return 'left';
          return null;
        },
        renderHTML: attributes => {
          const decls: string[] = [];
          if (attributes.width) decls.push(`width:${attributes.width}`);
          if (attributes.align === 'left') decls.push('margin-left:0', 'margin-right:auto');
          else if (attributes.align === 'center') decls.push('margin-left:auto', 'margin-right:auto');
          else if (attributes.align === 'right') decls.push('margin-left:auto', 'margin-right:0');
          if (decls.length === 0) return {};
          return { style: `${decls.join(';')};` };
        },
      },
    };
  },
});

// 엑셀에서 붙여넣은 표는 셀 배경색/테두리가 style 속성으로 들어오는데(rich-text-field.ts의
// inlineClassStyles가 클래스 규칙을 먼저 인라인 style로 합쳐준다), 기본 TableCell/TableHeader는
// style을 보존하는 속성이 없어 그대로 두면 사라진다 — 파싱 시 읽고 렌더링 시 그대로 다시 쓴다.
export const TableCellWithStyle = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      style: {
        default: null,
        parseHTML: element => element.getAttribute('style'),
        renderHTML: attributes => (attributes.style ? { style: attributes.style } : {}),
      },
    };
  },
});

export const TableHeaderWithStyle = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      style: {
        default: null,
        parseHTML: element => element.getAttribute('style'),
        renderHTML: attributes => (attributes.style ? { style: attributes.style } : {}),
      },
    };
  },
});
