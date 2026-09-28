import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';

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
